from app.database.mongodb import get_database
from app.config.settings import settings
from app.auth.jwt import get_password_hash
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

async def bootstrap_admin():
    """
    Check if admin user exists, if not create one using env vars.
    """
    db = get_database()
    
    # Check if admin exists by username or email
    existing_admin = db.users.find_one({
        "$or": [
            {"username": settings.ADMIN_USERNAME},
            {"email": settings.ADMIN_EMAIL}
        ]
    })
    
    if not existing_admin:
        logger.info(f"Admin user not found. Creating default admin: {settings.ADMIN_USERNAME}")
        
        admin_user = {
            "username": settings.ADMIN_USERNAME,
            "email": settings.ADMIN_EMAIL,
            "password": get_password_hash(settings.ADMIN_PASSWORD),
            "role": "admin",
            "status": "active",
            "created_at": datetime.utcnow()
        }
        
        result = db.users.insert_one(admin_user)
        logger.info(f"Admin user created successfully with ID: {result.inserted_id}")
    else:
        # Optional: Ensure existing admin has admin role
        if existing_admin.get("role") != "admin":
            logger.info("Updating existing admin user to have admin role")
            db.users.update_one(
                {"_id": existing_admin["_id"]},
                {"$set": {"role": "admin", "status": "active"}}
            )
