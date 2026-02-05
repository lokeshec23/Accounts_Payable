import pyodbc
import os
from dotenv import load_dotenv

load_dotenv()
conn_str = 'DRIVER={SQL Server};SERVER=127.0.0.1,1433;DATABASE=Accounts_Payable;UID=sa;PWD=Loandna@2026;TrustServerCertificate=yes;'

try:
    conn = pyodbc.connect(conn_str)
    cursor = conn.cursor()
    print("Checking entity_master table...")
    cursor.execute("SELECT id, entity_id, entity_name, details FROM entity_master")
    rows = cursor.fetchall()
    for row in rows:
        print(f"ID: {row.id}, EntityID: {row.entity_id}, Name: {row.entity_name}, Details Raw: {repr(row.details)}")
    conn.close()
except Exception as e:
    print(f"Error: {e}")
