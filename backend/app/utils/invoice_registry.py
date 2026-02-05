"""
Invoice Registry Helper - Fast Duplicate Detection (SQL Server Implementation)

This module provides O(1) lookup for duplicate invoices using the invoice_registry table.
"""

from typing import Optional, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.db_models import InvoiceRegistry, Invoice
import logging

logger = logging.getLogger(__name__)


def register_invoice(
    db: Session,
    vendor_id: str,
    invoice_number: str,
    entity: str,
    invoice_id: int,
    uploaded_by: str
) -> bool:
    """
    Register an invoice in the fast lookup registry.
    """
    try:
        # Check if already exists to avoid UniqueConstraint violation
        existing = db.query(InvoiceRegistry).filter(
            InvoiceRegistry.vendor_id == vendor_id,
            InvoiceRegistry.invoice_number == invoice_number,
            InvoiceRegistry.entity == entity
        ).first()
        
        if existing:
            logger.warning(f"Invoice already registered: vendor={vendor_id}, invoice#={invoice_number}")
            return True

        registry_entry = InvoiceRegistry(
            vendor_id=vendor_id,
            invoice_number=invoice_number,
            entity=entity,
            invoice_id=invoice_id,
            uploaded_at=datetime.utcnow(),
            uploaded_by=uploaded_by
        )
        
        db.add(registry_entry)
        db.commit()
        logger.info(f"Registered invoice: vendor={vendor_id}, invoice#={invoice_number}")
        return True
        
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to register invoice: {e}")
        return False


def check_registry_duplicate(
    db: Session,
    vendor_id: str,
    invoice_number: str,
    entity: str
) -> Optional[Dict[str, Any]]:
    """
    Fast O(1) lookup to check if invoice already exists.
    Returns the full invoice details if found.
    """
    try:
        # Case-insensitive check for invoice number and vendor_id is usually handled by collation in SQL Server,
        # but we can be explicit if needed. For now, assuming default collation handles it or exact match is expected.
        existing = db.query(InvoiceRegistry).filter(
            InvoiceRegistry.vendor_id == vendor_id,
            InvoiceRegistry.invoice_number == invoice_number,
            InvoiceRegistry.entity == entity
        ).first()
        
        if existing:
            logger.info(f"Duplicate found in registry: vendor={vendor_id}, invoice#={invoice_number}")
            # Fetch full invoice details
            invoice = db.query(Invoice).filter(Invoice.id == existing.invoice_id).first()
            if invoice:
                # Convert SQLAlchemy model to dict for backward compatibility with route logic
                from app.database.db_utils import invoice_to_dict
                return invoice_to_dict(invoice)
        
        return None
        
    except Exception as e:
        logger.error(f"Error checking registry: {e}")
        return None


def remove_from_registry(db: Session, invoice_id: int) -> bool:
    """
    Remove invoice from registry (called when invoice is deleted).
    """
    try:
        result = db.query(InvoiceRegistry).filter(
            InvoiceRegistry.invoice_id == invoice_id
        ).delete()
        
        db.commit()
        if result > 0:
            logger.info(f"Removed invoice from registry: {invoice_id}")
            return True
        else:
            logger.warning(f"Invoice not found in registry: {invoice_id}")
            return False
            
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to remove from registry: {e}")
        return False


def sync_registry_from_invoices(db: Session, entity: Optional[str] = None):
    """
    One-time migration: Populate registry from existing invoices.
    """
    try:
        query = db.query(Invoice).filter(
            Invoice.vendor_id != None,
            Invoice.invoice_number != None
        )
        
        if entity:
            query = query.filter(Invoice.entity == entity)
            
        invoices = query.all()
        
        count = 0
        skipped = 0
        
        for invoice in invoices:
            success = register_invoice(
                db,
                vendor_id=invoice.vendor_id,
                invoice_number=invoice.invoice_number,
                entity=invoice.entity or "",
                invoice_id=invoice.id,
                uploaded_by=invoice.uploaded_by or "system"
            )
            if success:
                count += 1
            else:
                skipped += 1
                
        logger.info(f"Registry sync complete: {count} registered, {skipped} skipped")
        return count, skipped
        
    except Exception as e:
        logger.error(f"Failed to sync registry: {e}")
        return 0, 0
