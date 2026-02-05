from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from app.database.sql_server import get_db
from app.auth.jwt import get_current_user
from app.dependencies import get_current_entity
from app.models.user import UserResponse
from datetime import datetime
from app.models.workflow import (
    WorkflowStepCreate,
    WorkflowStepResponse,
    WorkflowHistoryResponse,
    WorkflowStepType,
    WorkflowStepStatus
)
from app.models.sql.invoice import Invoice as SQLInvoice
from app.models.sql.workflow_step import WorkflowStep as SQLWorkflowStep
from app.models.sql.vendor_master import VendorMaster
from app.models.sql.workflow import VendorWorkflow, CodificationWorkflow
from app.models.sql.coding import Coding as SQLCoding
from app.models.delegation import check_active_delegation

router = APIRouter()

async def get_vendor_data_from_invoice(db: AsyncSession, invoice_id_int: int):
    """Helper to extract vendor name and ID from invoice (SQL)"""
    stmt = select(SQLInvoice).where(SQLInvoice.id == invoice_id_int)
    result = await db.execute(stmt)
    invoice = result.scalar_one_or_none()
    
    if not invoice:
        return None, None
    
    return invoice.vendor_name, invoice.vendor_id

async def get_invoice_total_from_invoice(db: AsyncSession, invoice_id_int: int):
    """Helper to extract total amount from invoice (SQL)"""
    stmt = select(SQLInvoice).where(SQLInvoice.id == invoice_id_int)
    result = await db.execute(stmt)
    invoice = result.scalar_one_or_none()
    
    if not invoice:
        return None
        
    extracted = invoice.extracted_data or {}
    
    def parse_amount(val):
        if not val:
            return None
        try:
            if isinstance(val, (int, float)):
                return float(val)
            import re
            clean = str(val).replace(",", "")
            match = re.search(r'-?\d+(\.\d+)?', clean)
            if match:
                return float(match.group())
            return None
        except:
            return None

    # Try amounts.total_invoice_amount.value
    amounts = extracted.get("amounts", {})
    if isinstance(amounts, dict):
        total_obj = amounts.get("total_invoice_amount", {})
        if isinstance(total_obj, dict):
            return parse_amount(total_obj.get("value"))
                
    return None

