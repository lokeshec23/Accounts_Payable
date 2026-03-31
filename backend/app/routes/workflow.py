from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc
import json
import re
from datetime import datetime

from app.database.database import get_db
from app.models.db_models import (
    Invoice, WorkflowStep, VendorWorkflow, CodificationWorkflow, 
    VendorMaster, Coding as DBCoding,
    ApproverAmount, ApproverGL, ApproverNumber, ApproverDefault
)
from app.auth.jwt import get_current_user
from app.dependencies import get_current_entity
from app.models.user import UserResponse
from app.models.workflow import (
    WorkflowStepCreate,
    WorkflowStepResponse,
    WorkflowHistoryResponse,
    WorkflowStepType,
    WorkflowStepStatus
)
from app.ai.vector_matcher import get_cached_vendors
from app.ai.normalizer import normalize_vendor

router = APIRouter()

def get_vendor_data_from_invoice(db: Session, invoice_id: int):
    """Helper to extract vendor name and ID from invoice using SQLAlchemy"""
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        return None, None
    
    # Check direct fields first
    v_name = invoice.vendor_name
    v_id = invoice.vendor_id
    if v_name and v_id:
        return v_name, v_id

    # Fallback to extraction data
    extracted = {}
    if invoice.extracted_data:
        try:
            extracted = json.loads(invoice.extracted_data) if isinstance(invoice.extracted_data, str) else invoice.extracted_data
        except:
            pass
            
    if "vendor_info" in extracted:
        v_info = extracted["vendor_info"]
        if isinstance(v_info, dict):
            name_val = v_info.get("name", {}).get("value") if isinstance(v_info.get("name"), dict) else v_info.get("name")
            if name_val: v_name = str(name_val).strip()
            
            # Also try to get vendor_id if LLM extracted it (unlikely but possible) or it was stored in metadata
            id_val = v_info.get("vendor_id", {}).get("value") if isinstance(v_info.get("vendor_id"), dict) else v_info.get("vendor_id")
            if id_val: v_id = str(id_val).strip()
    
    if not v_name:
        for field in ["VendorName", "MerchantName", "vendor_name", "merchant_name"]:
            if field in extracted and isinstance(extracted[field], dict):
                val = extracted[field].get("value")
                if val: v_name = str(val).strip()
    
    if not v_id:
    # Try to get from top level of extraction if LLM put it there
        for field in ["VendorId", "vendor_id", "CustomerID", "customer_id"]:
            if field in extracted and isinstance(extracted[field], dict):
                val = extracted[field].get("value")
                if val:
                    v_id = str(val).strip()
                    if not v_name:
                        v_name = str(val).strip()
                    break

    return v_name, v_id


def get_invoice_total_from_invoice(db: Session, invoice_id: int):
    """Helper to extract total amount from invoice using SQLAlchemy"""
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        return None
        
    extracted = {}
    if invoice.extracted_data:
        try:
            extracted = json.loads(invoice.extracted_data) if isinstance(invoice.extracted_data, str) else invoice.extracted_data
        except:
            pass
    
    def parse_amount(val):
        if not val:
            return None
        try:
            if isinstance(val, (int, float)):
                return float(val)
            val_str = str(val).strip().replace(",", "")
            match = re.search(r'-?\d+(\.\d+)?', val_str)
            if match:
                return float(match.group())
            return None
        except:
            return None

    if "amounts" in extracted:
        amounts = extracted["amounts"]
        if isinstance(amounts, dict):
            total_obj = amounts.get("total_invoice_amount", {})
            if isinstance(total_obj, dict):
                return parse_amount(total_obj.get("value"))
                
    for field in ["Total Invoice Amount", "TotalAmount", "InvoiceTotal", "Total", "total_amount"]:
        if field in extracted and isinstance(extracted[field], dict):
            return parse_amount(extracted[field].get("value"))
            
    return None

