from typing import List, Optional, Dict, Any
from datetime import datetime
from app.database.mongodb import get_database
from app.models.audit_log import AuditLogCreate, AuditLogResponse

class AuditService:
    def __init__(self):
        pass

    @property
    def collection(self):
        db = get_database()
        if db is None:
             raise Exception("Database not connected")
        return db.audit_logs

    async def log_action(self, invoice_id: str, action: str, user: str, entity: str, details: Optional[Dict[str, Any]] = None):
        """
        Logs an action into the audit_logs collection.
        """
        log_entry = AuditLogCreate(
            invoice_id=invoice_id,
            action=action,
            user=user,
            entity=entity,
            details=details,
            timestamp=datetime.utcnow()
        )
        
        log_dict = log_entry.dict()
        self.collection.insert_one(log_dict)
        print(f"[Audit] Logged action: {action} for invoice {invoice_id} by {user}")

    async def get_audit_trail(self, invoice_id: str, entity: str) -> List[AuditLogResponse]:
        """
        Retrieves the audit trail for a specific invoice, sorted by timestamp (newest first).
        """
        cursor = self.collection.find({"invoice_id": invoice_id, "entity": entity}).sort("timestamp", -1)
        logs = []
        for doc in cursor:
            doc["id"] = str(doc["_id"])
            logs.append(AuditLogResponse(**doc))
        return logs

audit_service = AuditService()
