import asyncio
from sqlalchemy import select
from app.database.sql_server import get_db
from app.models.sql.master_data import EntityMaster
import json

async def debug_entities():
    async for db in get_db():
        stmt = select(EntityMaster)
        result = await db.execute(stmt)
        entities = result.scalars().all()
        
        print(f"Total entities found: {len(entities)}")
        for e in entities:
            print(f"ID: {e.id}, Name: {e.entity_name}, Details: {json.dumps(e.details)}")
        break

if __name__ == "__main__":
    asyncio.run(debug_entities())
