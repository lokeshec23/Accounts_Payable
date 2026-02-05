from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

output = []
output.append(f"Testing DATABASE_URL: {DATABASE_URL}")

try:
    engine = create_engine(DATABASE_URL)
    with engine.connect() as connection:
        result = connection.execute(text("SELECT @@VERSION"))
        output.append("Connection successful!")
        output.append(f"SQL Server Version: {result.fetchone()[0]}")
except Exception as e:
    output.append(f"Connection failed: {e}")

with open("test_db_results.txt", "w") as f:
    f.write("\n".join(output))

print("Results written to test_db_results.txt")
