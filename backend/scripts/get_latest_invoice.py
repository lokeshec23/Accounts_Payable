import sys
from pathlib import Path
sys.path.append(str(Path("c:/Users/ldna40063/Accounts_Payable/backend").resolve()))
from app.database.database import SessionLocal
from app.models.db_models import Invoice, InvoiceStatusEnum

db = SessionLocal()
try:
    inv = db.query(Invoice).filter(Invoice.status == InvoiceStatusEnum.APPROVED).order_by(Invoice.id.desc()).first()
    if inv:
        print(f"LATEST_APPROVED_ID={inv.id}")
        print(f"Invoice Number: {inv.invoice_number}")
    else:
        print("No approved invoices found.")
        # Try any invoice
        inv = db.query(Invoice).order_by(Invoice.id.desc()).first()
        if inv:
            print(f"LATEST_INVOICE_ID={inv.id}")
            print(f"Status: {inv.status}")
except Exception as e:
    print(f"Error: {e}")
finally:
    db.close()
