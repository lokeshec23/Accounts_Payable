from sqlalchemy.orm import Session
from sqlalchemy import or_
from datetime import datetime
from app.models.db_models import Invoice, InvoiceAssignedApprover, InvoiceStatusHistory, Delegation as DBDelegation
from app.models.user import UserResponse

def get_accessible_invoices_query(db: Session, current_user: UserResponse, entity: str):
    """
    Returns a query for invoices that the current user is authorized to view.
    
    Access Rules:
    - Admin and Coder roles: Full access to all invoices in the entity.
    - Finance Team department: Full access to all invoices in the entity.
    - Other users (e.g., non-finance approvers): Access only to "associated" invoices:
        1. Uploaded by the user.
        2. Assigned to the user (directly or via active delegation).
        3. Acted on by the user (recorded in status history).
    """
    base_query = db.query(Invoice).filter(Invoice.entity == entity)
    
    # 1. Full access for Admin and Coder roles
    if current_user.role in ["admin", "coder"]:
        return base_query
        
    # 2. Full access for Finance Team members
    if (current_user.department or "").strip().lower() == "finance team":
        return base_query
        
    # 3. Restricted access for non-finance approvers and other users
    
    # Find all emails for which the current user is a substitute (delegation)
    now = datetime.utcnow()
    delegated_emails = db.query(DBDelegation.original_approver).filter(
        DBDelegation.substitute_email == current_user.email,
        DBDelegation.is_active == True,
        DBDelegation.start_date <= now,
        DBDelegation.end_date >= now,
        DBDelegation.entity == entity
    ).all()
    
    authorized_emails = [current_user.email.lower()] + [d[0].lower() for d in delegated_emails]
    
    # Subquery for assigned invoices
    assigned_ids = db.query(InvoiceAssignedApprover.invoice_id).filter(
        InvoiceAssignedApprover.approver_email.in_(authorized_emails)
    ).subquery()
    
    # Subquery for invoices with history of action by this user
    history_ids = db.query(InvoiceStatusHistory.invoice_id).filter(
        InvoiceStatusHistory.user == current_user.username
    ).subquery()
    
    # Apply filters: Uploaded by OR Assigned to OR Acted on
    return base_query.filter(
        or_(
            Invoice.uploaded_by == current_user.username,
            Invoice.id.in_(assigned_ids),
            Invoice.id.in_(history_ids)
        )
    )

def is_invoice_accessible(db: Session, invoice_id: int, current_user: UserResponse, entity: str) -> bool:
    """
    Checks if a specific invoice is accessible by the current user.
    """
    query = get_accessible_invoices_query(db, current_user, entity)
    return query.filter(Invoice.id == invoice_id).first() is not None
