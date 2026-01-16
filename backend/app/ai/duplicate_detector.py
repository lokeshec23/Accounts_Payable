import os
import logging
from typing import Optional, Dict, Tuple
from pymongo import ASCENDING
import requests
from app.ai.normalizer import normalize_vendor, normalize_address
from app.ai.vector_matcher import find_best_vendor_match

logger = logging.getLogger(__name__)

# Azure Document Intelligence credentials
AZURE_DI_ENDPOINT = os.getenv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT")
AZURE_DI_KEY = os.getenv("AZURE_DOCUMENT_INTELLIGENCE_KEY")

def get_vendor_id_from_master(db, vendor_name: str, entity: str = None, vendor_address: str = None) -> Tuple[Optional[str], Optional[str], str]:
    """
    Normalize vendor name and address, then lookup Vendor ID and official vendor name.
    Uses robust matching (Exact -> Embedding -> Text Similarity).
    Also checks vendor_metadata for manual mappings (both name and address based).
    
    Args:
        db: Database connection
        vendor_name: Raw vendor name from invoice
        entity: Entity identifier
        vendor_address: Raw vendor address from invoice
        
    Returns:
        Tuple of (vendor_id, official_vendor_name, line_grouping)
    """
    if not vendor_name and not vendor_address:
        return None, None, "No"
        
    normalized_name = normalize_vendor(vendor_name) if vendor_name else None
    normalized_address = normalize_address(vendor_address) if vendor_address else None

    # 1. Check vendor_metadata for manual mappings first
    if normalized_name or normalized_address:
        # Check by address first (Highest Priority)
        if normalized_address:
            addr_query = {"extracted_address_normalized": normalized_address}
            if entity:
                addr_query["entity"] = entity
            
            mapping = db.vendor_metadata.find_one(addr_query)
            if mapping:
                logger.info(f"Vendor Mapping: Found manual mapping for address '{vendor_address}' -> '{mapping['official_name']}' (ID: {mapping['vendor_id']})")
                return mapping["vendor_id"], mapping["official_name"], mapping.get("line_grouping", "No")

        # Then check by name
        if normalized_name:
            metadata_query = {"extracted_name_normalized": normalized_name}
            if entity:
                metadata_query["entity"] = entity
            
            mapping = db.vendor_metadata.find_one(metadata_query)
            if mapping:
                logger.info(f"Vendor Mapping: Found manual mapping for name '{vendor_name}' -> '{mapping['official_name']}' (ID: {mapping['vendor_id']})")
                return mapping["vendor_id"], mapping["official_name"], mapping.get("line_grouping", "No")

    # 2. Proceed with robust matching if no manual mapping found
    # Pass both name and address to the matcher
    result = find_best_vendor_match(db, vendor_name, vendor_address)
    
    if result and result["match"]:
        match = result["match"]
        # Extract ID and Name from match
        vendor_id = match.get("Vendor ID") or match.get("VendorID") or match.get("vendor_id") or match.get("VENDOR_ID")
        
        # Get official valid name
        official_name = match.get("Vendor Name") or match.get("VendorName") or match.get("Name") or match.get("VENDOR_NAME")
        
        # Get Line Grouping
        line_grouping = match.get("Line Grouping") or "No"

        if vendor_id:
             logger.info(f"Duplicate Detector: Matched via {result['method']}")
             return str(vendor_id), str(official_name), str(line_grouping)
             
    logger.warning(f"Duplicate Detector: No match found for Name='{vendor_name}', Addr='{vendor_address}'")
    return None, None, "No"


def check_duplicate_invoice(db, vendor_id: str, invoice_number: str, entity: str) -> Optional[Dict]:
    """
    Check if invoice with same vendor_id + invoice_number exists.
    
    Args:
        db: Database connection
        vendor_id: Vendor ID from master data
        invoice_number: Invoice number from extraction
        entity: Entity identifier
        
    Returns:
        Existing invoice document if duplicate found, None otherwise
    """
    if not vendor_id or not invoice_number:
        return None
    
    # Query invoices collection
    existing = db.invoices.find_one({
        "vendor_id": vendor_id,
        "invoice_number": invoice_number,
        "entity": entity
    })
    
    if existing:
        logger.info(f"Duplicate invoice found: vendor_id={vendor_id}, invoice_number={invoice_number}")
        return existing
    
    return None


