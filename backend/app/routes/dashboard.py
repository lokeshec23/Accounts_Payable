from fastapi import APIRouter
from datetime import datetime
from app.database.mongodb import get_database
from fastapi import Depends
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
    if "/" in date_str:
        try:
            m, d, y = date_str.split("/")
            date_str = f"{y}-{m}-{d}"
        except:
            pass
    formats = ["%Y-%m-%d", "%d-%m-%Y", "%m-%d-%Y"]
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
    return (datetime.now() - d).days


def safe_get(inv, *keys, default=None):
    """Safely navigate nested dictionary"""
    try:
        result = inv
        for key in keys:
            result = result.get(key, {})
        value = result.get("value") if isinstance(result, dict) else result
        return value if value else default
    except:
        return default


@router.get("/summary")
def summary(
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    db = get_database()
    data = list(db.invoices.find({"entity": entity}))
    
    total_due = sum(to_float(safe_get(inv, "extracted_data", "amounts", "total_invoice_amount")) for inv in data)
    approved = sum(1 for i in data if i.get("status") == "approved")
    waiting = sum(1 for i in data if i.get("status") == "waiting_approval")
    rejected = sum(1 for i in data if i.get("status") == "rejected")
    
    return {
        "total_invoices": len(data),
        "total_due": total_due,
        "approved": approved,
        "waiting_approval": waiting,
        "rejected": rejected
    }


@router.get("/aging")
def aging(
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    db = get_database()
    data = list(db.invoices.find({"entity": entity}))
    
    buckets = {"0_30": 0, "31_60": 0, "61_90": 0, "91_120": 0, "120_plus": 0}
    
    for inv in data:
        due = safe_get(inv, "extracted_data", "invoice_details", "due_date")
        days = aging_days(due)
        amt = to_float(safe_get(inv, "extracted_data", "amounts", "total_invoice_amount"))
        
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
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    db = get_database()
    data = list(db.invoices.find({"entity": entity}))
    return {
        "processed": sum(1 for i in data if i.get("status") == "processed"),
        "waiting_coding": sum(1 for i in data if i.get("status") == "waiting_coding"),
        "waiting_approval": sum(1 for i in data if i.get("status") == "waiting_approval"),
        "approved": sum(1 for i in data if i.get("status") == "approved"),
        "rejected": sum(1 for i in data if i.get("status") == "rejected"),
        "reworked": sum(1 for i in data if i.get("status") == "reworked"),
    }


@router.get("/vendors")
def vendors(
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    db = get_database()
    data = list(db.invoices.find({"entity": entity}))
    
    vendor_count = {}
    vendor_amount = {}
    
    for inv in data:
        vendor = safe_get(inv, "extracted_data", "vendor_info", "name", default="Unknown")
        amt = to_float(safe_get(inv, "extracted_data", "amounts", "total_invoice_amount"))
        
        vendor_count[vendor] = vendor_count.get(vendor, 0) + 1
        vendor_amount[vendor] = vendor_amount.get(vendor, 0) + amt
    
    return {
        "by_count": [{"vendor": v, "count": c} for v, c in vendor_count.items()],
        "by_amount": [{"vendor": v, "amount": a} for v, a in vendor_amount.items()],
    }


@router.get("/top_vendors")
def top_vendors(
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    db = get_database()
    data = list(db.invoices.find({"entity": entity}))
    
    totals = {}
    counts = {}
    
    for inv in data:
        vendor = safe_get(inv, "extracted_data", "vendor_info", "name", default="Unknown")
        amt = to_float(safe_get(inv, "extracted_data", "amounts", "total_invoice_amount"))
        
        totals[vendor] = totals.get(vendor, 0) + amt
        counts[vendor] = counts.get(vendor, 0) + 1
    
    sorted_vendors = sorted(totals.items(), key=lambda x: x[1], reverse=True)
    
    return [
        {"vendor": vendor, "total": total, "count": counts[vendor]}
        for vendor, total in sorted_vendors
    ]


@router.get("/payments")
def payments(
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    db = get_database()
    data = list(db.invoices.find({"entity": entity}))
    
    total = sum(to_float(safe_get(i, "extracted_data", "amounts", "total_invoice_amount")) for i in data)
    paid = sum(to_float(safe_get(i, "extracted_data", "amounts", "amount_paid")) for i in data)
    
    return {
        "done": paid,
        "pending": total - paid,
    }