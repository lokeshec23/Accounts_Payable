import os
import logging
from typing import Optional, Dict, Tuple, Any
import requests
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.db_models import Invoice, VendorMetadata
from app.ai.normalizer import normalize_vendor, normalize_address
from app.ai.vector_matcher import find_best_vendor_match, get_cached_vendors

logger = logging.getLogger(__name__)

# Azure Document Intelligence credentials
AZURE_DI_ENDPOINT = os.getenv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT")
AZURE_DI_KEY = os.getenv("AZURE_DOCUMENT_INTELLIGENCE_KEY")

def _count_same_name_vendors(db: Session, normalized_name: str, entity: str = None) -> int:
    """
    Count how many vendors in the master data share the same normalized name.
    """
    if not normalized_name:
        return 0

    vendors, _, _ = get_cached_vendors(db)
    count = 0
    for v in vendors:
        name = (
            v.get("Vendor Name") or
            v.get("VendorName") or
            v.get("Name") or
            v.get("VENDOR_NAME") or
            v.get("VENDOR NAME")
        )
        if name and normalize_vendor(str(name)) == normalized_name:
            count += 1
    return count


def get_vendor_id_from_master(
    db: Session,
    vendor_name: str,
    entity: str = None,
    vendor_address: str = None
) -> Tuple[Optional[str], Optional[str], str, Optional[dict]]:
    """
    Safe vendor resolution:
    - Address-based vendor_metadata → always allowed
    - Name-based vendor_metadata → only if name is NOT ambiguous
    - AI / vector match → only if name is NOT ambiguous
    """

    if not vendor_name and not vendor_address:
        return None, None, "No", None

    normalized_name = normalize_vendor(vendor_name) if vendor_name else None
    normalized_address = normalize_address(vendor_address) if vendor_address else None

    # -------------------------------------------------------
    # 0. Ambiguity detection
    # -------------------------------------------------------
    is_ambiguous = False
    if normalized_name:
        count = _count_same_name_vendors(db, normalized_name, entity)
        if count > 1:
            is_ambiguous = True

    # if is_ambiguous:
    #     logger.warning(
    #         f"⚠️ Ambiguous vendor name detected: '{vendor_name}'. "
    #         f"Multiple vendors share this name. Name-based auto-mapping will be skipped."
    #     )

    # -------------------------------------------------------
    # 1. Vendor Metadata Lookup (SQL Server)
    # -------------------------------------------------------
    if normalized_name or normalized_address:

        # 1A. Address-based mapping → ALWAYS SAFE
        if normalized_address:
            # Check Address-based Mapping
            query = db.query(VendorMetadata).filter(VendorMetadata.extracted_address_normalized == normalized_address)
            if entity:
                query = query.filter(VendorMetadata.entity == entity)
            mapping = query.first()
            
            if mapping:
                logger.info(f"Vendor Mapping (Address): '{vendor_address}' -> '{mapping.official_name}'")
                
                # Fetch full record from cache/master
                vendors, _, _ = get_cached_vendors(db)
                full_v = next((v for v in vendors if (v.get("Vendor ID") or v.get("VendorID") or v.get("VENDOR_ID") or v.get("VENDOR ID")) == mapping.vendor_id), None)

                return (
                    mapping.vendor_id,
                    mapping.official_name,
                    mapping.line_grouping or "No",
                    full_v
                )

        # 1B. Name-based mapping → ONLY if NOT ambiguous
        if normalized_name and not is_ambiguous:
            # Check Name-based Mapping
            query = db.query(VendorMetadata).filter(VendorMetadata.extracted_name_normalized == normalized_name)
            if entity:
                query = query.filter(VendorMetadata.entity == entity)
            mapping = query.first()
            
            if mapping:
                logger.info(f"Vendor Mapping (Name): '{vendor_name}' -> '{mapping.official_name}'")
                
                vendors, _, _ = get_cached_vendors(db)
                full_v = next((v for v in vendors if (v.get("Vendor ID") or v.get("VendorID") or v.get("VENDOR_ID") or v.get("VENDOR ID")) == mapping.vendor_id), None)

                return (
                    mapping.vendor_id,
                    mapping.official_name,
                    mapping.line_grouping or "No",
                    full_v
                )

    # -------------------------------------------------------
    # 2. AI / Vector Matching
    # -------------------------------------------------------
    # Relaxed ambiguity restriction to allow for tie-breaking via address/embeddings
    result = find_best_vendor_match(db, vendor_name, vendor_address)

    if result and result.get("match"):
        match = result["match"]
        vendor_id = str(match.get("Vendor ID") or match.get("VendorID") or match.get("vendor_id") or match.get("VENDOR_ID") or match.get("VENDOR ID") or "")
        official_name = str(match.get("Vendor Name") or match.get("VendorName") or match.get("Name") or match.get("VENDOR_NAME") or match.get("VENDOR NAME") or "")
        line_grouping = str(match.get("Line Grouping") or match.get("LINE GROUPING") or "No")

        if vendor_id:
            logger.info(f"Vendor matched via {result.get('method')}")
            return vendor_id, official_name, line_grouping, match

    # -------------------------------------------------------
    # 3. No safe match found
    # -------------------------------------------------------
    return None, None, "No", None


