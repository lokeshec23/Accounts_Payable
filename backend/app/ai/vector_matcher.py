import logging
import time
from typing import Optional, Dict, Any, Tuple, List
from app.ai.normalizer import normalize_vendor, normalize_address
from app.ai.embeddings import embed_text
from app.ai.similarity import cosine_similarity
from difflib import SequenceMatcher

logger = logging.getLogger(__name__)

# --- In-Memory Cache for Vendor Master ---
# Structure:
# {
#    "data": [list of vendor rows],
#    "map": {normalized_name: vendor_row},  # For O(1) exact name match
#    "address_map": {normalized_address: vendor_row}, # For O(1) exact address match
#    "timestamp": float  # When cache was last updated
# }
_VENDOR_CACHE = {
    "data": [],
    "map": {},
    "address_map": {},
    "timestamp": 0
}
CACHE_TTL = 300  # 5 minutes in seconds

def get_cached_vendors(db) -> Tuple[List[Dict], Dict[str, Dict], Dict[str, Dict]]:
    """
    Retrieve vendors from cache or reload from DB if expired.
    Returns:
        (list_of_all_vendors, map_of_normalized_names, map_of_normalized_addresses)
    """
    global _VENDOR_CACHE
    current_time = time.time()
    
    # Return cache if valid
    if _VENDOR_CACHE["data"] and (current_time - _VENDOR_CACHE["timestamp"] < CACHE_TTL):
        return _VENDOR_CACHE["data"], _VENDOR_CACHE["map"], _VENDOR_CACHE["address_map"]
        
    logger.info("Vendor cache expired or empty. Reloading from database...")
    
    # Find active Vendor_Master collection
    try:
        files = list(db["excel_files"].find({}))
        vendor_master_file = None
        for f in files:
            if f.get("tab_name") in ["Vendor_Master", "Vendor Master", "Vendors", "Vendor"]:
                vendor_master_file = f
                break
                
        if not vendor_master_file or not vendor_master_file.get("sheets"):
            logger.warning("No Vendor Master file found in database")
            return [], {}, {}
            
        collection_name = vendor_master_file["sheets"][0]["collection_name"]
        
        # Load all vendors
        chunks = list(db[collection_name].find().sort("chunk_index", 1))
        rows = []
        for chunk in chunks:
            rows.extend(chunk.get("rows", []))
            
        # Build lookup maps for O(1) exact match
        lookup_map = {}
        address_map = {}
        for row in rows:
            v_name = row.get("Vendor Name") or row.get("VendorName") or row.get("Name") or row.get("VENDOR_NAME")
            if v_name:
                norm = normalize_vendor(str(v_name))
                if norm:
                    lookup_map[norm] = row
            
            # Address construction - handle split fields
            v_addr = row.get("Vendor Address") or row.get("VendorAddress") or row.get("Address") or row.get("VENDOR_ADDRESS")
            if not v_addr:
                # Try to construct from parts found in logs (ADDRESS_LINE1, CITY, etc.)
                parts = [
                    row.get("ADDRESS_LINE1") or row.get("Address1"),
                    row.get("ADDRESS_LINE2") or row.get("Address2"),
                    row.get("ADDRESS_LINE3") or row.get("Address3"),
                    row.get("CITY") or row.get("City"),
                    row.get("STATE_OR_TERITTORY") or row.get("STATE") or row.get("State"),
                    row.get("ZIP_OR_POSTAL_CODE") or row.get("ZIP") or row.get("PostalCode") or row.get("ZipCode"),
                    row.get("COUNTRY") or row.get("Country")
                ]
                v_addr = " ".join([str(p).strip() for p in parts if p]).strip()

            if v_addr:
                norm_addr = normalize_address(str(v_addr))
                if norm_addr:
                    address_map[norm_addr] = row
                    
        # Update Cache
        _VENDOR_CACHE = {
            "data": rows,
            "map": lookup_map,
            "address_map": address_map,
            "timestamp": current_time
        }
        
        logger.info(f"Vendor cache refreshed. Loaded {len(rows)} vendors.")
        return rows, lookup_map, address_map
        
    except Exception as e:
        logger.error(f"Error loading vendor master: {e}")
        return [], {}, {}


