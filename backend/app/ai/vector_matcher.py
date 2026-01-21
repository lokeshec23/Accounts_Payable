import logging
import time
from typing import Optional, Dict, Any, Tuple, List
from app.ai.normalizer import normalize_vendor, normalize_address
from app.ai.embeddings import embed_text, embed_texts_batch
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
    "name_embeddings": {},    # {normalized_name: embedding_list}
    "address_embeddings": {}, # {normalized_address: embedding_list}
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
        return (
            _VENDOR_CACHE["data"], 
            _VENDOR_CACHE["map"], 
            _VENDOR_CACHE["address_map"],
            _VENDOR_CACHE["name_embeddings"],
            _VENDOR_CACHE["address_embeddings"]
        )
        
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
                    
        # --- Pre-calculate Embeddings in Batch ---
        logger.info(f"Pre-calculating embeddings for {len(rows)} vendors...")
        all_norm_names = list(lookup_map.keys())
        all_norm_addrs = list(address_map.keys())
        
        name_embs = embed_texts_batch(all_norm_names)
        addr_embs = embed_texts_batch(all_norm_addrs)
        
        name_emb_map = dict(zip(all_norm_names, name_embs))
        addr_emb_map = dict(zip(all_norm_addrs, addr_embs))
                    
        # Update Cache
        _VENDOR_CACHE = {
            "data": rows,
            "map": lookup_map,
            "address_map": address_map,
            "name_embeddings": name_emb_map,
            "address_embeddings": addr_emb_map,
            "timestamp": current_time
        }
        
        logger.info(f"Vendor cache refreshed. Loaded {len(rows)} vendors with embeddings.")
        return rows, lookup_map, address_map, name_emb_map, addr_emb_map
        
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
    vendors, vendor_map, address_map, name_emb_map, addr_emb_map = get_cached_vendors(db)
    
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

    # If we reach here, no exact address or name match was found.
    # Proceed with advanced matching (Fuzzy/Embedding) for BOTH Name and Address.
    
    # Ensure normalized_input is available (it might be None if name wasn't provided)
    if input_vendor_name and not normalized_input:
         normalized_input = normalize_vendor(input_vendor_name)

    # Prepare Normalized Address for fuzzy/embedding if provided
    normalized_input_address = None
    if input_vendor_address:
        normalized_input_address = normalize_address(input_vendor_address)

    logger.info("Checking advanced matching (Fuzzy & Embedding)...")
    start_match = time.time()
    
    best_match_candidate = None
    best_match_score = 0.0
    best_match_method = "none"

    # --- 4. FUZZY & EMBEDDING MATCHING LOOP ---
    
    # Pre-calculate input embeddings (One call each per invoice)
    input_name_embedding = embed_text(normalized_input) if normalized_input else None
    input_address_embedding = embed_text(normalized_input_address) if normalized_input_address else None

    # Track best matches separately
    best_addr_match = None
    best_addr_score = 0.0
    best_addr_method = "none"

    best_name_match = None
    best_name_score = 0.0
    best_name_method = "none"

    for row in vendors:
        # --- A. ADDRESS BASED MATCHING ---
        if normalized_input_address:
            v_addr = row.get("Vendor Address") or row.get("VendorAddress") or row.get("Address") or row.get("VENDOR_ADDRESS")
            
            # Construct address if missing
            if not v_addr:
                 parts = [
                    row.get("ADDRESS_LINE1") or row.get("Address1"),
                    row.get("ADDRESS_LINE2") or row.get("Address2"),
                    row.get("CITY") or row.get("City"),
                    row.get("STATE_OR_TERITTORY") or row.get("STATE") or row.get("State"),
                    row.get("ZIP_OR_POSTAL_CODE") or row.get("ZIP") or row.get("PostalCode"),
                    row.get("COUNTRY") or row.get("Country")
                ]
                 v_addr = " ".join([str(p).strip() for p in parts if p]).strip()

            if v_addr:
                norm_addr = normalize_address(str(v_addr))
                
                # A1. Fuzzy Address
                if abs(len(norm_addr) - len(normalized_input_address)) < 30: # Relaxed length check
                    addr_similarity = SequenceMatcher(None, normalized_input_address, norm_addr).ratio()
                    
                    if addr_similarity > best_addr_score:
                        best_addr_score = addr_similarity
                        best_addr_match = row
                        best_addr_method = "fuzzy_address"

                # A2. Embedding Address
                if input_address_embedding:
                    target_addr_emb = addr_emb_map.get(norm_addr)
                    if target_addr_emb:
                        sem_score = cosine_similarity(input_address_embedding, target_addr_emb)
                        
                        if sem_score > best_addr_score:
                             best_addr_score = sem_score
                             best_addr_match = row
                             best_addr_method = "embedding_address"

        # --- B. NAME BASED MATCHING ---
        if normalized_input:
            v_name = row.get("Vendor Name") or row.get("VendorName") or row.get("Name") or row.get("VENDOR_NAME")
            if v_name:
                norm_name = normalize_vendor(str(v_name))
                
                # B1. Fuzzy Name
                if abs(len(norm_name) - len(normalized_input)) < 20:
                     name_similarity = SequenceMatcher(None, normalized_input, norm_name).ratio()
                     if name_similarity > best_name_score:
                         best_name_score = name_similarity
                         best_name_match = row
                         best_name_method = "text_similarity"

                # B2. Embedding Name
                if input_name_embedding:
                    target_name_emb = name_emb_map.get(norm_name)
                    if target_name_emb:
                        sem_name_score = cosine_similarity(input_name_embedding, target_name_emb)
                        if sem_name_score > best_name_score:
                            best_name_score = sem_name_score
                            best_name_match = row
                            best_name_method = "embedding"

    # --- FINAL DECISION: CROSS CHECK ---
    match_duration = time.time() - start_match
    logger.info(f"Advanced matching took {match_duration:.4f}s")
    logger.info(f"Best Name Match: {best_name_match.get('VENDOR_NAME') if best_name_match else 'None'} ({best_name_method}: {best_name_score})")
    logger.info(f"Best Addr Match: {best_addr_match.get('VENDOR_NAME') if best_addr_match else 'None'} ({best_addr_method}: {best_addr_score})")

    # Weights / Bias
    # User said: "address is wrong so you can do cross check with vendor name normalization and compare give the best one"
    # This implies we should trust the higher score, BUT maybe bias slightly towards Name if scores are close?
    
    final_match = None
    final_score = 0.0
    final_method = "none"
    
    # 1. Check strict thresholds first
    valid_name = best_name_score >= (threshold_text if best_name_method == "text_similarity" else threshold_embedding)
    valid_addr = best_addr_score >= (0.80 if best_addr_method == "fuzzy_address" else 0.88)
    
    if valid_name and not valid_addr:
        final_match = best_name_match
        final_score = best_name_score
        final_method = best_name_method
        
    elif valid_addr and not valid_name:
        final_match = best_addr_match
        final_score = best_addr_score
        final_method = best_addr_method
        
    elif valid_name and valid_addr:
        # Both valid: Compare scores
        if best_name_score >= best_addr_score:
             final_match = best_name_match
             final_score = best_name_score
             final_method = best_name_method
        else:
             final_match = best_addr_match
             final_score = best_addr_score
             final_method = best_addr_method
             
    else:
        # Neither passed strict threshold
        # Return best effort if it's "okay" (e.g. > 0.4) or just None?
        # Original logic returned best text match even if low.
        if best_name_score > best_addr_score:
             final_match = best_name_match # Return best prediction
             final_score = best_name_score
             final_method = "none" # Sub-threshold
        else:
             final_match = best_addr_match
             final_score = best_addr_score
             final_method = "none"

    if final_match and final_score >= 0.4: # Only return if at least somewhat relevant
         if final_score >= (threshold_text if "text" in final_method else threshold_embedding):
             logger.info(f"Match found via {final_method}: {final_match.get('VENDOR_NAME', 'Unknown')} (Score: {final_score})")
         else:
             logger.warning(f"Returning weak match (below threshold): {final_match.get('VENDOR_NAME', 'Unknown')} (Score: {final_score})")
             
         return {"match": final_match, "score": final_score, "method": final_method}

    return {"match": None, "score": final_score, "method": "none"}

