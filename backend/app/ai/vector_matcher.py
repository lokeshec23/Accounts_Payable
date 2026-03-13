import logging
import json
import re
import time
from typing import Dict, Any, Optional, List
from sqlalchemy.orm import Session
from rapidfuzz import fuzz, process

from app.models.db_models import VendorMaster

logger = logging.getLogger(__name__)

# ==========================================================
# CONFIG
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

MATCH_THRESHOLD = 0.85  # Increased from 0.75 to reduce false positives
ACRONYM_MIN_ADDRESS_SCORE = 0.40

NAME_WEIGHT = 0.80
ADDRESS_WEIGHT = 0.20

# Minimum word overlap requirement
MIN_WORD_OVERLAP_LENGTH = 3  # Words must be at least 3 chars to count


# ==========================================================
# MATCHER CLASS
# ==========================================================

class VendorMatcher:

    def __init__(self):
        self.master_records: List[Dict] = []
        self.clean_names: List[str] = []
        self.deep_clean_names: List[str] = []
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
    # DBA EXTRACTION
    # ------------------------------------------------------
    def _extract_dba(self, text: str) -> Optional[str]:
        match = re.search(r"(d\.?b\.?a\.?|doing business as)\s+([^)]+)", text, re.I)
        if match:
            return match.group(2).strip()
        return None

    # ------------------------------------------------------
    # ACRONYM EXTRACTION
    # ------------------------------------------------------
    def _get_acronym_key(self, text: str) -> Optional[str]:
        words = text.strip().split()
        if not words:
            return None

        first_word = words[0]

        if first_word.isupper() and len(first_word) >= 2:
            return first_word.lower()

        return None

    # ------------------------------------------------------
    # ADDRESS SCORING
    # ------------------------------------------------------
    def _score_address(self, input_addr: Optional[str], record: Dict) -> float:
        if not input_addr:
            return 0.0

        db_addr = " ".join(filter(None, [
            str(record.get('address_line1', record.get('ADDRESS_LINE1', ''))),
            str(record.get('city', record.get('CITY', ''))),
            str(record.get('state_or_territory', record.get('STATE_OR_TERITTORY', ''))),
            str(record.get('zip_or_postal_code', record.get('ZIP_OR_POSTAL_CODE', '')))
        ])).lower().strip()

        if not db_addr:
            return 0.0

        return fuzz.token_set_ratio(input_addr.lower(), db_addr) / 100

    # ------------------------------------------------------
    # WORD OVERLAP CHECK (PREVENTS FALSE MATCHES)
    # ------------------------------------------------------
    def _has_meaningful_overlap(self, input_words: str, candidate_words: str) -> bool:
        """
        Check if input and candidate share at least one meaningful word.
        Prevents false matches like:
        - 'proxy pics' → 'Troy Pierce' (no common words)
        - 'proxy pics' → 'Roxy Enterprises' (roxy not a prefix of proxy)
        """
        input_tokens = set(input_words.split())
        candidate_tokens = set(candidate_words.split())
        
        # Filter to significant words only (3+ characters)
        input_significant = {w for w in input_tokens if len(w) >= MIN_WORD_OVERLAP_LENGTH}
        candidate_significant = {w for w in candidate_tokens if len(w) >= MIN_WORD_OVERLAP_LENGTH}
        
        if not input_significant or not candidate_significant:
            # If either has no significant words, allow fuzzy matching
            return True
        
        # Check for exact word match
        common_words = input_significant & candidate_significant
        if common_words:
            return True
        
        # Check for PREFIX-ONLY substring match (e.g., "tech" starts "technology")
        # This prevents "roxy" matching "proxy" (roxy is at position 1, not 0)
        for input_word in input_significant:
            for candidate_word in candidate_significant:
                # Skip if words are the same (already checked above)
                if input_word == candidate_word:
                    continue
                
                # Determine which is longer
                if len(input_word) > len(candidate_word):
                    longer, shorter = input_word, candidate_word
                elif len(candidate_word) > len(input_word):
                    longer, shorter = candidate_word, input_word
                else:
                    # Same length but different words - no prefix match possible
                    continue
                
                # Only match if shorter is PREFIX of longer AND >= 4 chars
                if len(shorter) >= 4 and longer.startswith(shorter):
                    return True
        
        return False

   

    # ------------------------------------------------------
    # LOAD MASTER DATA
    # ------------------------------------------------------
    def load_from_db(self, db: Session):
        """Load all vendors from structured VendorMaster table."""
        vendors = db.query(VendorMaster).all()
        
        if not vendors:
            logger.warning("No Vendor Master records found")
            return

        # Convert SQLAlchemy objects to dictionaries for compatibility
        all_rows = []
        for v in vendors:
            row_dict = {}
            for column in v.__table__.columns:
                row_dict[column.name] = getattr(v, column.name)
            all_rows.append(row_dict)

        self.master_records.clear()
        self.clean_names.clear()
        self.deep_clean_names.clear()
        self.acronym_map.clear()

        for row in all_rows:
            # Match code expects uppercase keys or snake_case
            name = str(row.get("vendor_name", row.get("VENDOR_NAME", ""))).strip()
            if not name:
                continue

            norm = self._normalize(name)
            deep_norm = self._normalize(name, deep_clean=True)
            acronym_key = self._get_acronym_key(name)

            index = len(self.master_records)

            self.master_records.append(row)
            self.clean_names.append(norm)
            self.deep_clean_names.append(deep_norm)

            if acronym_key:
                self.acronym_map.setdefault(acronym_key, []).append(index)

        self.last_updated = time.time()
        print(f"Loaded {len(self.master_records)} vendors into memory.")

    # ------------------------------------------------------
    # MAIN MATCH FUNCTION
    # ------------------------------------------------------
    def find_match(
        self,
        input_name: str,
        input_address: Optional[str] = None
    ) -> Dict[str, Any]:

        if not self.master_records:
            return {"match": None, "score": 0, "type": "no_data"}

        # Extract DBA
        dba_name = self._extract_dba(input_name)
        if dba_name:
            input_name = dba_name

        input_clean = self._normalize(input_name)
        input_core = self._normalize(input_name, deep_clean=True)

        # ==================================================
        # EXACT MATCH
        # ==================================================
        for idx, name in enumerate(self.deep_clean_names):
            if input_core == name:
                return {
                    "match": self.master_records[idx],
                    "score": 0.99,
                    "type": "exact_match"
                }

        candidates = []

        # ==================================================
        # SAFE ACRONYM MATCH
        # ==================================================
        input_key = input_name.strip().upper()

        if len(input_key) <= 5 and input_key.lower() in self.acronym_map:
            for idx in self.acronym_map[input_key.lower()]:
                record = self.master_records[idx]
                addr_score = self._score_address(input_address, record)

                if addr_score >= ACRONYM_MIN_ADDRESS_SCORE:
                    final_score = 0.93 + (addr_score * 0.07)

                    candidates.append({
                        "record": record,
                        "score": final_score,
                        "type": "acronym_match"
                    })

        # ==================================================
        # FUZZY MATCH
        # ==================================================
        top = process.extract(
            input_core,
            self.deep_clean_names,
            scorer=fuzz.token_set_ratio,
            limit=7
        )

        for _, score, idx in top:

            record = self.master_records[idx]
            name_score = score / 100
            
            master_core = self.deep_clean_names[idx]
            
            # 🔥 CRITICAL: Check for meaningful word overlap
            # This prevents "proxy pics" from matching "troy pierce"
            if not self._has_meaningful_overlap(input_core, master_core):
                # Penalize heavily if no word overlap
                name_score = name_score * 0.5  # Cut score in half
                
                # Skip if score drops below threshold
                if name_score < 0.70:
                    continue

            # Brand containment boost
            if input_core in master_core or master_core in input_core:
                name_score = max(name_score, 0.97)

            addr_score = self._score_address(input_address, record)

            if input_address:
                combined = (name_score * NAME_WEIGHT) + \
                           (addr_score * ADDRESS_WEIGHT)
            else:
                combined = name_score

            candidates.append({
                "record": record,
                "score": combined,
                "type": "fuzzy_match"
            })

        # ==================================================
        # FINAL DECISION
        # ==================================================
        if not candidates:
            return {"match": None, "score": 0, "type": "no_match"}

        candidates.sort(key=lambda x: x["score"], reverse=True)
        best = candidates[0]

        match_type = best["type"]

        if best["score"] < MATCH_THRESHOLD:
            match_type = "low_confidence_match"

        return {
            "match": best["record"],
            "score": round(best["score"], 2),
            "type": match_type
        }

