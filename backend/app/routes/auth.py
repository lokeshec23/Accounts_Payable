from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.security import HTTPBearer
from app.models.auth import LoginRequest, Token
from app.models.user import User, UserResponse
from app.database.mongodb import get_database
from app.auth.jwt import verify_password, get_password_hash, create_access_token, verify_token
from datetime import datetime, timedelta
from app.config.settings import settings

router = APIRouter()
security = HTTPBearer()

@router.post("/register", response_model=UserResponse)
async def register(user: User):
    db = get_database()
    
    # Check if user already exists
    if db.users.find_one({"email": user.email}):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    if db.users.find_one({"username": user.username}):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken"
        )
    
    # Hash password
    hashed_password = get_password_hash(user.password)
    user_dict = user.dict()
    user_dict["password"] = hashed_password
    # Set created_at to current UTC time if not present
    user_dict["created_at"] = datetime.utcnow()
    
    # Insert user
    result = db.users.insert_one(user_dict)
    user_dict["id"] = str(result.inserted_id)
    
    return UserResponse(**user_dict)

@router.post("/login", response_model=Token)
async def login(login_data: LoginRequest):
    db = get_database()
    
    user = db.users.find_one({"email": login_data.email})
    if not user or not verify_password(login_data.password, user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    access_token = create_access_token(
        data={"sub": user["email"]},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    
    return {"access_token": access_token, "token_type": "bearer"}

def get_current_user(token: str = Depends(security)):
    email = verify_token(token.credentials)
    if email is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials"
        )
    
    db = get_database()
    user = db.users.find_one({"email": email})
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    user["id"] = str(user["_id"])
    return UserResponse(**user)