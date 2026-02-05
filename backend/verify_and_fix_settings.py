import pyodbc
import sys

conn_str = (
    "DRIVER={SQL Server};"
    "SERVER=127.0.0.1,1433;"
    "DATABASE=Accounts_Payable;"
    "UID=sa;"
    "PWD=Loandna@2026;"
    "TrustServerCertificate=yes;"
)

try:
    conn = pyodbc.connect(conn_str)
    cursor = conn.cursor()
    
    # Check current schema
    cursor.execute("""
        SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'global_settings' AND COLUMN_NAME = 'settings_data'
    """)
    
    result = cursor.fetchone()
    if result:
        print(f"Current schema: {result[0]} - {result[1]}({result[2]})")
        
        if result[1] != 'nvarchar' or result[2] != -1:
            print("Schema needs fixing...")
            
            # Drop and recreate
            cursor.execute("DROP TABLE IF EXISTS global_settings")
            conn.commit()
            
            cursor.execute("""
                CREATE TABLE global_settings (
                    id INT IDENTITY(1,1) PRIMARY KEY,
                    config_key NVARCHAR(50) NOT NULL UNIQUE,
                    settings_data NVARCHAR(MAX) NOT NULL,
                    created_at DATETIME2 DEFAULT GETDATE(),
                    updated_at DATETIME2 DEFAULT GETDATE()
                )
            """)
            conn.commit()
            print("Table recreated with NVARCHAR(MAX)")
        else:
            print("Schema is already correct!")
    else:
        print("Table doesn't exist, creating...")
        cursor.execute("""
            CREATE TABLE global_settings (
                id INT IDENTITY(1,1) PRIMARY KEY,
                config_key NVARCHAR(50) NOT NULL UNIQUE,
                settings_data NVARCHAR(MAX) NOT NULL,
                created_at DATETIME2 DEFAULT GETDATE(),
                updated_at DATETIME2 DEFAULT GETDATE()
            )
        """)
        conn.commit()
        print("Table created")
    
    cursor.close()
    conn.close()
    print("Done!")
    
except Exception as e:
    print(f"ERROR: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
