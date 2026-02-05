import asyncio
import json
from sqlalchemy import select
from app.database.sql_server import get_db
from app.models.sql.master_data import EntityMaster

def parse_details(d):
    if not d: return {}
    if isinstance(d, dict): return d
    try:
        return json.loads(d)
    except:
        return {}

async def verify_entities():
    async for db in get_db():
        stmt = select(EntityMaster)
        result = await db.execute(stmt)
        entities = result.scalars().all()
        
        parsed = [parse_details(e.details) for e in entities]
        print(f"Entities found: {len(parsed)}")
        for p in parsed:
            print(f"Type of details: {type(p)}")
            print(f"Content: {json.dumps(p)}")
        break

if __name__ == "__main__":
    asyncio.run(verify_entities())