def find_best_vendor_match(
    db, 
    input_vendor_name: str, 
    input_vendor_address: str = None,
    threshold_embedding: float = 0.85, 
    threshold_text: float = 0.60
) -> Dict[str, Any]:
    """
    Find the best matching vendor from Master Data using a multi-stage approach:
    0. Exact Normalized Address Match (HIGHEST PRIORITY)
    1. Exact Normalized Name Match
    2. Embedding Similarity (Semantic)
    3. Text Similarity (Fuzzy / Typos)
    
    Returns:
        Dictionary containing:
        - match: The vendor document (or None)
        - score: Confidence score (0.0 - 1.0)
        - method: "exact_address", "exact", "embedding", "text_similarity", or "none"
    """
    if not input_vendor_name and not input_vendor_address:
        return {"match": None, "score": 0.0, "method": "none", "reason": "Empty input"}

    # 1. Load Master Data (Cached)
    vendors, vendor_map, address_map = get_cached_vendors(db)
    
    if not vendors:
         return {"match": None, "score": 0.0, "method": "none", "reason": "No Master Data"}

    # 2. EXACT ADDRESS MATCH (Highest Priority)
    if input_vendor_address:
        normalized_address = normalize_address(input_vendor_address)
        if normalized_address in address_map:
            match_row = address_map[normalized_address]
            v_name = match_row.get("Vendor Name") or match_row.get("VendorName") or match_row.get("Name") or match_row.get("VENDOR_NAME")
            logger.info(f"Exact Address match found: {v_name}")
            return {"match": match_row, "score": 1.0, "method": "exact_address"}

    # 3. EXACT NAME MATCH
    normalized_input = None # Initialize for later use
    if input_vendor_name:
        normalized_input = normalize_vendor(input_vendor_name)
        if not normalized_input:
            # If name was provided but normalized to empty, we can't proceed with name-based matching
            return {"match": None, "score": 0.0, "method": "none", "reason": "Normalized input name empty"}

        if normalized_input in vendor_map:
            match_row = vendor_map[normalized_input]
            v_name = match_row.get("Vendor Name") or match_row.get("VendorName") or match_row.get("Name") or match_row.get("VENDOR_NAME")
            logger.info(f"Exact Name match found (Cached): {v_name}")
            return {"match": match_row, "score": 1.0, "method": "exact"}
    else:
        # If no name provided and address didn't match, return none
        return {"match": None, "score": 0.0, "method": "none", "reason": "No name provided and address match failed"}

    # If we reach here, no exact address or name match was found. Proceed with fuzzy/embedding on name.
    # Ensure normalized_input is available for subsequent steps if input_vendor_name was provided.
    # It should be defined from the "3. EXACT NAME MATCH" block.

    # 4. Text Similarity (Fuzzy Match) - Based on NAME
    logger.info("Checking text similarity...")
    best_text_score = 0
    best_text_match = None
    
    for row in vendors:
        v_name = row.get("Vendor Name") or row.get("VendorName") or row.get("Name") or row.get("VENDOR_NAME")
        if not v_name: continue
        
        norm_name = normalize_vendor(str(v_name))
        
        # Optimization: Length filter (Relaxed to allow "Company" vs "Company North America")
        if abs(len(norm_name) - len(normalized_input)) > 15:
            continue
            
        similarity = SequenceMatcher(None, normalized_input, norm_name).ratio()
        
        if similarity > best_text_score:
            best_text_score = similarity
            best_text_match = row
            
    if best_text_score >= threshold_text:
        logger.info(f"Text similarity match: {best_text_match.get('VENDOR_NAME', 'Unknown')} (Score: {best_text_score})")
        return {"match": best_text_match, "score": best_text_score, "method": "text_similarity"}

    # 5. Embedding Match (Semantic) - Fallback based on NAME
    if len(vendors) > 20: 
        logger.warning(f"Skipping embedding match due to large dataset size ({len(vendors)} vendors). Relying on text similarity.")
        # Return best text match if it exists (even if below threshold, maybe?) 
        # Or just return None if strictly below threshold.
        # Let's return the best text match if it's decent (> 0.4) as a "guess" but strictly it respects threshold_text above.
        return {"match": None, "score": best_text_score, "method": "none"}
        
    best_score = 0
    best_match = None
    
    # Generate input embedding
    input_embedding = embed_text(normalized_input)
    
    # Optimization: If input_embedding failed (e.g. key missing), skip this heavy loop
    if input_embedding:
        for row in vendors:
            v_name = row.get("Vendor Name") or row.get("VendorName") or row.get("Name") or row.get("VENDOR_NAME")
            if not v_name: continue
            
            norm_name = normalize_vendor(str(v_name))
            
            # TODO: Ideally cache embeddings too, but that's memory intensive.
            # For now, we regenerate target embedding. 
            # PRO NOTE: In a real heavy system, we'd pre-compute embeddings in the DB.
            target_embedding = embed_text(norm_name)
            
            if target_embedding:
                score = cosine_similarity(input_embedding, target_embedding)
                if score > best_score:
                    best_score = score
                    best_match = row

        if best_score >= threshold_embedding:
            logger.info(f"Embedding match: {best_match.get('VENDOR_NAME', 'Unknown')} (Score: {best_score})")
            return {"match": best_match, "score": best_score, "method": "embedding"}

    logger.info(f"No match found. Best candidate was '{best_text_match.get('VENDOR_NAME') if best_text_match else 'None'}' (Text: {best_text_score})")
    return {"match": None, "score": max(best_score, best_text_score), "method": "none"}
