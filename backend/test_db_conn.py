
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Load env variables
load_dotenv(override=True)
url = os.getenv("DATABASE_URL")
print(f"Testing connection to: {url}")

try:
    engine = create_engine(url)
    with engine.connect() as connection:
        result = connection.execute(text("SELECT @@VERSION"))
        print("Connection successful!")
        print(f"SQL Server Version: {result.fetchone()[0]}")
except Exception as e:
    print(f"Connection failed: {e}")
