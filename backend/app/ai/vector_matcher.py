import logging
import time
from typing import Optional, Dict, Any, Tuple, List
from app.ai.normalizer import normalize_vendor
from app.ai.embeddings import embed_text
from app.ai.similarity import cosine_similarity
from difflib import SequenceMatcher

logger = logging.getLogger(__name__)

# --- In-Memory Cache for Vendor Master ---
# Structure:
# {
#    "data": [list of vendor rows],
#    "map": {normalized_name: vendor_row},  # For O(1) exact match
#    "timestamp": float  # When cache was last updated
# }
_VENDOR_CACHE = {
    "data": [],
    "map": {},
    "timestamp": 0
}
CACHE_TTL = 300  # 5 minutes in seconds

def get_cached_vendors(db) -> Tuple[List[Dict], Dict[str, Dict]]:
    """
    Retrieve vendors from cache or reload from DB if expired.
    Returns:
        (list_of_all_vendors, map_of_normalized_names)
    """
    global _VENDOR_CACHE
    current_time = time.time()
    
    # Return cache if valid
    if _VENDOR_CACHE["data"] and (current_time - _VENDOR_CACHE["timestamp"] < CACHE_TTL):
        return _VENDOR_CACHE["data"], _VENDOR_CACHE["map"]
        
    logger.info("Vendor cache expired or empty. Reloading from database...")
    
    # Find active Vendor_Master collection
    # Note: In a high-concurrency env, this simple check might race, but it's acceptable here.
    try:
        files = list(db["excel_files"].find({}))
        vendor_master_file = None
        for f in files:
            if f.get("tab_name") in ["Vendor_Master", "Vendor Master", "Vendors", "Vendor"]:
                vendor_master_file = f
                break
                
        if not vendor_master_file or not vendor_master_file.get("sheets"):
            logger.warning("No Vendor Master file found in database")
            return [], {}
            
        collection_name = vendor_master_file["sheets"][0]["collection_name"]
        
        # Load all vendors
        chunks = list(db[collection_name].find().sort("chunk_index", 1))
        rows = []
        for chunk in chunks:
            rows.extend(chunk.get("rows", []))
            
        # Build lookup map for O(1) exact match
        lookup_map = {}
        for row in rows:
            v_name = row.get("Vendor Name") or row.get("VendorName") or row.get("Name") or row.get("VENDOR_NAME")
            if v_name:
                norm = normalize_vendor(str(v_name))
                if norm:
                    # If duplicate normalized names exist, the last one wins (or logic could be improved)
                    lookup_map[norm] = row
                    
        # Update Cache
        _VENDOR_CACHE = {
            "data": rows,
            "map": lookup_map,
            "timestamp": current_time
        }
        
        logger.info(f"Vendor cache refreshed. Loaded {len(rows)} vendors.")
        return rows, lookup_map
        
    except Exception as e:
        logger.error(f"Error loading vendor master: {e}")
        # Return fallback empty data so we don't crash
        return [], {}


def find_best_vendor_match(
    db, 
    input_vendor_name: str, 
    threshold_embedding: float = 0.85, 
    threshold_text: float = 0.60
) -> Dict[str, Any]:
    """
    Find the best matching vendor from Master Data using a multi-stage approach:
    1. Exact Normalized Match (Fastest O(1) with cache)
    2. Embedding Similarity (Semantic)
    3. Text Similarity (Fuzzy / Typos)
    
    Returns:
        Dictionary containing:
        - match: The vendor document (or None)
        - score: Confidence score (0.0 - 1.0)
        - method: "exact", "embedding", "text_similarity", or "none"
    """
    if not input_vendor_name:
        return {"match": None, "score": 0.0, "method": "none", "reason": "Empty input"}

    normalized_input = normalize_vendor(input_vendor_name)
    if not normalized_input:
         return {"match": None, "score": 0.0, "method": "none", "reason": "Normalized input empty"}

    # 1. Load Master Data (Cached)
    vendors, vendor_map = get_cached_vendors(db)
    
    if not vendors:
         return {"match": None, "score": 0.0, "method": "none", "reason": "No Master Data"}

    # 2. Exact Match Check (O(1) using Map)
    if normalized_input in vendor_map:
        match_row = vendor_map[normalized_input]
        v_name = match_row.get("Vendor Name") or match_row.get("VendorName") or match_row.get("Name") or match_row.get("VENDOR_NAME")
        logger.info(f"Exact match found (Cached): {v_name}")
        return {"match": match_row, "score": 1.0, "method": "exact"}

    # 3. Text Similarity (Fuzzy Match) - Moved up for performance
    logger.info("Checking text similarity...")
    best_text_score = 0
    best_text_match = None
    
    for row in vendors:
        v_name = row.get("Vendor Name") or row.get("VendorName") or row.get("Name") or row.get("VENDOR_NAME")
        if not v_name: continue
        
        norm_name = normalize_vendor(str(v_name))
        
        # Optimization: Length filter
        if abs(len(norm_name) - len(normalized_input)) > 5:
            continue
            
        similarity = SequenceMatcher(None, normalized_input, norm_name).ratio()
        
        if similarity > best_text_score:
            best_text_score = similarity
            best_text_match = row
            
    if best_text_score >= threshold_text:
        logger.info(f"Text similarity match: {best_text_match.get('VENDOR_NAME', 'Unknown')} (Score: {best_text_score})")
        return {"match": best_text_match, "score": best_text_score, "method": "text_similarity"}

    # 4. Embedding Match (Semantic) - Fallback, expensive!
    # Only run if dataset is small or we really need it.
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
