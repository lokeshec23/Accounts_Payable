from fastapi import APIRouter, HTTPException, Depends
from app.models.invoice import InvoiceStatus
from app.models.workflow import WorkflowStepType, WorkflowStepStatus
from app.auth.jwt import get_current_user
from app.dependencies import get_current_entity, get_db
from app.models.user import UserResponse
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.audit_service import audit_service
from app.models.audit_log import AuditAction

router = APIRouter()

@router.post("/send-to-approval/{invoice_id}")
async def send_to_approval(
    invoice_id: str,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db)
):
    """
    Send invoice to approval workflow (SQL).
    """
    from app.models.sql.invoice import Invoice as SQLInvoice
    from app.models.sql.workflow_step import WorkflowStep as SQLWorkflowStep
    from sqlalchemy import select
    
    try:
        inv_id_int = int(invoice_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid invoice ID format")

    stmt = select(SQLInvoice).where(SQLInvoice.id == inv_id_int, SQLInvoice.entity == entity)
    result = await db.execute(stmt)
    invoice = result.scalar_one_or_none()
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # TODO: Verify coding exists (assuming Coding table exists for SQL too)
    
    # Update status history
    new_history = list(invoice.status_history or [])
    new_history.append({
        "status": InvoiceStatus.WAITING_APPROVAL,
        "user": current_user.username,
        "timestamp": datetime.utcnow().isoformat(),
        "comment": None
    })
    invoice.status_history = new_history
    invoice.status = InvoiceStatus.WAITING_APPROVAL
    invoice.current_approver_level = 1
    
    # Recalculate or persist approvers
    if invoice.required_approvers is None:
        from app.routes.workflow import get_vendor_data_from_invoice, get_required_approver_count, get_invoice_total_from_invoice
        vendor_name, vendor_id = await get_vendor_data_from_invoice(db, invoice_id)
        total_amount = await get_invoice_total_from_invoice(db, invoice_id)
        currency = (invoice.extracted_data or {}).get("invoice_details", {}).get("currency", {}).get("value", "USD")
        
        requirement_data = await get_required_approver_count(db, vendor_name, total_amount, invoice_id, currency=currency, entity=entity)
        
        invoice.required_approvers = requirement_data["required"]
        invoice.assigned_approvers = requirement_data.get("assigned_approvers", [])
        invoice.workflow_type = requirement_data.get("workflow_type")
        invoice.approver_breakdown = requirement_data["breakdown"]

    # Insert "Waiting for Approval" step
    new_step = SQLWorkflowStep(
        invoice_id=str(invoice.id),
        step_name="Waiting for Approval",
        step_type=WorkflowStepType.WAITING_APPROVAL,
        user=current_user.username,
        status=WorkflowStepStatus.PENDING,
        timestamp=datetime.utcnow(),
        entity=entity
    )
    db.add(new_step)
    
    # Audit Log
    await audit_service.log_action(
        db,
        invoice_id=str(invoice.id), 
        action=AuditAction.SENT_TO_APPROVAL, 
        user=current_user.username,
        entity=entity,
        details={"approvers_required": invoice.required_approvers}
    )

    await db.commit()
    return {"message": "Invoice sent to approval successfully"}
