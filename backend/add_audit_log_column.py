import os
import sys

sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.database.database import engine
from sqlalchemy import text

def run_migrations():
    with engine.begin() as conn:
        # ── 1. audit_logs: add sage_bill_number ──────────────────────────────
        print("Checking audit_logs table...")
        try:
            conn.execute(text("""
                IF NOT EXISTS (
                    SELECT * FROM sys.columns 
                    WHERE object_id = OBJECT_ID(N'[dbo].[audit_logs]') 
                    AND name = 'sage_bill_number'
                )
                BEGIN
                    ALTER TABLE audit_logs ADD sage_bill_number NVARCHAR(200) NULL;
                    PRINT 'Added sage_bill_number to audit_logs';
                END
                ELSE
                BEGIN
                    PRINT 'sage_bill_number already exists in audit_logs';
                END
            """))
            print("audit_logs migration done.")
        except Exception as e:
            print(f"Failed on audit_logs: {e}")

        # ── 2. invoices: add sage_bill_number ────────────────────────────────
        print("Checking invoices table...")
        try:
            conn.execute(text("""
                IF NOT EXISTS (
                    SELECT * FROM sys.columns 
                    WHERE object_id = OBJECT_ID(N'[dbo].[invoices]') 
                    AND name = 'sage_bill_number'
                )
                BEGIN
                    ALTER TABLE invoices ADD sage_bill_number NVARCHAR(200) NULL;
                    PRINT 'Added sage_bill_number to invoices';
                END
                ELSE
                BEGIN
                    PRINT 'sage_bill_number already exists in invoices';
                END
            """))
            print("invoices migration done.")
        except Exception as e:
            print(f"Failed on invoices: {e}")

if __name__ == "__main__":
    run_migrations()
    print("All migrations completed.")
