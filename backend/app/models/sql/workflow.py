from sqlalchemy import Column, String, Integer, Numeric, DateTime
from app.models.sql.base import Base
from datetime import datetime

class VendorWorkflow(Base):
    __tablename__ = "vendor_workflows"

    id = Column(Integer, primary_key=True, index=True)
    vendor_id = Column(String(50), index=True)
    vendor_name = Column(String(200), index=True)
    entity = Column(String(50), index=True)
    approver_count = Column(Integer, default=3)
    mandatory_approver_1 = Column(String(100))
    mandatory_approver_2 = Column(String(100))
    mandatory_approver_3 = Column(String(100))
    amount_threshold = Column(Numeric(precision=12, scale=2), default=0.0)
    threshold_approver = Column(String(100))
    optional_approver = Column(String(100))
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class CodificationWorkflow(Base):
    __tablename__ = "codification_workflows"

    id = Column(Integer, primary_key=True, index=True)
    lob = Column(String(100), index=True)
    department_id = Column(String(100), index=True)
    entity = Column(String(50), index=True)
    approver_count = Column(Integer, default=3)
    mandatory_approver_1 = Column(String(100))
    mandatory_approver_2 = Column(String(100))
    mandatory_approver_3 = Column(String(100))
    amount_threshold = Column(Numeric(precision=12, scale=2), default=0.0)
    threshold_approver = Column(String(100))
    optional_approver = Column(String(100))
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
