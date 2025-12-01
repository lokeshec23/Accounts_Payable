from fastapi import APIRouter
from pymongo import MongoClient
from datetime import datetime
from app.database.mongodb import get_database

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


# ----------------- SAFE FLOAT PARSER -----------------
def to_float(value):
    if not value:
        return 0.0
    value = str(value).strip().replace("$", "").replace(",", "")

    if value.startswith("(") and value.endswith(")"):
        value = "-" + value[1:-1]

    try:
        return float(value)
    except:
        return 0.0


# ----------------- DATE PARSER -----------------
def parse_date(date_str):
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


# ----------------- AGING DAYS -----------------
def aging_days(due_date):
    d = parse_date(due_date)
    if not d:
        return None
    return (datetime.now() - d).days


# ======================================================
#                       ROUTES
# ======================================================

@router.get("/summary")
def summary():
    db = get_database()
    invoices = db.invoices
    data = list(invoices.find({}))

    total = len(data)
    total_due = 0
    approved = 0
    waiting = 0
    rejected = 0

    for inv in data:
        amt = to_float(inv["extracted_data"]["amounts"]["total_invoice_amount"]["value"])
        total_due += amt

        status = inv.get("status", "").lower()
        if status == "approved":
            approved += 1
        elif status == "waiting_approval":
            waiting += 1
        elif status == "rejected":
            rejected += 1

    return {
        "total_invoices": total,
        "total_due": total_due,
        "approved": approved,
        "waiting_approval": waiting,
        "rejected": rejected
    }


@router.get("/aging")
def aging():
    db = get_database()
    invoices = db.invoices
    data = list(invoices.find({}))

    buckets = {
        "0_30": 0,
        "31_60": 0,
        "61_90": 0,
        "91_120": 0,
        "120_plus": 0
    }

    for inv in data:
        due = inv["extracted_data"]["invoice_details"]["due_date"]["value"]
        days = aging_days(due)
        amt = to_float(inv["extracted_data"]["amounts"]["total_invoice_amount"]["value"])

        if days is None:
            continue

        if days <= 30:
            buckets["0_30"] += amt
        elif 31 <= days <= 60:
            buckets["31_60"] += amt
        elif 61 <= days <= 90:
            buckets["61_90"] += amt
        elif 91 <= days <= 120:
            buckets["91_120"] += amt
        else:
            buckets["120_plus"] += amt

    return buckets


@router.get("/status_breakdown")
def status_breakdown():
    db = get_database()
    invoices = db.invoices
    data = list(invoices.find({}))
    return {
        "approved": sum(1 for i in data if i.get("status") == "approved"),
        "waiting_approval": sum(1 for i in data if i.get("status") == "waiting_approval"),
        "rejected": sum(1 for i in data if i.get("status") == "rejected"),
    }


@router.get("/vendors")
def vendors():
    db = get_database()
    invoices = db.invoices
    data = list(invoices.find({}))

    vendor_count = {}
    vendor_amount = {}

    for inv in data:
        vendor = inv["extracted_data"]["vendor_info"]["name"]["value"]
        amt = to_float(inv["extracted_data"]["amounts"]["total_invoice_amount"]["value"])

        vendor_count[vendor] = vendor_count.get(vendor, 0) + 1
        vendor_amount[vendor] = vendor_amount.get(vendor, 0) + amt

    return {
        "by_count": [{"vendor": v, "count": c} for v, c in vendor_count.items()],
        "by_amount": [{"vendor": v, "amount": a} for v, a in vendor_amount.items()],
    }


@router.get("/top_vendors")
def top_vendors():
    db = get_database()
    invoices = db.invoices
    data = list(invoices.find({}))

    totals = {}
    counts = {}

    for inv in data:
        vendor = inv["extracted_data"]["vendor_info"]["name"]["value"]
        amt = to_float(inv["extracted_data"]["amounts"]["total_invoice_amount"]["value"])

        totals[vendor] = totals.get(vendor, 0) + amt
        counts[vendor] = counts.get(vendor, 0) + 1

    sorted_vendors = sorted(totals.items(), key=lambda x: x[1], reverse=True)

    return [
        {"vendor": vendor, "total": total, "count": counts[vendor]}
        for vendor, total in sorted_vendors
    ]


@router.get("/payments")
def payments():
    db = get_database()
    invoices = db.invoices
    data = list(invoices.find({}))

    total = sum(
        to_float(i["extracted_data"]["amounts"]["total_invoice_amount"]["value"])
        for i in data
    )

    paid = sum(
        to_float(i["extracted_data"]["amounts"].get("amount_paid", {}).get("value"))
        for i in data
    )

    return {
        "done": paid,
        "pending": total - paid,
    }
