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
            return None, None
        
        # Get operation location
        operation_location = response.headers.get("Operation-Location")
        if not operation_location:
            logger.error("No operation location in response headers")
            logger.error(f"Available headers: {list(response.headers.keys())}")
            return None, None
        
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
                # Extract vendor name and invoice number
                vendor_name = None
                invoice_number = None
                
                if "analyzeResult" in result:
                    logger.debug(f"analyzeResult keys: {list(result['analyzeResult'].keys())}")
                    
                    if "documents" in result["analyzeResult"]:
                        logger.info(f"Found {len(result['analyzeResult']['documents'])} document(s)")
                        
                        for doc in result["analyzeResult"]["documents"]:
                            fields = doc.get("fields", {})
                            logger.debug(f"Available fields: {list(fields.keys())}")
                            
                            # Try multiple field name variations for vendor
                            for vendor_field in ["VendorName", "vendorName", "Vendor", "SupplierName"]:
                                if vendor_field in fields:
                                    field_data = fields[vendor_field]
                                    vendor_name = (
                                        field_data.get("content") or 
                                        field_data.get("valueString") or 
                                        field_data.get("value")
                                    )
                                    if vendor_name:
                                        logger.info(f"✓ Found vendor via field '{vendor_field}': {vendor_name}")
                                        break
                            
                            # Try multiple field name variations for invoice number
                            for invoice_field in ["InvoiceId", "invoiceId", "InvoiceNumber", "DocumentId"]:
                                if invoice_field in fields:
                                    field_data = fields[invoice_field]
                                    invoice_number = (
                                        field_data.get("content") or 
                                        field_data.get("valueString") or 
                                        field_data.get("value")
                                    )
                                    if invoice_number:
                                        logger.info(f"✓ Found invoice# via field '{invoice_field}': {invoice_number}")
                                        break
                            
                            # If we found both, break
                            if vendor_name and invoice_number:
                                break
                    else:
                        logger.warning("No 'documents' found in analyzeResult")
                else:
                    logger.warning("No 'analyzeResult' found in response")
                
                if vendor_name or invoice_number:
                    logger.info(f"✅ Quick extraction completed: vendor={vendor_name}, invoice={invoice_number}")
                else:
                    logger.warning("⚠️ Quick extraction completed but no vendor/invoice found")
                    
                return vendor_name, invoice_number
            
            elif status == "failed":
                error_info = result.get("error", {})
                logger.error(f"❌ Azure DI analysis failed: {error_info}")
                return None, None
        
        logger.warning("⏱️ Quick extraction timed out after 60 seconds")
        return None, None
        
    except Exception as e:
        logger.error(f"❌ Error during quick extraction: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return None, None
