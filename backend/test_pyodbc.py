import pyodbc
conn_str = (
    r'DRIVER={SQL Server};'
    r'SERVER=127.0.0.1,1433;'
    r'DATABASE=Accounts_Payable;'
    r'UID=sa;'
    r'PWD=Loandna@2026;'
    r'TrustServerCertificate=yes;'
)
print(f"Testing connection string: {conn_str}")
try:
    conn = pyodbc.connect(conn_str, timeout=5)
    print("Connection successful!")
    cursor = conn.cursor()
    cursor.execute("SELECT @@VERSION")
    row = cursor.fetchone()
    print(f"SQL Server Version: {row[0]}")
    conn.close()
except Exception as e:
    print(f"Connection failed: {e}")
