import asyncio
import os
import sys
from datetime import datetime
from typing import List, Dict, Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from motor.motor_asyncio import AsyncIOMotorClient

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database.sql_server import engine, get_db
from app.models.sql.user import User as SQLUser
from app.models.sql.invoice import Invoice as SQLInvoice
from app.models.sql.vendor_master import VendorMaster as SQLVendorMaster
from app.models.sql.workflow_step import WorkflowStep as SQLWorkflowStep

# MongoDB Configuration
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DB_NAME = "accounts_payable"

async def migrate_users(mongo_db, sql_db: AsyncSession):
    print("Migrating Users...")
    users = await mongo_db.users.find().to_list(length=1000)
    for u in users:
        # Check if exists
        stmt = select(SQLUser).where(SQLUser.username == u["username"])
        res = await sql_db.execute(stmt)
        if res.scalar_one_or_none():
            continue
            
        new_user = SQLUser(
            username=u["username"],
            email=u.get("email"),
            hashed_password=u["hashed_password"],
            full_name=u.get("full_name"),
            role=u.get("role", "user"),
            is_active=u.get("is_active", True),
            created_at=u.get("created_at") or datetime.utcnow()
        )
        sql_db.add(new_user)
    await sql_db.commit()

async def migrate_invoices(mongo_db, sql_db: AsyncSession):
    print("Migrating Invoices...")
    invoices = await mongo_db.invoices.find().to_list(length=5000)
    for inv in invoices:
        # Check if exists
        # In SQL, ID is auto-increment. We might want to store original ID or just trust the data
        new_invoice = SQLInvoice(
            entity=inv.get("entity"),
            vendor_id=inv.get("vendor_id"),
            vendor_name=inv.get("vendor_name"),
            invoice_number=inv.get("invoice_number"),
            invoice_date=inv.get("invoice_date"),
            total_amount=inv.get("total_amount"),
            status=inv.get("status", "uploaded"),
            uploaded_by=inv.get("uploaded_by"),
            uploaded_at=inv.get("uploaded_at") or datetime.utcnow(),
            extracted_data=inv.get("extracted_data"),
            status_history=inv.get("status_history", []),
            current_approver_level=inv.get("current_approver_level", 1),
            required_approvers=inv.get("required_approvers"),
            assigned_approvers=inv.get("assigned_approvers", []),
            workflow_type=inv.get("workflow_type"),
            approver_breakdown=inv.get("approver_breakdown", {})
        )
        sql_db.add(new_invoice)
    await sql_db.commit()

async def migrate_vendor_master(mongo_db, sql_db: AsyncSession):
    print("Migrating Vendor Master...")
    # This is complex because of MongoDB's chunked structure
    # We'll fetch the collections from excel_files meta
    meta = await mongo_db.excel_files.find_one({"tab_name": "Vendor_Master"})
    if not meta or "sheets" not in meta:
        print("No Vendor Master metadata found in Mongo.")
        return
        
    for sheet in meta["sheets"]:
        coll_name = sheet["collection_name"]
        chunks = await mongo_db[coll_name].find().to_list(length=1000)
        for chunk in chunks:
            for row in chunk.get("rows", []):
                # Map fields
                v_id = row.get("VENDOR_ID") or row.get("Vendor ID") or row.get("vendor_id")
                v_name = row.get("VENDOR_NAME") or row.get("Vendor Name") or row.get("vendor_name")
                
                if not v_name: continue
                
                new_vendor = SQLVendorMaster(
                    entity=meta.get("entity") or "Default", # May need refinement
                    vendor_id=str(v_id) if v_id else None,
                    vendor_name=str(v_name),
                    line_grouping=row.get("Line Grouping", "No"),
                    details=row
                )
                sql_db.add(new_vendor)
    await sql_db.commit()

async def run_migration():
    client = AsyncIOMotorClient(MONGODB_URL)
    mongo_db = client[DB_NAME]
    
    async with engine.begin() as conn:
        # Create tables if not exist (already done in main.py, but safe here)
        pass

    async for sql_db in get_db():
        try:
            await migrate_users(mongo_db, sql_db)
            await migrate_vendor_master(mongo_db, sql_db)
            await migrate_invoices(mongo_db, sql_db)
            print("Migration completed successfully!")
        except Exception as e:
            print(f"Migration failed: {e}")
            await sql_db.rollback()
        finally:
            await sql_db.close()
        break

if __name__ == "__main__":
    asyncio.run(run_migration())
