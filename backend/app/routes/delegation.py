from fastapi import APIRouter, HTTPException, Depends, status
from typing import List
from app.models.delegation import DelegationCreate, DelegationResponse
from app.database.mongodb import get_database
from app.auth.jwt import get_current_user
from app.dependencies import get_current_entity
from app.models.user import UserResponse
from datetime import datetime
from bson.objectid import ObjectId

router = APIRouter()

@router.post("/", response_model=DelegationResponse)
async def create_delegation(
    delegation: DelegationCreate,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    db = get_database()
    
    # Validation: Cannot delegate to self
    if delegation.original_approver == delegation.substitute_approver:
        raise HTTPException(
            status_code=400,
            detail="Original approver and substitute approver cannot be the same."
        )
    
    # Permission check: Only admin or the original approver themselves can create delegation
    if current_user.role != "admin" and current_user.email != delegation.original_approver:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to delegate this user's approvals."
        )

    delegation_dict = delegation.dict()
    delegation_dict["created_at"] = datetime.utcnow()
    delegation_dict["created_by"] = current_user.email
    delegation_dict["entity"] = entity
    
    result = db.delegations.insert_one(delegation_dict)
    
    created = db.delegations.find_one({"_id": result.inserted_id})
    created["_id"] = str(created["_id"])
    
    return created

@router.get("/", response_model=List[DelegationResponse])
async def get_delegations(
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    db = get_database()
    
    query = {"entity": entity}
    
    # Non-admins only see delegations they created or are involved in
    if current_user.role != "admin":
        query["$or"] = [
            {"original_approver": current_user.email},
            {"substitute_approver": current_user.email},
            {"created_by": current_user.email}
        ]
        
    delegations = list(db.delegations.find(query).sort("created_at", -1))
    
    for d in delegations:
        d["_id"] = str(d["_id"])
        
    return delegations

@router.delete("/{delegation_id}")
async def delete_delegation(
    delegation_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    db = get_database()
    
    delegation = db.delegations.find_one({"_id": ObjectId(delegation_id)})
    if not delegation:
        raise HTTPException(status_code=404, detail="Delegation not found")
        
    # Permission check: Only admin, creator, or original approver can delete
    if current_user.role != "admin" and \
       current_user.email != delegation.get("created_by") and \
       current_user.email != delegation.get("original_approver"):
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to revert this delegation."
        )
        
    db.delegations.delete_one({"_id": ObjectId(delegation_id)})
    
    return {"message": "Delegation reverted successfully"}
