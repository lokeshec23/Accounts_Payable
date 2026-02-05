from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database.sql_server import get_db
from app.auth.jwt import get_current_user
from app.models.sql.settings import GlobalSettings as SQLGlobalSettings
from app.models.user import UserResponse

router = APIRouter()

@router.get("/")
async def get_settings(db: AsyncSession = Depends(get_db)):
    stmt = select(SQLGlobalSettings).where(SQLGlobalSettings.config_key == "app_settings")
    result = await db.execute(stmt)
    settings = result.scalar_one_or_none()
    
    if not settings:
        # Return defaults if nothing in DB
        return {
            "entity_name": "Consolidated Analytics Inc",
            "roles": ["admin", "coder", "approver", "user"],
            "statuses": ["active", "pending", "rejected"]
        }
    return settings.settings_data

@router.put("/")
async def update_settings(
    payload: dict, 
    user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    stmt = select(SQLGlobalSettings).where(SQLGlobalSettings.config_key == "app_settings")
    result = await db.execute(stmt)
    settings = result.scalar_one_or_none()
    
    if settings:
        settings.settings_data = payload
    else:
        settings = SQLGlobalSettings(
            config_key="app_settings",
            settings_data=payload
        )
        db.add(settings)
        
    await db.commit()
    return {"message": "Settings updated"}
