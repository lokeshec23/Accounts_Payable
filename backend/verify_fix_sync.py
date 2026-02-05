from sqlalchemy import create_engine, text
import json
import os
from dotenv import load_dotenv

load_dotenv()
engine = create_engine(os.getenv("DATABASE_URL"))

def parse_details(d):
    if not d: return {}
    if isinstance(d, dict): return d
    try:
        return json.loads(d)
    except:
        return {}

with engine.connect() as conn:
    result = conn.execute(text("SELECT details FROM [entity_master]"))
    rows = result.fetchall()
    for row in rows:
        d = row[0]
        parsed = parse_details(d)
        print(f"Original type: {type(d)}")
        print(f"Parsed type: {type(parsed)}")
        print(f"Parsed content: {parsed}")
