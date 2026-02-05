from fastapi import APIRouter, Depends, HTTPException
from typing import List
from sqlalchemy.orm import Session
from app.database.database import get_db
from app.auth.jwt import get_current_user
from app.dependencies import get_current_entity
from app.models.user import UserResponse
from app.services.audit_service import audit_service
from app.models.audit_log import AuditLogResponse

router = APIRouter()

@router.get("/{invoice_id}", response_model=List[AuditLogResponse])
async def get_audit_logs(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """
    Get audit trail for a specific invoice using SQLAlchemy.
    """
    return await audit_service.get_audit_trail(db, invoice_id, entity)
