from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, asc
import json

from app.database.database import get_db
from app.models.db_models import (
    VendorWorkflow as DBVendorWorkflow, 
    CodificationWorkflow as DBCodificationWorkflow,
    VendorMaster, LOBMaster, DepartmentMaster, User as DBUser
)
from app.auth.jwt import get_current_user
from app.models.user import UserResponse
from app.models.workflow_vendor import VendorWorkflow, VendorWorkflowResponse
from app.models.workflow_codification import CodificationWorkflow, CodificationWorkflowResponse
from app.dependencies import get_current_entity

router = APIRouter(tags=["Workflow Configuration"])

# ==================== VENDOR WORKFLOW ====================

@router.get("/vendor", response_model=List[VendorWorkflowResponse])
async def get_vendor_workflows(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    workflows = db.query(DBVendorWorkflow).filter(
        DBVendorWorkflow.entity == entity
    ).all()
    
    result = []
    for w in workflows:
        result.append({
            "id": str(w.id),
            "vendor_id": w.vendor_id,
            "vendor_name": w.vendor_name,
            "approver_count": w.approver_count,
            "mandatory_approver_1": w.mandatory_approver_1,
            "mandatory_approver_2": w.mandatory_approver_2,
            "mandatory_approver_3": w.mandatory_approver_3,
            "amount_threshold": w.amount_threshold,
            "threshold_approver": w.threshold_approver,
            "optional_approver": w.optional_approver,
            "entity": w.entity,
            "created_at": w.created_at
        })
    return result

@router.post("/vendor", response_model=VendorWorkflowResponse)
async def create_vendor_workflow(
    workflow: VendorWorkflow,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    existing = db.query(DBVendorWorkflow).filter(
        DBVendorWorkflow.vendor_id == workflow.vendor_id,
        DBVendorWorkflow.entity == entity
    ).first()
    
    if existing:
        raise HTTPException(400, f"Workflow already exists for vendor '{workflow.vendor_id}'")
    
    new_workflow = DBVendorWorkflow(
        entity=entity,
        vendor_id=workflow.vendor_id,
        vendor_name=workflow.vendor_name,
        approver_count=workflow.approver_count,
        mandatory_approver_1=workflow.mandatory_approver_1,
        mandatory_approver_2=workflow.mandatory_approver_2,
        mandatory_approver_3=workflow.mandatory_approver_3,
        amount_threshold=workflow.amount_threshold,
        threshold_approver=workflow.threshold_approver,
        optional_approver=workflow.optional_approver,
        created_at=datetime.utcnow()
    )
    db.add(new_workflow)
    db.commit()
    db.refresh(new_workflow)
    
    return {**workflow.dict(), "id": str(new_workflow.id), "entity": entity, "created_at": new_workflow.created_at}

@router.put("/vendor/{workflow_id}", response_model=VendorWorkflowResponse)
async def update_vendor_workflow(
    workflow_id: int,
    workflow: VendorWorkflow,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    existing = db.query(DBVendorWorkflow).filter(
        DBVendorWorkflow.id == workflow_id,
        DBVendorWorkflow.entity == entity
    ).first()
    
    if not existing:
        raise HTTPException(404, "Workflow not found")
    
    existing.vendor_id = workflow.vendor_id
    existing.vendor_name = workflow.vendor_name
    existing.approver_count = workflow.approver_count
    existing.mandatory_approver_1 = workflow.mandatory_approver_1
    existing.mandatory_approver_2 = workflow.mandatory_approver_2
    existing.mandatory_approver_3 = workflow.mandatory_approver_3
    existing.amount_threshold = workflow.amount_threshold
    existing.threshold_approver = workflow.threshold_approver
    existing.optional_approver = workflow.optional_approver
    existing.entity = entity
    
    db.commit()
    return {**workflow.dict(), "id": str(workflow_id), "entity": entity, "created_at": existing.created_at}

@router.delete("/vendor/{workflow_id}")
async def delete_vendor_workflow(
    workflow_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    result = db.query(DBVendorWorkflow).filter(
        DBVendorWorkflow.id == workflow_id,
        DBVendorWorkflow.entity == entity
    ).delete()
    
    if result == 0:
        raise HTTPException(404, "Workflow not found")
    
    db.commit()
    return {"message": "Workflow deleted successfully"}

@router.get("/vendor/vendors")
async def get_workflow_vendors(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    vendors = db.query(VendorMaster).all()
    workflow_vendors = []
    
    for v in vendors:
        # Robust check for both boolean (new) and legacy string "Yes"
        is_val = v.workflow_applicable
        if is_val is True or is_val == 1 or str(is_val).strip().lower() == "yes" or str(is_val).strip().lower() == "true":
            vendor_name = v.vendor_name
            vendor_id = v.vendor_id
            
            if vendor_name:
                label = f"{vendor_id} - {vendor_name}" if vendor_id else str(vendor_name)
                unique_val = f"{vendor_id}|{vendor_name}" if vendor_id else str(vendor_name)
                workflow_vendors.append({
                    "id": str(vendor_id) if vendor_id else "",
                    "value": unique_val,
                    "label": label,
                    "vendor_name": str(vendor_name)
                })
    return workflow_vendors

# ==================== CODIFICATION WORKFLOW ====================

@router.get("/codification", response_model=List[CodificationWorkflowResponse])
async def get_codification_workflows(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    workflows = db.query(DBCodificationWorkflow).filter(
        DBCodificationWorkflow.entity == entity
    ).all()
    
    result = []
    for w in workflows:
        result.append({
            "id": str(w.id),
            "lob": w.lob,
            "department_id": w.department_id,
            "approver_count": w.approver_count,
            "mandatory_approver_1": w.mandatory_approver_1,
            "mandatory_approver_2": w.mandatory_approver_2,
            "mandatory_approver_3": w.mandatory_approver_3,
            "amount_threshold": w.amount_threshold,
            "threshold_approver": w.threshold_approver,
            "optional_approver": w.optional_approver,
            "entity": w.entity,
            "created_at": w.created_at
        })
    return result

@router.post("/codification", response_model=CodificationWorkflowResponse)
async def create_codification_workflow(
    workflow: CodificationWorkflow,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    existing = db.query(DBCodificationWorkflow).filter(
        DBCodificationWorkflow.lob == workflow.lob,
        DBCodificationWorkflow.department_id == workflow.department_id,
        DBCodificationWorkflow.entity == entity
    ).first()
    
    if existing:
        raise HTTPException(400, f"Workflow already exists for LOB '{workflow.lob}' and Department '{workflow.department_id}'")
        
    new_workflow = DBCodificationWorkflow(
        entity=entity,
        lob=workflow.lob,
        department_id=workflow.department_id,
        approver_count=workflow.approver_count,
        mandatory_approver_1=workflow.mandatory_approver_1,
        mandatory_approver_2=workflow.mandatory_approver_2,
        mandatory_approver_3=workflow.mandatory_approver_3,
        amount_threshold=workflow.amount_threshold,
        threshold_approver=workflow.threshold_approver,
        optional_approver=workflow.optional_approver,
        created_at=datetime.utcnow()
    )
    db.add(new_workflow)
    db.commit()
    db.refresh(new_workflow)
    
    return {**workflow.dict(), "id": str(new_workflow.id), "entity": entity, "created_at": new_workflow.created_at}

@router.put("/codification/{workflow_id}", response_model=CodificationWorkflowResponse)
async def update_codification_workflow(
    workflow_id: int,
    workflow: CodificationWorkflow,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    existing = db.query(DBCodificationWorkflow).filter(
        DBCodificationWorkflow.id == workflow_id,
        DBCodificationWorkflow.entity == entity
    ).first()
    
    if not existing:
        raise HTTPException(404, "Workflow not found")
        
    existing.lob = workflow.lob
    existing.department_id = workflow.department_id
    existing.approver_count = workflow.approver_count
    existing.mandatory_approver_1 = workflow.mandatory_approver_1
    existing.mandatory_approver_2 = workflow.mandatory_approver_2
    existing.mandatory_approver_3 = workflow.mandatory_approver_3
    existing.amount_threshold = workflow.amount_threshold
    existing.threshold_approver = workflow.threshold_approver
    existing.optional_approver = workflow.optional_approver
    existing.entity = entity
    
    db.commit()
    return {**workflow.dict(), "id": str(workflow_id), "entity": entity, "created_at": existing.created_at}

@router.delete("/codification/{workflow_id}")
async def delete_codification_workflow(
    workflow_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    result = db.query(DBCodificationWorkflow).filter(
        DBCodificationWorkflow.id == workflow_id,
        DBCodificationWorkflow.entity == entity
    ).delete()
    
    if result == 0:
        raise HTTPException(404, "Workflow not found")
    
    db.commit()
    return {"message": "Workflow deleted successfully"}

@router.get("/codification/lobs")
async def get_lobs(db: Session = Depends(get_db)):
    lobs = db.query(LOBMaster).all()
    result = []
    # lob_id and name are correct for LOBMaster
    for w in sorted(lobs, key=lambda x: str(x.lob_id or "")):
        val = str(w.lob_id) if w.lob_id is not None else str(w.id)
        result.append({
            "value": val,
            "label": f"{val} - {w.name}" if getattr(w, 'name', None) else val
        })
    return result

@router.get("/codification/departments")
async def get_departments(db: Session = Depends(get_db)):
    depts = db.query(DepartmentMaster).all()
    result = []
    # DepartmentMaster uses department_name, not name
    for w in sorted(depts, key=lambda x: str(x.department_id or "")):
        val = str(w.department_id) if w.department_id is not None else str(w.id)
        name = getattr(w, 'department_name', None) or getattr(w, 'name', None)
        result.append({
            "value": val,
            "label": f"{val} - {name}" if name else val
        })
    return result

@router.get("/approvers")
async def get_approvers(db: Session = Depends(get_db)):
    approvers = db.query(DBUser).filter(DBUser.role == "approver", DBUser.status == "active").all()
    return [{
        "value": a.email,
        "label": f"{a.username or a.email.split('@')[0]} ({a.email})"
    } for a in approvers]
