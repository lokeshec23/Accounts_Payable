import asyncio
from app.database.mongodb import connect_to_mongo, get_database, close_mongo_connection

async def check_users():
    await connect_to_mongo()
    db = get_database()
    users = await db.users.find().to_list(length=100)
    print(f"Total users found: {len(users)}")
    for user in users:
        print(f"User: {user.get('username')}, Role: {user.get('role')}, Status: {user.get('status')}")
    await close_mongo_connection()

if __name__ == "__main__":
    asyncio.run(check_users())