def get_required_approver_count(
    db: Session, 
    vendor_name: str, 
    amount: float = None, 
    invoice_id: int = None, 
    invoice_data: Any = None, 
    currency: str = "USD", 
    entity: str = None, 
    force_vendor_id: str = None, 
    force_vendor_name: str = None
):
    """
    Get the required approvers based on Workflow rules in SQL Server.
    """
    # 0. Check persisted values
    if not force_vendor_name and not force_vendor_id and invoice_data:
        if hasattr(invoice_data, "required_approvers") and invoice_data.required_approvers is not None:
            # We need to map relationship models to strings for the response
            assigned_approvers = []
            if hasattr(invoice_data, "assigned_approvers_list"):
                assigned_approvers = [a.approver_email for a in sorted(invoice_data.assigned_approvers_list, key=lambda x: x.sequence_order)]
                
            if assigned_approvers:
                return {
                    "required": invoice_data.required_approvers,
                    "assigned_approvers": assigned_approvers,
                    "workflow_type": getattr(invoice_data, "workflow_type", "persisted"),
                    "breakdown": {} # Breakdown is usually not persisted in a structured way elsewhere
                }

    assigned_approvers = []
    workflow_found = False
    workflow_type = None
    vendor_eligible = False
    is_parallel = False
    
    # Resolve vendor identity
    if force_vendor_name or force_vendor_id:
         v_name_resolved = force_vendor_name
         v_id_resolved = force_vendor_id
    else:
        v_name_resolved, v_id_resolved = get_vendor_data_from_invoice(db, invoice_id) if invoice_id else (vendor_name, None)

    # 1. Check Vendor Eligibility in Vendor Master (Using Cache)
    vendors, vendor_map, address_map = get_cached_vendors(db)
    
    vendor_entry = None
    if v_id_resolved:
        # Search for vendor_id across all rows in the list
        for row in vendors:
            rid = row.get("vendor_id") or row.get("VENDOR_ID") or row.get("Vendor ID")
            if str(rid) == str(v_id_resolved):
                vendor_entry = row
                break
    
    if not vendor_entry and v_name_resolved:
        norm_name = normalize_vendor(v_name_resolved)
        vendor_entry = vendor_map.get(norm_name)

    if vendor_entry:
        if not v_id_resolved:
            v_id_resolved = vendor_entry.get("vendor_id") or vendor_entry.get("VENDOR_ID") or vendor_entry.get("Vendor ID")
        workflow_applicable = None
        for key in vendor_entry.keys():
            kl = key.lower()
            if "workflow" in kl and ("applicable" in kl or "applicability" in kl or "eligible" in kl or "eligibility" in kl):
                workflow_applicable = vendor_entry[key]
                break
        if str(workflow_applicable).strip().lower() == "yes":
            vendor_eligible = True

    # 2. Try Vendor Based Workflow
    if entity:
        v_workflow = None
        if v_id_resolved:
            v_workflow = db.query(VendorWorkflow).filter(VendorWorkflow.vendor_id == v_id_resolved, VendorWorkflow.entity == entity).first()
        
        if not v_workflow and v_name_resolved:
            v_workflow = db.query(VendorWorkflow).filter(VendorWorkflow.vendor_name == v_name_resolved, VendorWorkflow.entity == entity).first()
            if not v_workflow:
                v_workflow = db.query(VendorWorkflow).filter(VendorWorkflow.vendor_name.like(f"%{v_name_resolved}%"), VendorWorkflow.entity == entity).first()
            
        if v_workflow:
            # If we found a workflow, we prioritize it
            workflow_found = True
            workflow_type = "vendor"
            count = v_workflow.approver_count
            def parse_approvers(val):
                if not val: return []
                if isinstance(val, str) and val.startswith("["):
                    try: return json.loads(val)
                    except: return [val]
                return [val] if val else []

            mandatory_fields = [
                parse_approvers(v_workflow.mandatory_approver_1),
                parse_approvers(v_workflow.mandatory_approver_2),
                parse_approvers(v_workflow.mandatory_approver_3),
                parse_approvers(v_workflow.mandatory_approver_4),
                parse_approvers(v_workflow.mandatory_approver_5)
            ]
            assigned_approvers = [a for a in mandatory_fields[:count] if a]
            is_parallel = getattr(v_workflow, 'is_parallel', False)
            
            # Threshold Approver
            if getattr(v_workflow, 'is_threshold_enabled', False):
                if amount is not None and v_workflow.amount_threshold is not None:
                     if amount >= v_workflow.amount_threshold and v_workflow.threshold_approver:
                        assigned_approvers.append(v_workflow.threshold_approver)


    # 3. Try Codification Based Workflow
    if not workflow_found and invoice_id and entity:
        coding = db.query(DBCoding).filter(DBCoding.invoice_id == invoice_id).first()
        if coding and coding.line_items:
            items = json.loads(coding.line_items)
            for item in items:
                lob_raw = item.get("lob")
                dept_raw = item.get("department_id") or item.get("department")
                lob = lob_raw.split(" - ")[0].strip() if lob_raw and " - " in str(lob_raw) else lob_raw
                dept = dept_raw.split(" - ")[0].strip() if dept_raw and " - " in str(dept_raw) else dept_raw

                if lob and dept:
                    cod_workflow = db.query(CodificationWorkflow).filter(
                        CodificationWorkflow.lob == lob,
                        CodificationWorkflow.department_id == dept,
                        CodificationWorkflow.entity == entity
                    ).first()
                    
                    if cod_workflow:
                        workflow_found = True
                        workflow_type = "codification"
                        count = cod_workflow.approver_count
                        def parse_approvers(val):
                            if not val: return []
                            if isinstance(val, str) and val.startswith("["):
                                try: return json.loads(val)
                                except: return [val]
                            return [val] if val else []

                        mandatory_fields = [
                            parse_approvers(cod_workflow.mandatory_approver_1),
                            parse_approvers(cod_workflow.mandatory_approver_2),
                            parse_approvers(cod_workflow.mandatory_approver_3),
                            parse_approvers(cod_workflow.mandatory_approver_4),
                            parse_approvers(cod_workflow.mandatory_approver_5)
                        ]
                        assigned_approvers = [a for a in mandatory_fields[:count] if a]
                        is_parallel = getattr(cod_workflow, 'is_parallel', False)
                        
                        # Threshold Approver
                        if getattr(cod_workflow, 'is_threshold_enabled', False):
                            if amount is not None and amount >= cod_workflow.amount_threshold and cod_workflow.threshold_approver:
                                assigned_approvers.append(cod_workflow.threshold_approver)
                        break

    # 4. Fallback Logic (Progressive check of other config tables)
    if not workflow_found and entity:
        # A. Check GL based configuration
        coding = db.query(DBCoding).filter(DBCoding.invoice_id == invoice_id).first() if invoice_id else None
        if coding and coding.header_coding:
            hc = json.loads(coding.header_coding)
            gl_code = hc.get("gl_code")
            if gl_code:
                approver_gl = db.query(ApproverGL).filter(ApproverGL.gl_code == gl_code, ApproverGL.entity == entity).first()
                if approver_gl:
                    workflow_found = True
                    workflow_type = "approver_gl"
                    count = approver_gl.required_approvers
                    emails = json.loads(approver_gl.approver_emails) if approver_gl.approver_emails else []
                    assigned_approvers = [e for e in emails if e]

        # B. Check Amount based configuration
        if not workflow_found and amount is not None:
            approver_amt = db.query(ApproverAmount).filter(
                ApproverAmount.entity == entity,
                ApproverAmount.min_amount <= amount,
                ApproverAmount.max_amount >= amount
            ).first()
            if approver_amt:
                workflow_found = True
                workflow_type = "approver_amount"
                count = approver_amt.required_approvers
                emails = json.loads(approver_amt.approver_emails) if approver_amt.approver_emails else []
                assigned_approvers = [e for e in emails if e]

        # C. Check Approver Number (Count based)
        if not workflow_found:
            approver_num = db.query(ApproverNumber).filter(ApproverNumber.entity == entity).first()
            if approver_num:
                workflow_found = True
                workflow_type = "approver_number"
                count = approver_num.approver_count
                emails = json.loads(approver_num.approver_emails) if approver_num.approver_emails else []
                assigned_approvers = [e for e in emails if e]

        # D. Check Default configuration
        if not workflow_found:
            approver_def = db.query(ApproverDefault).filter(ApproverDefault.entity == entity).first()
            if approver_def:
                workflow_found = True
                workflow_type = "approver_default"
                count = approver_def.required_approvers
                emails = json.loads(approver_def.approver_emails) if approver_def.approver_emails else []
                assigned_approvers = [e for e in emails if e]

    if not workflow_found:
        return {
            "required": 1,
            "assigned_approvers": [],
            "workflow_type": "hardcoded_default",
            "breakdown": {"default": 1}
        }

    assigned_approvers = [a for a in assigned_approvers if a]
    
    # total required = number of levels
    # each level is a parallel group if is_parallel is true
    # If is_parallel is false, assigned_approvers might still be lists of 1
    # We should flatten if not parallel, or keep as is.
    
    # Clean assigned_approvers (ensure no empty lists)
    assigned_approvers = [a for a in assigned_approvers if a]
    
    # Parallel means: each level requires 1 approval.
    # Total required = number of stages.
    # (Even if sequential, total required = number of stages, because current_approver_level matches stage)
    req_count = len(assigned_approvers)

    return {
        "required": req_count,
        "assigned_approvers": assigned_approvers,
        "workflow_type": workflow_type,
        "is_parallel": is_parallel,
        "breakdown": {"type": workflow_type, "vendor_eligible": vendor_eligible, "is_parallel": is_parallel}
    }

