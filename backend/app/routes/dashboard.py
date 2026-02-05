from fastapi import APIRouter, Depends
from datetime import datetime
from sqlalchemy.orm import Session
import json
from enum import Enum

from app.database.database import get_db
from app.models.db_models import Invoice
from app.auth.jwt import get_current_user
from app.dependencies import get_current_entity
from app.models.user import UserResponse

router = APIRouter(tags=["Dashboard"])

def to_float(value):
    """Safely convert value to float"""
    if not value:
        return 0.0
    value = str(value).strip().replace("$", "").replace(",", "")
    if value.startswith("(") and value.endswith(")"):
        value = "-" + value[1:-1]
    try:
        return float(value)
    except:
        return 0.0

def parse_date(date_str):
    """Parse date string to datetime object"""
    if not date_str:
        return None
    if isinstance(date_str, datetime):
        return date_str
    if "/" in date_str:
        try:
            m, d, y = date_str.split("/")
            date_str = f"{y}-{m}-{d}"
        except:
            pass
    formats = ["%Y-%m-%d", "%d-%m-%Y", "%m-%d-%Y", "%Y-%m-%dT%H:%M:%S"]
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt)
        except:
            continue
    return None

def aging_days(due_date):
    """Calculate aging days from due date"""
    d = parse_date(due_date)
    if not d:
        return None
    return (datetime.utcnow() - d).days

def safe_get(inv_data, *keys, default=None):
    """Safely navigate dictionary data"""
    try:
        result = inv_data
        for key in keys:
            if isinstance(result, dict):
                result = result.get(key, {})
            else:
                return default
        
        value = result.get("value") if isinstance(result, dict) else result
        return value if value is not None else default
    except:
        return default

def get_extracted_data_json(inv: Invoice):
    """Safely parse extracted_data JSON"""
    if not inv.extracted_data:
        return {}
    if isinstance(inv.extracted_data, dict):
        return inv.extracted_data
    try:
        return json.loads(inv.extracted_data)
    except:
        return {}

@router.get("/summary")
def summary(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    invoices = db.query(Invoice).filter(Invoice.entity == entity).all()
    
    total_due = 0.0
    approved = 0
    waiting = 0
    rejected = 0
    
    for inv in invoices:
        data = get_extracted_data_json(inv)
        total_due += to_float(safe_get(data, "amounts", "total_invoice_amount"))
        
        status = inv.status.value if hasattr(inv.status, "value") else str(inv.status)
        if status == "approved":
            approved += 1
        elif status == "waiting_approval":
            waiting += 1
        elif status == "rejected":
            rejected += 1
    
    return {
        "total_invoices": len(invoices),
        "total_due": total_due,
        "approved": approved,
        "waiting_approval": waiting,
        "rejected": rejected
    }

@router.get("/aging")
def aging(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    invoices = db.query(Invoice).filter(Invoice.entity == entity).all()
    buckets = {"0_30": 0, "31_60": 0, "61_90": 0, "91_120": 0, "120_plus": 0}
    
    for inv in invoices:
        data = get_extracted_data_json(inv)
        due = safe_get(data, "invoice_details", "due_date")
        days = aging_days(due)
        amt = to_float(safe_get(data, "amounts", "total_invoice_amount"))
        
        if days is None:
            continue
        if days <= 30:
            buckets["0_30"] += amt
        elif days <= 60:
            buckets["31_60"] += amt
        elif days <= 90:
            buckets["61_90"] += amt
        elif days <= 120:
            buckets["91_120"] += amt
        else:
            buckets["120_plus"] += amt
    
    return buckets

@router.get("/status_breakdown")
def status_breakdown(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    invoices = db.query(Invoice).filter(Invoice.entity == entity).all()
    
    counts = {
        "processed": 0,
        "waiting_coding": 0,
        "waiting_approval": 0,
        "approved": 0,
        "rejected": 0,
        "reworked": 0,
    }
    
    for inv in invoices:
        status = inv.status.value if hasattr(inv.status, "value") else str(inv.status)
        if status in counts:
            counts[status] += 1
            
    return counts

@router.get("/vendors")
def vendors(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    invoices = db.query(Invoice).filter(Invoice.entity == entity).all()
    
    vendor_count = {}
    vendor_amount = {}
    
    for inv in invoices:
        data = get_extracted_data_json(inv)
        vendor = safe_get(data, "vendor_info", "name", default="Unknown")
        amt = to_float(safe_get(data, "amounts", "total_invoice_amount"))
        
        vendor_count[vendor] = vendor_count.get(vendor, 0) + 1
        vendor_amount[vendor] = vendor_amount.get(vendor, 0) + amt
    
    return {
        "by_count": [{"vendor": v, "count": c} for v, c in vendor_count.items()],
        "by_amount": [{"vendor": v, "amount": a} for v, a in vendor_amount.items()],
    }

@router.get("/top_vendors")
def top_vendors(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    invoices = db.query(Invoice).filter(Invoice.entity == entity).all()
    
    totals = {}
    counts = {}
    
    for inv in invoices:
        data = get_extracted_data_json(inv)
        vendor = safe_get(data, "vendor_info", "name", default="Unknown")
        amt = to_float(safe_get(data, "amounts", "total_invoice_amount"))
        
        totals[vendor] = totals.get(vendor, 0) + amt
        counts[vendor] = counts.get(vendor, 0) + 1
    
    sorted_vendors = sorted(totals.items(), key=lambda x: x[1], reverse=True)
    
    return [
        {"vendor": vendor, "total": total, "count": counts[vendor]}
        for vendor, total in sorted_vendors
    ]

@router.get("/payments")
def payments(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    invoices = db.query(Invoice).filter(Invoice.entity == entity).all()
    
    total = 0.0
    paid = 0.0
    
    for inv in invoices:
        data = get_extracted_data_json(inv)
        total += to_float(safe_get(data, "amounts", "total_invoice_amount"))
        paid += to_float(safe_get(data, "amounts", "amount_paid"))
    
    return {
        "done": paid,
        "pending": total - paid,
    }