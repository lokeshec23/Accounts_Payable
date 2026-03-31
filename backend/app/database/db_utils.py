"""
Helper utilities for database operations and data conversion.
Provides compatibility layer between MongoDB and SQLAlchemy.
"""

import json
from typing import Any, Dict, List, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.db_models import (
    Invoice, InvoiceStatusHistory, InvoiceApprovedBy, 
    InvoiceAssignedApprover, User
)


def serialize_json_field(data: Any) -> Optional[str]:
    """Convert Python object to JSON string for database storage"""
    if data is None:
        return None
    if isinstance(data, str):
        return data
    return json.dumps(data, default=str)


def deserialize_json_field(json_str: Optional[str]) -> Any:
    """Convert JSON string from database to Python object"""
    if json_str is None:
        return None
    if isinstance(json_str, dict) or isinstance(json_str, list):
        return json_str
    try:
        return json.loads(json_str)
    except (json.JSONDecodeError, TypeError):
        return json_str


def invoice_to_dict(invoice: Invoice, include_relationships: bool = True) -> Dict[str, Any]:
    """
    Convert SQLAlchemy Invoice model to dictionary (MongoDB-like format).
    This provides backward compatibility with existing frontend code.
    """
    result = {
        "id": str(invoice.id),
        "_id": str(invoice.id),  # For backward compatibility
        "filename": invoice.filename,
        "original_filename": invoice.original_filename,
        "file_path": invoice.file_path,
        "uploaded_by": invoice.uploaded_by,
        "status": invoice.status.value if hasattr(invoice.status, 'value') else invoice.status,
        "entity": invoice.entity,
        "vendor_id": invoice.vendor_id,
        "vendor_name": invoice.vendor_name,
        "invoice_number": invoice.invoice_number,
        "azure_vendor_name": invoice.azure_vendor_name,
        "line_grouping": invoice.line_grouping,
        "exchange_rate": float(invoice.exchange_rate) if invoice.exchange_rate else None,
        "confidence_score": invoice.confidence_score,
        "uploaded_at": invoice.uploaded_at,
        "processed_at": invoice.processed_at,
        "required_approvers": invoice.required_approvers,
        "current_approver_level": invoice.current_approver_level,
        
        # Deserialize JSON fields
        "extracted_data": deserialize_json_field(invoice.extracted_data),
        "vendor_details": deserialize_json_field(invoice.vendor_details),
        "processing_steps": deserialize_json_field(invoice.processing_steps),
        "validation_results": deserialize_json_field(invoice.validation_results),
        "duplicate_info": deserialize_json_field(invoice.duplicate_info),
        "original_items": deserialize_json_field(invoice.original_items),
        "approver_breakdown": deserialize_json_field(invoice.approver_breakdown),
        "gl_summary": deserialize_json_field(invoice.gl_summary),
    }
    
    if include_relationships:
        # Status history
        if invoice.status_history:
            result["status_history"] = [
                {
                    "status": h.status,
                    "user": h.user,
                    "timestamp": h.timestamp,
                    "comment": h.comment,
                    "approver_level": h.approver_level
                }
                for h in sorted(invoice.status_history, key=lambda x: x.timestamp)
            ]
        else:
            result["status_history"] = []
        
        # Approved by
        if invoice.approved_by_list:
            result["approved_by"] = [a.approver_email for a in invoice.approved_by_list]
        else:
            result["approved_by"] = []
        
        # Assigned approvers (Grouped by sequence_order/level)
        if invoice.assigned_approvers_list:
            # Sort by sequence_order first
            sorted_approvers = sorted(invoice.assigned_approvers_list, key=lambda x: x.sequence_order)
            grouped = {}
            for a in sorted_approvers:
                if a.sequence_order not in grouped:
                    grouped[a.sequence_order] = []
                grouped[a.sequence_order].append(a.approver_email)
            
            # Return as a list of levels (each level is a list of emails)
            # The indices will correspond to current_approver_level - 1
            # We use the sequence of sorted keys to ensure correct ordering even if there are gaps
            result["assigned_approvers"] = [grouped[seq] for seq in sorted(grouped.keys())]
        else:
            result["assigned_approvers"] = []
    
    return result


def dict_to_invoice(data: Dict[str, Any], db: Session) -> Invoice:
    """
    Convert dictionary to SQLAlchemy Invoice model.
    Handles nested relationships properly.
    """
    # Extract relationship data
    status_history_data = data.pop("status_history", [])
    approved_by_data = data.pop("approved_by", [])
    assigned_approvers_data = data.pop("assigned_approvers", [])
    
    # Remove MongoDB-specific fields
    data.pop("_id", None)
    data.pop("id", None)
    
    # Serialize JSON fields
    json_fields = [
        "extracted_data", "vendor_details", "processing_steps",
        "validation_results", "duplicate_info", "original_items",
        "approver_breakdown", "gl_summary"
    ]
    for field in json_fields:
        if field in data:
            data[field] = serialize_json_field(data[field])
    
    # Get or create user reference
    if "uploaded_by" in data:
        user = db.query(User).filter(User.username == data["uploaded_by"]).first()
        if user:
            data["uploaded_by_id"] = user.id
    
    # Create invoice
    invoice = Invoice(**data)
    
    # Add status history
    for hist in status_history_data:
        history_entry = InvoiceStatusHistory(
            status=hist.get("status"),
            user=hist.get("user"),
            timestamp=hist.get("timestamp", datetime.utcnow()),
            comment=hist.get("comment"),
            approver_level=hist.get("approver_level")
        )
        invoice.status_history.append(history_entry)
    
    # Add approved by
    for email in approved_by_data:
        approved_entry = InvoiceApprovedBy(approver_email=email)
        invoice.approved_by_list.append(approved_entry)
    
    # Add assigned approvers (Handle flat or nested layout)
    for idx, item in enumerate(assigned_approvers_data):
        # item could be a string (email) OR a list of strings (parallel level)
        emails = [item] if isinstance(item, (str, bytes)) else item
        if not hasattr(emails, '__iter__'): emails = [emails]
        
        for email in emails:
            if email:
                assigned_entry = InvoiceAssignedApprover(
                    approver_email=str(email).strip(),
                    sequence_order=idx + 1 # sequence_order starts at 1
                )
                invoice.assigned_approvers_list.append(assigned_entry)
    
    return invoice


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    """Get user by email"""
    return db.query(User).filter(User.email == email).first()


def get_user_by_username(db: Session, username: str) -> Optional[User]:
    """Get user by username"""
    return db.query(User).filter(User.username == username).first()
