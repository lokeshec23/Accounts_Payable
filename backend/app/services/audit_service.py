import json
from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.sql.audit_log import AuditLog
from app.models.audit_log import AuditLogResponse

from app.middleware.trace_middleware import trace_logger

class AuditService:
    def __init__(self):
        pass

    async def log_action(self, db: AsyncSession, invoice_id: str, action: str, user: str, entity: str, details: Optional[Dict[str, Any]] = None):
        """
        Logs an action into the audit_logs table (SQL).
        """
        new_log = AuditLog(
            invoice_id=invoice_id,
            action=action,
            user=user,
            entity=entity,
            details=details,
            timestamp=datetime.utcnow()
        )
        
        db.add(new_log)
        # Note: commit() is usually handled by the caller or at the end of request, 
        # but for individual audit logs, we might want to ensure it's added.
        # However, to maintain async session flow, we just 'add' it.
        
        # Echo to trace log for "nook and corner" coverage
        trace_logger.info(f"AUDIT_EVENT | {user} | {action} | Invoice: {invoice_id} | Details: {json.dumps(details if details else {})}")
        print(f"[Audit] Logged action: {action} for invoice {invoice_id} by {user} (SQL)")

    async def get_audit_trail(self, db: AsyncSession, invoice_id: str, entity: str) -> List[AuditLogResponse]:
        """
        Retrieves the audit trail for a specific invoice (SQL).
        """
        stmt = select(AuditLog).where(
            AuditLog.invoice_id == invoice_id, 
            AuditLog.entity == entity
        ).order_by(AuditLog.timestamp.desc())
        
        result = await db.execute(stmt)
        logs = result.scalars().all()
        
        return [
            AuditLogResponse(
                id=str(log.id),
                invoice_id=log.invoice_id,
                action=log.action,
                user=log.user,
                entity=log.entity,
                details=log.details,
                timestamp=log.timestamp
            ) for log in logs
        ]

audit_service = AuditService()
