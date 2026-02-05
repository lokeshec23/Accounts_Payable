
import asyncio
from app.database.sql_server import engine, Base
from app.models.sql.user import User  # Import ALL models here
from app.models.sql.invoice import Invoice
from app.models.sql.vendor_master import VendorMaster
from app.models.sql.master_data import MasterRecord, EntityMaster, TDSRates
from app.models.sql.workflow import VendorWorkflow, CodificationWorkflow
from app.models.sql.invoice_registry import InvoiceRegistry
from app.models.sql.audit_log import AuditLog
from app.models.sql.coding import CodingItem
from app.models.sql.delegation import DelegationRule

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Tables created!")

if __name__ == "__main__":
    asyncio.run(init_db())
