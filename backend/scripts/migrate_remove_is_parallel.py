import sys
from pathlib import Path
import traceback

# Add backend to path
sys.path.append(str(Path("c:/Users/ldna40063/Accounts_Payable/backend").resolve()))

from app.database.database import engine
from sqlalchemy import text

def migrate():
    commands = [
        "ALTER TABLE Invoices DROP COLUMN is_parallel;",
        "ALTER TABLE VendorWorkflows DROP COLUMN is_parallel;",
        "ALTER TABLE CodificationWorkflows DROP COLUMN is_parallel;"
    ]
    
    with engine.begin() as conn:
        for cmd in commands:
            try:
                print(f"Executing: {cmd}")
                conn.execute(text(cmd))
                print("Success.")
            except Exception as e:
                print(f"Error executing '{cmd}': {e}")
                # We don't necessarily want to fail everything if one fails (e.g. if column already dropped)

if __name__ == "__main__":
    migrate()
