from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class User(BaseModel):
    username: str
    email: EmailStr
    password: str
    created_at: Optional[datetime] = None

class UserInDB(User):
    id: str

class UserResponse(BaseModel):
    id: str
    username: str
    email: EmailStr
    created_at: datetime

    class Config:
        from_attributes = True