import logging
import json
import re
import time
from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from rapidfuzz import fuzz, process

from app.models.db_models import ExcelFile, MasterDataChunk

logger = logging.getLogger(__name__)

# ==========================================================
# CONFIGURATION
# ==========================================================

STOP_WORDS = {
    "pvt", "ltd", "limited", "inc", "corp",
    "the", "and", "co", "llp", "llc"
}

GENERIC_WORDS = {
    "health", "foundation", "group",
    "services", "solutions", "international",
    "systems", "staffing", "private", "bank"
}

MATCH_THRESHOLD = 0.70
ACRONYM_MIN_ADDRESS_SCORE = 0.40


# ==========================================================
# VENDOR MATCHER
# ==========================================================

class VendorMatcher:

    def __init__(self):
        self.master_records: List[Dict] = []
        self.clean_names: List[str] = []
        self.deep_clean_names: List[str] = []
        self.tax_id_map: Dict[str, int] = {}
        self.acronym_map: Dict[str, List[int]] = {}
        self.last_updated = 0

    # ------------------------------------------------------
    # NORMALIZATION
    # ------------------------------------------------------
    def _normalize(self, text: str, deep_clean: bool = False) -> str:
        if not text:
            return ""

        text = text.encode("utf-8", "ignore").decode("utf-8", "ignore")
        text = re.sub(r"[®©™Â]", "", text)
        text = text.lower()
        text = re.sub(r"[^\w\s]", " ", text)

        tokens = text.split()
        tokens = [t for t in tokens if t not in STOP_WORDS]

        if deep_clean:
            tokens = [t for t in tokens if t not in GENERIC_WORDS]

        return " ".join(tokens).strip()

    # ------------------------------------------------------
    # CLEAN TAX ID
    # ------------------------------------------------------
    def _clean_tax_id(self, tax_id: str) -> str:
        return re.sub(r"\D", "", tax_id or "")

    # ------------------------------------------------------
    # DBA EXTRACTION
    # ------------------------------------------------------
    def _extract_dba(self, text: str) -> Optional[str]:
        match = re.search(r"(d\.?b\.?a\.?|doing business as)\s+([^)]+)", text, re.I)
        if match:
            return match.group(2).strip()
        return None

    # ------------------------------------------------------
    # ADDRESS SCORING
    # ------------------------------------------------------
    def _score_address(self, input_addr: Optional[str], record: Dict) -> float:
        if not input_addr:
            return 0.0

        db_addr = " ".join(filter(None, [
            str(record.get('ADDRESS_LINE1', '')),
            str(record.get('ADDRESS_LINE2', '')),
            str(record.get('ADDRESS_LINE3', '')),
            str(record.get('CITY', '')),
            str(record.get('STATE_OR_TERITTORY', '')),
            str(record.get('ZIP_OR_POSTAL_CODE', ''))
        ])).lower().strip()

        if not db_addr:
            return 0.0

        return fuzz.token_set_ratio(input_addr.lower(), db_addr) / 100

    # ------------------------------------------------------
    # LOAD MASTER DATA
    # ------------------------------------------------------
    def load_from_db(self, db: Session):

        vendor_file = db.query(ExcelFile).filter(
            ExcelFile.tab_name.in_(
                ["Vendor_Master", "Vendor Master", "Vendors", "Vendor"]
            )
        ).order_by(ExcelFile.uploaded_at.desc()).first()

        if not vendor_file:
            logger.error("No Vendor Master file found")
            return

        chunks = db.query(MasterDataChunk).filter(
            MasterDataChunk.file_id == vendor_file.id
        ).all()

        all_rows = []
        for chunk in chunks:
            try:
                data = json.loads(chunk.data_json) \
                    if isinstance(chunk.data_json, str) else chunk.data_json
                if isinstance(data, list):
                    all_rows.extend(data)
            except Exception as e:
                logger.error(f"Chunk parsing error: {e}")

        self.master_records.clear()
        self.clean_names.clear()
        self.deep_clean_names.clear()
        self.tax_id_map.clear()
        self.acronym_map.clear()

        for row in all_rows:
            name = str(row.get("VENDOR_NAME", "")).strip()
            if not name:
                continue

            norm = self._normalize(name)
            deep_norm = self._normalize(name, deep_clean=True)

            index = len(self.master_records)

            self.master_records.append(row)
            self.clean_names.append(norm)
            self.deep_clean_names.append(deep_norm)

            # TAX ID INDEXING
            tax_id = row.get("TAX ID") or row.get("TAX_ID")
            if tax_id:
                clean_tax = self._clean_tax_id(str(tax_id))
                if clean_tax:
                    self.tax_id_map[clean_tax] = index

        self.last_updated = time.time()
        print(f"Loaded {len(self.master_records)} vendors into memory.")
        print(f"Indexed {len(self.tax_id_map)} tax IDs.")

    # ------------------------------------------------------
    # MAIN MATCH FUNCTION
    # ------------------------------------------------------
    def find_match(
        self,
        input_name: str,
        input_address: Optional[str] = None,
        input_tax_id: Optional[str] = None
    ) -> Dict[str, Any]:

        if not self.master_records:
            return {"match": None, "score": 0, "type": "no_data"}

        # ==================================================
        # 1️⃣ TAX ID PRIORITY MATCH
        # ==================================================
        if input_tax_id:
            clean_input_tax = self._clean_tax_id(input_tax_id)

            if clean_input_tax in self.tax_id_map:
                idx = self.tax_id_map[clean_input_tax]
                return {
                    "match": self.master_records[idx],
                    "score": 1.0,
                    "type": "tax_id_match"
                }

        # Extract DBA if exists
        dba_name = self._extract_dba(input_name)
        if dba_name:
            input_name = dba_name

        input_clean = self._normalize(input_name)
        input_core = self._normalize(input_name, deep_clean=True)

        candidates = []

        # ==================================================
        # 2️⃣ EXACT NAME MATCH
        # ==================================================
        for idx, name in enumerate(self.deep_clean_names):
            if input_core == name:
                return {
                    "match": self.master_records[idx],
                    "score": 0.98,
                    "type": "exact_name_match"
                }

        # ==================================================
        # 3️⃣ FUZZY MATCH + ADDRESS PRIORITY
        # ==================================================
        top = process.extract(
            input_core,
            self.deep_clean_names,
            scorer=fuzz.token_set_ratio,
            limit=7
        )

        for _, score, idx in top:

            record = self.master_records[idx]
            base_score = score / 100
            master_core = self.deep_clean_names[idx]

            if input_core and input_core in master_core:
                base_score = max(base_score, 0.95)

            addr_score = self._score_address(input_address, record)

            if input_address:
                combined = (base_score * 0.6) + (addr_score * 0.4)

                # Strong address boost
                if addr_score > 0.85:
                    combined = max(combined, 0.96)
            else:
                combined = base_score

            candidates.append({
                "record": record,
                "score": combined,
                "type": "fuzzy_match"
            })

        if not candidates:
            return {"match": None, "score": 0, "type": "no_match"}

        candidates.sort(key=lambda x: x["score"], reverse=True)
        best = candidates[0]

        if best["score"] < MATCH_THRESHOLD:
            return {"match": None, "score": 0, "type": "no_match"}

        return {
            "match": best["record"],
            "score": round(best["score"], 2),
            "type": best["type"]
        }
