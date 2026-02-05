"""
SQLAlchemy database models for Accounts Payable application.
These models replace the MongoDB collections with SQL Server tables.
"""

from sqlalchemy import (
    Column, Integer, String, DateTime, Text, ForeignKey, 
    DECIMAL, Boolean, Index, UniqueConstraint, Enum as SQLEnum,
    Float
)
from sqlalchemy.orm import relationship, backref
from sqlalchemy.dialects.mssql import NVARCHAR
from datetime import datetime
from app.database.database import Base
import enum


# ==================== ENUMS ====================

class InvoiceStatusEnum(str, enum.Enum):
    WAITING_CODING = "waiting_coding"
    WAITING_APPROVAL = "waiting_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    PROCESSED = "processed"
    REWORKED = "reworked"


class WorkflowStepTypeEnum(str, enum.Enum):
    PROCESSED = "processed"
    CODING = "coding"
    APPROVER_1 = "approver_1"
    APPROVER_2 = "approver_2"
    APPROVER_3 = "approver_3"
    APPROVER_4 = "approver_4"


class WorkflowStepStatusEnum(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    APPROVED = "approved"
    REJECTED = "rejected"
    REWORKED = "reworked"


# ==================== USER MODEL ====================

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default="coder")  # admin, coder, approver
    status = Column(String(50), nullable=False, default="pending")  # pending, active, rejected
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    # Relationships
    invoices = relationship("Invoice", back_populates="uploader", foreign_keys="Invoice.uploaded_by_id")


# ==================== INVOICE MODEL ====================

class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, autoincrement=True)
    filename = Column(String(500), nullable=False)
    original_filename = Column(String(500), nullable=False)
    file_path = Column(String(1000), nullable=False)
    uploaded_by = Column(String(100), nullable=False)  # Username for backward compatibility
    uploaded_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # FK to users
    status = Column(SQLEnum(InvoiceStatusEnum), nullable=False, default=InvoiceStatusEnum.WAITING_APPROVAL)
    entity = Column(String(100), nullable=True, index=True)
    
    # Vendor information
    vendor_id = Column(String(100), nullable=True, index=True)
    vendor_name = Column(String(500), nullable=True, index=True)
    invoice_number = Column(String(200), nullable=True, index=True)
    azure_vendor_name = Column(String(500), nullable=True)
    line_grouping = Column(String(10), nullable=True)  # Yes/No
    
    # Financial data
    exchange_rate = Column(DECIMAL(18, 6), nullable=True)
    
    # JSON fields (stored as NVARCHAR(MAX))
    extracted_data = Column(Text, nullable=True)  # JSON
    vendor_details = Column(Text, nullable=True)  # JSON
    processing_steps = Column(Text, nullable=True)  # JSON (array)
    validation_results = Column(Text, nullable=True)  # JSON
    duplicate_info = Column(Text, nullable=True)  # JSON
    original_items = Column(Text, nullable=True)  # JSON (array)
    approver_breakdown = Column(Text, nullable=True)  # JSON
    gl_summary = Column(Text, nullable=True)  # JSON (array)
    
    # Metadata
    confidence_score = Column(String(50), nullable=True)
    uploaded_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    processed_at = Column(DateTime, nullable=True)
    
    # Approval tracking
    required_approvers = Column(Integer, nullable=True)
    current_approver_level = Column(Integer, nullable=True, default=1)
    
    # Relationships
    uploader = relationship("User", back_populates="invoices", foreign_keys=[uploaded_by_id])
    status_history = relationship("InvoiceStatusHistory", back_populates="invoice", cascade="all, delete-orphan")
    approved_by_list = relationship("InvoiceApprovedBy", back_populates="invoice", cascade="all, delete-orphan")
    assigned_approvers_list = relationship("InvoiceAssignedApprover", back_populates="invoice", cascade="all, delete-orphan")
    coding = relationship("Coding", back_populates="invoice", uselist=False, cascade="all, delete-orphan")
    workflow_steps = relationship("WorkflowStep", back_populates="invoice", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="invoice", cascade="all, delete-orphan")

    # Indexes
    __table_args__ = (
        Index('ix_invoice_vendor_number', 'vendor_id', 'invoice_number'),
        Index('ix_invoice_entity_status', 'entity', 'status'),
        Index('ix_invoice_uploaded_at_desc', uploaded_at.desc()),
    )


# ==================== INVOICE STATUS HISTORY ====================

class InvoiceStatusHistory(Base):
    __tablename__ = "invoice_status_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(50), nullable=False)
    user = Column(String(100), nullable=False)
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow)
    comment = Column(Text, nullable=True)
    approver_level = Column(Integer, nullable=True)

    # Relationships
    invoice = relationship("Invoice", back_populates="status_history")

    __table_args__ = (
        Index('ix_status_history_invoice_timestamp', 'invoice_id', timestamp.desc()),
    )


# ==================== INVOICE APPROVED BY ====================

