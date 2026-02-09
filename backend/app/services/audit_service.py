import json
from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.db_models import AuditLog
from app.models.audit_log import AuditLogCreate, AuditLogResponse
from app.middleware.trace_middleware import trace_logger

class AuditService:
    def __init__(self):
        pass

    async def log_action(self, db: Session, invoice_id: Any, action: str, user: str, entity: str, details: Optional[Dict[str, Any]] = None):
        """
        Logs an action into the audit_logs table (SQL Server).
        """
        # Ensure invoice_id is int if it's a string from old logic
        try:
            if isinstance(invoice_id, str) and invoice_id.isdigit():
                inv_id = int(invoice_id)
            else:
                inv_id = invoice_id
        except:
            inv_id = invoice_id

        log_entry = AuditLog(
            invoice_id=inv_id,
            action=action,
            user=user,
            entity=entity,
            details=json.dumps(details) if details else None,
            timestamp=datetime.utcnow()
        )
        
        db.add(log_entry)
        db.commit()
        
        # Echo to trace log
        trace_logger.info(f"AUDIT_EVENT | {user} | {action} | Invoice: {invoice_id} | Details: {json.dumps(details if details else {})}")
        print(f"[Audit] Logged action: {action} for invoice {invoice_id} by {user}")

    async def get_audit_trail(self, db: Session, invoice_id: Any, entity: str) -> List[AuditLogResponse]:
        """
        Retrieves the audit trail for a specific invoice from SQL Server.
        """
        try:
            if isinstance(invoice_id, str) and invoice_id.isdigit():
                inv_id = int(invoice_id)
            else:
                inv_id = invoice_id
        except:
            inv_id = invoice_id

        logs = db.query(AuditLog).filter(
            AuditLog.invoice_id == inv_id,
            AuditLog.entity == entity
        ).order_by(AuditLog.timestamp.desc()).all()
        
        result = []
        for log in logs:
            result.append(AuditLogResponse(
                id=str(log.id),
                invoice_id=str(log.invoice_id),
                action=log.action,
                user=log.user,
                entity=log.entity,
                details=json.loads(log.details) if log.details else None,
                timestamp=log.timestamp
            ))
        return result

audit_service = AuditService()
