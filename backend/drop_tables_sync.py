from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

# Use synchronous engine
engine = create_engine(DATABASE_URL, echo=True)

tables_to_drop = [
    'workflow_steps',
    'coding_history', 
    'coding',
    'delegation_rules',
    'audit_logs',
    'invoice_registry',
    'codification_workflows',
    'vendor_workflows',
    'tds_rates',
    'entity_master',
    'master_records',
    'vendor_master',
    'invoices',
    'users',
    'currencies',
    'global_settings'
]

print("Dropping tables...")
with engine.begin() as conn:
    for table in tables_to_drop:
        try:
            conn.execute(text(f"DROP TABLE IF EXISTS {table}"))
            print(f"✓ Dropped: {table}")
        except Exception as e:
            print(f"✗ Could not drop {table}: {e}")

print("\n✓ All tables dropped! Now restart your application.")
