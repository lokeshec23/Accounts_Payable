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

# --- Vendor Rules (Existing) ---

@router.get("/", response_model=List[ApproverNumberResponse], response_model_by_alias=False)
async def get_approver_configs(
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """Get all vendor approver configurations"""
    db = get_database()
    
    configs = db.approver_number.find({"entity": entity})
    config_list = []
    
    for config in configs:
        config["id"] = str(config["_id"])
        config_list.append(ApproverNumberResponse(**config))
    
    return config_list

@router.get("/vendor/{vendor_name}", response_model=ApproverNumberResponse)
async def get_approver_config(
    vendor_name: str,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """Get approver configuration for a specific vendor"""
    db = get_database()
    
    config = db.approver_number.find_one({"vendorName": vendor_name, "entity": entity})
    if not config:
        raise HTTPException(status_code=404, detail=f"No approver configuration found for vendor: {vendor_name}")
    
    config["id"] = str(config["_id"])
    return ApproverNumberResponse(**config)

@router.get("/count/{vendor_name}")
async def get_approver_count(
    vendor_name: str,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """Get the required approver count for a vendor (returns 4 if not configured)"""
    db = get_database()
    
    config = db.approver_number.find_one({"vendorName": vendor_name, "entity": entity})
    
    if config:
        return {"vendor_name": vendor_name, "approver_count": config["approverCount"]}
    else:
        # Default to 4 approvers for unknown vendors
        return {"vendor_name": vendor_name, "approver_count": 4, "is_default": True}

@router.post("/", response_model=ApproverNumberResponse)
async def create_or_update_approver_config(
    config_data: ApproverNumberCreate,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """Create or update approver configuration for a vendor"""
    db = get_database()
    
    # Convert to dict with MongoDB field names
    config_dict = config_data.model_dump(by_alias=False)
    vendor_name = config_dict.get("vendorName") or config_dict.get("vendor_name")
    
    # Check if configuration already exists
    existing = db.approver_number.find_one({"vendorName": vendor_name, "entity": entity})
    
    if existing:
        # Update existing configuration
        update_data = {
            "approverCount": config_dict.get("approverCount") or config_dict.get("approver_count"),
            "updated_at": datetime.utcnow()
        }
        
        db.approver_number.update_one(
            {"vendorName": vendor_name, "entity": entity},
            {"$set": update_data}
        )
        
        updated_config = db.approver_number.find_one({"vendorName": vendor_name, "entity": entity})
        updated_config["id"] = str(updated_config["_id"])
        return ApproverNumberResponse(**updated_config)
    else:
        # Create new configuration
        mongo_doc = {
            "vendorName": vendor_name,
            "approverCount": config_dict.get("approverCount") or config_dict.get("approver_count"),
            "created_at": datetime.utcnow(),
            "updated_at": None,
            "entity": entity 
        }
        
        result = db.approver_number.insert_one(mongo_doc)
        
        created_config = db.approver_number.find_one({"_id": result.inserted_id})
        created_config["id"] = str(created_config["_id"])
        return ApproverNumberResponse(**created_config)

@router.delete("/{vendor_name}")
async def delete_approver_config(
    vendor_name: str,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """Delete approver configuration for a vendor"""
    db = get_database()
    
    result = db.approver_number.delete_one({"vendorName": vendor_name, "entity": entity})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail=f"No approver configuration found for vendor: {vendor_name}")
    
    return {"message": f"Approver configuration deleted for vendor: {vendor_name}"}


# --- Amount Rules ---

@router.get("/rules/amount", response_model=List[ApproverAmountResponse])
async def get_amount_rules(
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """Get all amount-based approver rules"""
    db = get_database()
    rules = db.approver_amount.find({"entity": entity})
    result = []
    for rule in rules:
        rule["id"] = str(rule["_id"])
        result.append(ApproverAmountResponse(**rule))
    return result

@router.post("/rules/amount", response_model=ApproverAmountResponse)
async def create_amount_rule(
    rule_data: ApproverAmountCreate,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """Create a new amount-based approver rule"""
    db = get_database()
    
    # Check for overlapping ranges? For now, we'll allow overlap but maybe we should warn or prevent.
    # Simple insertion for now.
    
    rule_dict = rule_data.dict()
    rule_dict["created_at"] = datetime.utcnow()
    rule_dict["updated_at"] = None
    rule_dict["entity"] = entity
    
    result = db.approver_amount.insert_one(rule_dict)
    created_rule = db.approver_amount.find_one({"_id": result.inserted_id})
    created_rule["id"] = str(created_rule["_id"])
    return ApproverAmountResponse(**created_rule)

@router.delete("/rules/amount/{rule_id}")
async def delete_amount_rule(
    rule_id: str,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """Delete an amount-based approver rule"""
    db = get_database()
    result = db.approver_amount.delete_one({"_id": ObjectId(rule_id), "entity": entity})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail=f"Rule not found or access denied: {rule_id}")
    
    return {"message": "Rule deleted successfully"}


# --- GL Rules ---

@router.get("/rules/gl", response_model=List[ApproverGLResponse], response_model_by_alias=False)
async def get_gl_rules(
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """Get all GL-based approver rules"""
    db = get_database()
    rules = db.approver_gl.find({"entity": entity})
    result = []
    for rule in rules:
        rule["id"] = str(rule["_id"])
        result.append(ApproverGLResponse(**rule))
    return result

@router.post("/rules/gl", response_model=ApproverGLResponse)
async def create_gl_rule(
    rule_data: ApproverGLCreate,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """Create or update a GL-based approver rule"""
    db = get_database()
    
    # Convert to dict with MongoDB field names
    rule_dict = rule_data.model_dump(by_alias=False)
    gl_title = rule_dict.get("glTitle") or rule_dict.get("gl_code")
    
    existing = db.approver_gl.find_one({"glTitle": gl_title, "entity": entity})
    if existing:
         # Update existing configuration
        update_data = {
            "approverCount": rule_dict.get("approverCount") or rule_dict.get("approver_count"),
            "updated_at": datetime.utcnow()
        }
        
        db.approver_gl.update_one(
            {"glTitle": gl_title, "entity": entity},
            {"$set": update_data}
        )
        updated_rule = db.approver_gl.find_one({"glTitle": gl_title, "entity": entity})
        updated_rule["id"] = str(updated_rule["_id"])
        return ApproverGLResponse(**updated_rule)
    else:
        mongo_doc = {
            "glTitle": gl_title,
            "approverCount": rule_dict.get("approverCount") or rule_dict.get("approver_count"),
            "created_at": datetime.utcnow(),
            "updated_at": None,
            "entity": entity
        }
        
        result = db.approver_gl.insert_one(mongo_doc)
        created_rule = db.approver_gl.find_one({"_id": result.inserted_id})
        created_rule["id"] = str(created_rule["_id"])
        return ApproverGLResponse(**created_rule)

@router.delete("/rules/gl/{gl_code}")
async def delete_gl_rule(
    gl_code: str,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """Delete a GL-based approver rule"""
    db = get_database()
    result = db.approver_gl.delete_one({"glTitle": gl_code, "entity": entity})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail=f"Rule not found for GL: {gl_code}")
    
    return {"message": f"Rule deleted for GL: {gl_code}"}


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
            default_approver_count=4, 
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
