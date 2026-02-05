from fastapi import APIRouter, Depends
from typing import Dict, List, Any
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from app.database.sql_server import get_db
from app.auth.jwt import get_current_user
from app.dependencies import get_current_entity
from app.models.user import UserResponse
from app.models.sql.invoice import Invoice as SQLInvoice

router = APIRouter(tags=["Dashboard"])


def to_float(value):
    if not value:
        return 0.0
    try:
        if isinstance(value, (int, float)):
            return float(value)
        import re
        clean = str(value).replace(",", "")
        match = re.search(r'-?\d+(\.\d+)?', clean)
        if match:
            return float(match.group())
        return 0.0
    except:
        return 0.0

def safe_get_total(invoice: SQLInvoice) -> float:
    extracted = invoice.extracted_data or {}
    amounts = extracted.get("amounts", {})
    if isinstance(amounts, dict):
        total_obj = amounts.get("total_invoice_amount", {})
        if isinstance(total_obj, dict):
            return to_float(total_obj.get("value"))
    return 0.0


@router.get("/summary")
async def summary(
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(SQLInvoice).where(SQLInvoice.entity == entity)
    result = await db.execute(stmt)
    invoices = result.scalars().all()
    
    total_due = sum(safe_get_total(inv) for inv in invoices)
    approved = sum(1 for i in invoices if i.status == "approved")
    waiting = sum(1 for i in invoices if i.status == "waiting_approval")
    rejected = sum(1 for i in invoices if i.status == "rejected")
    
    return {
        "total_invoices": len(invoices),
        "total_due": total_due,
        "approved": approved,
        "waiting_approval": waiting,
        "rejected": rejected
    }


@router.get("/aging")
async def aging(
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(SQLInvoice).where(SQLInvoice.entity == entity)
    result = await db.execute(stmt)
    invoices = result.scalars().all()
    
    buckets = {"0_30": 0, "31_60": 0, "61_90": 0, "91_120": 0, "120_plus": 0}
    now = datetime.utcnow()
    
    for inv in invoices:
        extracted = inv.extracted_data or {}
        due_date_str = extracted.get("invoice_details", {}).get("due_date", {}).get("value")
        if not due_date_str:
            continue
            
        try:
            # Simple date parse
            import dateutil.parser
            due_date = dateutil.parser.parse(str(due_date_str))
            days = (now - due_date).days
        except:
            continue
            
        amt = safe_get_total(inv)
        
        if days <= 30: buckets["0_30"] += amt
        elif days <= 60: buckets["31_60"] += amt
        elif days <= 90: buckets["61_90"] += amt
        elif days <= 120: buckets["91_120"] += amt
        else: buckets["120_plus"] += amt
    
    return buckets


@router.get("/status_breakdown")
async def status_breakdown(
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(SQLInvoice.status, func.count(SQLInvoice.id)).where(SQLInvoice.entity == entity).group_by(SQLInvoice.status)
    result = await db.execute(stmt)
    counts = dict(result.all())
    
    return {
        "processed": counts.get("processed", 0),
        "waiting_coding": counts.get("waiting_coding", 0),
        "waiting_approval": counts.get("waiting_approval", 0),
        "approved": counts.get("approved", 0),
        "rejected": counts.get("rejected", 0),
        "reworked": counts.get("reworked", 0),
    }


@router.get("/vendors")
async def vendors(
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(SQLInvoice).where(SQLInvoice.entity == entity)
    result = await db.execute(stmt)
    invoices = result.scalars().all()
    
    vendor_count = {}
    vendor_amount = {}
    
    for inv in invoices:
        vendor = inv.vendor_name or "Unknown"
        amt = safe_get_total(inv)
        
        vendor_count[vendor] = vendor_count.get(vendor, 0) + 1
        vendor_amount[vendor] = vendor_amount.get(vendor, 0) + amt
    
    return {
        "by_count": [{"vendor": v, "count": c} for v, c in vendor_count.items()],
        "by_amount": [{"vendor": v, "amount": a} for v, a in vendor_amount.items()],
    }


@router.get("/top_vendors")
async def top_vendors(
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(SQLInvoice).where(SQLInvoice.entity == entity)
    result = await db.execute(stmt)
    invoices = result.scalars().all()
    
    totals = {}
    counts = {}
    
    for inv in invoices:
        vendor = inv.vendor_name or "Unknown"
        amt = safe_get_total(inv)
        totals[vendor] = totals.get(vendor, 0) + amt
        counts[vendor] = counts.get(vendor, 0) + 1
    
    sorted_vendors = sorted(totals.items(), key=lambda x: x[1], reverse=True)
    return [{"vendor": vendor, "total": total, "count": counts[vendor]} for vendor, total in sorted_vendors]


@router.get("/payments")
async def payments(
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(SQLInvoice).where(SQLInvoice.entity == entity)
    result = await db.execute(stmt)
    invoices = result.scalars().all()
    
    total = sum(safe_get_total(inv) for inv in invoices)
    # Assuming amount_paid is stored in extracted_data
    paid = 0.0
    for inv in invoices:
        extracted = inv.extracted_data or {}
        paid_val = extracted.get("amounts", {}).get("amount_paid", {}).get("value")
        paid += to_float(paid_val)
    
    return {
        "done": paid,
        "pending": total - paid,
    }