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
    from sqlalchemy import or_, and_, exists, outerjoin
    from app.models.db_models import InvoiceStatusHistory, InvoiceAssignedApprover

    # Fetch user object to get last_notifications_read_at
    user_db = db.query(User).filter(User.id == current_user.id).first()
    last_read = user_db.last_notifications_read_at if user_db else datetime(1970, 1, 1)
    if not last_read:
        last_read = datetime(1970, 1, 1)

    items = []
    unread_count = 0

    # 1. New Users Pending Approval (Admin only)
    if current_user.role == "admin":
        pending_users = db.query(User).filter(User.status == "pending").order_by(User.created_at.desc()).limit(20).all()
        for u in pending_users:
            is_unread = u.created_at > last_read
            if is_unread:
                unread_count += 1
            
            items.append({
                "id": f"user_{u.id}",
                "type": "admin",
                "message": f"New user '{u.username}' pending approval",
                "link": "/admin",
                "timestamp": u.created_at.isoformat(),
                "is_unread": is_unread
            })

    # 2. Invoices (Coder or Approver)
    else:
        # Subquery to get latest status history timestamp for each invoice
        # This represents the "activity" timestamp
        latest_history_sub = db.query(
            InvoiceStatusHistory.invoice_id,
            func.max(InvoiceStatusHistory.timestamp).label("latest_activity")
        ).group_by(InvoiceStatusHistory.invoice_id).subquery()

        query = db.query(Invoice, latest_history_sub.c.latest_activity).outerjoin(
            latest_history_sub, Invoice.id == latest_history_sub.c.invoice_id
        ).filter(Invoice.entity == entity)

        if current_user.role == "coder":
            query = query.filter(Invoice.status == InvoiceStatusEnum.WAITING_CODING)
        elif current_user.role == "approver":
            query = query.filter(
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
        else:
            # Fallback for other roles or general case
            query = query.filter(Invoice.id == -1) # Return nothing

        pending_invoices = query.order_by(func.coalesce(latest_history_sub.c.latest_activity, Invoice.uploaded_at).desc()).limit(20).all()

        for inv, latest_activity in pending_invoices:
            # Determine activity timestamp
            activity_ts = latest_activity or inv.uploaded_at
            is_unread = activity_ts > last_read
            
            if is_unread:
                unread_count += 1

            type_map = {
                InvoiceStatusEnum.WAITING_CODING: "coding",
                InvoiceStatusEnum.WAITING_APPROVAL: "approval"
            }
            link_map = {
                InvoiceStatusEnum.WAITING_CODING: "/coding",
                InvoiceStatusEnum.WAITING_APPROVAL: "/approvals"
            }

            items.append({
                "id": f"inv_{inv.id}",
                "type": type_map.get(inv.status, "invoice"),
                "message": f"Invoice #{inv.invoice_number or 'N/A'} from {inv.vendor_name or 'Unknown'} waiting for {inv.status.value.replace('_', ' ')}",
                "link": link_map.get(inv.status, "/"),
                "timestamp": activity_ts.isoformat(),
                "is_unread": is_unread
            })

    # Sort all items by timestamp desc
    items.sort(key=lambda x: x["timestamp"], reverse=True)

    return {
        "total_count": unread_count,
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