async def get_required_approver_count(db: AsyncSession, vendor_name: str, amount: float = None, invoice_id: Any = None, invoice_data: Any = None, currency: str = "USD", entity: str = None, force_vendor_id: str = None, force_vendor_name: str = None):
    """
    Get the required approvers using SQL Server.
    """
    if not force_vendor_name and not force_vendor_id and invoice_data:
        # Check if we have Pydantic model (SQL) or dict
        req = getattr(invoice_data, "required_approvers", None)
        if req is not None:
             assigned = getattr(invoice_data, "assigned_approvers", [])
             if assigned:
                 return {
                    "required": req,
                    "assigned_approvers": assigned,
                    "workflow_type": getattr(invoice_data, "workflow_type", "persisted"),
                    "breakdown": getattr(invoice_data, "approver_breakdown", {})
                 }

    assigned_approvers = []
    workflow_found = False
    workflow_type = None
    vendor_eligible = False
    
    v_name_resolved = force_vendor_name
    v_id_resolved = force_vendor_id
    
    try:
        inv_id_int = int(invoice_id) if invoice_id else None
    except:
        inv_id_int = None

    if not (v_name_resolved or v_id_resolved) and inv_id_int:
        v_name_resolved, v_id_resolved = await get_vendor_data_from_invoice(db, inv_id_int)

    if v_id_resolved or v_name_resolved:
        # Check Vendor Eligibility from Vendor Master table
        stmt = select(VendorMaster).where(VendorMaster.entity == entity)
        if v_id_resolved:
            stmt = stmt.where(VendorMaster.vendor_id == v_id_resolved)
        else:
            stmt = stmt.where(VendorMaster.vendor_name == v_name_resolved)
            
        result = await db.execute(stmt)
        vendor = result.scalar_one_or_none()
        
        if vendor:
            # Check line_grouping or specific details if workflow eligibility is hidden there
            if vendor.line_grouping == "Yes": # Simple check for now
                 vendor_eligible = True
            elif vendor.details and vendor.details.get("Workflow Applicability Configuration") == "Yes":
                 vendor_eligible = True
    
    # 1. Vendor Based Workflow
    if vendor_eligible and (v_name_resolved or v_id_resolved) and entity:
        stmt_vw = select(VendorWorkflow).where(VendorWorkflow.entity == entity)
        if v_id_resolved:
            stmt_vw = stmt_vw.where(VendorWorkflow.vendor_id == v_id_resolved)
        else:
            stmt_vw = stmt_vw.where(VendorWorkflow.vendor_name == v_name_resolved.strip())
            
        result_vw = await db.execute(stmt_vw)
        vendor_workflow = result_vw.scalar_one_or_none()
        
        if vendor_workflow:
            workflow_found = True
            workflow_type = "vendor"
            # Extract assigned approvers based on approver_count
            count = vendor_workflow.approver_count or 3
            assigned_approvers = [
                vendor_workflow.mandatory_approver_1,
                vendor_workflow.mandatory_approver_2,
                vendor_workflow.mandatory_approver_3
            ]
            
            if count >= 4:
                threshold_amt = vendor_workflow.amount_threshold or 0.0
                threshold_appr = vendor_workflow.threshold_approver
                if threshold_appr and amount is not None:
                    # STRICT GREATER THAN as per user request
                    if amount > threshold_amt:
                        assigned_approvers.append(threshold_appr)
            
            if count == 5:
                optional_appr = vendor_workflow.optional_approver
                if optional_appr:
                    assigned_approvers.append(optional_appr)

    # 2. Codification Based Workflow
    # This allows "Workflow Eligible" vendors to use Codification rules if they don't have a specific Vendor Workflow
    if not workflow_found and inv_id_int and entity:
        # Fetch coding data to get LOB and Dept ID
        stmt_coding = select(SQLCoding).where(SQLCoding.invoice_id == str(inv_id_int))
        result_coding = await db.execute(stmt_coding)
        coding = result_coding.scalar_one_or_none()
        
        if coding and coding.line_items:
            # Match against the first line item with LOB/Dept
            for item in coding.line_items:
                lob_raw = item.get("lob")
                dept_raw = item.get("department_id") or item.get("department")
                
                # Extract ID from "ID - Name" if present
                lob = lob_raw.split(" - ")[0].strip() if lob_raw and " - " in str(lob_raw) else lob_raw
                dept = dept_raw.split(" - ")[0].strip() if dept_raw and " - " in str(dept_raw) else dept_raw

                if lob and dept:
                    stmt_cw = select(CodificationWorkflow).where(
                        CodificationWorkflow.lob == lob,
                        CodificationWorkflow.department_id == dept,
                        CodificationWorkflow.entity == entity
                    )
                    res_cw = await db.execute(stmt_cw)
                    cod_workflow = res_cw.scalar_one_or_none()
                    
                    if cod_workflow:
                        workflow_found = True
                        workflow_type = "codification"
                        count = cod_workflow.approver_count or 3
                        assigned_approvers = [
                            cod_workflow.mandatory_approver_1,
                            cod_workflow.mandatory_approver_2,
                            cod_workflow.mandatory_approver_3
                        ]
                        
                        if count >= 4:
                            threshold_amt = cod_workflow.amount_threshold or 0.0
                            threshold_appr = cod_workflow.threshold_approver
                            if threshold_appr and amount is not None:
                                if amount >= threshold_amt:
                                    assigned_approvers.append(threshold_appr)
                        
                        if count == 5:
                            optional_appr = cod_workflow.optional_approver
                            if optional_appr:
                                assigned_approvers.append(optional_appr)
                        break

    # 3. Fallback
    if not workflow_found:
        return {
            "required": 3,
            "assigned_approvers": ["approver1@example.com", "approver2@example.com", "approver3@example.com"],
            "workflow_type": "default",
            "breakdown": {"default": 3}
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
    preview_vendor_id: Optional[str] = None,
    preview_vendor_name: Optional[str] = None,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db)
):
    """Get complete workflow history for an invoice (SQL)."""
    
    try:
        inv_id_int = int(invoice_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid invoice ID format")

    stmt = select(SQLInvoice).where(SQLInvoice.id == inv_id_int, SQLInvoice.entity == entity)
    result = await db.execute(stmt)
    invoice = result.scalar_one_or_none()
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Get vendor name/ID (prefer preview, else fetch from DB)
    vendor_name = preview_vendor_name or invoice.vendor_name
    vendor_id = preview_vendor_id or invoice.vendor_id

    total_amount = await get_invoice_total_from_invoice(db, inv_id_int)
    currency = (invoice.extracted_data or {}).get("invoice_details", {}).get("currency", {}).get("value", "USD")

    # Recalculate requirements (Note: get_required_approver_count should be updated for SQL too)
    requirement_data = await get_required_approver_count(
        db, 
        vendor_name, 
        total_amount, 
        inv_id_int, 
        invoice_data=invoice, 
        currency=currency, 
        entity=entity,
        force_vendor_id=vendor_id, 
        force_vendor_name=vendor_name
    )
    
    # Get all workflow steps for this invoice
    stmt_steps = select(SQLWorkflowStep).where(SQLWorkflowStep.invoice_id == str(invoice.id)).order_by(SQLWorkflowStep.timestamp.asc())
    result_steps = await db.execute(stmt_steps)
    steps = result_steps.scalars().all()
    
    step_list = [WorkflowStepResponse(**{c.name: getattr(s, c.name) for c in s.__table__.columns if c.name != 'id'}, id=str(s.id)) for s in steps]
    
    delegations_map = {}
    assigned = requirement_data.get("assigned_approvers", [])
    for email in assigned:
        if email:
            subs = await check_active_delegation(db, email, entity)
            if subs:
                delegations_map[email.lower()] = subs

    return WorkflowHistoryResponse(
        invoice_id=str(invoice.id),
        vendor_name=vendor_name,
        required_approvers=requirement_data["required"],
        assigned_approvers=assigned,
        current_approver_level=invoice.current_approver_level or 1,
        current_status=invoice.status,
        approver_breakdown=requirement_data.get("breakdown", {}),
        delegations=delegations_map,
        steps=step_list
    )

@router.post("/step", response_model=WorkflowStepResponse)
async def create_workflow_step(
    step_data: WorkflowStepCreate,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db)
):
    """Create a new workflow step (SQL)"""
    
    try:
        inv_id_int = int(step_data.invoice_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid invoice ID format")

    stmt = select(SQLInvoice).where(SQLInvoice.id == inv_id_int, SQLInvoice.entity == entity)
    result = await db.execute(stmt)
    invoice = result.scalar_one_or_none()
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Validation: Check for duplicate approvers
    if step_data.step_type in [WorkflowStepType.APPROVER_1, WorkflowStepType.APPROVER_2, 
                                WorkflowStepType.APPROVER_3, WorkflowStepType.APPROVER_4]:
        
        stmt_existing = select(SQLWorkflowStep).where(
            SQLWorkflowStep.invoice_id == str(invoice.id),
            SQLWorkflowStep.step_type.in_(["approver_1", "approver_2", "approver_3", "approver_4"])
        )
        res_existing = await db.execute(stmt_existing)
        existing_approvers = res_existing.scalars().all()
        
        approver_users = [s.user for s in existing_approvers]
        
        if step_data.user in approver_users:
            # delegation check omitted for brevity in this step, but would use SQL-based delegation model
            raise HTTPException(
                status_code=400, 
                detail=f"User {step_data.user} has already approved/rejected this invoice. Approvers must be unique."
            )
    
    # Create the workflow step
    new_step = SQLWorkflowStep(
        invoice_id=str(invoice.id),
        step_name=step_data.step_name,
        step_type=step_data.step_type,
        user=step_data.user,
        status=step_data.status,
        timestamp=datetime.utcnow(),
        approver_number=step_data.approver_number,
        comment=step_data.comment,
        entity=entity
    )
    
    db.add(new_step)
    await db.commit()
    await db.refresh(new_step)
    
    return WorkflowStepResponse(**{c.name: getattr(new_step, c.name) for c in new_step.__table__.columns if c.name != 'id'}, id=str(new_step.id))

@router.get("/approvers/{invoice_id}")
async def get_approver_status(
    invoice_id: str,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db)
):
    """Get the status of all approvers for an invoice (SQL)"""
    
    try:
        inv_id_int = int(invoice_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid invoice ID format")

    stmt = select(SQLInvoice).where(SQLInvoice.id == inv_id_int, SQLInvoice.entity == entity)
    result = await db.execute(stmt)
    invoice = result.scalar_one_or_none()
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Get vendor name/ID and total amount
    vendor_name, vendor_id = await get_vendor_data_from_invoice(db, inv_id_int)
    total_amount = await get_invoice_total_from_invoice(db, inv_id_int)
    currency = (invoice.extracted_data or {}).get("invoice_details", {}).get("currency", {}).get("value", "USD")
    requirement_data = await get_required_approver_count(db, vendor_name, total_amount, inv_id_int, invoice_data=invoice, currency=currency, entity=entity)
    
    # Get all approver steps
    stmt_approvers = select(SQLWorkflowStep).where(
        SQLWorkflowStep.invoice_id == str(invoice.id),
        SQLWorkflowStep.step_type.in_(["approver_1", "approver_2", "approver_3", "approver_4"])
    ).order_by(SQLWorkflowStep.timestamp.asc())
    result_approvers = await db.execute(stmt_approvers)
    approver_steps = result_approvers.scalars().all()
    
    approvers = []
    for step in approver_steps:
        approvers.append({
            "approver_number": step.approver_number,
            "user": step.user,
            "status": step.status,
            "timestamp": step.timestamp.isoformat() if step.timestamp else None,
            "comment": step.comment
        })
    
    delegations_map = {}
    assigned = requirement_data.get("assigned_approvers", [])
    for email in assigned:
        if email:
            subs = await check_active_delegation(db, email, entity)
            if subs:
                delegations_map[email.lower()] = subs

    return {
        "invoice_id": str(invoice.id),
        "vendor_name": vendor_name,
        "required_approvers": requirement_data["required"],
        "completed_approvers": len(approvers),
        "approvers": approvers,
        "delegations": delegations_map
    }
