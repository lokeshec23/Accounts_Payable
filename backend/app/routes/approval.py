from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from datetime import datetime
import json
from app.models.invoice import InvoiceStatus
from app.models.workflow import WorkflowStepType, WorkflowStepStatus
from app.database.database import get_db
from app.models.db_models import (
    Invoice, WorkflowStep, InvoiceStatusHistory, Coding as DBCoding,
    InvoiceAssignedApprover, User
)

from app.auth.jwt import get_current_user
from app.dependencies import get_current_entity
from app.models.user import UserResponse
from app.services.audit_service import audit_service
from app.models.audit_log import AuditAction
from app.routes.workflow import (
    get_vendor_data_from_invoice, 
    get_required_approver_count, 
    get_invoice_total_from_invoice
)

from app.services.email_service import email_service

router = APIRouter()

@router.post("/send-to-approval/{invoice_id}")
async def send_to_approval(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """
    Send invoice to approval workflow using SQLAlchemy.
    """
    # 1. Verify invoice exists
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Use the entity stored on the invoice for all subsequent lookups
    entity = invoice.entity
    
    # 2. Verify coding exists
    coding = db.query(DBCoding).filter(DBCoding.invoice_id == invoice_id).first()
    if not coding:
        raise HTTPException(status_code=400, detail="Coding must be completed before sending to approval")
    
    # 3. Calculate Approvers
    vendor_name, vendor_id = get_vendor_data_from_invoice(db, invoice_id)
    total_amount = get_invoice_total_from_invoice(db, invoice_id)
    
    # Get currency from extraction
    extracted = {}
    if invoice.extracted_data:
        try: extracted = json.loads(invoice.extracted_data) if isinstance(invoice.extracted_data, str) else invoice.extracted_data
        except: pass
    currency = extracted.get("invoice_details", {}).get("currency", {}).get("value", "USD")
    
    requirement_data = get_required_approver_count(db, vendor_name, total_amount, invoice_id, currency=currency, entity=entity, force_vendor_id=vendor_id)
    
    # 4. Update Invoice Status
    invoice.status = InvoiceStatus.WAITING_APPROVAL
    invoice.current_approver_level = 1
    invoice.required_approvers = requirement_data["required"]
    # Note: workflow_type is tracked in requirement_data but not stored on invoice

    
    # Clear existing assigned approvers
    db.query(InvoiceAssignedApprover).filter(InvoiceAssignedApprover.invoice_id == invoice_id).delete()
    
    # Store assigned approvers
    assigned_approvers = requirement_data.get("assigned_approvers", [])
    for idx, email in enumerate(assigned_approvers):
        if email:
            db.add(InvoiceAssignedApprover(
                invoice_id=invoice_id,
                approver_email=email,
                sequence_order=idx + 1
            ))
    import json
    
    # Update requirement breakdown if we want to persist it (using JSON field)
    invoice.approver_breakdown = json.dumps(requirement_data.get("breakdown", {}))
    
    # 5. Add to Status History
    history = InvoiceStatusHistory(
        invoice_id=invoice_id,
        status=InvoiceStatus.WAITING_APPROVAL,
        user=current_user.username,
        timestamp=datetime.utcnow(),
        comment="Sent to approval"
    )
    db.add(history)

    # 6. Workflow Steps
    # Check if we need to insert "Coding Completed" step
    # We define cycle start
    last_cycle_start = datetime(1753, 1, 1)
    histories = db.query(InvoiceStatusHistory).filter(InvoiceStatusHistory.invoice_id == invoice_id).order_by(InvoiceStatusHistory.timestamp.desc()).all()
    for h in histories:
        if h.status in [InvoiceStatus.REWORKED, InvoiceStatus.WAITING_CODING]:
            last_cycle_start = h.timestamp
            break
            
    existing_coding_step = db.query(WorkflowStep).filter(
        WorkflowStep.invoice_id == invoice_id,
        WorkflowStep.step_type == WorkflowStepType.CODING,
        WorkflowStep.timestamp > last_cycle_start
    ).first()

    if not existing_coding_step:
        db.add(WorkflowStep(
            invoice_id=invoice_id,
            step_name="Coding",
            step_type=WorkflowStepType.CODING,
            user=current_user.username,
            status=WorkflowStepStatus.COMPLETED,
            timestamp=datetime.utcnow(),
            entity=entity
        ))

    # Add "Waiting for Approval" step
    db.add(WorkflowStep(
        invoice_id=invoice_id,
        step_name="Waiting for Approval",
        step_type=WorkflowStepType.WAITING_APPROVAL,
        user=current_user.username,
        status=WorkflowStepStatus.PENDING,
        timestamp=datetime.utcnow(),
        entity=entity
    ))
    
    db.commit()

    # 7. TRIGGER FIRST APPROVAL EMAIL
    if assigned_approvers:
        first_approver_email = assigned_approvers[0]
        # Get approver's name (optional, using "Approver" as default if user record not found)
        approver_user = db.query(User).filter(User.email == first_approver_email).first()

        approver_name = approver_user.username if approver_user else "Approver"
        
        # Prioritize invoice number from extracted_data with fallback
        import json
        extracted_data = {}
        if invoice.extracted_data:
            try:
                extracted_data = json.loads(invoice.extracted_data) if isinstance(invoice.extracted_data, str) else invoice.extracted_data
            except: pass
            
        invoice_number = extracted_data.get("invoice_details", {}).get("invoice_number", {}).get("value")
        if not invoice_number:
            invoice_number = invoice.invoice_number

        email_service.send_approval_request_email(
            email=first_approver_email,
            username=approver_name,
            vendor_name=vendor_name or "Unknown",
            invoice_number=invoice_number or "N/A",
            amount=str(total_amount),
            currency=currency
        )



    # [AUDIT]
    await audit_service.log_action(db, invoice_id, AuditAction.SENT_TO_APPROVAL, current_user.username, entity,
                                   details={"approvers_required": requirement_data["required"]})

    return {"message": "Invoice sent to approval successfully"}

