import sys
import os

sys.path.append(os.path.join(os.getcwd(), 'backend'))

from sqlalchemy import create_engine, text
from app.config.settings import settings

def check_users():
    engine = create_engine(settings.DATABASE_URL)
    with engine.connect() as conn:
        result = conn.execute(text("SELECT email, role, department FROM users WHERE role = 'approver'"))
        for row in result.fetchall():
            print(row)

if __name__ == "__main__":
    check_users()
