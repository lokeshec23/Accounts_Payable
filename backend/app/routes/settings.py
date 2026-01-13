from fastapi import APIRouter, Depends, HTTPException
from app.database.mongodb import get_database
from app.auth.jwt import get_current_user
from app.utils.settings import get_app_settings

router = APIRouter()

@router.get("/")
async def get_settings():
    return get_app_settings()


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
