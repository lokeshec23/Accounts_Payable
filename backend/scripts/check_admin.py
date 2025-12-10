import sys
import os
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(backend_dir))

from app.database.mongodb import connect_to_mongo, get_database, close_mongo_connection
from app.config.settings import settings
import asyncio

async def check_admin():
    await connect_to_mongo()
    db = get_database()
    
    admin_username = settings.ADMIN_USERNAME
    print(f"Checking user: {admin_username}")
    
    user = db.users.find_one({"username": admin_username})
    
    if user:
        print("User found:")
        print(f"ID: {user.get('_id')}")
        print(f"Role: {user.get('role')}")
        print(f"Status: {user.get('status')}")
    else:
        print("User NOT found!")
        
    await close_mongo_connection()

if __name__ == "__main__":
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(check_admin())
    loop.close()
