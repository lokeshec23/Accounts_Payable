import sys
from pathlib import Path
import traceback

# Add backend to path
sys.path.append(str(Path("c:/Users/ldna40063/Accounts_Payable/backend").resolve()))

from app.database.database import SessionLocal
from app.services.pdf_service import generate_approval_pdf
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai_app")

output_file = Path("backend/output/debug_4027_results.txt")

db = SessionLocal()
results = []
try:
    invoice_id = 4027
    results.append(f"DEBUG: Triggering PDF for ID: {invoice_id}")
    path = generate_approval_pdf(db, invoice_id)
    results.append(f"SUCCESS: PDF saved to {path}")
except Exception as e:
    results.append(f"FAILED: {e}")
    results.append(traceback.format_exc())
finally:
    db.close()
    with open(output_file, "w") as f:
        f.write("\n".join(results))
    print(f"Results written to {output_file}")
