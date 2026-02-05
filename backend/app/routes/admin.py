from fastapi import APIRouter, HTTPException, Depends, status
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.database.sql_server import get_db
from app.models.user import UserResponse
from app.models.sql.user import User as SQLUser
from app.auth.jwt import get_current_user
from app.utils.settings import get_app_settings
from pydantic import BaseModel

router = APIRouter()

class UserRoleUpdate(BaseModel):
    role: str
    status: str

# Helper to check if user is admin
def get_current_admin(current_user: UserResponse = Depends(get_current_user)):
    if current_user.role != "admin": 
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    return current_user

@router.get("/", response_model=List[UserResponse])
async def get_all_users(
    current_user: UserResponse = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Get all users from SQL (Admin only)"""
    stmt = select(SQLUser)
    result = await db.execute(stmt)
    users = result.scalars().all()
    
    user_list = []
    for user in users:
        u_dict = {c.name: getattr(user, c.name) for c in user.__table__.columns if c.name != 'id'}
        u_dict["id"] = str(user.id)
        user_list.append(UserResponse(**u_dict))
        
    return user_list

@router.put("/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: str,
    update_data: UserRoleUpdate,
    current_user: UserResponse = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    try:
        user_id_int = int(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid user ID format")

    settings = get_app_settings()
    allowed_roles = settings.get("roles", ["admin", "coder", "approver", "user"])
    allowed_statuses = settings.get("statuses", ["active", "pending", "rejected"])

    if update_data.role not in allowed_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role: {update_data.role}")

    if update_data.status not in allowed_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status: {update_data.status}")

    if str(current_user.id) == user_id and update_data.role != "admin":
        raise HTTPException(status_code=400, detail="Admin cannot remove own admin role")

    stmt = select(SQLUser).where(SQLUser.id == user_id_int)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user.role = update_data.role
    user.status = update_data.status
    
    await db.commit()
    await db.refresh(user)
    
    u_dict = {c.name: getattr(user, c.name) for c in user.__table__.columns if c.name != 'id'}
    u_dict["id"] = str(user.id)
    return UserResponse(**u_dict)
