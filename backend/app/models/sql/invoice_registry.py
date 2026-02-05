from sqlalchemy import Column, String, DateTime, Integer, ForeignKey
from app.models.sql.base import Base
from datetime import datetime

class InvoiceRegistry(Base):
    __tablename__ = "invoice_registry"

    vendor_id = Column(String(100), index=True, nullable=False)
    invoice_number = Column(String(100), index=True, nullable=False)
    entity = Column(String(100), index=True, nullable=False)
    invoice_id = Column(Integer, index=True, nullable=False) # Refers to SQL Invoice.id
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    uploaded_by = Column(String(50), nullable=False)
