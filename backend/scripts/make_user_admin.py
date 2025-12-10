import sys
import os
from pathlib import Path
import asyncio

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(backend_dir))

from app.database.mongodb import connect_to_mongo, get_database, close_mongo_connection

async def update_user_to_admin(username):
    await connect_to_mongo()
    db = get_database()
    
    # Find the user
    user = db.users.find_one({"username": username})
    
    if not user:
        print(f"ERROR: User '{username}' not found")
        await close_mongo_connection()
        return
    
    print(f"Found user: {user.get('username')}")
    print(f"Current role: {user.get('role', 'N/A')}")
    print(f"Current status: {user.get('status', 'N/A')}")
    
    # Update to admin
    result = db.users.update_one(
        {"username": username},
        {"$set": {"role": "admin", "status": "active"}}
    )
    
    if result.modified_count > 0:
        print(f"SUCCESS: Updated '{username}' to admin with active status")
    else:
        print(f"WARNING: User was already admin with active status")
    
    # Verify the update
    updated_user = db.users.find_one({"username": username})
    print(f"\nUpdated role: {updated_user.get('role')}")
    print(f"Updated status: {updated_user.get('status')}")
    
    await close_mongo_connection()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python make_user_admin.py <username>")
        sys.exit(1)
    
    username = sys.argv[1]
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(update_user_to_admin(username))
    loop.close()
