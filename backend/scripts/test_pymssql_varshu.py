import pymssql
from pathlib import Path

output_file = Path("backend/output/pymssql_test_varshu.txt")
try:
    # URL in vector_finder.py: mssql+pymssql://sa:varshu%4040067@localhost:1433/accounts_payable
    conn = pymssql.connect(
        server='localhost',
        user='sa',
        password='Loandna@2026',
        database='accounts_payable',
        port=1433
    )
    cursor = conn.cursor()
    cursor.execute("SELECT @@VERSION")
    row = cursor.fetchone()
    result = f"SUCCESS: {row[0]}"
    conn.close()
except Exception as e:
    result = f"FAILED: {e}"

with open(output_file, "w") as f:
    f.write(result)
print(f"Result: {result}")
