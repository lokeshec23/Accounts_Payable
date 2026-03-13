from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from typing import Dict

from app.database.database import get_db
from app.models.db_models import User, Invoice, InvoiceStatusEnum
from app.auth.jwt import get_current_user
from app.models.user import UserResponse
from app.dependencies import get_current_entity

router = APIRouter()

@router.get("/")
async def get_notifications(
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    db: Session = Depends(get_db)
):
    # Fetch user object to get last_notifications_read_at
    user_db = db.query(User).filter(User.id == current_user.id).first()
    last_read = user_db.last_notifications_read_at if user_db else None

    items = []

    # 1. New Users Pending Approval (Admin only)
    if current_user.role == "admin":
        user_query = db.query(User).filter(User.status == "pending")
        if last_read:
            user_query = user_query.filter(User.created_at > last_read)
        
        pending_users = user_query.order_by(User.created_at.desc()).limit(15).all()
        for u in pending_users:
            items.append({
                "id": f"user_{u.id}",
                "type": "admin",
                "message": f"New user '{u.username}' pending approval",
                "link": "/admin",
                "timestamp": u.created_at.isoformat()
            })

    # 2. Invoices Waiting for Coding (Coder only - unless specified otherwise, we stick to strict role)
    elif current_user.role == "coder":
        coding_query = db.query(Invoice).filter(
            Invoice.entity == entity,
            Invoice.status == InvoiceStatusEnum.WAITING_CODING
        )
        if last_read:
            coding_query = coding_query.filter(Invoice.uploaded_at > last_read)
        
        pending_coding = coding_query.order_by(Invoice.uploaded_at.desc()).limit(15).all()
        for inv in pending_coding:
            items.append({
                "id": f"inv_{inv.id}",
                "type": "coding",
                "message": f"Invoice #{inv.invoice_number or 'N/A'} from {inv.vendor_name or 'Unknown'} waiting for coding",
                "link": "/coding",
                "timestamp": inv.uploaded_at.isoformat()
            })

    # 3. Invoices Waiting for Approval (Approver only)
    elif current_user.role == "approver":
        from sqlalchemy import or_, and_, exists
        from app.models.db_models import InvoiceAssignedApprover
        
        approval_query = db.query(Invoice).filter(
            Invoice.entity == entity,
            Invoice.status == InvoiceStatusEnum.WAITING_APPROVAL,
            or_(
                exists().where(
                    and_(
                        InvoiceAssignedApprover.invoice_id == Invoice.id,
                        InvoiceAssignedApprover.approver_email == current_user.email,
                        InvoiceAssignedApprover.sequence_order == Invoice.current_approver_level
                    )
                ),
                ~exists().where(InvoiceAssignedApprover.invoice_id == Invoice.id)
            )
        )
        if last_read:
            approval_query = approval_query.filter(Invoice.uploaded_at > last_read)
        
        pending_approval = approval_query.order_by(Invoice.uploaded_at.desc()).limit(15).all()
        for inv in pending_approval:
            items.append({
                "id": f"app_{inv.id}",
                "type": "approval",
                "message": f"Invoice #{inv.invoice_number or 'N/A'} from {inv.vendor_name or 'Unknown'} waiting for your approval",
                "link": "/approvals",
                "timestamp": inv.uploaded_at.isoformat()
            })

    # Sort all items by timestamp desc
    items.sort(key=lambda x: x["timestamp"], reverse=True)

    return {
        "total_count": len(items),
        "items": items
    }

@router.post("/read-all")
async def mark_all_as_read(
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_db = db.query(User).filter(User.id == current_user.id).first()
    if not user_db:
        raise HTTPException(status_code=404, detail="User not found")
    
    user_db.last_notifications_read_at = datetime.utcnow()
    db.commit()
    
    return {"message": "All notifications marked as read"}
