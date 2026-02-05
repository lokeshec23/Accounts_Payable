from sqlalchemy import Column, String, DateTime, JSON, Integer, Numeric, ForeignKey
from sqlalchemy.orm import relationship
from app.models.sql.base import Base
from datetime import datetime

class Invoice(Base):
    __tablename__ = "invoices"

    filename = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    uploaded_by = Column(String(50), nullable=False)
    status = Column(String(50), default="waiting_approval")
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    processed_at = Column(DateTime, nullable=True)
    entity = Column(String(100), nullable=True)
    
    # Nested data as JSON columns
    extracted_data = Column(JSON, nullable=True)
    exchange_rate = Column(Numeric(precision=10, scale=4), nullable=True)
    status_history = Column(JSON, nullable=True)
    validation_results = Column(JSON, nullable=True)
    duplicate_info = Column(JSON, nullable=True)
    original_items = Column(JSON, nullable=True)
    gl_summary = Column(JSON, nullable=True)
    
    # Metadata
    vendor_id = Column(String(100), nullable=True)
    vendor_name = Column(String(255), nullable=True)
    invoice_number = Column(String(100), nullable=True)
    confidence_score = Column(String(20), nullable=True)
    exchange_rate = Column(Numeric(precision=10, scale=4), nullable=True)
    
    # Approvals
    required_approvers = Column(Integer, nullable=True)
    current_approver_level = Column(Integer, default=1)
    approved_by = Column(JSON, nullable=True) # List of emails
    assigned_approvers = Column(JSON, nullable=True) # List of emails
    approver_breakdown = Column(JSON, nullable=True)
