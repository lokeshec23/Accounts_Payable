from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.orm import Session
from app.models.auth import LoginRequest, Token, CheckEmailRequest, ResetPasswordRequest, SendOTPRequest, VerifyOTPRequest, ChangePasswordFirstTimeRequest
from app.models.user import User as UserPydantic, UserResponse
from app.models.db_models import User as UserDB
from app.database.database import get_db
from app.auth.jwt import verify_password, get_password_hash, create_access_token
from app.services.email_service import email_service
from app.services.otp_service import otp_service
from datetime import datetime, timedelta
from app.config.settings import settings

router = APIRouter()

@router.post("/send-otp")
async def send_otp(request: SendOTPRequest, db: Session = Depends(get_db)):
    # If purpose is forgot_password, check if email exists
    if request.purpose == "forgot_password":
        user = db.query(UserDB).filter(UserDB.email == request.email).first()
        if not user:
            raise HTTPException(status_code=404, detail="Email not found")
    
    # If purpose is registration, check if email already exists
    if request.purpose == "registration":
        user = db.query(UserDB).filter(UserDB.email == request.email).first()
        if user:
            raise HTTPException(status_code=400, detail="Email already registered")

    otp = otp_service.create_otp_record(db, request.email, request.purpose)
    
    success = False
    if request.purpose == "registration":
        success = email_service.send_registration_otp(request.email, otp)
    else:
        user = db.query(UserDB).filter(UserDB.email == request.email).first()
        success = email_service.send_forgot_password_otp(request.email, user.username if user else "User", otp)
    
    if not success:
        raise HTTPException(status_code=500, detail="Failed to send email notification")
        
    return {"message": "OTP sent successfully"}

@router.post("/verify-otp")
async def verify_otp(request: VerifyOTPRequest, db: Session = Depends(get_db)):
    valid = otp_service.verify_otp(db, request.email, request.otp_code, request.purpose)
    if not valid:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")
    return {"message": "OTP verified successfully"}

@router.post("/register", response_model=UserResponse)
async def register(user: UserPydantic, db: Session = Depends(get_db)):
    # Check if OTP was verified
    if not otp_service.is_verified(db, user.email, "registration"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email not verified. Please verify OTP first."
        )

    # Check if user already exists (redundant but safe)
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
    
    # Create new user with pending status
    new_user = UserDB(
        username=user.username,
        email=user.email,
        password=hashed_password,
        status="pending",
        role="coder", # Default role, can be changed during approval
        isCreatedByUser=True,
        createdby="self",
        ispasswordchange=True,
        created_at=datetime.utcnow()
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Notify all Admins and the user
    admins = db.query(UserDB).filter(UserDB.role == "admin").all()
    for admin in admins:
        email_service.send_admin_new_user_notification(admin.email, new_user.email, new_user.username)
    
    # If no admins found in DB, fallback to settings default admin email
    if not admins:
        email_service.send_admin_new_user_notification(settings.ADMIN_EMAIL, new_user.email, new_user.username)

    # NEW: Send confirmation to the user that their account is pending approval
    email_service.send_user_pending_approval(new_user.email, new_user.username)
    
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
            detail=f"Account {user.status}. Please contact administrator."
        )
    
    access_token = create_access_token(
        data={"sub": user.email},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "username": user.username,
        "role": user.role,
        "ispasswordchange": user.ispasswordchange
    }

@router.post("/change-password-first-time")
async def change_password_first_time(request: ChangePasswordFirstTimeRequest, db: Session = Depends(get_db)):
    user = db.query(UserDB).filter(UserDB.email == request.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    hashed_password = get_password_hash(request.new_password)
    user.password = hashed_password
    user.ispasswordchange = True
    db.commit()
    
    return {"message": "Password updated successfully"}

@router.post("/check-email")
async def check_email(request: CheckEmailRequest, db: Session = Depends(get_db)):
    try:
        user = db.query(UserDB).filter(UserDB.email == request.email).first()
        if not user:
            return {"exists": False, "message": "Email does not exist"}
        return {"exists": True, "message": "Email exists"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal server error: {str(e)}"
        )

@router.post("/reset-password")
async def reset_password(request: ResetPasswordRequest, db: Session = Depends(get_db)):
    # Check if OTP was verified
    if not otp_service.is_verified(db, request.email, "forgot_password"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP not verified for this email."
        )

    user = db.query(UserDB).filter(UserDB.email == request.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    hashed_password = get_password_hash(request.new_password)
    user.password = hashed_password
    db.commit()
    
    return {"message": "Password updated successfully"}
