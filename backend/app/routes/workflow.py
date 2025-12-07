from fastapi import APIRouter, HTTPException, Depends
from typing import List
from app.models.workflow import (
    WorkflowStepCreate,
    WorkflowStepResponse,
    WorkflowHistoryResponse,
    WorkflowStepType,
    WorkflowStepStatus
)
from app.database.mongodb import get_database
from app.auth.jwt import get_current_user
from app.models.user import UserResponse
from datetime import datetime
from bson.objectid import ObjectId

router = APIRouter()

def get_vendor_name_from_invoice(db, invoice_id: str):
    """Helper to extract vendor name from invoice"""
    invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
    if not invoice:
        return None
    
    extracted = invoice.get("extracted_data", {})
    
    # Check new nested structure first
    if "vendor_info" in extracted:
        v_info = extracted["vendor_info"]
        if isinstance(v_info, dict):
            name_obj = v_info.get("name", {})
            if isinstance(name_obj, dict):
                val = name_obj.get("value")
                if val:
                    return str(val).strip()
    
    # Try common fields for vendor name
    for field in ["VendorName", "MerchantName", "vendor_name", "merchant_name"]:
        if field in extracted and isinstance(extracted[field], dict):
            val = extracted[field].get("value")
            if val:
                return str(val).strip()
    
    return None

def get_required_approver_count(db, vendor_name: str):
    """Get the required approver count for a vendor (default 4)"""
    if not vendor_name:
        return 4
    
    # Try finding by vendor_name (snake_case)
    config = db.approver_number.find_one({"vendor_name": vendor_name.strip()})
    
    # If not found, try vendorName (camelCase)
    if not config:
        config = db.approver_number.find_one({"vendorName": vendor_name.strip()})
        
    if config:
        # Check for approver_count or approverCount
        if "approver_count" in config:
            return config["approver_count"]
        elif "approverCount" in config:
            return config["approverCount"]
            
    return 4

@router.get("/{invoice_id}", response_model=WorkflowHistoryResponse)
async def get_workflow_history(
    invoice_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Get complete workflow history for an invoice"""
    db = get_database()
    
    # Verify invoice exists
    invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Get vendor name and required approver count
    vendor_name = get_vendor_name_from_invoice(db, invoice_id)
    required_approvers = get_required_approver_count(db, vendor_name)
    
    # Get all workflow steps for this invoice
    steps = db.workflow_steps.find({"invoice_id": invoice_id}).sort("timestamp", 1)
    
    step_list = []
    for step in steps:
        step["id"] = str(step["_id"])
        step_list.append(WorkflowStepResponse(**step))
    
    return WorkflowHistoryResponse(
        invoice_id=invoice_id,
        vendor_name=vendor_name,
        required_approvers=required_approvers,
        steps=step_list
    )

@router.post("/step", response_model=WorkflowStepResponse)
async def create_workflow_step(
    step_data: WorkflowStepCreate,
    current_user: UserResponse = Depends(get_current_user)
):
    """Create a new workflow step"""
    db = get_database()
    
    # Verify invoice exists
    invoice = db.invoices.find_one({"_id": ObjectId(step_data.invoice_id)})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Validation: Check for duplicate approvers
    if step_data.step_type in [WorkflowStepType.APPROVER_1, WorkflowStepType.APPROVER_2, 
                                WorkflowStepType.APPROVER_3, WorkflowStepType.APPROVER_4]:
        # Get all existing approver steps
        existing_approvers = db.workflow_steps.find({
            "invoice_id": step_data.invoice_id,
            "step_type": {"$in": ["approver_1", "approver_2", "approver_3", "approver_4"]}
        })
        
        approver_users = [step["user"] for step in existing_approvers]
        
        if step_data.user in approver_users:
            raise HTTPException(
                status_code=400, 
                detail=f"User {step_data.user} has already approved/rejected this invoice. Approvers must be unique."
            )
    
    # Create the workflow step
    step_dict = step_data.dict()
    step_dict["timestamp"] = datetime.utcnow()
    
    result = db.workflow_steps.insert_one(step_dict)
    
    created_step = db.workflow_steps.find_one({"_id": result.inserted_id})
    created_step["id"] = str(created_step["_id"])
    
    return WorkflowStepResponse(**created_step)

@router.get("/approvers/{invoice_id}")
async def get_approver_status(
    invoice_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Get the status of all approvers for an invoice"""
    db = get_database()
    
    # Get vendor name and required approver count
    vendor_name = get_vendor_name_from_invoice(db, invoice_id)
    required_approvers = get_required_approver_count(db, vendor_name)
    
    # Get all approver steps
    approver_steps = db.workflow_steps.find({
        "invoice_id": invoice_id,
        "step_type": {"$in": ["approver_1", "approver_2", "approver_3", "approver_4"]}
    }).sort("timestamp", 1)
    
    approvers = []
    for step in approver_steps:
        approvers.append({
            "approver_number": step.get("approver_number"),
            "user": step["user"],
            "status": step["status"],
            "timestamp": step["timestamp"],
            "comment": step.get("comment")
        })
    
    return {
        "invoice_id": invoice_id,
        "vendor_name": vendor_name,
        "required_approvers": required_approvers,
        "completed_approvers": len(approvers),
        "approvers": approvers
    }
