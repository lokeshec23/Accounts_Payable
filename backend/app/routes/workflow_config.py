from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from app.database.sql_server import get_db
from app.auth.jwt import get_current_user
from app.models.user import UserResponse
from app.models.workflow_vendor import VendorWorkflow, VendorWorkflowResponse
from app.models.workflow_codification import CodificationWorkflow, CodificationWorkflowResponse
from app.models.sql.workflow import VendorWorkflow as SQLVendorWorkflow, CodificationWorkflow as SQLCodificationWorkflow
from app.models.sql.vendor_master import VendorMaster
from app.models.sql.master_data import MasterRecord
from app.models.sql.user import User as SQLUser
from app.dependencies import get_current_entity

router = APIRouter(tags=["Workflow Configuration"])

# ==================== VENDOR WORKFLOW ====================

@router.get("/vendor", response_model=List[VendorWorkflowResponse])
async def get_vendor_workflows(
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(SQLVendorWorkflow).where(
        or_(
            SQLVendorWorkflow.entity == entity,
            SQLVendorWorkflow.entity == None
        )
    )
    result = await db.execute(stmt)
    workflows = result.scalars().all()
    
    return [
        VendorWorkflowResponse(
            id=str(w.id),
            vendor_id=w.vendor_id,
            vendor_name=w.vendor_name,
            entity=w.entity,
            approver_count=w.approver_count,
            mandatory_approver_1=w.mandatory_approver_1,
            mandatory_approver_2=w.mandatory_approver_2,
            mandatory_approver_3=w.mandatory_approver_3,
            amount_threshold=w.amount_threshold,
            threshold_approver=w.threshold_approver,
            optional_approver=w.optional_approver,
            updated_at=w.updated_at
        ) for w in workflows
    ]


@router.post("/vendor", response_model=VendorWorkflowResponse)
async def create_vendor_workflow(
    workflow: VendorWorkflow,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(SQLVendorWorkflow).where(
        SQLVendorWorkflow.vendor_id == workflow.vendor_id,
        SQLVendorWorkflow.entity == entity
    )
    res = await db.execute(stmt)
    if res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Workflow already exists for vendor '{workflow.vendor_id}'")
        
    new_workflow = SQLVendorWorkflow(
        vendor_id=workflow.vendor_id,
        vendor_name=workflow.vendor_name,
        entity=entity,
        approver_count=workflow.approver_count,
        mandatory_approver_1=workflow.mandatory_approver_1,
        mandatory_approver_2=workflow.mandatory_approver_2,
        mandatory_approver_3=workflow.mandatory_approver_3,
        amount_threshold=workflow.amount_threshold,
        threshold_approver=workflow.threshold_approver,
        optional_approver=workflow.optional_approver,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.add(new_workflow)
    await db.commit()
    await db.refresh(new_workflow)
    
    # Map back to response model
    return VendorWorkflowResponse(**{c.name: getattr(new_workflow, c.name) for c in new_workflow.__table__.columns if c.name != 'id'}, id=str(new_workflow.id))


@router.put("/vendor/{workflow_id}", response_model=VendorWorkflowResponse)
async def update_vendor_workflow(
    workflow_id: str,
    workflow: VendorWorkflow,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db)
):
    try:
        w_id_int = int(workflow_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid workflow ID format")
        
    stmt = select(SQLVendorWorkflow).where(SQLVendorWorkflow.id == w_id_int)
    res = await db.execute(stmt)
    existing = res.scalar_one_or_none()
    
    if not existing:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Check for duplicate vendor_id/entity combination if vendor_id is being changed
    if existing.vendor_id != workflow.vendor_id:
        duplicate_stmt = select(SQLVendorWorkflow).where(
            SQLVendorWorkflow.vendor_id == workflow.vendor_id,
            SQLVendorWorkflow.entity == entity,
            SQLVendorWorkflow.id != w_id_int
        )
        duplicate_res = await db.execute(duplicate_stmt)
        if duplicate_res.scalar_one_or_none():
            raise HTTPException(status_code=400, detail=f"Workflow already exists for vendor '{workflow.vendor_id}'")
            
    existing.vendor_id = workflow.vendor_id
    existing.vendor_name = workflow.vendor_name
    existing.entity = entity
    existing.approver_count = workflow.approver_count
    existing.mandatory_approver_1 = workflow.mandatory_approver_1
    existing.mandatory_approver_2 = workflow.mandatory_approver_2
    existing.mandatory_approver_3 = workflow.mandatory_approver_3
    existing.amount_threshold = workflow.amount_threshold
    existing.threshold_approver = workflow.threshold_approver
    existing.optional_approver = workflow.optional_approver
    existing.updated_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(existing)
    return VendorWorkflowResponse(**{c.name: getattr(existing, c.name) for c in existing.__table__.columns if c.name != 'id'}, id=str(existing.id))


@router.delete("/vendor/{workflow_id}")
async def delete_vendor_workflow(
    workflow_id: str,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db)
):
    try:
        w_id_int = int(workflow_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid workflow ID format")
        
    stmt = select(SQLVendorWorkflow).where(SQLVendorWorkflow.id == w_id_int)
    res = await db.execute(stmt)
    existing = res.scalar_one_or_none()
    if not existing:
        raise HTTPException(status_code=404, detail="Workflow not found")
        
    await db.delete(existing)
    await db.commit()
    return {"message": "Workflow deleted successfully"}


@router.get("/vendor/vendors")
async def get_workflow_vendors(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(VendorMaster).where(VendorMaster.workflow_applicable == "Yes")
    result = await db.execute(stmt)
    vendors = result.scalars().all()
    
    workflow_vendors = []
    for v in vendors:
        vendor_id_str = str(v.vendor_id) if v.vendor_id else ""
        vendor_name_str = str(v.vendor_name) if v.vendor_name else ""
        
        label = f"{vendor_id_str} - {vendor_name_str}" if v.vendor_id and v.vendor_name else vendor_name_str
        unique_val = f"{vendor_id_str}|{vendor_name_str}" if v.vendor_id and v.vendor_name else vendor_name_str
        
        workflow_vendors.append({
            "id": vendor_id_str,
            "value": unique_val,
            "label": label,
            "vendor_name": vendor_name_str
        })
    return workflow_vendors


# ==================== CODIFICATION WORKFLOW ====================

@router.get("/codification", response_model=List[CodificationWorkflowResponse])
async def get_codification_workflows(
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(SQLCodificationWorkflow).where(
        or_(
            SQLCodificationWorkflow.entity == entity,
            SQLCodificationWorkflow.entity == None
        )
    )
    result = await db.execute(stmt)
    workflows = result.scalars().all()
    
    return [
        CodificationWorkflowResponse(
            id=str(w.id),
            lob=w.lob,
            department_id=w.department_id,
            entity=w.entity,
            approver_count=w.approver_count,
            mandatory_approver_1=w.mandatory_approver_1,
            mandatory_approver_2=w.mandatory_approver_2,
            mandatory_approver_3=w.mandatory_approver_3,
            amount_threshold=w.amount_threshold,
            threshold_approver=w.threshold_approver,
            optional_approver=w.optional_approver,
            updated_at=w.updated_at
        ) for w in workflows
    ]


@router.post("/codification", response_model=CodificationWorkflowResponse)
async def create_codification_workflow(
    workflow: CodificationWorkflow,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(SQLCodificationWorkflow).where(
        SQLCodificationWorkflow.lob == workflow.lob,
        SQLCodificationWorkflow.department_id == workflow.department_id,
        SQLCodificationWorkflow.entity == entity
    )
    res = await db.execute(stmt)
    if res.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Workflow already exists for LOB '{workflow.lob}' and Department '{workflow.department_id}'")
        
    new_workflow = SQLCodificationWorkflow(
        lob=workflow.lob,
        department_id=workflow.department_id,
        entity=entity,
        approver_count=workflow.approver_count,
        mandatory_approver_1=workflow.mandatory_approver_1,
        mandatory_approver_2=workflow.mandatory_approver_2,
        mandatory_approver_3=workflow.mandatory_approver_3,
        amount_threshold=workflow.amount_threshold,
        threshold_approver=workflow.threshold_approver,
        optional_approver=workflow.optional_approver,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.add(new_workflow)
    await db.commit()
    await db.refresh(new_workflow)
    return CodificationWorkflowResponse(**{c.name: getattr(new_workflow, c.name) for c in new_workflow.__table__.columns if c.name != 'id'}, id=str(new_workflow.id))


@router.put("/codification/{workflow_id}", response_model=CodificationWorkflowResponse)
async def update_codification_workflow(
    workflow_id: str,
    workflow: CodificationWorkflow,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db)
):
    try:
        w_id_int = int(workflow_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid workflow ID format")
        
    stmt = select(SQLCodificationWorkflow).where(SQLCodificationWorkflow.id == w_id_int)
    res = await db.execute(stmt)
    existing = res.scalar_one_or_none()
    if not existing:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Check if updating to a duplicate LOB/Department combination
    if existing.lob != workflow.lob or existing.department_id != workflow.department_id:
        duplicate_stmt = select(SQLCodificationWorkflow).where(
            SQLCodificationWorkflow.lob == workflow.lob,
            SQLCodificationWorkflow.department_id == workflow.department_id,
            SQLCodificationWorkflow.entity == entity,
            SQLCodificationWorkflow.id != w_id_int
        )
        duplicate_res = await db.execute(duplicate_stmt)
        if duplicate_res.scalar_one_or_none():
            raise HTTPException(
                status_code=400,
                detail=f"Workflow already exists for LOB '{workflow.lob}' and Department '{workflow.department_id}'"
            )
            
    existing.lob = workflow.lob
    existing.department_id = workflow.department_id
    existing.entity = entity
    existing.approver_count = workflow.approver_count
    existing.mandatory_approver_1 = workflow.mandatory_approver_1
    existing.mandatory_approver_2 = workflow.mandatory_approver_2
    existing.mandatory_approver_3 = workflow.mandatory_approver_3
    existing.amount_threshold = workflow.amount_threshold
    existing.threshold_approver = workflow.threshold_approver
    existing.optional_approver = workflow.optional_approver
    existing.updated_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(existing)
    return CodificationWorkflowResponse(**{c.name: getattr(existing, c.name) for c in existing.__table__.columns if c.name != 'id'}, id=str(existing.id))


@router.delete("/codification/{workflow_id}")
async def delete_codification_workflow(
    workflow_id: str,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db)
):
    try:
        w_id_int = int(workflow_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid workflow ID format")
        
    stmt = select(SQLCodificationWorkflow).where(SQLCodificationWorkflow.id == w_id_int)
    res = await db.execute(stmt)
    existing = res.scalar_one_or_none()
    if not existing:
        raise HTTPException(status_code=404, detail="Workflow not found")
        
    await db.delete(existing)
    await db.commit()
    return {"message": "Workflow deleted successfully"}


@router.get("/codification/lobs")
async def get_lobs(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(MasterRecord).where(MasterRecord.category == "Line_Items")
    result = await db.execute(stmt)
    records = result.scalars().all()
    
    lobs = {}
    for r in records:
        row = r.data # Assuming 'data' is a JSON field
        lob_id = None
        # Flexible field matching (from original logic)
        for key in ["LOB ID", "LOBID", "LOB", "LineOfBusiness", "Line of Business", "LineOfBiz"]:
            if key in row and row[key]:
                lob_id = str(row[key]).strip()
                break
            else:
                for rk in row.keys():
                    if rk.lower().replace("_", "").replace(" ", "") == key.lower().replace("_", "").replace(" ", ""):
                        if row[rk]:
                            lob_id = str(row[rk]).strip()
                            break
            if lob_id: break
        
        lob_name = None
        for key in ["Name", "LOB Name", "LOBName", "Description"]:
            if key in row and row[key]:
                lob_name = str(row[key]).strip()
                break
            else:
                for rk in row.keys():
                    if rk.lower().replace("_", "").replace(" ", "") == key.lower().replace("_", "").replace(" ", ""):
                        if row[rk]:
                            lob_name = str(row[rk]).strip()
                            break
            if lob_name: break

        if lob_id:
            label = f"{lob_id} - {lob_name}" if lob_name else lob_id
            lobs[lob_id] = label
            
    return [{"value": vid, "label": lbl} for vid, lbl in sorted(lobs.items())]


@router.get("/codification/departments")
async def get_departments(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(MasterRecord).where(MasterRecord.category == "Line_Items")
    result = await db.execute(stmt)
    records = result.scalars().all()
    
    departments = {}
    for r in records:
        row = r.data # Assuming 'data' is a JSON field
        dept_id = None
        # Flexible field matching (from original logic)
        for key in ["Department ID", "DepartmentID", "department_id", "dept_id", "Dept ID", "Department_ID", "Dept"]:
            if key in row and row[key]:
                dept_id = str(row[key]).strip()
                break
            else:
                for rk in row.keys():
                    if rk.lower().replace("_", "").replace(" ", "") == key.lower().replace("_", "").replace(" ", ""):
                        if row[rk]:
                            dept_id = str(row[rk]).strip()
                            break
            if dept_id: break
        
        dept_name = None
        for key in ["Department name", "Department Name", "DeptName", "Name"]:
            if key in row and row[key]:
                dept_name = str(row[key]).strip()
                break
            else:
                for rk in row.keys():
                    if rk.lower().replace("_", "").replace(" ", "") == key.lower().replace("_", "").replace(" ", ""):
                        if row[rk]:
                            dept_name = str(row[rk]).strip()
                            break
            if dept_name: break

        if dept_id:
            label = f"{dept_id} - {dept_name}" if dept_name else dept_id
            departments[dept_id] = label
            
    return [{"value": did, "label": lbl} for did, lbl in sorted(departments.items())]


# ==================== APPROVERS ====================

@router.get("/approvers")
async def get_approvers(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(SQLUser).where(and_(SQLUser.role == "approver", SQLUser.status == "active"))
    result = await db.execute(stmt)
    approvers = result.scalars().all()
    
    return [
        {
            "value": a.email,
            "label": f"{a.username or a.email.split('@')[0]} ({a.email})"
        } for a in approvers
    ]
