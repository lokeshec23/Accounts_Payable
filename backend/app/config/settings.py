import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    # SQL Server Database URL
    # DATABASE_URL: str = os.getenv(
    #     "DATABASE_URL", 
    #     "mssql+pymssql://sa:Loandna%402026@localhost:1433/accounts_payable?driver=ODBC+Driver+18+for+SQL+Server&TrustServerCertificate=yes"
    # )
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        "mssql+pymssql://sa:Loandna%402026@localhost:1433/accounts_payable"
    )
    
    # SMTP Settings
    SMTP_SERVER: str = os.getenv("SMTP_SERVER", "smtp.office365.com")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", 587))
    EMAIL_USER: str = os.getenv("EMAIL_USER", "AppDevNotification@LoanDNA.com")
    EMAIL_PASS: str = os.getenv("EMAIL_PASS", "#Thor!2rLDraC")
    
    # OTP Settings
    OTP_EXPIRY_MINUTES: int = 5
   

    # Legacy MongoDB URL (kept for backward compatibility during migration)
    MONGODB_URL: str = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    DATABASE_NAME: str = "accounts_payable"
    
    # JWT Settings
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-here")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 360
    
    # Admin Defaults
    ADMIN_USERNAME: str = os.getenv("ADMIN_USERNAME", "admin")
    ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "admin123")
    ADMIN_EMAIL: str = os.getenv("ADMIN_EMAIL", "admin@example.com")
    
    # App Settings
    BASE_URL: str = os.getenv("BASE_URL", "http://localhost:3000")

    # Sage Intacct API
    SAGE_TOKEN_URL: str = os.getenv("SAGE_TOKEN_URL", "https://api.intacct.com/ia/api/v1/oauth2/token")
    SAGE_BASE_URL: str = os.getenv("SAGE_BASE_URL", "https://api.intacct.com/ia/api/v1")
    SAGE_CLIENT_ID: str = os.getenv("SAGE_CLIENT_ID", "3f83ee41b095ea8e5659.app.sage.com")
    SAGE_CLIENT_SECRET: str = os.getenv("SAGE_CLIENT_SECRET", "e49424e23f3df286f49e1f052e897ea944e3dce1")
    SAGE_USERNAME: str = os.getenv("SAGE_USERNAME", "Apex@consolidatedanalytics-sandbox")

settings = Settings()