import pyodbc
import os
from dotenv import load_dotenv

load_dotenv()
conn_str = 'DRIVER={SQL Server};SERVER=127.0.0.1,1433;DATABASE=Accounts_Payable;UID=sa;PWD=Loandna@2026;TrustServerCertificate=yes;'

try:
    conn = pyodbc.connect(conn_str)
    cursor = conn.cursor()
    print("Inspecting and fixing entity_master table...")
    
    # Check if table exists
    cursor.execute("SELECT * FROM sys.tables WHERE name = 'entity_master'")
    if not cursor.fetchone():
        print("Table 'entity_master' does not exist. Initializing...")
        # (Initialization is normally handled by init_db.py or init_db_raw.py)
    else:
        cursor.execute("SELECT id, entity_id, entity_name, details FROM entity_master")
        rows = cursor.fetchall()
        print(f"Total rows found: {len(rows)}")
        for row in rows:
            print(f"ID: {row.id}, EntityID: {row.entity_id}, Name: {row.entity_name}, Details: {repr(row.details)}")
            
            # If details is not valid JSON, fix it
            is_valid_json = False
            if row.details:
                import json
                try:
                    json.loads(row.details)
                    is_valid_json = True
                except:
                    pass
            
            if row.details is None or row.details == '' or not is_valid_json:
                print(f"Fixing ID {row.id} because details is invalid: {repr(row.details)}")
                cursor.execute("UPDATE entity_master SET details = ? WHERE id = ?", 
                              ('{}', row.id))
        
        conn.commit()
    conn.close()
    print("Done.")
except Exception as e:
    print(f"Error: {e}")
