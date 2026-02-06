import logging
import time
import json
from typing import Optional, Dict, Any, Tuple, List
from sqlalchemy.orm import Session
from difflib import SequenceMatcher

from app.models.db_models import ExcelFile, MasterDataChunk
from app.ai.normalizer import normalize_vendor, normalize_address

logger = logging.getLogger(__name__)

# ---------------- CACHE ---------------- #
_VENDOR_CACHE = {
    "rows": [],
    "vendor_map": {},
    "address_map": {},
    "timestamp": 0
}
CACHE_TTL = 300  # 5 minutes

NAME_FUZZY_THRESHOLD = 0.60
ADDR_FUZZY_THRESHOLD = 0.75
MIN_ACCEPTABLE_SCORE = 0.40

# ---------------- HELPERS ---------------- #
def _get_val(row: dict, keys: list) -> Optional[str]:
    """Helper to get value from row using multiple key variations (case-insensitive)."""
    for k in keys:
        if k in row:
            return row[k]
        k_upper = k.upper()
        for rk in row:
            if rk.upper() == k_upper:
                return row[rk]
    return None


def _build_address(row: dict) -> str:
    """Construct a full address string from individual master data fields."""
    parts = [
        _get_val(row, ["ADDRESS_LINE1", "Address1", "ADDRESS 1"]),
        _get_val(row, ["ADDRESS_LINE2", "Address2", "ADDRESS 2"]),
        _get_val(row, ["CITY", "City"]),
        _get_val(row, ["STATE_OR_TERITTORY", "STATE", "State"]),
        _get_val(row, ["ZIP_OR_POSTAL_CODE", "ZIP", "PostalCode"]),
        _get_val(row, ["COUNTRY", "Country"]),
    ]
    return " ".join(str(p).strip() for p in parts if p).strip()


# ---------------- LOAD MASTER ---------------- #
def get_cached_vendors(db: Session) -> Tuple[List[Dict], Dict[str, Dict], Dict[str, Dict]]:
    """
    Retrieve vendors from cache or reload from SQL Server if expired.
    Returns (rows, vendor_map, address_map).
    """
    global _VENDOR_CACHE
    now = time.time()

    if _VENDOR_CACHE["rows"] and (now - _VENDOR_CACHE["timestamp"] < CACHE_TTL):
        return _VENDOR_CACHE["rows"], _VENDOR_CACHE["vendor_map"], _VENDOR_CACHE["address_map"]

    logger.info("Reloading Vendor Master cache from SQL Server...")

    try:
        # 1. Find the Vendor Master file record
        vendor_file = db.query(ExcelFile).filter(
            ExcelFile.tab_name.in_(["Vendor_Master", "Vendor Master", "Vendors", "Vendor"])
        ).order_by(ExcelFile.uploaded_at.desc()).first()

        if not vendor_file:
            logger.warning("No Vendor Master file found in SQL Server")
            return [], {}, {}

        # 2. Extract all rows from chunks
        chunks = db.query(MasterDataChunk).filter(
            MasterDataChunk.file_id == vendor_file.id
        ).order_by(MasterDataChunk.chunk_index.asc()).all()

        rows = []
        for chunk in chunks:
            try:
                data = json.loads(chunk.data_json) if isinstance(chunk.data_json, str) else chunk.data_json
                if isinstance(data, dict) and "rows" in data:
                    rows.extend(data["rows"])
                elif isinstance(data, list):
                    rows.extend(data)
            except Exception as e:
                logger.error(f"Failed to parse chunk data: {e}")

        # 3. Build lookup maps
        vendor_map = {}
        address_map = {}
        for r in rows:
            name = _get_val(r, ["Vendor Name", "VendorName", "Name", "VENDOR_NAME", "VENDOR NAME"])
            if name:
                norm_name = normalize_vendor(str(name))
                if norm_name:
                    vendor_map[norm_name] = r

            addr = _get_val(r, ["Vendor Address", "VendorAddress", "Address", "VENDOR_ADDRESS", "VENDOR ADDRESS"]) or _build_address(r)
            if addr:
                norm_addr = normalize_address(str(addr))
                if norm_addr:
                    address_map[norm_addr] = r

        # Update Cache
        _VENDOR_CACHE = {
            "rows": rows,
            "vendor_map": vendor_map,
            "address_map": address_map,
            "timestamp": now
        }

        logger.info(f"Vendor cache refreshed. Loaded {len(rows)} vendors.")
        return rows, vendor_map, address_map

    except Exception as e:
        logger.error(f"Error loading vendor master: {e}")
        return [], {}, {}


