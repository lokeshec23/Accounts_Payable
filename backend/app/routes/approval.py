from fastapi import APIRouter, HTTPException, Depends
from app.models.invoice import InvoiceStatus
from app.models.workflow import WorkflowStepType, WorkflowStepStatus
from app.database.mongodb import get_database
from app.auth.jwt import get_current_user
from app.models.user import UserResponse
from datetime import datetime
from bson.objectid import ObjectId

router = APIRouter()

@router.post("/send-to-approval/{invoice_id}")
async def send_to_approval(
    invoice_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Send invoice to approval workflow.
    This creates a 'waiting_approval' workflow step and updates invoice status.
    """
    db = get_database()
    
    # Verify invoice exists
    invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
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
    
    # Update invoice status
    db.invoices.update_one(
        {"_id": ObjectId(invoice_id)},
        {
            "$set": {"status": InvoiceStatus.WAITING_APPROVAL},
            "$push": {"status_history": new_status_entry}
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
        "comment": None
    }
    db.workflow_steps.insert_one(workflow_step)
    
    return {"message": "Invoice sent to approval successfully"}
