import sys
import os
from pathlib import Path

# Add backend directory to path so we can import app modules
backend_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(backend_dir))

from app.database.mongodb import connect_to_mongo, get_database, close_mongo_connection
from app.config.settings import settings
import asyncio

async def update_users():
    await connect_to_mongo()
    db = get_database()
    
    admin_username = settings.ADMIN_USERNAME
    
    print(f"Updating users except admin: {admin_username}")
    
    # Update all users who are NOT the admin
    result = db.users.update_many(
        {"username": {"$ne": admin_username}},
        {"$set": {"role": "user", "status": "pending"}}
    )
    
    print(f"Matched {result.matched_count} users.")
    print(f"Modified {result.modified_count} users.")
    
    # Optional: ensure admin is correct just in case
    # This logic mimics bootstrap.py but safe to run here too
    db.users.update_one(
        {"username": admin_username},
        {"$set": {"role": "admin", "status": "active"}}
    )
    print("Ensured admin user is active/admin.")

    await close_mongo_connection()

if __name__ == "__main__":
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(update_users())
    loop.close()
