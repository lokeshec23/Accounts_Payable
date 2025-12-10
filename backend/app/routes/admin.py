from fastapi import APIRouter, HTTPException, Depends, status
from typing import List
from app.models.user import UserResponse
from app.database.mongodb import get_database
from app.auth.jwt import get_current_user
from bson.objectid import ObjectId
from pydantic import BaseModel

router = APIRouter()

class UserRoleUpdate(BaseModel):
    role: str
    status: str

# Helper to check if user is admin
def get_current_admin(current_user: UserResponse = Depends(get_current_user)):
    # Assuming role is stored in UserResponse (which it is now)
    # Check both "admin" role and specific usernames as fallback for bootstrapping
    # Check admin role
    print(f"[DEBUG] Admin check - User: {current_user.username}, Role: {current_user.role}")
    if current_user.role != "admin": 
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    return current_user

@router.get("/", response_model=List[UserResponse])
async def get_all_users(
    current_user: UserResponse = Depends(get_current_admin)
):
    """Get all users (Admin only)"""
    db = get_database()
    users = db.users.find()
    
    user_list = []
    for user in users:
        user["id"] = str(user["_id"])
        # Ensure role/status exist for older records
        if "role" not in user: user["role"] = "user"
        if "status" not in user: user["status"] = "active"
        
        user_list.append(UserResponse(**user))
        
    return user_list

@router.put("/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: str,
    update_data: UserRoleUpdate,
    current_user: UserResponse = Depends(get_current_admin)
):
    """Update user role and status (Admin only)"""
    db = get_database()
    
    # Verify update data
    if update_data.role not in ["admin", "coder", "approver", "user"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    if update_data.status not in ["pending", "active", "rejected"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    # Update user
    result = db.users.update_one(
        {"_id": ObjectId(user_id)},
        {"$set": {
            "role": update_data.role,
            "status": update_data.status
        }}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
        
    updated_user = db.users.find_one({"_id": ObjectId(user_id)})
    updated_user["id"] = str(updated_user["_id"])
    
    return UserResponse(**updated_user)
