from sqlalchemy import Column, String, DateTime, Integer
from app.models.sql.base import Base
from datetime import datetime

class Delegation(Base):
    __tablename__ = "delegations"

    id = Column(Integer, primary_key=True, index=True)
    original_approver = Column(String(100), index=True, nullable=False)
    substitute_approver = Column(String(100), nullable=False)
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    entity = Column(String(50), index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String(50))
