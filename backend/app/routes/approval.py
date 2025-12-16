from fastapi import APIRouter, HTTPException, Depends
from app.models.invoice import InvoiceStatus
from app.models.workflow import WorkflowStepType, WorkflowStepStatus
from app.database.mongodb import get_database
from app.auth.jwt import get_current_user
from app.dependencies import get_current_entity
from app.models.user import UserResponse
from datetime import datetime
from bson.objectid import ObjectId

router = APIRouter()

@router.post("/send-to-approval/{invoice_id}")
async def send_to_approval(
    invoice_id: str,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """
    Send invoice to approval workflow.
    This creates a 'waiting_approval' workflow step and updates invoice status.
    """
    db = get_database()
    
    # Verify invoice exists AND belongs to entity
    invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Entity Check
    if invoice.get("entity") != entity:
        raise HTTPException(status_code=403, detail="Access denied to this entity's data")
    
    # Verify coding exists
    coding = db.coding.find_one({"invoice_id": invoice_id})
    if not coding:
        raise HTTPException(status_code=400, detail="Coding must be completed before sending to approval")
    
    # Append to status_history
    new_status_entry = {
        "status": InvoiceStatus.WAITING_APPROVAL,
        "user": current_user.username,
        "timestamp": datetime.utcnow(),
        "comment": None
    }
    
    
    # Calculate approver count (Strict Persistence Logic)
    extra_fields = {}
    
    # 1. Check if we already have a locked value (Strict Persistence)
    if invoice.get("required_approvers") is not None:
        print(f"DEBUG: [approval.py] Keeping persisted approver count: {invoice['required_approvers']}")
        # Ensure these are preserved (implicitly done by not adding them to set if not needed, 
        # but for clarity/completeness and in case of any weird mongo behavior, we can set them again or just skip)
        # Actually, if we just don't touch them, they persist.
        pass
    else:
        # 2. Calculate fresh if not set
        print("DEBUG: [approval.py] Calculating FRESH approver count")
        from app.routes.workflow import get_vendor_name_from_invoice, get_required_approver_count, get_invoice_total_from_invoice
        
        vendor_name = get_vendor_name_from_invoice(db, invoice_id)
        total_amount = get_invoice_total_from_invoice(db, invoice_id)
        requirement_data = get_required_approver_count(db, vendor_name, total_amount, invoice_id)
        
        extra_fields["required_approvers"] = requirement_data["required"]
        extra_fields["approver_breakdown"] = requirement_data["breakdown"]

    # Update invoice status
    db.invoices.update_one(
    {"_id": ObjectId(invoice_id)},
    {
        "$set": {
            "status": InvoiceStatus.WAITING_APPROVAL, 
            "current_approver_level": 1,              
            **extra_fields                              
        },
        "$push": {
            "status_history": {
                "status": InvoiceStatus.WAITING_APPROVAL,
                "user": current_user.username,
                "timestamp": datetime.utcnow(),
                "comment": None                         # ✅ SAFE
            }
        }
    }
)

    # Create workflow step: Waiting for Approval
    workflow_step = {
        "invoice_id": invoice_id,
        "step_name": "Waiting for Approval",
        "step_type": WorkflowStepType.WAITING_APPROVAL,
        "user": current_user.username,
        "status": WorkflowStepStatus.PENDING,
        "timestamp": datetime.utcnow(),
        "approver_number": None,
        "comment": None,
        "entity": entity
    }
    db.workflow_steps.insert_one(workflow_step)
    
    return {"message": "Invoice sent to approval successfully"}