# ==========================================================
# MAIN EXECUTION
# ==========================================================

# ==========================================================
# MAIN EXECUTION (HARDCODED VALUES)
# ==========================================================

# ==========================================================
# MAIN EXECUTION (MULTIPLE TEST CASES)
# ==========================================================

if __name__ == "__main__":

    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    # --------------------------------------------
    # DATABASE CONNECTION
    # --------------------------------------------
    DATABASE_URL = "mssql+pymssql://sa:varshu%4040067@localhost:1433/accounts_payable"

    engine = create_engine(DATABASE_URL)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()

    # --------------------------------------------
    # LOAD MATCHER
    # --------------------------------------------
    matcher = VendorMatcher()
    matcher.load_from_db(db)

    # --------------------------------------------
    # 🔥 TEST CASE ARRAY
    # --------------------------------------------

    test_cases = [
        {
            "name": "Consolidated Analytics",
            "address": "One Portland Square, 10th Floor Portland, Maine 04101-4054",
            "tax_id": "01-0176171"
        },
        {
            "name": "Richard Hayles",
            "address": "472 Tufton Trl SE Dallas TX 75123",
            "tax_id": None
        },
        {
            "name": "Black Knight Technologies",
            "address": "Jacksonville FL",
            "tax_id": None
        },
        {
            "name": "Arizent",
            "address": "New York NY",
            "tax_id": None
        }
    ]

    # --------------------------------------------
    # RUN ALL TESTS
    # --------------------------------------------

    for i, case in enumerate(test_cases, start=1):

        print("\n===================================================")
        print(f"TEST CASE {i}")
        print("===================================================")

        result = matcher.find_match(
            input_name=case["name"],
            input_address=case["address"],
            input_tax_id=case["tax_id"]
        )

        print("INPUT:")
        print("Name:", case["name"])
        print("Address:", case["address"])
        print("Tax ID:", case["tax_id"])

        print("\nMATCH RESULT:")

        if result["match"]:
            matched = result["match"]

            print("Matched Vendor ID:", matched.get("VENDOR_ID"))
            print("Matched Vendor Name:", matched.get("VENDOR_NAME"))
            print("Score:", result["score"])
            print("Match Type:", result["type"])

            print("Matched Address:",
                  matched.get("ADDRESS_LINE1"),
                  matched.get("CITY"),
                  matched.get("STATE_OR_TERITTORY"),
                  matched.get("ZIP_OR_POSTAL_CODE"))
        else:
            print("❌ No Match Found")
