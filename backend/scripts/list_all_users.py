import sys
import os
from pathlib import Path
import asyncio

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(backend_dir))

from app.database.mongodb import connect_to_mongo, get_database, close_mongo_connection

async def list_users():
    await connect_to_mongo()
    db = get_database()
    
    print("Fetching all users...")
    users = list(db.users.find())
    print(f"Found {len(users)} users.")
    
    for u in users:
        print(f"User: {u.get('username')}, Role: {u.get('role', 'N/A')}, Status: {u.get('status', 'N/A')}")

    await close_mongo_connection()

if __name__ == "__main__":
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(list_users())
    loop.close()
