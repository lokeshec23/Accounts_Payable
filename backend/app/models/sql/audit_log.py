from sqlalchemy import Column, String, DateTime, JSON, Integer
from app.models.sql.base import Base
from datetime import datetime

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(String(50), index=True) # Can be string ID for now
    action = Column(String(100), nullable=False)
    user = Column(String(50), nullable=False)
    entity = Column(String(100), nullable=True)
    details = Column(JSON, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
