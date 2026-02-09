from sqlalchemy.orm import Session
from app.database.database import SessionLocal
from app.models.db_models import User as DBUser
from app.config.settings import settings
import logging

logger = logging.getLogger(__name__)

def migrate_users_role_status():
    """
    Updates all non-admin users to have role='user' and status='pending'. (SQLAlchemy version)
    """
    db = SessionLocal()
    try:
        admin_username = settings.ADMIN_USERNAME
        logger.info(f"Starting migration: Setting default role/status for users (excluding {admin_username})")
        
        # Update non-admins
        db.query(DBUser).filter(DBUser.username != admin_username).update({
            "role": "coder",
            "status": "pending"
        }, synchronize_session=False)
        
        # Ensure admin is correct
        db.query(DBUser).filter(DBUser.username == admin_username).update({
            "role": "admin",
            "status": "active"
        }, synchronize_session=False)
        
        db.commit()
        logger.info(f"Migration completed successfully")
    except Exception as e:
        logger.error(f"Error during migration: {e}")
        db.rollback()
    finally:
        db.close()
