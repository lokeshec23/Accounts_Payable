import sys
import os
from pathlib import Path

# Add the backend directory to sys.path
backend_dir = Path("c:/Users/ldna40063/Accounts_Payable/backend").resolve()
sys.path.append(str(backend_dir))

print(f"Checking environment...")
try:
    import reportlab
    print(f"ReportLab version: {reportlab.Version}")
except ImportError as e:
    print(f"ReportLab NOT found: {e}")
    sys.exit(1)

from app.database.database import SessionLocal
from app.models.db_models import Invoice, InvoiceStatusEnum
from app.services.pdf_service import generate_approval_pdf

db = SessionLocal()

print("Searching for approved invoices...")
approved_invoices = db.query(Invoice).filter(Invoice.status == InvoiceStatusEnum.APPROVED).all()

if not approved_invoices:
    print("No approved invoices found in database.")
    # Check for invoices waiting for approval
    waiting = db.query(Invoice).filter(Invoice.status == InvoiceStatusEnum.WAITING_APPROVAL).all()
    print(f"Invoices waiting for approval: {len(waiting)}")
    for inv in waiting:
        print(f"ID: {inv.id}, Status: {inv.status}, Required: {inv.required_approvers}, Current Approvals: {len(inv.approved_by_list or [])}")
else:
    print(f"Found {len(approved_invoices)} approved invoices. Generating PDFs...")
    for inv in approved_invoices:
        try:
            print(f"Generating PDF for Invoice ID {inv.id}...")
            path = generate_approval_pdf(db, inv.id)
            print(f"Success! Saved to: {path}")
        except Exception as e:
            print(f"Failed for ID {inv.id}: {e}")

db.close()
print("Done.")
