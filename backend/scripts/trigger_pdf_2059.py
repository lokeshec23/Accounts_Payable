import sys
from pathlib import Path

# Add backend to path
sys.path.append(str(Path("c:/Users/ldna40063/Accounts_Payable/backend").resolve()))

from app.database.database import SessionLocal
from app.services.pdf_service import generate_approval_pdf
import logging

# Configure logging to see PDF service logs here
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai_app")

db = SessionLocal()
try:
    invoice_id = 2059
    print(f"Manually triggering PDF for ID: {invoice_id}")
    path = generate_approval_pdf(db, invoice_id)
    print(f"SUCCESS: PDF saved to {path}")
except Exception as e:
    print(f"FAILED: {e}")
    import traceback
    traceback.print_exc()
finally:
    db.close()
