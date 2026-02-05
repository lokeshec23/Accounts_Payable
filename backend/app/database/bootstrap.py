from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.database.database import SessionLocal
from app.models.db_models import User as DBUser
from app.config.settings import settings
from app.auth.jwt import get_password_hash
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

def bootstrap_admin():
    """
    Check if admin user exists, if not create one using env vars. (SQLAlchemy version)
    """
    db = SessionLocal()
    try:
        # Check if admin exists
        existing_admin = db.query(DBUser).filter(
            or_(
                DBUser.username == settings.ADMIN_USERNAME,
                DBUser.email == settings.ADMIN_EMAIL
            )
        ).first()
        
        if not existing_admin:
            logger.info(f"Admin user not found. Creating default admin: {settings.ADMIN_USERNAME}")
            
            admin_user = DBUser(
                username=settings.ADMIN_USERNAME,
                email=settings.ADMIN_EMAIL,
                password=get_password_hash(settings.ADMIN_PASSWORD),
                role="admin",
                status="active",
                created_at=datetime.utcnow()
            )
            
            db.add(admin_user)
            db.commit()
            logger.info(f"Admin user created successfully")
        else:
            if existing_admin.role != "admin":
                logger.info("Updating existing admin user to have admin role")
                existing_admin.role = "admin"
                existing_admin.status = "active"
                db.commit()
    except Exception as e:
        logger.error(f"Error during admin bootstrap: {e}")
        db.rollback()
    finally:
        db.close()