class InvoiceApprovedBy(Base):
    __tablename__ = "invoice_approved_by"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    approver_email = Column(String(255), nullable=False)

    # Relationships
    invoice = relationship("Invoice", back_populates="approved_by_list")

    __table_args__ = (
        UniqueConstraint('invoice_id', 'approver_email', name='uq_invoice_approver'),
    )


# ==================== INVOICE ASSIGNED APPROVERS ====================

class InvoiceAssignedApprover(Base):
    __tablename__ = "invoice_assigned_approvers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    approver_email = Column(String(255), nullable=False)
    sequence_order = Column(Integer, nullable=False, default=0)  # For maintaining order

    # Relationships
    invoice = relationship("Invoice", back_populates="assigned_approvers_list")

    __table_args__ = (
        Index('ix_assigned_approvers_invoice_order', 'invoice_id', 'sequence_order'),
    )


# ==================== CODING MODEL ====================

class Coding(Base):
    __tablename__ = "coding"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    header_coding = Column(Text, nullable=True)  # Store as JSON string
    line_items = Column(Text, nullable=True)    # Store as JSON string
    entity = Column(String(100), nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)

    # Relationships
    invoice = relationship("Invoice", back_populates="coding")


# ==================== AUDIT LOG ====================

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    action = Column(String(100), nullable=False)
    user = Column(String(100), nullable=False)
    entity = Column(String(100), nullable=False, index=True)
    details = Column(Text, nullable=True)  # JSON stored as text
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)

    # Relationships
    invoice = relationship("Invoice", back_populates="audit_logs")

    __table_args__ = (
        Index('ix_audit_invoice_timestamp', 'invoice_id', timestamp.desc()),
        Index('ix_audit_entity_timestamp', 'entity', timestamp.desc()),
    )


# ==================== WORKFLOW STEP ====================

class WorkflowStep(Base):
    __tablename__ = "workflow_steps"

    id = Column(Integer, primary_key=True, autoincrement=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    step_name = Column(String(200), nullable=False)
    step_type = Column(String(100), nullable=False) # Changed to String for flexibility with approver_N
    user = Column(String(100), nullable=False)
    status = Column(String(100), nullable=False) 
    timestamp = Column(DateTime, nullable=False, default=datetime.utcnow)
    approver_number = Column(Integer, nullable=True)
    comment = Column(Text, nullable=True)
    entity = Column(String(100), nullable=False, index=True)

    # Relationships
    invoice = relationship("Invoice", back_populates="workflow_steps")

    __table_args__ = (
        Index('ix_workflow_invoice_type', 'invoice_id', 'step_type'),
        Index('ix_workflow_entity_status', 'entity', 'status'),
    )


# ==================== CURRENCY ====================

class Currency(Base):
    __tablename__ = "currencies"

    id = Column(Integer, primary_key=True, autoincrement=True)
    code = Column(String(10), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    symbol = Column(String(10), nullable=True)
    exchange_rate = Column(Float, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)


# ==================== DELEGATION ====================

class Delegation(Base):
    __tablename__ = "delegations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    entity = Column(String(100), nullable=False, index=True)
    original_approver = Column(String(200), nullable=False, index=True)
    substitute_approver = Column(String(200), nullable=False)
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    created_by = Column(String(100), nullable=True)

    __table_args__ = (
        Index('ix_delegation_approver_entity', 'original_approver', 'entity'),
        Index('ix_delegation_dates', 'start_date', 'end_date'),
    )


# ==================== GLOBAL SETTINGS ====================

class GlobalSetting(Base):
    __tablename__ = "global_settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    setting_key = Column(String(100), unique=True, nullable=False, index=True)
    setting_value = Column(Text, nullable=False)  # JSON
    updated_at = Column(DateTime, nullable=True, onupdate=datetime.utcnow)


# ==================== APPROVER CONFIGURATIONS ====================

class ApproverAmount(Base):
    __tablename__ = "approver_amount"

    id = Column(Integer, primary_key=True, autoincrement=True)
    entity = Column(String(100), nullable=False, index=True)
    currency = Column(String(10), nullable=False)
    min_amount = Column(DECIMAL(18, 2), nullable=False)
    max_amount = Column(DECIMAL(18, 2), nullable=False)
    required_approvers = Column(Integer, nullable=False)
    approver_emails = Column(Text, nullable=True)  # JSON array


class ApproverGL(Base):
    __tablename__ = "approver_gl"

    id = Column(Integer, primary_key=True, autoincrement=True)
    entity = Column(String(100), nullable=False, index=True)
    gl_code = Column(String(100), nullable=False, index=True)
    required_approvers = Column(Integer, nullable=False)
    approver_emails = Column(Text, nullable=True)  # JSON array


class ApproverNumber(Base):
    __tablename__ = "approver_number"

    id = Column(Integer, primary_key=True, autoincrement=True)
    entity = Column(String(100), nullable=False, index=True)
    approver_count = Column(Integer, nullable=False)
    approver_emails = Column(Text, nullable=True)  # JSON array


class ApproverDefault(Base):
    __tablename__ = "approver_default"

    id = Column(Integer, primary_key=True, autoincrement=True)
    entity = Column(String(100), nullable=False, unique=True, index=True)
    required_approvers = Column(Integer, nullable=False, default=1)
    approver_emails = Column(Text, nullable=True)  # JSON array


# ==================== MASTER DATA ====================

class ExcelFile(Base):
    """Metadata for uploaded Excel files (vendor master, etc.)"""
    __tablename__ = "excel_files"

    id = Column(Integer, primary_key=True, autoincrement=True)
    original_filename = Column(String(500), nullable=False)
    tab_name = Column(String(100), nullable=False, index=True) # e.g., "Vendor_Master"
    sheet_name = Column(String(100), nullable=True) # Sub-sheet name
    uploaded_by = Column(String(100), nullable=True)
    columns_json = Column(Text, nullable=True) # JSON array of column names
    uploaded_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index('ix_excel_tab_uploaded', 'tab_name', 'uploaded_at'),
    )


class MasterDataChunk(Base):
    """Generic table for storing chunked master data (vendor master, etc.)"""
    __tablename__ = "master_data_chunks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    file_id = Column(Integer, ForeignKey("excel_files.id", ondelete="CASCADE"), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)
    data_json = Column(Text, nullable=False)  # JSON with rows array
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index('ix_master_data_file_chunk', 'file_id', 'chunk_index'),
    )


