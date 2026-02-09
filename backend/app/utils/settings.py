from sqlalchemy.orm import Session
from app.database.database import get_db
from app.models.db_models import GlobalSetting
import json

DEFAULT_SETTINGS = {
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

def get_app_settings(db: Session = None):
    """
    Retrieve application settings from the database.
    Returns default settings if not found in DB.
    """
    # Create session if not provided
    close_session = False
    if db is None:
        from app.database.database import SessionLocal
        db = SessionLocal()
        close_session = True
    
    try:
        setting = db.query(GlobalSetting).filter(GlobalSetting.setting_key == "app_settings").first()
        
        if not setting or not setting.setting_value:
            return DEFAULT_SETTINGS.copy()
        
        # Parse JSON value
        try:
            settings_data = json.loads(setting.setting_value) if isinstance(setting.setting_value, str) else setting.setting_value
        except (json.JSONDecodeError, TypeError):
            return DEFAULT_SETTINGS.copy()
        
        # Merge with defaults to ensure all keys exist
        merged_settings = DEFAULT_SETTINGS.copy()
        merged_settings.update(settings_data)
        
        return merged_settings
    finally:
        if close_session:
            db.close()
