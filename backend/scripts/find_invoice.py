import sys
from pathlib import Path
from sqlalchemy import create_all

# Add backend to path
sys.path.append(str(Path("c:/Users/ldna40063/Accounts_Payable/backend").resolve()))

from app.database.database import SessionLocal
from app.models.db_models import Invoice
import json

db = SessionLocal()
try:
    print("Searching for %82407%...")
    invs = db.query(Invoice).filter(Invoice.invoice_number.ilike('%82407%')).all()
    if invs:
        results = []
        for inv in invs:
            results.append({
                "id": inv.id,
                "number": inv.invoice_number,
                "status": str(inv.status),
                "required": inv.required_approvers,
                "approvals": len(inv.approved_by_list or []),
                "current_level": inv.current_approver_level
            })
            print(f"FOUND: ID={inv.id}, Num={inv.invoice_number}, Status={inv.status}")
        
        with open("scripts/found_id.json", "w") as f:
            json.dump(results, f, indent=2)
    else:
        print("Invoice not found in DB.")
except Exception as e:
    print(f"Error: {e}")
finally:
    db.close()
