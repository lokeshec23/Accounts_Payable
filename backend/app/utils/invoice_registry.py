"""
Invoice Registry Helper - Fast Duplicate Detection (SQL Server)

This module provides efficient lookup for duplicate invoices using the SQL Server registry table.
"""

from typing import Optional, Dict, Any
from datetime import datetime
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.models.sql.invoice_registry import InvoiceRegistry
from app.models.sql.invoice import Invoice

logger = logging.getLogger(__name__)

async def register_invoice(
    db: AsyncSession,
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
        registry_entry = InvoiceRegistry(
            vendor_id=vendor_id,
            invoice_number=invoice_number,
            entity=entity,
            invoice_id=invoice_id,
            uploaded_at=datetime.utcnow(),
            uploaded_by=uploaded_by
        )
        
        db.add(registry_entry)
        await db.commit()
        logger.info(f"Registered invoice: vendor={vendor_id}, invoice#={invoice_number}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to register invoice: {e}")
        await db.rollback()
        return False


async def check_registry_duplicate(
    db: AsyncSession,
    vendor_id: str,
    invoice_number: str,
    entity: str
) -> Optional[Any]:
    """
    Fast lookup to check if invoice already exists.
    """
    try:
        stmt = select(InvoiceRegistry).where(
            InvoiceRegistry.vendor_id == vendor_id,
            InvoiceRegistry.invoice_number == invoice_number,
            InvoiceRegistry.entity == entity
        )
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()
        
        if existing:
            logger.info(f"Duplicate found in registry: vendor={vendor_id}, invoice#={invoice_number}")
            # Fetch full invoice details
            invoice_stmt = select(Invoice).where(Invoice.id == existing.invoice_id)
            invoice_result = await db.execute(invoice_stmt)
            return invoice_result.scalar_one_or_none()
        
        return None
        
    except Exception as e:
        logger.error(f"Error checking registry: {e}")
        return None


async def remove_from_registry(db: AsyncSession, invoice_id: int) -> bool:
    """
    Remove invoice from registry.
    """
    try:
        stmt = delete(InvoiceRegistry).where(InvoiceRegistry.invoice_id == invoice_id)
        result = await db.execute(stmt)
        await db.commit()
        
        if result.rowcount > 0:
            logger.info(f"Removed invoice from registry: {invoice_id}")
            return True
        else:
            logger.warning(f"Invoice not found in registry: {invoice_id}")
            return False
            
    except Exception as e:
        logger.error(f"Failed to remove from registry: {e}")
        await db.rollback()
        return False
