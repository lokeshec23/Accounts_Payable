from sqlalchemy import Column, Integer, String, DateTime, JSON, ForeignKey, Numeric
from app.models.sql.base import Base
from datetime import datetime

class Coding(Base):
    __tablename__ = "coding"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(String(50), index=True) # ID of the SQL Invoice (as string for consistency or int)
    line_items = Column(JSON) # List of coded line items
    total_amount = Column(Numeric(precision=12, scale=2))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True)
    entity = Column(String(50), index=True)

class CodingHistory(Base):
    __tablename__ = "coding_history"

    id = Column(Integer, primary_key=True, index=True)
    vendor_key = Column(String(255), index=True)
    vendor_name = Column(String(255))
    description = Column(String(1000))
    normalized_description = Column(String(1000), index=True)
    embedding = Column(JSON) # Vector embedding
    coding = Column(JSON) # GL, LOB, Dept etc
    updated_at = Column(DateTime, default=datetime.utcnow)
    entity = Column(String(50), index=True)
