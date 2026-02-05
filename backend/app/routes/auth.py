from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.orm import Session
from app.models.auth import LoginRequest, Token
from app.models.user import User as UserPydantic, UserResponse
from app.models.db_models import User as UserDB
from app.database.database import get_db
from app.auth.jwt import verify_password, get_password_hash, create_access_token
from datetime import datetime, timedelta
from app.config.settings import settings

router = APIRouter()

@router.post("/register", response_model=UserResponse)
async def register(user: UserPydantic, db: Session = Depends(get_db)):
    # Check if user already exists
    existing_email = db.query(UserDB).filter(UserDB.email == user.email).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    existing_username = db.query(UserDB).filter(UserDB.username == user.username).first()
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken"
        )
    
    # Hash password
    hashed_password = get_password_hash(user.password)
    
    # Create new user
    new_user = UserDB(
        username=user.username,
        email=user.email,
        password=hashed_password,
        status="pending",
        role="coder",
        created_at=datetime.utcnow()
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return UserResponse(
        id=str(new_user.id),
        username=new_user.username,
        email=new_user.email,
        role=new_user.role,
        status=new_user.status,
        created_at=new_user.created_at
    )

@router.post("/login", response_model=Token)
async def login(login_data: LoginRequest, db: Session = Depends(get_db)):
    # Find user by email
    user = db.query(UserDB).filter(UserDB.email == login_data.email).first()
    
    if not user or not verify_password(login_data.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )
    
    # Check status
    if user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account pending approval"
        )
    
    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "username": user.username,
        "role": user.role
    }