def check_duplicate_invoice(db: Session, vendor_id: str, invoice_number: str, entity: str) -> Optional[Dict[str, Any]]:
    """
    Check if invoice with same vendor_id + invoice_number exists using SQLAlchemy.
    """
    if not vendor_id or not invoice_number:
        return None
    
    # SQL Server is usually case-insensitive by default with its collations, 
    # but we can use func.lower() for safety or if the collation is case-sensitive.
    existing = db.query(Invoice).filter(
        func.lower(Invoice.vendor_id) == vendor_id.lower().strip(),
        func.lower(Invoice.invoice_number) == invoice_number.lower().strip(),
        Invoice.entity == entity
    ).first()
    
    if existing:
        logger.info(f"Duplicate invoice found: vendor_id={vendor_id}, invoice_number={invoice_number}")
        # Convert to dict for backward compatibility
        from app.database.db_utils import invoice_to_dict
        return invoice_to_dict(existing)
    
    return None


async def extract_vendor_invoice_and_address(file_path: str) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Quick extraction of vendor name, invoice number, and address using Azure Document Intelligence.
    """
    if not AZURE_DI_ENDPOINT or not AZURE_DI_KEY:
        logger.warning("Azure Document Intelligence not configured")
        return None, None, None
    
    try:
        with open(file_path, "rb") as f:
            file_content = f.read()
            
        analyze_url = f"{AZURE_DI_ENDPOINT}/formrecognizer/documentModels/prebuilt-invoice:analyze?api-version=2023-07-31"
        headers = {"Content-Type": "application/pdf", "Ocp-Apim-Subscription-Key": AZURE_DI_KEY}
        
        response = requests.post(analyze_url, headers=headers, data=file_content, timeout=30)
        response.raise_for_status()
        
        operation_location = response.headers.get("Operation-Location")
        if not operation_location: return None, None, None
        
        import time
        for _ in range(30): # Poll for up to 30s
            time.sleep(1)
            result_response = requests.get(operation_location, headers={"Ocp-Apim-Subscription-Key": AZURE_DI_KEY})
            result = result_response.json()
            if result.get("status") == "succeeded":
                # Basic extraction logic
                fields = result.get("analyzeResult", {}).get("documents", [{}])[0].get("fields", {})
                v_name = fields.get("VendorName", {}).get("content")
                inv_num = fields.get("InvoiceId", {}).get("content")
                v_addr = fields.get("VendorAddress", {}).get("content")
                return v_name, inv_num, v_addr
            elif result.get("status") == "failed": break
            
        return None, None, None
    except Exception as e:
        logger.error(f"Error during quick extraction: {e}")
        return None, None, None
