from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database.database import get_db
from app.models.db_models import GlobalSetting
from app.auth.jwt import get_current_user
from app.utils.settings import get_app_settings
import json

router = APIRouter()

@router.get("/")
async def get_settings(db: Session = Depends(get_db)):
    return get_app_settings(db)


@router.put("/")
async def update_settings(payload: dict, user=Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied")

    # Find or create the settings record
    setting = db.query(GlobalSetting).filter(GlobalSetting.setting_key == "app_settings").first()
    
    if setting:
        # Update existing
        setting.setting_value = json.dumps(payload)
    else:
        # Create new
        setting = GlobalSetting(
            setting_key="app_settings",
            setting_value=json.dumps(payload)
        )
        db.add(setting)
    
    db.commit()

    return {"message": "Settings updated"}
