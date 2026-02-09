"""
Database initialization and bootstrap utilities.
Creates tables and inserts default data.
"""

from app.database.database import Base, engine, SessionLocal
from app.models.db_models import (
    User, Currency, GlobalSetting, ApproverDefault
)
from app.auth.jwt import get_password_hash
from app.config.settings import settings
from datetime import datetime
import json


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


def init_database():
    """
    Initialize the database with tables and default data.
    This should be called on application startup.
    """
    print("\n" + "="*50)
    print("DATABASE INITIALIZATION")
    print("="*50 + "\n")
    
    # Create tables
    create_tables()
    
    # Create session for data insertion
    db = SessionLocal()
    try:
        # Create default data
        create_admin_user(db)
        create_default_currencies(db)
        create_default_settings(db)
        
        print("\n" + "="*50)
        print("✓ DATABASE INITIALIZATION COMPLETE")
        print("="*50 + "\n")
        
    except Exception as e:
        print(f"✗ Error during initialization: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    # Run initialization when script is executed directly
    init_database()
