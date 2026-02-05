from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from app.models.sql.user import User
from app.config.settings import settings
from app.auth.jwt import get_password_hash
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

async def bootstrap_admin(db: AsyncSession):
    """
    Check if admin user exists, if not create one using env vars.
    """
    # Check if admin exists by username or email
    stmt = select(User).where(
        or_(
            User.username == settings.ADMIN_USERNAME,
            User.email == settings.ADMIN_EMAIL
        )
    )
    result = await db.execute(stmt)
    existing_admin = result.scalar_one_or_none()
    
    if not existing_admin:
        logger.info(f"Admin user not found. Creating default admin: {settings.ADMIN_USERNAME}")
        
        admin_user = User(
            username=settings.ADMIN_USERNAME,
            email=settings.ADMIN_EMAIL,
            password=get_password_hash(settings.ADMIN_PASSWORD),
            role="admin",
            status="active",
            created_at=datetime.utcnow()
        )
        
        db.add(admin_user)
        await db.commit()
        logger.info(f"Admin user created successfully")
    else:
        # Optional: Ensure existing admin has admin role
        if existing_admin.role != "admin":
            logger.info("Updating existing admin user to have admin role")
            existing_admin.role = "admin"
            existing_admin.status = "active"
            await db.commit()

from app.models.sql.settings import GlobalSettings

async def bootstrap_settings(db: AsyncSession):
    """
    Ensure global settings exist with default navigation.
    """
    stmt = select(GlobalSettings).where(GlobalSettings.config_key == "app_settings")
    result = await db.execute(stmt)
    settings = result.scalar_one_or_none()

    default_nav = [
        {"label": "Dashboard", "path": "/dashboard", "roles": ["all"]},
        {"label": "Invoices", "path": "/invoice", "roles": ["admin", "coder", "approver"]},
        {"label": "Coding", "path": "/coding", "roles": ["admin", "coder", "approver"]},
        {"label": "Approvals", "path": "/approvals", "roles": ["admin", "approver"]},
        {"label": "Master Data", "path": "/master-data", "roles": ["admin"]},
        {"label": "Settings", "path": "/settings", "roles": ["admin"]},
        {"label": "Admin", "path": "/admin", "roles": ["admin"]},
    ]

    default_data = {
        "entity_name": "Consolidated Analytics Inc",
        "roles": ["admin", "coder", "approver"],
        "statuses": ["active", "pending", "rejected"],
        "navigation": default_nav
    }

    if not settings:
        logger.info("Settings not found. Creating default settings.")
        settings = GlobalSettings(
            config_key="app_settings",
            settings_data=default_data
        )
        db.add(settings)
        await db.commit()
    else:
        # Ensure navigation exists
        current_data = settings.settings_data
        if "navigation" not in current_data or not current_data["navigation"]:
            logger.info("Navigation missing in settings. Updating defaults.")
            current_data["navigation"] = default_nav
            # Force update trigger
            settings.settings_data = dict(current_data)
            await db.commit()
