import os
from pathlib import Path
from dotenv import load_dotenv

# Explicitly load .env from the backend root directory (parent of app)
env_path = Path(__file__).resolve().parent.parent / '.env'
print(f"Loading .env from: {env_path}")
load_dotenv(dotenv_path=env_path, override=True)


# Monkeypatch bcrypt for passlib compatibility
import bcrypt

try:
    if not hasattr(bcrypt, "__about__"):
        bcrypt.__about__ = type("About", (object,), {"__version__": bcrypt.__version__})
except Exception:
    pass

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import auth, invoices, coding, dashboard, currency
from app.routes import master_data, workflow, approval, admin, settings as settings_route, workflow_config, delegation, audit
from app.database.sql_server import engine, Base, AsyncSessionLocal

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

from app.database.bootstrap import bootstrap_admin, bootstrap_settings
from app.database.migration import migrate_users_role_status
from app.ai.vector_matcher import get_cached_vendors

@app.on_event("startup")
async def startup_event():
    # Create tables
    # TEMPORARILY DISABLED due to ODBC driver compatibility issues
    # Tables need to be created manually or with a different approach
    # async with engine.begin() as conn:
    #     await conn.run_sync(Base.metadata.create_all)
    
    # Bootstrap admin and settings
    async with AsyncSessionLocal() as db:
        import logging
        logger = logging.getLogger("uvicorn")
        logger.info("STARTING BOOTSTRAP PROCESS...")
        await bootstrap_admin(db)
        await bootstrap_settings(db)
        logger.info("BOOTSTRAP PROCESS COMPLETED.")
    
    # await migrate_users_role_status()

@app.on_event("shutdown")
async def shutdown_event():
    await engine.dispose()

@app.get("/")
async def root():
    return {"message": "Accounts Payable API"}





