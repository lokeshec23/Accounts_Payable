from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.models.auth import LoginRequest, Token
from app.models.user import User as PydanticUser, UserResponse
from app.models.sql.user import User as SQLUser
from app.database.sql_server import get_db
from app.auth.jwt import verify_password, get_password_hash, create_access_token
from datetime import datetime, timedelta
from app.config.settings import settings

router = APIRouter()

@router.post("/register", response_model=UserResponse)
async def register(user: PydanticUser, db: AsyncSession = Depends(get_db)):
    # Check if user already exists
    stmt = select(SQLUser).where(
        or_(
            SQLUser.email == user.email,
            SQLUser.username == user.username
        )
    )
    result = await db.execute(stmt)
    existing_user = result.scalar_one_or_none()
    
    if existing_user:
        if existing_user.email == user.email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken"
            )
    
    # Hash password
    hashed_password = get_password_hash(user.password)
    
    # Create new user
    new_user = SQLUser(
        username=user.username,
        email=user.email,
        password=hashed_password,
        role="coder",
        status="pending",
        created_at=datetime.utcnow()
    )
    
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    
    # Prepare response
    response_data = {
        "id": str(new_user.id),
        "username": new_user.username,
        "email": new_user.email,
        "role": new_user.role,
        "status": new_user.status,
        "created_at": new_user.created_at
    }
    
    return UserResponse(**response_data)

@router.post("/login", response_model=Token)
async def login(login_data: LoginRequest, db: AsyncSession = Depends(get_db)):
    stmt = select(SQLUser).where(SQLUser.email == login_data.email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()
    
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
