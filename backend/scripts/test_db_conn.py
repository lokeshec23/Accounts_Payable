import sys
from pathlib import Path
import traceback

# Add backend to path
sys.path.append(str(Path("c:/Users/ldna40063/Accounts_Payable/backend").resolve()))

from app.database.database import engine
from sqlalchemy import text

output_file = Path("backend/output/db_test_results.txt")

results = []
try:
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    results.append("SUCCESS: Database connected!")
except Exception as e:
    results.append(f"FAILED: {e}")
    results.append(traceback.format_exc())
finally:
    with open(output_file, "w") as f:
        f.write("\n".join(results))
    print(f"Results written to {output_file}")
