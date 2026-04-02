import sys
from pathlib import Path
import json

# Add backend to path
sys.path.append(str(Path("c:/Users/ldna40063/Accounts_Payable/backend").resolve()))

from app.database.database import engine
from sqlalchemy import text

def check_columns():
    tables = ['Invoices', 'VendorWorkflows', 'CodificationWorkflows']
    results = {}
    
    with engine.connect() as conn:
        for table in tables:
            query = text(f"SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '{table}' AND COLUMN_NAME = 'is_parallel'")
            res = conn.execute(query).fetchone()
            results[table] = "Exists" if res else "Dropped"
            
    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    check_columns()
