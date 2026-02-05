import asyncio
from sqlalchemy import text
from app.database.sql_server import engine

async def drop_tables():
    """Drop all tables to allow recreation with new Numeric types"""
    
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
    
    async with engine.begin() as conn:
        for table in tables_to_drop:
            try:
                await conn.execute(text(f"DROP TABLE IF EXISTS {table}"))
                print(f"Dropped table: {table}")
            except Exception as e:
                print(f"Could not drop {table}: {e}")
    
    print("\nAll tables dropped! Now restart your application to recreate them.")

if __name__ == "__main__":
    asyncio.run(drop_tables())
