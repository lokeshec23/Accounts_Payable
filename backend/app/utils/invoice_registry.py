"""
Invoice Registry Helper - Fast Duplicate Detection

This module provides O(1) lookup for duplicate invoices using a dedicated
lightweight collection with compound indexes.
"""

from typing import Optional, Dict
from datetime import datetime
from bson.objectid import ObjectId
import logging

logger = logging.getLogger(__name__)


def ensure_registry_index(db):
    """
    Create compound index on invoice_registry collection for fast lookups.
    This should be called once during application startup.
    """
    try:
        db.invoice_registry.create_index(
            [("vendor_id", 1), ("invoice_number", 1), ("entity", 1)],
            unique=True,
            name="vendor_invoice_entity_unique"
        )
        logger.info("Invoice registry index created/verified")
    except Exception as e:
        logger.error(f"Failed to create registry index: {e}")


def register_invoice(
    db,
    vendor_id: str,
    invoice_number: str,
    entity: str,
    invoice_id: str,
    uploaded_by: str
) -> bool:
    """
    Register an invoice in the fast lookup registry.
    
    Args:
        db: Database connection
        vendor_id: Vendor ID from master data
        invoice_number: Invoice number from extraction
        entity: Entity identifier
        invoice_id: MongoDB ObjectId of the invoice document
        uploaded_by: Username who uploaded
        
    Returns:
        True if registered successfully, False otherwise
    """
    try:
        registry_doc = {
            "vendor_id": vendor_id,
            "invoice_number": invoice_number,
            "entity": entity,
            "invoice_id": ObjectId(invoice_id) if isinstance(invoice_id, str) else invoice_id,
            "uploaded_at": datetime.utcnow(),
            "uploaded_by": uploaded_by
        }
        
        db.invoice_registry.insert_one(registry_doc)
        logger.info(f"Registered invoice: vendor={vendor_id}, invoice#={invoice_number}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to register invoice: {e}")
        return False


def check_registry_duplicate(
    db,
    vendor_id: str,
    invoice_number: str,
    entity: str
) -> Optional[Dict]:
    """
    Fast O(1) lookup to check if invoice already exists.
    
    Args:
        db: Database connection
        vendor_id: Vendor ID from master data
        invoice_number: Invoice number from extraction
        entity: Entity identifier
        
    Returns:
        Registry document if duplicate found, None otherwise
    """
    try:
        existing = db.invoice_registry.find_one({
            "vendor_id": vendor_id,
            "invoice_number": invoice_number,
            "entity": entity
        })
        
        if existing:
            logger.info(f"Duplicate found in registry: vendor={vendor_id}, invoice#={invoice_number}")
            # Fetch full invoice details for error message
            invoice = db.invoices.find_one({"_id": existing["invoice_id"]})
            return invoice
        
        return None
        
    except Exception as e:
        logger.error(f"Error checking registry: {e}")
        return None


def remove_from_registry(db, invoice_id: str) -> bool:
    """
    Remove invoice from registry (called when invoice is deleted).
    
    Args:
        db: Database connection
        invoice_id: MongoDB ObjectId of the invoice to remove
        
    Returns:
        True if removed successfully, False otherwise
    """
    try:
        result = db.invoice_registry.delete_one({
            "invoice_id": ObjectId(invoice_id) if isinstance(invoice_id, str) else invoice_id
        })
        
        if result.deleted_count > 0:
            logger.info(f"Removed invoice from registry: {invoice_id}")
            return True
        else:
            logger.warning(f"Invoice not found in registry: {invoice_id}")
            return False
            
    except Exception as e:
        logger.error(f"Failed to remove from registry: {e}")
        return False


def sync_registry_from_invoices(db, entity: Optional[str] = None):
    """
    One-time migration: Populate registry from existing invoices.
    This should be run once to backfill the registry.
    
    Args:
        db: Database connection
        entity: Optional entity filter (None = all entities)
    """
    try:
        query = {}
        if entity:
            query["entity"] = entity
            
        # Find all invoices with vendor_id and invoice_number
        invoices = db.invoices.find({
            **query,
            "vendor_id": {"$exists": True, "$ne": None},
            "invoice_number": {"$exists": True, "$ne": None}
        })
        
        count = 0
        skipped = 0
        
        for invoice in invoices:
            try:
                register_invoice(
                    db,
                    vendor_id=invoice["vendor_id"],
                    invoice_number=invoice["invoice_number"],
                    entity=invoice.get("entity", ""),
                    invoice_id=str(invoice["_id"]),
                    uploaded_by=invoice.get("uploaded_by", "system")
                )
                count += 1
            except Exception as e:
                # Skip duplicates (already in registry)
                skipped += 1
                
        logger.info(f"Registry sync complete: {count} registered, {skipped} skipped")
        return count, skipped
        
    except Exception as e:
        logger.error(f"Failed to sync registry: {e}")
        return 0, 0
