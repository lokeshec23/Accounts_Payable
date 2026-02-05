from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import update
from app.models.sql.user import User
from app.config.settings import settings
import logging

logger = logging.getLogger(__name__)

async def migrate_users_role_status(db: AsyncSession):
    """
    Updates all non-admin users to have role='user' and status='pending' (SQL version).
    """
    admin_username = settings.ADMIN_USERNAME
    
    logger.info(f"Starting SQL migration: Setting default role/status for users (excluding {admin_username})")
    
    # Update all users who are NOT the admin
    stmt = update(User).where(User.username != admin_username).values(role="coder", status="pending")
    result = await db.execute(stmt)
    
    # Ensure admin is correct
    stmt_admin = update(User).where(User.username == admin_username).values(role="admin", status="active")
    await db.execute(stmt_admin)
    
    await db.commit()
    logger.info("SQL Migration completed")
