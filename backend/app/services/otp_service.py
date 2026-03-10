import random
import string
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.models.db_models import OTPRecord
from app.config.settings import settings
import logging

logger = logging.getLogger("app")

class OTPService:
    @staticmethod
    def generate_otp(length: int = 6) -> str:
        """Generate a numeric OTP string."""
        return ''.join(random.choices(string.digits, k=length))

    @staticmethod
    def create_otp_record(db: Session, email: str, purpose: str) -> str:
        """Create a new OTP record in the database and return the OTP code."""
        # Deactivate any previous codes for the same email and purpose
        db.query(OTPRecord).filter(
            OTPRecord.email == email,
            OTPRecord.purpose == purpose,
            OTPRecord.is_verified == False
        ).delete()
        
        otp_code = OTPService.generate_otp()
        expires_at = datetime.utcnow() + timedelta(minutes=settings.OTP_EXPIRY_MINUTES)
        
        db_otp = OTPRecord(
            email=email,
            otp_code=otp_code,
            purpose=purpose,
            expires_at=expires_at
        )
        db.add(db_otp)
        db.commit()
        db.refresh(db_otp)
        return otp_code

    @staticmethod
    def verify_otp(db: Session, email: str, otp_code: str, purpose: str) -> bool:
        """Verify an OTP code."""
        db_otp = db.query(OTPRecord).filter(
            OTPRecord.email == email,
            OTPRecord.otp_code == otp_code,
            OTPRecord.purpose == purpose,
            OTPRecord.is_verified == False,
            OTPRecord.expires_at > datetime.utcnow()
        ).first()

        if not db_otp:
            # Increment attempts for the record if found by code or just email/purpose
            db_otp_any = db.query(OTPRecord).filter(
                OTPRecord.email == email,
                OTPRecord.purpose == purpose,
                OTPRecord.is_verified == False
            ).order_by(OTPRecord.created_at.desc()).first()
            
            if db_otp_any:
                db_otp_any.attempts += 1
                db.commit()
                # Check if max retries exceeded (e.g., 5)
                if db_otp_any.attempts >= 5:
                    db.delete(db_otp_any)
                    db.commit()
            return False

        db_otp.is_verified = True
        db.commit()
        return True

    @staticmethod
    def is_verified(db: Session, email: str, purpose: str) -> bool:
        """Check if an email has recently verified an OTP for a specific purpose."""
        # Check for a verified record that isn't too old (e.g., verified in last 15 mins)
        cutoff = datetime.utcnow() - timedelta(minutes=15)
        return db.query(OTPRecord).filter(
            OTPRecord.email == email,
            OTPRecord.purpose == purpose,
            OTPRecord.is_verified == True,
            OTPRecord.created_at > cutoff
        ).first() is not None

otp_service = OTPService()
