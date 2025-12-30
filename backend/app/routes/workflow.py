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
    Get the required approver count with detailed breakdown.
    Logic: MAX(Vendor_Rule_Count, Amount_Rule_Count, GL_Rule_Count)
    
    If no vendor rule exists: Default to 4 (High risk default).
    If no amount rule exists: 0 (No requirement from amount).
    If no GL rule exists: 0.
    
    Returns:
    {
        "required": int,
        "breakdown": {
            "vendor": {"count": int, "name": str},
            "amount": {"count": int, "value": float},
            "gl": {"count": int, "codes": List[str]}
        }
    }
    """
    
    # 0. Check for persisted values on the invoice
    if invoice_data and "required_approvers" in invoice_data and invoice_data["required_approvers"] is not None:
        print(f"DEBUG: returning PERSISTED approver count: {invoice_data['required_approvers']}")
        return {
            "required": invoice_data["required_approvers"],
            "breakdown": invoice_data.get("approver_breakdown", {
                "vendor": {"count": 0, "name": vendor_name},
                "amount": {"count": 0, "value": amount, "currency": currency},
                "gl": {"count": 0, "codes": []},
                "note": "Loaded from persisted invoice data"
            })
        }

    # 1. Vendor Based Count
    vendor_count = 0 # Will verify below
    
    # Check default config first
    default_query = {}
    if entity:
        default_query["entity"] = entity
        
    default_config = db.approver_default.find_one(default_query)
    
    # Fallback if specific entity default not found, try generic? 
    # Or strict? Let's assume strict for now, or fallback to ANY if desired, but request implies strict entity separation.
    # If not found for entity, maybe fallback to no-entity default?
    if not default_config and entity:
         default_config = db.approver_default.find_one({"entity": {"$exists": False}})

    # If still no config, fallback to hardcoded 4
    default_count = default_config.get("default_approver_count", 2) if default_config else 2
    
    if vendor_name:
        # Try finding by vendor_name (snake_case)
        query = {"vendor_name": vendor_name.strip()}
        if entity:
            query["entity"] = entity
            
        config = db.approver_number.find_one(query)
        
        # If not found, try vendorName (camelCase)
        if not config:
            query = {"vendorName": vendor_name.strip()}
            if entity:
                query["entity"] = entity
            config = db.approver_number.find_one(query)
            
        if config:
            if "approver_count" in config:
                vendor_count = config["approver_count"]
            elif "approverCount" in config:
                vendor_count = config["approverCount"]
    
    # If no vendor specific rule found, use default
    if vendor_count == 0:
        vendor_count = default_count
    
    # 2. Amount Based Count
    amount_count = 0
    if amount is not None:
        # Find all rules that might apply (where start of range is <= amount)
        # AND currency matches (or rule has no currency, assume USD default or legacy)
        # Actually, if we want strict, we should match.
        
        query = {
            "min_amount": {"$lte": amount}
        }
        
        # Add entity filter
        if entity:
            query["entity"] = entity
        
        if currency:
             query["$or"] = [
                 {"currency": currency},
                 {"currency": {"$exists": False}}, # Legacy support
                 {"currency": None}
             ]
        
        candidates = list(db.approver_amount.find(query))
        
        for rule in candidates:
            max_amt = rule.get("max_amount")
            # Match if no upper limit (max_amt is None) OR amount is within limit
            if max_amt is None or max_amt >= amount:
                rule_count = rule.get("approver_count", 0)
                # If multiple rules match, take the one requiring MOST approvers
                if rule_count > amount_count:
                    amount_count = rule_count
        
        if amount_count == 0:
            amount_count = default_count
    
    # 3. GL Based Count
    gl_count = 0
    matched_gls = []
    
    if invoice_id:
        # Fetch coding data for this invoice to get GL codes
        coding = db.coding.find_one({"invoice_id": invoice_id})
        if coding and "line_items" in coding:
            # Extract unique GL codes from line items
            gl_codes = set()
            for item in coding["line_items"]:
                code = item.get("gl_code")
                if code:
                    gl_codes.add(code)
            
            # Check rules for each GL code
            for code in gl_codes:
                code_clean = str(code).strip()
                # GL rules are stored with "glTitle" (e.g. "12345 - Expense")
                # We need to match exact strings from coding
                
                gl_query = {"glTitle": code_clean}
                if entity:
                    gl_query["entity"] = entity
                    
                rule = db.approver_gl.find_one(gl_query)
                
                # If not found, try matching just the code part (assuming "Code - Description" format)
                if not rule and " - " in code_clean:
                    parts = code_clean.split(" - ", 1)
                    # Try matching code (prefix)
                    short_code = parts[0].strip()
                    gl_query_short = {"glTitle": short_code}
                    if entity:
                        gl_query_short["entity"] = entity
                    rule = db.approver_gl.find_one(gl_query_short)
                    
                    # If still not found, try matching description (suffix)
                    if not rule and len(parts) > 1:
                        description = parts[1].strip()
                        gl_query_desc = {"glTitle": description}
                        if entity:
                             gl_query_desc["entity"] = entity
                        rule = db.approver_gl.find_one(gl_query_desc)
                
                if rule:
                    count = rule.get("approverCount", rule.get("approver_count", 0))
                    if count > gl_count:
                        gl_count = count
                    matched_gls.append(code)
            
            if gl_count == 0:
                gl_count = default_count

    # 4. Return Maximum Requirement with Breakdown
    max_count = max(vendor_count, amount_count, gl_count)
    
    return {
        "required": max_count,
        "breakdown": {
            "vendor": {"count": vendor_count, "name": vendor_name},
            "amount": {"count": amount_count, "value": amount, "currency": currency},
            "gl": {"count": gl_count, "codes": matched_gls},
            "default": default_count
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