# ---------------- MATCHER ---------------- #
def find_best_vendor_match(
    db: Session,
    input_vendor_name: str,
    input_vendor_address: str = None
) -> Dict[str, Any]:

    if not input_vendor_name and not input_vendor_address:
        return {"match": None, "score": 0.0, "method": "none", "reason": "empty_input"}

    rows, vendor_map, address_map = get_cached_vendors(db)
    if not rows:
        return {"match": None, "score": 0.0, "method": "none", "reason": "no_master"}

    norm_name = normalize_vendor(input_vendor_name) if input_vendor_name else None
    norm_addr = normalize_address(input_vendor_address) if input_vendor_address else None

    # ==========================================================
    # 1️⃣ EXACT ADDRESS MATCH (HIGHEST PRIORITY)
    # ==========================================================
    if norm_addr and norm_addr in address_map:
        return {
            "match": address_map[norm_addr],
            "score": 1.0,
            "method": "exact_address"
        }

    # ==========================================================
    # 2️⃣ EXACT NAME MATCH
    # ==========================================================
    if norm_name and norm_name in vendor_map:
        return {
            "match": vendor_map[norm_name],
            "score": 1.0,
            "method": "exact_name"
        }

    # ==========================================================
    # 3️⃣ ADVANCED MATCHING (FUZZY NAME + FUZZY ADDRESS)
    # ==========================================================
    best_name = {"row": None, "score": 0.0}
    best_addr = {"row": None, "score": 0.0}

    for r in rows:
        # ---------------- NAME ----------------
        if norm_name:
            vname = _get_val(r, ["Vendor Name", "VendorName", "Name", "VENDOR_NAME"])
            if vname:
                vn = normalize_vendor(str(vname))
                if vn and abs(len(vn) - len(norm_name)) <= 20:
                    score = SequenceMatcher(None, norm_name, vn).ratio()
                    if score > best_name["score"]:
                        best_name = {"row": r, "score": score}

        # ---------------- ADDRESS ----------------
        if norm_addr:
            addr = _get_val(r, ["Vendor Address", "VENDOR_ADDRESS"]) or _build_address(r)
            if addr:
                na = normalize_address(str(addr))
                if na and abs(len(na) - len(norm_addr)) <= 30:
                    score = SequenceMatcher(None, norm_addr, na).ratio()
                    if score > best_addr["score"]:
                        best_addr = {"row": r, "score": score}

    # ==========================================================
    # 4️⃣ FINAL DECISION (Mongo-style cross-check)
    # ==========================================================
    name_ok = best_name["score"] >= NAME_FUZZY_THRESHOLD
    addr_ok = best_addr["score"] >= ADDR_FUZZY_THRESHOLD

    if name_ok and not addr_ok:
        final = best_name
        method = "name_fuzzy"

    elif addr_ok and not name_ok:
        final = best_addr
        method = "address_fuzzy"

    elif name_ok and addr_ok:
        # Bias toward stronger signal
        if best_name["score"] >= best_addr["score"]:
            final = best_name
            method = "name_fuzzy"
        else:
            final = best_addr
            method = "address_fuzzy"

    else:
        # Mongo behavior: return best effort ONLY if reasonable
        if max(best_name["score"], best_addr["score"]) >= MIN_ACCEPTABLE_SCORE:
            if best_name["score"] >= best_addr["score"]:
                final = best_name
                method = "weak_name"
            else:
                final = best_addr
                method = "weak_address"
        else:
            return {
                "match": None,
                "score": max(best_name["score"], best_addr["score"]),
                "method": "none"
            }

    return {
        "match": final["row"],
        "score": final["score"],
        "method": method
    }

