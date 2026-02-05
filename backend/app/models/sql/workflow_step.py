from sqlalchemy import Column, String, DateTime, Integer, JSON
from app.models.sql.base import Base
from datetime import datetime

class WorkflowStep(Base):
    __tablename__ = "workflow_steps"

    invoice_id = Column(String(50), index=True, nullable=False)
    step_name = Column(String(100), nullable=False)
    step_type = Column(String(50), nullable=False)
    user = Column(String(50), nullable=True)
    status = Column(String(50), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    approver_number = Column(Integer, nullable=True)
    comment = Column(String(500), nullable=True)
    entity = Column(String(100), nullable=True)
