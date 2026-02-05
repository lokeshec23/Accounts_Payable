from sqlalchemy import create_engine
import os
from dotenv import load_dotenv

# Import all models to register them with Base
from app.models.sql.base import Base
from app.models.sql.user import User
from app.models.sql.invoice import Invoice
from app.models.sql.vendor_master import VendorMaster
from app.models.sql.master_data import MasterRecord, EntityMaster, TDSRates
from app.models.sql.workflow import VendorWorkflow, CodificationWorkflow
from app.models.sql.invoice_registry import InvoiceRegistry
from app.models.sql.audit_log import AuditLog
from app.models.sql.coding import Coding, CodingHistory
from app.models.sql.delegation import Delegation
from app.models.sql.settings import Currency, GlobalSettings
from app.models.sql.workflow_step import WorkflowStep

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

print(f"Creating tables using: {DATABASE_URL}")

# Use synchronous engine
engine = create_engine(DATABASE_URL, echo=True)

print("\nCreating all tables...")
Base.metadata.create_all(engine)

print("\n✓ All tables created successfully!")
print("You can now start your application.")
