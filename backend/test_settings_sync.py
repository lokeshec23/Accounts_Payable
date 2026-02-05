import os
import pyodbc
from dotenv import load_dotenv

def test_settings_sync():
    load_dotenv()
    conn_str = os.getenv("DATABASE_URL").replace("mssql+pyodbc://", "")
    # Parse conn_str for pyodbc.connect
    # Example: driver;server;database;uid;pwd
    params = dict(item.split("=") for item in conn_str.split(";"))
    
    connection_string = (
        f"DRIVER={{{params['driver']}}};"
        f"SERVER={params['server']};"
        f"DATABASE={params['database']};"
        f"UID={params['uid']};"
        f"PWD={params['pwd']};"
    )
    
    print(f"Connecting with: {connection_string}")
    conn = pyodbc.connect(connection_string)
    cursor = conn.cursor()
    
    print("Executing query...")
    cursor.execute("SELECT config_key, settings_data FROM global_settings")
    rows = cursor.fetchall()
    
    for row in rows:
        print(f"Key: {row.config_key}, Data: {row.settings_data}")
    
    conn.close()
    print("Done.")

if __name__ == "__main__":
    test_settings_sync()
