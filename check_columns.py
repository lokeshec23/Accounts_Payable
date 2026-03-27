import os
import sys

sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.database.database import engine
from sqlalchemy import text

def check():
    with engine.connect() as conn:
        res = conn.execute(text("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'audit_logs'"))
        columns = [row[0] for row in res]
        with open("migration_check.txt", "w") as f:
            f.write(str(columns))

if __name__ == "__main__":
    check()
