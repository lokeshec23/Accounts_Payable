from app.database.mongodb import get_database

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

def get_app_settings():
    """
    Retrieve application settings from the database.
    Returns default settings if not found in DB.
    """
    db = get_database()
    settings = db["global_settings"].find_one({"_id": "app_settings"})

    if not settings:
        return DEFAULT_SETTINGS.copy()

    settings.pop("_id", None)
    
    # Merge with defaults to ensure all keys exist
    merged_settings = DEFAULT_SETTINGS.copy()
    merged_settings.update(settings)
    
    return merged_settings
