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
from app.dependencies import get_current_entity
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

def get_invoice_total_from_invoice(db, invoice_id: str):
    """Helper to extract total amount from invoice"""
    invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
    if not invoice:
        return None
        
    extracted = invoice.get("extracted_data", {})
    
    # helper to clean and parse float
    def parse_amount(val):
        if not val:
            return None
        try:
            # Handle float/int directly
            if isinstance(val, (int, float)):
                return float(val)
                
            val_str = str(val).strip()
            # Use regex to find the number part. 
            # Matches: optional negative sign, digits with optional commas, optional decimal part
            import re
            # Remove all non-numeric chars except . and -
            # This handles "3,222.09 USD" -> "3222.09"
            # It also handles "$3,222.09" -> "3222.09"
            
            # First, try to extract a clear number pattern
            # Look for digits, commas, dots. 
            # But "USD 300" -> "300"
            
            # Simple approach: Remove all chars that are NOT digits, dots, or minus signs
            # But remove commas first to avoid confusion with decimals in some locales (assuming standard US/UK format based on example)
            clean = val_str.replace(",", "")
            
            # Now extract the first valid float-like sequence
            match = re.search(r'-?\d+(\.\d+)?', clean)
            if match:
                return float(match.group())
                
            return None
        except Exception as e:
            print(f"DEBUG: Error parsing amount '{val}': {e}")
            return None

    # Check new nested structure first
    if "amounts" in extracted:
        amounts = extracted["amounts"]
        if isinstance(amounts, dict):
            # Try total_invoice_amount
            total_obj = amounts.get("total_invoice_amount", {})
            if isinstance(total_obj, dict):
                return parse_amount(total_obj.get("value"))
                
    # Try common fields for total amount
    for field in ["Total Invoice Amount", "TotalAmount", "InvoiceTotal", "Total", "total_amount"]:
        if field in extracted and isinstance(extracted[field], dict):
            return parse_amount(extracted[field].get("value"))
            
    return None

def get_required_approver_count(db, vendor_name: str, amount: float = None, invoice_id: str = None, invoice_data: dict = None, currency: str = "USD", entity: str = None):
    """
    Get the required approvers based on new Workflow Redesign.
    
    Logic:
    1. Try VendorWorkflow match.
    2. If not found, try CodificationWorkflow match (using LOB/Dept from coding).
    3. If not found, fallback to Default approver count.
    
    Returns:
    {
        "required": int,
        "assigned_approvers": List[str],
        "workflow_type": str,
        "breakdown": { ... }
    }
    """
    
    # 0. Check for persisted values on the invoice
    if invoice_data and "required_approvers" in invoice_data and invoice_data["required_approvers"] is not None:
        return {
            "required": invoice_data["required_approvers"],
            "assigned_approvers": invoice_data.get("assigned_approvers", []),
            "workflow_type": invoice_data.get("workflow_type", "persisted"),
            "breakdown": invoice_data.get("approver_breakdown", {})
        }

    assigned_approvers = []
    workflow_found = False
    workflow_type = None
    
    # 1. Try Vendor Based Workflow
    if vendor_name and entity:
        vendor_workflow = db.vendor_workflows.find_one({
            "vendor_name": vendor_name.strip(),
            "entity": entity
        })
        
        if vendor_workflow:
            workflow_found = True
            workflow_type = "vendor"
            # Mandatory 1, 2, 3
            assigned_approvers = [
                vendor_workflow.get("mandatory_approver_1"),
                vendor_workflow.get("mandatory_approver_2"),
                vendor_workflow.get("mandatory_approver_3")
            ]
            
            # Threshold Approver (4th)
            threshold_amt = vendor_workflow.get("amount_threshold")
            threshold_appr = vendor_workflow.get("threshold_approver")
            if threshold_appr and amount is not None and threshold_amt is not None:
                if amount >= threshold_amt:
                    assigned_approvers.append(threshold_appr)
            
            # Optional Approver (5th)
            optional_appr = vendor_workflow.get("optional_approver")
            if optional_appr:
                assigned_approvers.append(optional_appr)

    # 2. Try Codification Based Workflow if no vendor match
    if not workflow_found and invoice_id and entity:
        # Fetch coding data to get LOB and Dept ID
        coding = db.coding.find_one({"invoice_id": invoice_id})
        if coding and "line_items" in coding:
            # For simplicity, we match against the first line item with LOB/Dept
            for item in coding["line_items"]:
                lob = item.get("lob")
                dept = item.get("department_id")
                
                if lob and dept:
                    cod_workflow = db.codification_workflows.find_one({
                        "lob": lob,
                        "department_id": dept,
                        "entity": entity
                    })
                    
                    if cod_workflow:
                        workflow_found = True
                        workflow_type = "codification"
                        assigned_approvers = [
                            cod_workflow.get("mandatory_approver_1"),
                            cod_workflow.get("mandatory_approver_2"),
                            cod_workflow.get("mandatory_approver_3")
                        ]
                        
                        # Threshold
                        threshold_amt = cod_workflow.get("amount_threshold")
                        threshold_appr = cod_workflow.get("threshold_approver")
                        if threshold_appr and amount is not None and threshold_amt is not None:
                            if amount >= threshold_amt:
                                assigned_approvers.append(threshold_appr)
                        
                        # Optional
                        optional_appr = cod_workflow.get("optional_approver")
                        if optional_appr:
                            assigned_approvers.append(optional_appr)
                        break

    # 3. Fallback to Default Count
    if not workflow_found:
        workflow_type = "default"
        default_query = {"entity": entity} if entity else {}
        default_config = db.approver_default.find_one(default_query)
        if not default_config and entity:
            default_config = db.approver_default.find_one({"entity": {"$exists": False}})
        
        required_count = default_config.get("default_approver_count", 2) if default_config else 2
        # For default, we don't have assigned individuals yet, so we just return count
        # and maybe an empty or placeholder list
        return {
            "required": required_count,
            "assigned_approvers": [],
            "workflow_type": "default",
            "breakdown": {"default": required_count}
        }

    # Filter out None or empty approvers
    assigned_approvers = [a for a in assigned_approvers if a]
    
    return {
        "required": len(assigned_approvers),
        "assigned_approvers": assigned_approvers,
        "workflow_type": workflow_type,
        "breakdown": {
            "workflow_id": str(vendor_workflow["_id"]) if workflow_type == "vendor" else str(cod_workflow["_id"]) if workflow_type == "codification" else None,
            "type": workflow_type
        }
    }

