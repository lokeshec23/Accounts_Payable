import asyncio
import os
from dotenv import load_dotenv
from sqlalchemy import select
from app.database.sql_server import AsyncSessionLocal
from app.models.sql.settings import GlobalSettings

async def seed_settings():
    load_dotenv()
    
    settings_data = {
        "entity_name": "Consolidated Analytics Inc",
        "roles": ["admin", "coder", "approver"],
        "statuses": ["active", "pending", "rejected"],
        "navigation": [
            {"label": "Dashboard", "path": "/dashboard", "roles": ["all"]},
            {"label": "Invoices", "path": "/invoice", "roles": ["admin", "coder"]},
            {"label": "Coding", "path": "/coding", "roles": ["admin", "coder"]},
            {"label": "Approvals", "path": "/approvals", "roles": ["admin", "approver"]},
            {"label": "Master Data", "path": "/master-data", "roles": ["admin"]},
            {"label": "Settings", "path": "/settings", "roles": ["admin"]},
            {"label": "Admin", "path": "/admin", "roles": ["admin"]},
        ]
    }

    async with AsyncSessionLocal() as db:
        print("Connected to database.")
        stmt = select(GlobalSettings).where(GlobalSettings.config_key == "app_settings")
        print(f"Executing query: {stmt}")
        result = await db.execute(stmt)
        existing_settings = result.scalar_one_or_none()

        if existing_settings:
            print("Updating existing settings...")
            existing_settings.settings_data = settings_data
        else:
            print("Creating new settings...")
            new_settings = GlobalSettings(
                config_key="app_settings",
                settings_data=settings_data
            )
            db.add(new_settings)
        
        print("Committing changes...")
        await db.commit()
        print("✓ Global settings seeded successfully!")

if __name__ == "__main__":
    asyncio.run(seed_settings())
