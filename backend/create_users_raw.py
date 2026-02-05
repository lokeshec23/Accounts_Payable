from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("DATABASE_URL not found in .env")
    exit(1)

# Use synchronous engine
engine = create_engine(DATABASE_URL)

create_users_sql = """
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[users]') AND type in (N'U'))
BEGIN
    CREATE TABLE [users] (
        [id] INT IDENTITY(1,1) NOT NULL,
        [username] NVARCHAR(50) NOT NULL,
        [email] NVARCHAR(100) NOT NULL,
        [password] NVARCHAR(255) NOT NULL,
        [role] NVARCHAR(20) DEFAULT 'user',
        [status] NVARCHAR(20) DEFAULT 'pending',
        [created_at] DATETIME DEFAULT GETDATE(),
        [updated_at] DATETIME DEFAULT GETDATE(),
        PRIMARY KEY ([id]),
        UNIQUE ([username]),
        UNIQUE ([email])
    );
    CREATE INDEX [ix_users_id] ON [users] ([id]);
    CREATE INDEX [ix_users_username] ON [users] ([username]);
    CREATE INDEX [ix_users_email] ON [users] ([email]);
    PRINT 'Table users created successfully!';
END
ELSE
BEGIN
    PRINT 'Table users already exists.';
END
"""

try:
    with engine.connect() as conn:
        conn.execute(text(create_users_sql))
        conn.commit()
    print("Script finished successfully.")
except Exception as e:
    print(f"Error: {e}")
