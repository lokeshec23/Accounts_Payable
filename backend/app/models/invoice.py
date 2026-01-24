from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, Any, List
from datetime import datetime
from enum import Enum

class InvoiceStatus(str, Enum):
    WAITING_CODING = "waiting_coding"
    WAITING_APPROVAL = "waiting_approval"
    APPROVED = "approved"
    REJECTED = "rejected"
    PROCESSED = "processed"
    REWORKED = "reworked"

class StatusHistoryItem(BaseModel):
    status: InvoiceStatus
    user: str
    timestamp: datetime
    comment: Optional[str] = None

class InvoiceBase(BaseModel):
    filename: str
    original_filename: str
    file_path: str
    uploaded_by: str
    status: InvoiceStatus = InvoiceStatus.WAITING_APPROVAL
    status_history: Optional[List[StatusHistoryItem]] = []
    required_approvers: Optional[int] = None
    approver_breakdown: Optional[Dict[str, Any]] = None
    entity: Optional[str] = None
    approved_by: Optional[List[str]] = []
    assigned_approvers: Optional[List[str]] = []
    current_approver_level: Optional[int] = 1
    gl_summary: Optional[List[Dict[str, Any]]] = None
    gl_summary: Optional[List[Dict[str, Any]]] = None
    exchange_rate: Optional[float] = None
    vendor_id: Optional[str] = None
    vendor_name: Optional[str] = None
    invoice_number: Optional[str] = None

class InvoiceCreate(InvoiceBase):
    pass

class InvoiceUpdate(BaseModel):
    extracted_data: Optional[Dict[str, Any]] = None
    status: Optional[InvoiceStatus] = None
    status_history: Optional[List[Dict[str, Any]]] = None
    validation_results: Optional[Dict[str, Any]] = None
    exchange_rate: Optional[float] = None

class Invoice(InvoiceBase):
    id: str
    extracted_data: Optional[Dict[str, Any]] = None
    processing_steps: Optional[List[str]] = None
    validation_results: Optional[Dict[str, Any]] = None
    confidence_score: Optional[str] = None
    uploaded_at: datetime
    processed_at: Optional[datetime] = None
    duplicate_info: Optional[Dict[str, Any]] = None
    original_items: Optional[List[Dict[str, Any]]] = None

    class Config:
        from_attributes = True

class InvoiceResponse(Invoice):
    pass