class InvoiceRegistry(Base):
    """Fast lookup registry for duplicate invoice detection"""
    __tablename__ = "invoice_registry"

    id = Column(Integer, primary_key=True, autoincrement=True)
    vendor_id = Column(String(100), nullable=False, index=True)
    invoice_number = Column(String(200), nullable=False, index=True)
    entity = Column(String(100), nullable=False, index=True)
    invoice_id = Column(Integer, nullable=False)  # Reference to invoices.id
    uploaded_by = Column(String(100), nullable=False)
    uploaded_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('vendor_id', 'invoice_number', 'entity', name='uq_vendor_invoice_entity'),
        Index('ix_registry_lookup', 'vendor_id', 'invoice_number', 'entity'),
    )

class VendorMetadata(Base):
    __tablename__ = "vendor_metadata"

    id = Column(Integer, primary_key=True, autoincrement=True)
    entity = Column(String(100), nullable=True, index=True)
    vendor_id = Column(String(100), nullable=False, index=True)
    official_name = Column(String(500), nullable=False)
    extracted_name_normalized = Column(String(500), nullable=True, index=True)
    extracted_address_normalized = Column(String(1000), nullable=True, index=True)
    line_grouping = Column(String(10), nullable=True, default="No")  # Yes/No
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index('ix_vendor_metadata_lookup', 'entity', 'extracted_name_normalized', 'extracted_address_normalized'),
    )

class VendorWorkflow(Base):
    __tablename__ = "vendor_workflows"

    id = Column(Integer, primary_key=True, autoincrement=True)
    entity = Column(String(100), nullable=False, index=True)
    vendor_id = Column(String(100), nullable=True, index=True)
    vendor_name = Column(String(500), nullable=True)
    approver_count = Column(Integer, default=3)
    mandatory_approver_1 = Column(String(200), nullable=True)
    mandatory_approver_2 = Column(String(200), nullable=True)
    mandatory_approver_3 = Column(String(200), nullable=True)
    amount_threshold = Column(Float, default=0.0)
    threshold_approver = Column(String(200), nullable=True)
    optional_approver = Column(String(200), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

class CodificationWorkflow(Base):
    __tablename__ = "codification_workflows"

    id = Column(Integer, primary_key=True, autoincrement=True)
    entity = Column(String(100), nullable=False, index=True)
    lob = Column(String(200), nullable=False)
    department_id = Column(String(200), nullable=False)
    approver_count = Column(Integer, default=3)
    mandatory_approver_1 = Column(String(200), nullable=True)
    mandatory_approver_2 = Column(String(200), nullable=True)
    mandatory_approver_3 = Column(String(200), nullable=True)
    amount_threshold = Column(Float, default=0.0)
    threshold_approver = Column(String(200), nullable=True)
    optional_approver = Column(String(200), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class CodingHistory(Base):
    __tablename__ = "coding_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    vendor_key = Column(String(500), nullable=False, index=True)
    vendor_name = Column(String(500), nullable=True)
    description = Column(Text, nullable=True)
    normalized_description = Column(String(1000), nullable=False, index=True)
    embedding = Column(Text, nullable=True)  # Store JSON serialized embedding
    coding_json = Column(Text, nullable=True) # Store JSON of GL, LOB, etc.
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (
        Index('ix_coding_history_lookup', 'vendor_key', 'normalized_description'),
    )
