from fastapi import APIRouter, HTTPException, Depends
from typing import List
from app.dependencies import get_current_entity
from app.models.approver_number import (
    ApproverNumberCreate,
    ApproverNumberResponse,
    ApproverNumberUpdate
)
from app.models.approver_gl import (
    ApproverGLCreate,
    ApproverGLResponse,
    ApproverGLUpdate
)
from app.models.approver_amount import (
    ApproverAmountCreate,
    ApproverAmountResponse,
    ApproverAmountUpdate
)
from app.database.mongodb import get_database
from app.auth.jwt import get_current_user
from app.models.user import UserResponse
from datetime import datetime
from bson.objectid import ObjectId

router = APIRouter()

# --- Default Rules (Retained) ---


# --- Default Rules ---

from app.models.approver_default import (
    ApproverDefaultCreate,
    ApproverDefaultResponse
)

@router.get("/default", response_model=ApproverDefaultResponse)
async def get_default_config(
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """Get default approver configuration"""
    db = get_database()
    config = db.approver_default.find_one({"entity": entity})
    
    if config:
        config["id"] = str(config["_id"])
        return ApproverDefaultResponse(**config)
    else:
        # Default fallback if nothing in DB
        return ApproverDefaultResponse(
            id="default", 
            default_approver_count=2, 
            updated_at=None
        )

@router.post("/default", response_model=ApproverDefaultResponse)
async def create_or_update_default_config(
    config_data: ApproverDefaultCreate,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """Create or update default approver configuration"""
    db = get_database()
    
    existing = db.approver_default.find_one({"entity": entity})
    
    if existing:
        update_data = {
            "default_approver_count": config_data.default_approver_count,
            "updated_at": datetime.utcnow()
        }
        db.approver_default.update_one(
            {"_id": existing["_id"]},
            {"$set": update_data}
        )
        updated_config = db.approver_default.find_one({"_id": existing["_id"]})
        updated_config["id"] = str(updated_config["_id"])
        return ApproverDefaultResponse(**updated_config)
    else:
        new_config = {
            "default_approver_count": config_data.default_approver_count,
            "updated_at": datetime.utcnow(),
            "entity": entity
        }
        result = db.approver_default.insert_one(new_config)
        created_config = db.approver_default.find_one({"_id": result.inserted_id})
        created_config["id"] = str(created_config["_id"])
        return ApproverDefaultResponse(**created_config)
