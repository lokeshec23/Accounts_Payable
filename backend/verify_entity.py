from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("Error: DATABASE_URL not found in .env")
    exit(1)

# Use synchronous engine
engine = create_engine(DATABASE_URL)

try:
    with engine.connect() as conn:
        result = conn.execute(text("SELECT * FROM [entity_master]"))
        rows = result.fetchall()
        print(f"Total entities found: {len(rows)}")
        for row in rows:
            print(f"Row: {row}")
except Exception as e:
    print(f"Error: {e}")
