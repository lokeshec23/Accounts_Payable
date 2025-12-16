from fastapi import APIRouter, Depends, HTTPException
from app.database.mongodb import get_database
from app.auth.jwt import get_current_user

router = APIRouter()

@router.get("/")
async def get_settings():
    db = get_database()
    settings = db["global_settings"].find_one({"_id": "app_settings"})

    if not settings:
        return {
            "roles": ["admin", "coder", "approver"],
            "statuses": ["active", "pending", "rejected"],
            "navigation": [
                {"label": "Dashboard", "path": "/dashboard", "roles": ["all"]},
                {"label": "Invoice", "path": "/invoice", "roles": ["admin", "coder"]},
                {"label": "Coding", "path": "/coding", "roles": ["admin", "coder"]},
                {"label": "Approvals", "path": "/approvals", "roles": ["admin", "approver"]},
                {"label": "Master Data", "path": "/master-data", "roles": ["all"]},
                {"label": "Settings", "path": "/settings", "roles": ["all"]},
                {"label": "Admin", "path": "/admin", "roles": ["admin"]}
            ]
        }

    settings.pop("_id", None)
    return settings


@router.put("/")
async def update_settings(payload: dict, user=Depends(get_current_user)):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    db = get_database()
    db["global_settings"].update_one(
        {"_id": "app_settings"},
        {"$set": payload},
        upsert=True
    )

    return {"message": "Settings updated"}