async def extract_vendor_invoice_and_address(file_path: str) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Quick extraction of vendor name, invoice number, and address using Azure Document Intelligence.
    This is a lightweight extraction focused only on key fields needed for duplicate detection and normalization.
    
    Args:
        file_path: Path to invoice PDF file
        
    Returns:
        Tuple of (vendor_name, invoice_number, vendor_address)
    """
    if not AZURE_DI_ENDPOINT or not AZURE_DI_KEY:
        logger.warning("Azure Document Intelligence not configured, cannot perform quick extraction")
        return None, None, None
    
    try:
        logger.info(f"Starting quick extraction for: {file_path}")
        
        # Read the file
        with open(file_path, "rb") as f:
            file_content = f.read()
        
        logger.info(f"File size: {len(file_content)} bytes")
        
        # Call Azure Document Intelligence with prebuilt-invoice model
        # Using stable API version 2023-07-31
        analyze_url = f"{AZURE_DI_ENDPOINT}/formrecognizer/documentModels/prebuilt-invoice:analyze?api-version=2023-07-31"
        
        headers = {
            "Content-Type": "application/pdf",
            "Ocp-Apim-Subscription-Key": AZURE_DI_KEY
        }
        
        # Start analysis
        logger.info(f"Sending POST request to Azure DI: {analyze_url}")
        try:
            response = requests.post(analyze_url, headers=headers, data=file_content, timeout=30)
            logger.info(f"Azure DI POST response status: {response.status_code}")
            response.raise_for_status()
        except requests.exceptions.RequestException as e:
            logger.error(f"Azure DI POST request failed: {e}")
            if hasattr(e, 'response') and e.response is not None:
                logger.error(f"Response status: {e.response.status_code}")
                logger.error(f"Response content: {e.response.text[:500]}")
            return None, None, None
        
        # Get operation location
        operation_location = response.headers.get("Operation-Location")
        if not operation_location:
            logger.error("No operation location in response headers")
            return None, None, None
        
        logger.info(f"Operation location: {operation_location}")
        
        # Poll for results (simplified, max 60 seconds)
        import time
        max_attempts = 60
        for attempt in range(max_attempts):
            time.sleep(1)
            
            try:
                result_response = requests.get(
                    operation_location,
                    headers={"Ocp-Apim-Subscription-Key": AZURE_DI_KEY},
                    timeout=10
                )
                result_response.raise_for_status()
                result = result_response.json()
            except requests.exceptions.RequestException as e:
                logger.error(f"Error polling results (attempt {attempt + 1}): {e}")
                continue
            
            status = result.get("status")
            logger.debug(f"Polling attempt {attempt + 1}: status={status}")
            
            if status == "succeeded":
                # Extract vendor name, invoice number, and address
                vendor_name = None
                invoice_number = None
                vendor_address = None
                
                if "analyzeResult" in result:
                    if "documents" in result["analyzeResult"]:
                        for doc in result["analyzeResult"]["documents"]:
                            fields = doc.get("fields", {})
                            
                            # Vendor Name
                            for f in ["VendorName", "vendorName", "Vendor", "SupplierName"]:
                                if f in fields:
                                    vendor_name = fields[f].get("content") or fields[f].get("valueString") or fields[f].get("value")
                                    if vendor_name: break
                            
                            # Invoice Number
                            for f in ["InvoiceId", "invoiceId", "InvoiceNumber", "DocumentId"]:
                                if f in fields:
                                    invoice_number = fields[f].get("content") or fields[f].get("valueString") or fields[f].get("value")
                                    if invoice_number: break

                            # Vendor Address
                            for f in ["VendorAddress", "vendorAddress", "Address"]:
                                if f in fields:
                                    vendor_address = fields[f].get("content") or fields[f].get("valueString") or fields[f].get("value")
                                    if vendor_address: break
                            
                            if vendor_name and invoice_number and vendor_address:
                                break
                    
                return vendor_name, invoice_number, vendor_address
            
            elif status == "failed":
                return None, None, None
        
        return None, None, None
        
        logger.warning("⏱️ Quick extraction timed out after 60 seconds")
        return None, None
        
    except Exception as e:
        logger.error(f"❌ Error during quick extraction: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return None, None
