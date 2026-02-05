import pyodbc
import sys

print("Testing direct pyodbc connection...")
conn_str = "Driver={SQL Server};Server=127.0.0.1,1433;Database=Accounts_Payable;Uid=sa;Pwd=Loandna@2026;Encrypt=no;TrustServerCertificate=yes;"
print(f"Connection string: {conn_str}")

try:
    conn = pyodbc.connect(conn_str, timeout=5)
    print("SUCCESS: Connection established!")
    conn.close()
except Exception as e:
    print(f"FAILURE: {e}")
    sys.exit(1)
