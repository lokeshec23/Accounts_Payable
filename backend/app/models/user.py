from pydantic import BaseModel, EmailStr
from typing import Optional, Union
from datetime import datetime

class User(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: str = "user"  # admin, coder, approver, user
    status: str = "pending"  # pending, active, rejected
    created_at: Optional[datetime] = None

class UserInDB(User):
    id: Union[str, int]

class UserResponse(BaseModel):
    id: Union[str, int]
    username: str
    email: EmailStr
    role: str
    status: str 
    isCreatedByUser: bool = True
    createdby: str = "self"
    ispasswordchange: bool = True
    created_at: datetime

    class Config:
        from_attributes = True