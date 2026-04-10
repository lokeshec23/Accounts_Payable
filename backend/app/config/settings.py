import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL")
    
    # SMTP Settings
    SMTP_SERVER: str = os.getenv("SMTP_SERVER")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT"))
    EMAIL_USER: str = os.getenv("EMAIL_USER")
    EMAIL_PASS: str = os.getenv("EMAIL_PASS")
    
    # OTP Settings
    OTP_EXPIRY_MINUTES: int = 5
   

    # Legacy MongoDB URL (kept for backward compatibility during migration)
    MONGODB_URL: str = os.getenv("MONGODB_URL")
    DATABASE_NAME: str = os.getenv("DATABASE_NAME")
    
    # JWT Settings
    SECRET_KEY: str = os.getenv("SECRET_KEY")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 360
    
    # Admin Defaults
    ADMIN_USERNAME: str = os.getenv("ADMIN_USERNAME")
    ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD")
    ADMIN_EMAIL: str = os.getenv("ADMIN_EMAIL")
    
    # App Settings
    BASE_URL: str = os.getenv("BASE_URL")

    # Sage Intacct API
    SAGE_TOKEN_URL: str = os.getenv("SAGE_TOKEN_URL")
    SAGE_BASE_URL: str = os.getenv("SAGE_BASE_URL")
    SAGE_CLIENT_ID: str = os.getenv("SAGE_CLIENT_ID")
    SAGE_CLIENT_SECRET: str = os.getenv("SAGE_CLIENT_SECRET")
    SAGE_USERNAME: str = os.getenv("SAGE_USERNAME")

settings = Settings()