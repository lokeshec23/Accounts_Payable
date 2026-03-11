from app.database.database import SessionLocal
from app.models.db_models import Invoice
import json

db = SessionLocal()
try:
    inv = db.query(Invoice).filter(Invoice.invoice_number.like('%82407%')).first()
    if inv:
        res = {
            "id": inv.id,
            "number": inv.invoice_number,
            "status": str(inv.status),
            "required": inv.required_approvers,
            "approvals": len(inv.approved_by_list or [])
        }
        with open("id_check.json", "w") as f:
            json.dump(res, f)
        print(f"FOUND: {inv.id}")
    else:
        print("NOT FOUND")
except Exception as e:
    print(f"ERROR: {e}")
finally:
    db.close()
