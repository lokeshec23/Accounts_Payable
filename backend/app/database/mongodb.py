from pymongo import MongoClient
from app.config.settings import settings

class MongoDB:
    client: MongoClient = None
    database = None

mongodb = MongoDB()

async def connect_to_mongo():
    mongodb.client = MongoClient(settings.MONGODB_URL)
    mongodb.database = mongodb.client[settings.DATABASE_NAME]
    print("Connected to MongoDB")

async def close_mongo_connection():
    mongodb.client.close()
    print("Disconnected from MongoDB")

def get_database():
    return mongodb.database