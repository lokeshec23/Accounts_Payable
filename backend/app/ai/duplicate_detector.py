import os
import logging
from typing import Optional, Tuple, Any
import requests
from app.ai.normalizer import normalize_vendor
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.sql.vendor_master import VendorMaster

logger = logging.getLogger(__name__)

# Azure Document Intelligence credentials
AZURE_DI_ENDPOINT = os.getenv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT")
AZURE_DI_KEY = os.getenv("AZURE_DOCUMENT_INTELLIGENCE_KEY")

async def _count_same_name_vendors(db: AsyncSession, normalized_name: str, entity: str = None) -> int:
    """Count vendors with the same normalized name (SQL)"""
    if not normalized_name:
        return 0

    stmt = select(VendorMaster).where(VendorMaster.entity == entity)
    result = await db.execute(stmt)
    vendors = result.scalars().all()
    
    count = 0
    for v in vendors:
        v_name = v.vendor_name
        if v_name and normalize_vendor(v_name) == normalized_name:
            count += 1
    return count

async def get_vendor_id_from_master(
    db: AsyncSession,
    vendor_name: str,
    entity: str = None,
    vendor_address: str = None
) -> Tuple[Optional[str], Optional[str], str, Optional[dict]]:
    """
    Resolve vendor ID and metadata using robust matching (SQL).
    """
    if not vendor_name and not vendor_address:
        return None, None, "No", None
        
    normalized_name = normalize_vendor(vendor_name) if vendor_name else None

    # Ambiguity check
    is_ambiguous = False
    if normalized_name:
        count = await _count_same_name_vendors(db, normalized_name, entity)
        is_ambiguous = count > 1
        
    if not is_ambiguous:
        if normalized_name:
            # Try simple exact-ish match
            stmt = select(VendorMaster).where(
                VendorMaster.entity == entity,
                func.lower(VendorMaster.vendor_name) == vendor_name.lower().strip()
            )
            res = await db.execute(stmt)
            match = res.scalar_one_or_none()
            if match:
                return match.vendor_id, match.vendor_name, match.line_grouping, match.details

    return None, None, "No", None


async def check_duplicate_invoice(db: AsyncSession, vendor_id: str, invoice_number: str, entity: str) -> Optional[Any]:
    """
    Check if invoice with same vendor_id + invoice_number exists (SQL Server).
    """
    from app.models.sql.invoice import Invoice as SQLInvoice

    if not vendor_id or not invoice_number:
        return None
    
    stmt = select(SQLInvoice).where(
        SQLInvoice.entity == entity,
        func.lower(SQLInvoice.vendor_id) == vendor_id.lower().strip(),
        func.lower(SQLInvoice.invoice_number) == invoice_number.lower().strip()
    )
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()
    
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
                            
                            if vendor_name or invoice_number: # Changed from `and vendor_address` to `or invoice_number` as per edit
                                break
                    
                return vendor_name, invoice_number, vendor_address
            
            elif status == "failed":
                return None, None, None
        
        return None, None, None
        
    except Exception as e:
        logger.error(f"❌ Error during quick extraction: {e}")
        import traceback
        logger.error(f"Traceback: {traceback.format_exc()}")
        return None, None, None
