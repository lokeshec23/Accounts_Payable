"""
Database initialization and bootstrap utilities.
Creates the accounts_payable database if it doesn't exist,
then creates tables and inserts default data.
"""

from sqlalchemy import create_engine, text
from app.database.database import Base, engine, SessionLocal
from app.models.db_models import (
    User, Currency, GlobalSetting, ApproverDefault, EntityMaster
)
from app.auth.jwt import get_password_hash
from app.config.settings import settings
from datetime import datetime
import json


def create_database_if_not_exists():
    """
    Connect to the 'master' database (which always exists in SQL Server)
    and create the 'accounts_payable' database if it doesn't already exist.
    This must be done BEFORE SQLAlchemy tries to connect to accounts_payable.
    """
    db_url = settings.DATABASE_URL
    # Build a URL that points to 'master' instead of 'accounts_payable'
    # Handles both formats:
    #   mssql+pymssql://user:pass@host:port/accounts_payable
    #   mssql+pymssql://user:pass@host:port/accounts_payable?...
    if "/accounts_payable" in db_url:
        master_url = db_url.replace("/accounts_payable", "/master", 1)
    else:
        # Fallback: append /master
        master_url = db_url.rsplit("/", 1)[0] + "/master"

    print(f"Connecting to master DB to ensure 'accounts_payable' exists...")
    try:
        # isolation_level=AUTOCOMMIT is required for CREATE DATABASE
        master_engine = create_engine(master_url, isolation_level="AUTOCOMMIT")
        with master_engine.connect() as conn:
            result = conn.execute(
                text("SELECT COUNT(*) FROM sys.databases WHERE name = 'accounts_payable'")
            )
            count = result.scalar()
            if count == 0:
                conn.execute(text("CREATE DATABASE accounts_payable"))
                print("✓ Database 'accounts_payable' created successfully")
            else:
                print("✓ Database 'accounts_payable' already exists")
        master_engine.dispose()
    except Exception as e:
        print(f"✗ Failed to create database: {e}")
        raise


