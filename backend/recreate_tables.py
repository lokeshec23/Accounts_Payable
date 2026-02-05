import asyncio
from app.database.sql_server import engine, Base
from app.models.sql.user import User
from app.models.sql.invoice import Invoice
from app.models.sql.vendor_master import VendorMaster
from app.models.sql.master_data import MasterRecord, EntityMaster, TDSRates
from app.models.sql.workflow import VendorWorkflow, CodificationWorkflow
from app.models.sql.invoice_registry import InvoiceRegistry
from app.models.sql.audit_log import AuditLog
from app.models.sql.coding import Coding, CodingHistory
from app.models.sql.delegation import DelegationRule
from app.models.sql.settings import Currency, GlobalSettings
from app.models.sql.workflow_step import WorkflowStep

async def recreate_tables():
    print("Dropping all tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    print("Tables dropped!")
    
    print("Creating all tables with updated schema...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Tables created successfully!")

if __name__ == "__main__":
    asyncio.run(recreate_tables())
