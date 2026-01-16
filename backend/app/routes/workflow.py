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

def get_vendor_data_from_invoice(db, invoice_id: str):
    """Helper to extract vendor name and ID from invoice"""
    invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
    if not invoice:
        return None, None
    
    # Check direct fields first (highest reliability)
    v_name = invoice.get("vendor_name")
    v_id = invoice.get("vendor_id")
    if v_name and v_id:
        return v_name, v_id

    extracted = invoice.get("extracted_data", {})
    
    # Check new nested structure
    if "vendor_info" in extracted:
        v_info = extracted["vendor_info"]
        if isinstance(v_info, dict):
            name_obj = v_info.get("name", {})
            if isinstance(name_obj, dict):
                val = name_obj.get("value")
                if val:
                    v_name = str(val).strip()
    
    # Try common fields for vendor name if still None
    if not v_name:
        for field in ["VendorName", "MerchantName", "vendor_name", "merchant_name"]:
            if field in extracted and isinstance(extracted[field], dict):
                val = extracted[field].get("value")
                if val:
                    v_name = str(val).strip()
                    break
    
    return v_name, v_id

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
        persisted_assigned = invoice_data.get("assigned_approvers", [])
        if persisted_assigned and len(persisted_assigned) > 0:
            return {
                "required": invoice_data["required_approvers"],
                "assigned_approvers": persisted_assigned,
                "workflow_type": invoice_data.get("workflow_type", "persisted"),
                "breakdown": invoice_data.get("approver_breakdown", {})
            }
        else:
            print("DEBUG: Persisted count found but NO assigned_approvers list. Recalculating to fetch names.")

    assigned_approvers = []
    workflow_found = False
    workflow_type = None
    
    # Check Vendor Eligibility from Master Data
    vendor_eligible = False
    v_name_resolved, v_id_resolved = get_vendor_data_from_invoice(db, invoice_id) if invoice_id else (vendor_name, None)
 
    
    if v_name_resolved:
        # 1. Targeted search for Vendor_Master tab (Matches workflow_config.py)
        meta = db.excel_files.find_one({"tab_name": "Vendor_Master"})
        if meta and "sheets" in meta and meta["sheets"]:
            vendor_collection = meta["sheets"][0].get("collection_name")
            if vendor_collection:
                # Search by ID if available, else by name
                inner_query = {}
                if v_id_resolved:
                    inner_query = {
                        "$or": [
                            {"VENDOR_ID": v_id_resolved}, {"Vendor ID": v_id_resolved}, {"vendor_id": v_id_resolved}, {"Customer_Id": v_id_resolved}
                        ]
                    }
                else:
                    inner_query = {
                        "$or": [
                            {"VENDOR_NAME": v_name_resolved}, {"Vendor Name": v_name_resolved}, {"vendor_name": v_name_resolved}, {"Name": v_name_resolved}
                        ]
                    }

                # Search inside CHUNKED rows
                chunk = db[vendor_collection].find_one({"rows": {"$elemMatch": inner_query}})
                
                if chunk:
                    # Find the actual row in the chunk
                    vendor_entry = next((row for row in chunk["rows"] if any(
                        (str(row.get("VENDOR_ID")) == str(v_id_resolved) if v_id_resolved else False) or
                        (str(row.get("Vendor ID")) == str(v_id_resolved) if v_id_resolved else False) or
                        (str(row.get("vendor_id")) == str(v_id_resolved) if v_id_resolved else False) or
                        (str(row.get("Customer_Id")) == str(v_id_resolved) if v_id_resolved else False) or
                        (str(row.get("VENDOR_NAME")) == v_name_resolved if not v_id_resolved else False) or
                        (str(row.get("Vendor Name")) == v_name_resolved if not v_id_resolved else False) or
                        (str(row.get("vendor_name")) == v_name_resolved if not v_id_resolved else False) or
                        (str(row.get("Name")) == v_name_resolved if not v_id_resolved else False)
                        for _ in [1]
                    )), None)

                    if vendor_entry:
                        workflow_applicable = None
                        for key in vendor_entry.keys():
                            kl = key.lower()
                            if "workflow" in kl and ("applicable" in kl or "applicability" in kl or "eligible" in kl or "eligibility" in kl):
                                workflow_applicable = vendor_entry[key]
                                break
                        
                        if str(workflow_applicable).strip().lower() == "yes":
                            vendor_eligible = True
                        else:
                            print(f"DEBUG: Vendor found but NOT workflow eligible. Value: '{workflow_applicable}'")
    

    # 1. Try Vendor Based Workflow (Only if ELIGIBLE)
    if vendor_eligible and v_name_resolved and entity:
        # Try finding by vendor_id first for better precision
        workflow_query = {"entity": entity}
        if v_id_resolved:
            workflow_query["vendor_id"] = v_id_resolved
        else:
            workflow_query["vendor_name"] = v_name_resolved.strip()
            
        vendor_workflow = db.vendor_workflows.find_one(workflow_query)
        
        # Fallback to name if ID match failed but ID was provided
        if not vendor_workflow and v_id_resolved:
            
            vendor_workflow = db.vendor_workflows.find_one({
                "vendor_name": v_name_resolved.strip(),
                "entity": entity
            })
        
        if vendor_workflow:
            workflow_found = True
            workflow_type = "vendor"
            # Extract assigned approvers based on approver_count
            count = vendor_workflow.get("approver_count", 3)
            # ...
            assigned_approvers = [
                vendor_workflow.get("mandatory_approver_1"),
                vendor_workflow.get("mandatory_approver_2"),
                vendor_workflow.get("mandatory_approver_3")
            ]
            
            if count >= 4:
                threshold_amt = vendor_workflow.get("amount_threshold", 0)
                threshold_appr = vendor_workflow.get("threshold_approver")
                if threshold_appr and amount is not None:
                    # STRICT GREATER THAN as per user request
                    if amount > threshold_amt:
                        assigned_approvers.append(threshold_appr)
            
            if count == 5:
                optional_appr = vendor_workflow.get("optional_approver")
                if optional_appr:
                    assigned_approvers.append(optional_appr)

    # 2. Try Codification Based Workflow (Fallback if no Vendor Workflow found)
    # This allows "Workflow Eligible" vendors to use Codification rules if they don't have a specific Vendor Workflow
    if not workflow_found and invoice_id and entity:
        # Fetch coding data to get LOB and Dept ID
        coding = db.coding.find_one({"invoice_id": invoice_id})
        if coding and "line_items" in coding:
            # Match against the first line item with LOB/Dept
            for item in coding["line_items"]:
                lob_raw = item.get("lob")
                dept_raw = item.get("department_id") or item.get("department")
                
                # Extract ID from "ID - Name" if present
                lob = lob_raw.split(" - ")[0].strip() if lob_raw and " - " in str(lob_raw) else lob_raw
                dept = dept_raw.split(" - ")[0].strip() if dept_raw and " - " in str(dept_raw) else dept_raw

                if lob and dept:
                    cod_workflow = db.codification_workflows.find_one({
                        "lob": lob,
                        "department_id": dept,
                        "entity": entity
                    })
                    
                    if cod_workflow:
                        workflow_found = True
                        workflow_type = "codification"
                        count = cod_workflow.get("approver_count", 3)
                        assigned_approvers = [
                            cod_workflow.get("mandatory_approver_1"),
                            cod_workflow.get("mandatory_approver_2"),
                            cod_workflow.get("mandatory_approver_3")
                        ]
                        
                        if count >= 4:
                            threshold_amt = cod_workflow.get("amount_threshold", 0)
                            threshold_appr = cod_workflow.get("threshold_approver")
                            if threshold_appr and amount is not None:
                                if amount >= threshold_amt:
                                    assigned_approvers.append(threshold_appr)
                        
                        if count == 5:
                            optional_appr = cod_workflow.get("optional_approver")
                            if optional_appr:
                                assigned_approvers.append(optional_appr)
                        break

    # 3. Fallback to Default Count
    if not workflow_found:
        workflow_type = "default"
        required_count = 3
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
            "type": workflow_type,
            "vendor_eligible": vendor_eligible
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
    
    # Get vendor name/ID and total amount
    vendor_name, vendor_id = get_vendor_data_from_invoice(db, invoice_id)
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
    
    # 🆕 Fetch Active Delegations for assigned approvers
    delegations_map = {}
    from app.models.delegation import check_active_delegation
    assigned_approvers = requirement_data.get("assigned_approvers", [])
    for approver_email in assigned_approvers:
        substitutes = check_active_delegation(db, approver_email, entity)
        if substitutes:
            delegations_map[approver_email.lower()] = substitutes

    return WorkflowHistoryResponse(
        invoice_id=invoice_id,
        vendor_name=vendor_name,
        required_approvers=required_approvers,
        assigned_approvers=assigned_approvers,
        current_approver_level=invoice.get("current_approver_level", 1),
        current_status=invoice.get("status"),
        approver_breakdown=approver_breakdown,
        delegations=delegations_map,
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
            # 🆕 RELAXED CHECK FOR DELEGATION
            # If the user is an active substitute for the CURRENTLY EXPECTED approver, allow it.
            current_level = (invoice.get("current_approver_level") or 1)
            # Need requirement_data to find expected_email
            from app.routes.workflow import (
                get_vendor_data_from_invoice,
                get_required_approver_count,
                get_invoice_total_from_invoice
            )
            vendor_name, _ = get_vendor_data_from_invoice(db, step_data.invoice_id)
            total_amount = get_invoice_total_from_invoice(db, step_data.invoice_id)
            currency = invoice.get("extracted_data", {}).get("invoice_details", {}).get("currency", {}).get("value", "USD")
            
            req_data = get_required_approver_count(
                db, vendor_name, total_amount, step_data.invoice_id, invoice_data=invoice, currency=currency, entity=entity
            )
            assigned = req_data.get("assigned_approvers", [])
            
            is_delegate = False
            if current_level <= len(assigned):
                expected_email = assigned[current_level - 1].lower()
                from app.models.delegation import check_active_delegation
                substitutes = check_active_delegation(db, expected_email, entity)
                if current_user.email.lower() in substitutes:
                    is_delegate = True

            if not is_delegate:
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
    
    # Get vendor name/ID and total amount
    vendor_name, vendor_id = get_vendor_data_from_invoice(db, invoice_id)
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
    
    # 🆕 Fetch Active Delegations for assigned approvers
    delegations_map = {}
    from app.models.delegation import check_active_delegation
    assigned_approvers = requirement_data.get("assigned_approvers", [])
    for approver_email in assigned_approvers:
        substitutes = check_active_delegation(db, approver_email, entity)
        if substitutes:
            delegations_map[approver_email.lower()] = substitutes

    return {
        "invoice_id": invoice_id,
        "vendor_name": vendor_name,
        "required_approvers": required_approvers,
        "completed_approvers": len(approvers),
        "approvers": approvers,
        "delegations": delegations_map
    }