def create_tables():
    """Create all database tables"""
    print("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    print("✓ All tables created successfully")


def create_admin_user(db):
    """Create default admin user if not exists"""
    existing_admin = db.query(User).filter(User.email == settings.ADMIN_EMAIL).first()
    
    if not existing_admin:
        admin_user = User(
            username=settings.ADMIN_USERNAME,
            email=settings.ADMIN_EMAIL,
            password=get_password_hash(settings.ADMIN_PASSWORD),
            role="admin",
            status="active",
            created_at=datetime.utcnow()
        )
        db.add(admin_user)
        db.commit()
        print(f"✓ Admin user created: {settings.ADMIN_EMAIL}")
    else:
        print(f"✓ Admin user already exists: {settings.ADMIN_EMAIL}")


def create_default_currencies(db):
    """Create default currencies if not exists"""
    default_currencies = [
        {"code": "USD", "name": "US Dollar", "symbol": "$", "exchange_rate": 1.0},
        {"code": "EUR", "name": "Euro", "symbol": "€", "exchange_rate": 0.85},
        {"code": "GBP", "name": "British Pound", "symbol": "£", "exchange_rate": 0.73},
        {"code": "INR", "name": "Indian Rupee", "symbol": "₹", "exchange_rate": 83.0},
        {"code": "CAD", "name": "Canadian Dollar", "symbol": "C$", "exchange_rate": 1.35},
        {"code": "AUD", "name": "Australian Dollar", "symbol": "A$", "exchange_rate": 1.52},
    ]
    
    existing_count = db.query(Currency).count()
    
    if existing_count == 0:
        for curr_data in default_currencies:
            currency = Currency(**curr_data)
            db.add(currency)
        db.commit()
        print(f"✓ Created {len(default_currencies)} default currencies")
    else:
        print(f"✓ Currencies already exist ({existing_count} currencies)")


def create_default_settings(db):
    """Create default global settings if not exists"""
    default_settings = {
        "roles": ["admin", "coder", "approver"],
        "statuses": ["active", "pending", "rejected"],
        "navigation": [
            {"label": "Dashboard", "path": "/dashboard", "roles": ["all"]},
            {"label": "Invoice", "path": "/invoice", "roles": ["coder"]},
            {"label": "Coding", "path": "/coding", "roles": ["coder"]},
            {"label": "Approvals", "path": "/approvals", "roles": ["approver"]},
            {"label": "Master Data", "path": "/master-data", "roles": ["admin"]},
            {"label": "Settings", "path": "/settings", "roles": ["admin"]},
            {"label": "Admin", "path": "/admin", "roles": ["admin"]}
        ]
    }
    
    existing_setting = db.query(GlobalSetting).filter(
        GlobalSetting.setting_key == "app_settings"
    ).first()
    
    if not existing_setting:
        setting = GlobalSetting(
            setting_key="app_settings",
            setting_value=json.dumps(default_settings),
            updated_at=datetime.utcnow()
        )
        db.add(setting)
        db.commit()
        print("✓ Default global settings created")
    else:
        print("✓ Global settings already exist")


def create_default_entity(db):
    """Create a default entity if entity_master table is empty.
    This placeholder entity is used until a real entity master file is uploaded.
    """
    existing_count = db.query(EntityMaster).count()

    if existing_count == 0:
        default_entity = EntityMaster(
            entity_id="DEFAULT",
            entity_name="Default Entity",
            registered_address="",
            address_line1="",
            address_line2="",
            address_line3="",
            city="",
            state_or_territory="",
            zip_or_postal_code="",
            country_code="",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(default_entity)
        db.commit()
        print("✓ Default entity created (entity_id='DEFAULT') — replace by uploading an entity master file")
    else:
        print(f"✓ Entity master already has {existing_count} record(s), skipping default")


def init_database():
    """
    Initialize the database with tables and default data.
    This should be called on application startup.
    """
    print("\n" + "="*50)
    print("DATABASE INITIALIZATION")
    print("="*50 + "\n")

    # Step 1: Ensure the 'accounts_payable' database exists in SQL Server.
    # SQL Server Docker images only ship with 'master'; we must create our DB
    # BEFORE the main engine (which points to accounts_payable) is first used.
    create_database_if_not_exists()

    # Step 2: Create all ORM tables
    create_tables()
    
    # Create session for data insertion
    db = SessionLocal()
    try:
        # Create default data
        create_admin_user(db)
        create_default_currencies(db)
        create_default_settings(db)
        create_default_entity(db)
        
        print("\n" + "="*50)
        print("✓ DATABASE INITIALIZATION COMPLETE")
        print("="*50 + "\n")
        
    except Exception as e:
        print(f"✗ Error during initialization: {e}")
        db.rollback()
        raise
    finally:
        db.close()


async def seed_api_master_data(db):
    """
    Seed master data from Sage Intacct if tables are empty.
    Calls sync services for Vendors, GL, LOB, Items, Departments, and Customers.
    """
    from app.services.vendor_sync_service import VendorSyncService
    from app.services.master_sync_services import (
        GLSyncService, LOBSyncService, DepartmentSyncService, 
        CustomerSyncService, ItemSyncService, ExchangeRateSyncService
    )
    from app.models.db_models import (
        VendorMaster, GLMaster, LOBMaster, ItemMaster, DepartmentMaster, CustomerMaster, ExchangeRateMaster
    )

    masters = [
        (VendorMaster, VendorSyncService, "sync_vendors"),
        (GLMaster, GLSyncService, "sync_gl_accounts"),
        (LOBMaster, LOBSyncService, "sync_lob"),
        (ItemMaster, ItemSyncService, "sync_items"),
        (DepartmentMaster, DepartmentSyncService, "sync_departments"),
        (CustomerMaster, CustomerSyncService, "sync_customers"),
        (ExchangeRateMaster, ExchangeRateSyncService, "sync_exchange_rates")
    ]

    print("\n" + "-"*30)
    print("SEEDING MASTER DATA FROM SAGE")
    print("-"*30)

    for model, service_class, sync_method in masters:
        try:
            count = db.query(model).count()
            if count == 0:
                print(f"→ Seeding {model.__name__}...")
                service = service_class(db)
                sync_func = getattr(service, sync_method)
                await sync_func()
                new_count = db.query(model).count()
                print(f"  ✓ {model.__name__} seeded ({new_count} records)")
            else:
                print(f"✓ {model.__name__} already has {count} records, skipping seed")
        except Exception as e:
            print(f"  ✗ Error checking/seeding {model.__name__}: {e}")
    
    print("-"*30 + "\n")


if __name__ == "__main__":
    # Run initialization when script is executed directly
    init_database()
