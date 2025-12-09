from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import auth, invoices, coding, dashboard
from app.routes import master_data, workflow, approver_config, approval, admin
from app.database.mongodb import connect_to_mongo, close_mongo_connection

app = FastAPI(title="Accounts Payable API", version="1.0.0")

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
app.include_router(approver_config.router, prefix="/api/approver-config", tags=["approver-config"])
app.include_router(approval.router, prefix="/api/approval", tags=["approval"])
app.include_router(admin.router, prefix="/api/users", tags=["admin"])

from app.database.bootstrap import bootstrap_admin
from app.database.migration import migrate_users_role_status

@app.on_event("startup")
async def startup_event():
    await connect_to_mongo()
    await bootstrap_admin()
    await migrate_users_role_status()

@app.on_event("shutdown")
async def shutdown_event():
    await close_mongo_connection()

@app.get("/")
async def root():
    return {"message": "Accounts Payable API"}