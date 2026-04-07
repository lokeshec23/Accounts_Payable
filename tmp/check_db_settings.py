import sys
import os

# Add the backend directory to sys.path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from sqlalchemy import create_engine, text
from app.config.settings import settings

def check_settings():
    engine = create_engine(settings.DATABASE_URL)
    with engine.connect() as conn:
        result = conn.execute(text("SELECT value FROM app_settings WHERE [key] = 'global_settings'"))
        row = result.fetchone()
        if row:
            print(row[0])
        else:
            print("Settings not found in DB")

if __name__ == "__main__":
    check_settings()