@router.get("/{invoice_id}", response_model=WorkflowHistoryResponse)
async def get_workflow_history(
    invoice_id: int,
    preview_vendor_id: Optional[str] = None,
    preview_vendor_name: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(404, "Invoice not found")
    
    # Use the entity stored on the invoice
    entity = invoice.entity
        
    vendor_name = preview_vendor_name if preview_vendor_name else (invoice.vendor_name or "Unknown")
    vendor_id = preview_vendor_id if preview_vendor_id else invoice.vendor_id
    total_amount = get_invoice_total_from_invoice(db, invoice_id)
    
    # Support currency extraction
    extracted = {}
    if invoice.extracted_data:
        try:
            extracted = json.loads(invoice.extracted_data) if isinstance(invoice.extracted_data, str) else invoice.extracted_data
        except: pass
    currency = extracted.get("invoice_details", {}).get("currency", {}).get("value", "USD")

    requirement_data = get_required_approver_count(
        db, vendor_name, total_amount, invoice_id, invoice_data=invoice, 
        currency=currency, entity=entity, force_vendor_id=vendor_id, force_vendor_name=vendor_name
    )
    
    steps = db.query(WorkflowStep).filter(WorkflowStep.invoice_id == invoice_id).order_by(asc(WorkflowStep.timestamp)).all()
    
    # Fetch Delegations
    delegations_map = {}
    from app.models.delegation import check_active_delegation
    assigned_approvers = requirement_data.get("assigned_approvers", [])
    
    def _flatten_emails(items):
        res = []
        for item in items:
            if isinstance(item, list):
                res.extend(_flatten_emails(item))
            elif isinstance(item, str):
                item = item.strip()
                if item.startswith("["):
                    try:
                        parsed = json.loads(item)
                        if isinstance(parsed, list):
                            res.extend(_flatten_emails(parsed))
                        else:
                            res.append(item)
                    except:
                        res.append(item)
                else:
                    res.append(item)
        return res

    flat_emails = set(_flatten_emails(assigned_approvers))
    for email in flat_emails:
        if email and isinstance(email, str):
            subs = check_active_delegation(db, email, entity)
            if subs: delegations_map[email.lower()] = subs

    return WorkflowHistoryResponse(
        invoice_id=str(invoice_id),
        vendor_name=vendor_name,
        required_approvers=requirement_data["required"],
        assigned_approvers=assigned_approvers,
        current_approver_level=invoice.current_approver_level or 1,
        current_status=invoice.status.value if hasattr(invoice.status, "value") else str(invoice.status),
        approver_breakdown=requirement_data["breakdown"],
        delegations=delegations_map,
        workflow_type=requirement_data.get("workflow_type", "unknown"),
        steps=[
            WorkflowStepResponse(
                id=str(s.id),
                invoice_id=str(s.invoice_id),
                step_name=s.step_name,
                step_type=s.step_type,
                user=s.user,
                status=s.status,
                approver_number=s.approver_number,
                comment=s.comment,
                timestamp=s.timestamp
            ) for s in steps
        ]
    )
    
@router.get("/approvers/{invoice_id}")
async def get_approver_status(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """
    Get the workflow status/history for an invoice.
    This is called by the frontend to show the approval timeline.
    """
    steps = db.query(WorkflowStep).filter(WorkflowStep.invoice_id == invoice_id).order_by(asc(WorkflowStep.timestamp)).all()
    
    return {
        "approvers": [
            {
                "id": str(s.id),
                "invoice_id": str(s.invoice_id),
                "step_name": s.step_name,
                "step_type": s.step_type,
                "user": s.user,
                "status": s.status,
                "timestamp": s.timestamp.isoformat() if s.timestamp else None,
                "comment": s.comment
            } for s in steps
        ]
    }
