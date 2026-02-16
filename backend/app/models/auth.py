from pydantic import BaseModel, EmailStr
from typing import Optional

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class CheckEmailRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    new_password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    username: str
    role: Optional[str] = None

class TokenData(BaseModel):
    email: str = None