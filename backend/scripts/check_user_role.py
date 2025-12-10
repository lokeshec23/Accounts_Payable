import sys
import os
from pathlib import Path
import asyncio

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(backend_dir))

from app.database.mongodb import connect_to_mongo, get_database, close_mongo_connection

async def check_user_role(username):
    await connect_to_mongo()
    db = get_database()
    
    user = db.users.find_one({"username": username})
    
    if user:
        print(f"User: {user.get('username')}")
        print(f"Email: {user.get('email')}")
        print(f"Role: {user.get('role', 'N/A')}")
        print(f"Status: {user.get('status', 'N/A')}")
        print(f"ID: {user.get('_id')}")
    else:
        print(f"User '{username}' not found")
    
    await close_mongo_connection()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python check_user_role.py <username>")
        sys.exit(1)
    
    username = sys.argv[1]
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(check_user_role(username))
    loop.close()
