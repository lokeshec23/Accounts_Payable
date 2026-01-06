import logging
from typing import Optional, Dict, Any, Tuple
from app.ai.normalizer import normalize_vendor
from app.ai.embeddings import embed_text
from app.ai.similarity import cosine_similarity
from difflib import SequenceMatcher

logger = logging.getLogger(__name__)

def find_best_vendor_match(
    db, 
    input_vendor_name: str, 
    threshold_embedding: float = 0.85, 
    threshold_text: float = 0.60
) -> Dict[str, Any]:
    """
    Find the best matching vendor from Master Data using a multi-stage approach:
    1. Exact Normalized Match (Fastest)
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

    # 1. Load Master Data
    # Find active Vendor_Master collection
    files = list(db["excel_files"].find({}))
    vendor_master_file = None
    for f in files:
        if f.get("tab_name") in ["Vendor_Master", "Vendor Master", "Vendors", "Vendor"]:
            vendor_master_file = f
            break
            
    if not vendor_master_file or not vendor_master_file.get("sheets"):
         logger.warning("No Vendor Master file found in database")
         return {"match": None, "score": 0.0, "method": "none", "reason": "No Master Data"}
         
    collection_name = vendor_master_file["sheets"][0]["collection_name"]
    
    # Load all vendors (optimized load would be better in production)
    chunks = list(db[collection_name].find().sort("chunk_index", 1))
    rows = []
    for chunk in chunks:
        rows.extend(chunk.get("rows", []))
        
    logger.info(f"Loaded {len(rows)} vendors for matching '{input_vendor_name}'")

    # 2. Exact Match Check
    for row in rows:
        v_name = row.get("Vendor Name") or row.get("VendorName") or row.get("Name") or row.get("VENDOR_NAME")
        if not v_name: continue
        
        norm_name = normalize_vendor(str(v_name))
        if norm_name == normalized_input:
            logger.info(f"Exact match found: {v_name}")
            return {"match": row, "score": 1.0, "method": "exact"}

    # 3. Embedding Match
    best_score = 0
    best_match = None
    
    # Generate input embedding
    # This might fail if Azure keys are missing, embed_text handles fallback to md5 which is not semantic
    # but exact match already handled md5-equivalent logic. 
    input_embedding = embed_text(normalized_input)
    
    for row in rows:
        v_name = row.get("Vendor Name") or row.get("VendorName") or row.get("Name") or row.get("VENDOR_NAME")
        if not v_name: continue
        
        norm_name = normalize_vendor(str(v_name))
        
        target_embedding = embed_text(norm_name)
        score = cosine_similarity(input_embedding, target_embedding)
        
        if score > best_score:
            best_score = score
            best_match = row

    if best_score >= threshold_embedding:
        logger.info(f"Embedding match: {best_match.get('VENDOR_NAME', 'Unknown')} (Score: {best_score})")
        return {"match": best_match, "score": best_score, "method": "embedding"}

    # 4. Text Similarity Fallback
    logger.info("Falling back to text similarity...")
    best_text_score = 0
    best_text_match = None
    
    for row in rows:
        v_name = row.get("Vendor Name") or row.get("VendorName") or row.get("Name") or row.get("VENDOR_NAME")
        if not v_name: continue
        
        norm_name = normalize_vendor(str(v_name))
        
        # Optimization
        if abs(len(norm_name) - len(normalized_input)) > 5:
            continue
            
        similarity = SequenceMatcher(None, normalized_input, norm_name).ratio()
        
        if similarity > best_text_score:
            best_text_score = similarity
            best_text_match = row
            
    if best_text_score >= threshold_text:
        logger.info(f"Text similarity match: {best_text_match.get('VENDOR_NAME', 'Unknown')} (Score: {best_text_score})")
        return {"match": best_text_match, "score": best_text_score, "method": "text_similarity"}
        
    logger.info(f"No match found. Best candidate was '{best_text_match.get('VENDOR_NAME') if best_text_match else 'None'}' (Text: {best_text_score})")
    return {"match": None, "score": max(best_score, best_text_score), "method": "none"}
