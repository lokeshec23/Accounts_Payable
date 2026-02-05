import pyodbc
import sys

# Connection string
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
    
    print("Connected to database successfully")
    
    # Drop the existing table
    print("Dropping existing global_settings table...")
    cursor.execute("DROP TABLE IF EXISTS global_settings")
    conn.commit()
    print("Table dropped successfully")
    
    # Recreate with correct schema
    print("Creating global_settings table with NVARCHAR(MAX)...")
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
    print("Table created successfully with NVARCHAR(MAX) for settings_data")
    
    cursor.close()
    conn.close()
    print("\nSchema fix completed successfully!")
    sys.exit(0)
    
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
