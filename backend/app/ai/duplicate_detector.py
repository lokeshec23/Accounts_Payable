import os
import logging
from typing import Optional, Dict, Tuple
from pymongo import ASCENDING
from app.ai.normalizer import normalize_vendor
import requests

logger = logging.getLogger(__name__)

# Azure Document Intelligence credentials
AZURE_DI_ENDPOINT = os.getenv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT")
AZURE_DI_KEY = os.getenv("AZURE_DOCUMENT_INTELLIGENCE_KEY")


from app.ai.vector_matcher import find_best_vendor_match

def get_vendor_id_from_master(db, vendor_name: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Normalize vendor name and lookup Vendor ID and official vendor name from Vendor_Master collection.
    Uses robust matching (Exact -> Embedding -> Text Similarity).
    
    Args:
        db: Database connection
        vendor_name: Raw vendor name from invoice
        
    Returns:
        Tuple of (vendor_id, official_vendor_name) if found, (None, None) otherwise
    """
    if not vendor_name:
        return None, None
        
    result = find_best_vendor_match(db, vendor_name)
    
    if result and result["match"]:
        match = result["match"]
        # Extract ID and Name from match
        vendor_id = match.get("Vendor ID") or match.get("VendorID") or match.get("vendor_id") or match.get("VENDOR_ID")
        
        # Get official valid name
        official_name = match.get("Vendor Name") or match.get("VendorName") or match.get("Name") or match.get("VENDOR_NAME")
        
        # Get Line Grouping
        line_grouping = match.get("Line Grouping") or "No"

        if vendor_id:
             logger.info(f"Duplicate Detector: Matched '{vendor_name}' -> '{official_name}' (ID: {vendor_id}) via {result['method']}")
             return str(vendor_id), str(official_name), str(line_grouping)
             
    logger.warning(f"Duplicate Detector: No match found for '{vendor_name}'")
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


def extract_vendor_and_invoice_number(file_path: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Quick extraction of vendor name and invoice number using Azure Document Intelligence.
    This is a lightweight extraction focused only on key fields needed for duplicate detection.
    
    Args:
        file_path: Path to invoice PDF file
        
    Returns:
        Tuple of (vendor_name, invoice_number)
    """
    if not AZURE_DI_ENDPOINT or not AZURE_DI_KEY:
        logger.warning("Azure Document Intelligence not configured, cannot perform quick extraction")
        return None, None
    
    try:
        # Read the file
        with open(file_path, "rb") as f:
            file_content = f.read()
        
        # Call Azure Document Intelligence with prebuilt-invoice model
        analyze_url = f"{AZURE_DI_ENDPOINT}/formrecognizer/documentModels/prebuilt-invoice:analyze?api-version=2024-11-30"
        
        headers = {
            "Content-Type": "application/pdf",
            "Ocp-Apim-Subscription-Key": AZURE_DI_KEY
        }
        
        # Start analysis
        response = requests.post(analyze_url, headers=headers, data=file_content)
        response.raise_for_status()
        
        # Get operation location
        operation_location = response.headers.get("Operation-Location")
        if not operation_location:
            logger.error("No operation location in response headers")
            return None, None
        
        # Poll for results (simplified, max 60 seconds)
        import time
        max_attempts = 60
        for attempt in range(max_attempts):
            time.sleep(1)
            result_response = requests.get(
                operation_location,
                headers={"Ocp-Apim-Subscription-Key": AZURE_DI_KEY}
            )
            result_response.raise_for_status()
            result = result_response.json()
            
            if result.get("status") == "succeeded":
                # Extract vendor name and invoice number
                vendor_name = None
                invoice_number = None
                
                if "analyzeResult" in result and "documents" in result["analyzeResult"]:
                    for doc in result["analyzeResult"]["documents"]:
                        fields = doc.get("fields", {})
                        
                        # Get vendor name
                        if "VendorName" in fields:
                            vendor_name = fields["VendorName"].get("content") or fields["VendorName"].get("valueString")
                        
                        # Get invoice number
                        if "InvoiceId" in fields:
                            invoice_number = fields["InvoiceId"].get("content") or fields["InvoiceId"].get("valueString")
                
                logger.info(f"Quick extraction completed: vendor={vendor_name}, invoice={invoice_number}")
                return vendor_name, invoice_number
            
            elif result.get("status") == "failed":
                logger.error(f"Azure DI analysis failed: {result.get('error')}")
                return None, None
        
        logger.warning("Quick extraction timed out")
        return None, None
        
    except Exception as e:
        logger.error(f"Error during quick extraction: {e}")
        return None, None