@router.get("/{invoice_id}", response_model=WorkflowHistoryResponse)
async def get_workflow_history(
    invoice_id: str,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """Get complete workflow history for an invoice"""
    db = get_database()
    
    # Verify invoice exists AND belongs to entity
    invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
        
    # Entity Check
    if invoice.get("entity") != entity:
        raise HTTPException(status_code=403, detail="Access denied to this entity's data")
    
    # Get vendor name and required approver count
    vendor_name = get_vendor_name_from_invoice(db, invoice_id)
    total_amount = get_invoice_total_from_invoice(db, invoice_id)
    currency = invoice.get("extracted_data", {}).get("invoice_details", {}).get("currency", {}).get("value", "USD")

    # Result is now a dict with breakdown
    requirement_data = get_required_approver_count(db, vendor_name, total_amount, invoice_id, invoice_data=invoice, currency=currency, entity=entity)
    required_approvers = requirement_data["required"]
    approver_breakdown = requirement_data["breakdown"]
    
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
        current_status=invoice.get("status"),
        approver_breakdown=approver_breakdown,
        steps=step_list
    )

@router.post("/step", response_model=WorkflowStepResponse)
async def create_workflow_step(
    step_data: WorkflowStepCreate,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """Create a new workflow step"""
    db = get_database()
    
    # Verify invoice exists AND belongs to entity
    invoice = db.invoices.find_one({"_id": ObjectId(step_data.invoice_id)})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Entity Check
    if invoice.get("entity") != entity:
        raise HTTPException(status_code=403, detail="Access denied to this entity's data")
    
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
    step_dict["entity"] = entity # Store entity on step too
    
    result = db.workflow_steps.insert_one(step_dict)
    
    created_step = db.workflow_steps.find_one({"_id": result.inserted_id})
    created_step["id"] = str(created_step["_id"])
    
    return WorkflowStepResponse(**created_step)

@router.get("/approvers/{invoice_id}")
async def get_approver_status(
    invoice_id: str,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """Get the status of all approvers for an invoice"""
    db = get_database()
    
    # Get invoice to check for persisted rules
    invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Entity Check
    if invoice.get("entity") != entity:
        raise HTTPException(status_code=403, detail="Access denied to this entity's data")
    
    # Get vendor name and required approver count
    vendor_name = get_vendor_name_from_invoice(db, invoice_id)
    total_amount = get_invoice_total_from_invoice(db, invoice_id)
    currency = invoice.get("extracted_data", {}).get("invoice_details", {}).get("currency", {}).get("value", "USD")
    requirement_data = get_required_approver_count(db, vendor_name, total_amount, invoice_id, invoice_data=invoice, currency=currency, entity=entity)
    required_approvers = requirement_data["required"]
    
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
