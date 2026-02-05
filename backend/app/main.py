import os
from pathlib import Path
from dotenv import load_dotenv

# Explicitly load .env from the backend root directory (parent of app)
env_path = Path(__file__).resolve().parent.parent / '.env'
print(f"Loading .env from: {env_path}")
load_dotenv(dotenv_path=env_path, override=True)


from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import auth, invoices, coding, dashboard, currency
from app.routes import master_data, workflow, approval, admin, settings as settings_route, workflow_config, delegation, audit
from app.database.database import engine, Base
from app.database.init_db import init_database

from app.middleware.trace_middleware import TraceMiddleware

app = FastAPI(title="Accounts Payable API", version="1.0.0")

# Register Trace Middleware
app.add_middleware(TraceMiddleware)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["authentication"])
app.include_router(invoices.router, prefix="/api/invoices", tags=["invoices"])
app.include_router(coding.router, prefix="/api/coding", tags=["coding"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(master_data.router, prefix="/api/master", tags=["master-data"])
app.include_router(workflow.router, prefix="/api/workflow", tags=["workflow"])

app.include_router(approval.router, prefix="/api/approval", tags=["approval"])
app.include_router(admin.router, prefix="/api/users", tags=["admin"])
app.include_router(settings_route.router, prefix="/api/settings", tags=["Settings"])
app.include_router(currency.router, prefix="/api/currency", tags=["Currencies"])
app.include_router(workflow_config.router, prefix="/api/workflow-config", tags=["workflow-config"])
app.include_router(delegation.router, prefix="/api/delegation", tags=["delegation"])
app.include_router(audit.router, prefix="/api/audit", tags=["audit"])


@app.on_event("startup")
async def startup_event():
    """Initialize database on startup"""
    print("\n" + "="*60)
    print("STARTING ACCOUNTS PAYABLE API")
    print("="*60)
    
    try:
        # Initialize database (create tables and default data)
        init_database()
        print("✓ Database initialized successfully")
    except Exception as e:
        print(f"✗ Database initialization error: {e}")
        # Don't fail startup - allow app to run for debugging
    
    print("="*60 + "\n")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    print("\nShutting down Accounts Payable API...")
    # SQLAlchemy connections are managed by connection pool
    # No explicit cleanup needed

@app.get("/")
async def root():
    return {"message": "Accounts Payable API", "database": "SQL Server"}

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Test database connection
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}

