from fastapi import APIRouter, HTTPException, Depends
from typing import List
from app.models.approver_number import (
    ApproverNumberCreate,
    ApproverNumberResponse,
    ApproverNumberUpdate
)
from app.database.mongodb import get_database
from app.auth.jwt import get_current_user
from app.models.user import UserResponse
from datetime import datetime
from bson.objectid import ObjectId

router = APIRouter()

@router.get("/", response_model=List[ApproverNumberResponse])
async def get_approver_configs(
    current_user: UserResponse = Depends(get_current_user)
):
    """Get all vendor approver configurations"""
    db = get_database()
    
    configs = db.approver_number.find()
    config_list = []
    
    for config in configs:
        config["id"] = str(config["_id"])
        config_list.append(ApproverNumberResponse(**config))
    
    return config_list

@router.get("/{vendor_name}", response_model=ApproverNumberResponse)
async def get_approver_config(
    vendor_name: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Get approver configuration for a specific vendor"""
    db = get_database()
    
    config = db.approver_number.find_one({"vendor_name": vendor_name})
    if not config:
        raise HTTPException(status_code=404, detail=f"No approver configuration found for vendor: {vendor_name}")
    
    config["id"] = str(config["_id"])
    return ApproverNumberResponse(**config)

@router.get("/count/{vendor_name}")
async def get_approver_count(
    vendor_name: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Get the required approver count for a vendor (returns 4 if not configured)"""
    db = get_database()
    
    config = db.approver_number.find_one({"vendor_name": vendor_name})
    
    if config:
        return {"vendor_name": vendor_name, "approver_count": config["approver_count"]}
    else:
        # Default to 4 approvers for unknown vendors
        return {"vendor_name": vendor_name, "approver_count": 4, "is_default": True}

@router.post("/", response_model=ApproverNumberResponse)
async def create_or_update_approver_config(
    config_data: ApproverNumberCreate,
    current_user: UserResponse = Depends(get_current_user)
):
    """Create or update approver configuration for a vendor"""
    db = get_database()
    
    # Check if configuration already exists
    existing = db.approver_number.find_one({"vendor_name": config_data.vendor_name})
    
    if existing:
        # Update existing configuration
        update_data = {
            "approver_count": config_data.approver_count,
            "updated_at": datetime.utcnow()
        }
        
        db.approver_number.update_one(
            {"vendor_name": config_data.vendor_name},
            {"$set": update_data}
        )
        
        updated_config = db.approver_number.find_one({"vendor_name": config_data.vendor_name})
        updated_config["id"] = str(updated_config["_id"])
        return ApproverNumberResponse(**updated_config)
    else:
        # Create new configuration
        config_dict = config_data.dict()
        config_dict["created_at"] = datetime.utcnow()
        config_dict["updated_at"] = None
        
        result = db.approver_number.insert_one(config_dict)
        
        created_config = db.approver_number.find_one({"_id": result.inserted_id})
        created_config["id"] = str(created_config["_id"])
        return ApproverNumberResponse(**created_config)

@router.delete("/{vendor_name}")
async def delete_approver_config(
    vendor_name: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Delete approver configuration for a vendor"""
    db = get_database()
    
    result = db.approver_number.delete_one({"vendor_name": vendor_name})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail=f"No approver configuration found for vendor: {vendor_name}")
    
    return {"message": f"Approver configuration deleted for vendor: {vendor_name}"}