_matcher_instance = VendorMatcher()


def find_best_vendor_match(
    db: Session,
    input_vendor_name: str,
    input_vendor_address: Optional[str] = None,
    min_confidence: float = 0.0
) -> Dict[str, Any]:
    """
    Backward-compatible function wrapper.
    Keeps old API intact.
    """

    # Reload data if not loaded
    if not _matcher_instance.master_records:
        _matcher_instance.load_from_db(db)

    result = _matcher_instance.find_match(
        input_name=input_vendor_name,
        input_address=input_vendor_address
    )

    # Convert to old response format
    if not result.get("match"):
        return {
            "match": None,
            "score": 0.0,
            "confidence": 0.0,
            "method": "no_match",
            "match_type": "no_match"
        }

    score = result["score"]

    return {
        "match": result["match"],
        "score": score,
        "confidence": score,
        "method": result["type"],
        "match_type": result["type"]
    }


def get_cached_vendors(db: Session):
    """
    Backward-compatible cache loader.
    Returns (rows, vendor_map, address_map)
    """

    if not _matcher_instance.master_records:
        _matcher_instance.load_from_db(db)

    rows = _matcher_instance.master_records

    vendor_map = {}
    address_map = {}

    for record in rows:
        name = str(record.get("vendor_name", record.get("VENDOR_NAME", ""))).strip()
        if name:
            vendor_map[name.lower()] = record

        address = " ".join(filter(None, [
            str(record.get('address_line1', record.get('ADDRESS_LINE1', ''))),
            str(record.get('city', record.get('CITY', ''))),
            str(record.get('state_or_territory', record.get('STATE_OR_TERITTORY', ''))),
            str(record.get('zip_or_postal_code', record.get('ZIP_OR_POSTAL_CODE', '')))
        ])).strip()

        if address:
            address_map[address.lower()] = record

    return rows, vendor_map, address_map
