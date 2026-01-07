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
        if "role" not in user: user["role"] = "coder"
        if "status" not in user: user["status"] = "active"
        
        user_list.append(UserResponse(**user))
        
    return user_list


@router.put("/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: str,
    update_data: UserRoleUpdate,
    current_user: UserResponse = Depends(get_current_admin)
):
    db = get_database()

    #  Load global settings correctly
    settings = db.global_settings.find_one({"_id": "app_settings"})
    if not settings:
        raise HTTPException(status_code=500, detail="Global settings not found")

    allowed_roles = settings.get("roles", [])
    allowed_statuses = settings.get("statuses", [])

    # Validate role
    if update_data.role not in allowed_roles:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role: {update_data.role}"
        )

    # Validate status
    if update_data.status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status: {update_data.status}"
        )

    # Prevent admin removing own admin role
    if str(current_user.id) == user_id and update_data.role != "admin":
        raise HTTPException(
            status_code=400,
            detail="Admin cannot remove own admin role"
        )

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
