from app.database.mongodb import get_database
from app.config.settings import settings
import logging

logger = logging.getLogger(__name__)

async def migrate_users_role_status():
    """
    Updates all non-admin users to have role='user' and status='pending'.
    """
    db = get_database()
    admin_username = settings.ADMIN_USERNAME
    
    logger.info(f"Starting migration: Setting default role/status for users (excluding {admin_username})")
    
    # Update all users who are NOT the admin
    # We use update_many to ensure coverage
    result = db.users.update_many(
        {"username": {"$ne": admin_username}},
        {"$set": {"role": "user", "status": "pending"}}
    )
    
    logger.info(f"Migration completed: Matched {result.matched_count}, Modified {result.modified_count}")
    
    # Ensure admin is correct
    db.users.update_one(
        {"username": admin_username},
        {"$set": {"role": "admin", "status": "active"}}
    )
