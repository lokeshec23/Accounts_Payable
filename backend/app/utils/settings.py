DEFAULT_SETTINGS = {
    "roles": ["admin", "coder", "approver", "user"],
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
    Returns default application settings.
    SQL routes should handle DB-backed settings.
    """
    return DEFAULT_SETTINGS.copy()
