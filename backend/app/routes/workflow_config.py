from fastapi import APIRouter, HTTPException, Depends
from bson import ObjectId
from datetime import datetime
from typing import List, Optional
from app.database.mongodb import get_database
from app.auth.jwt import get_current_user
from app.models.user import UserResponse
from app.models.workflow_vendor import VendorWorkflow, VendorWorkflowResponse
from app.models.workflow_codification import CodificationWorkflow, CodificationWorkflowResponse

from app.dependencies import get_current_entity

router = APIRouter(tags=["Workflow Configuration"])

# ==================== VENDOR WORKFLOW ====================

@router.get("/vendor", response_model=List[VendorWorkflowResponse])
async def get_vendor_workflows(
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """Get all vendor workflows for the current entity"""
    db = get_database()
    
    workflows = list(db.vendor_workflows.find({
        "$or": [
            {"entity": entity},
            {"entity": {"$exists": False}}
        ]
    }))
    
    for workflow in workflows:
        workflow["id"] = str(workflow["_id"])
        del workflow["_id"]
    
    return workflows


@router.post("/vendor", response_model=VendorWorkflowResponse)
async def create_vendor_workflow(
    workflow: VendorWorkflow,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """Create a new vendor workflow"""
    db = get_database()
    
    # Check if workflow already exists for this vendor and entity
    existing = db.vendor_workflows.find_one({
        "vendor_name": workflow.vendor_name,
        "entity": entity
    })
    
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Workflow already exists for vendor '{workflow.vendor_name}'"
        )
    
    print(f"[DEBUG] Creating vendor workflow for {workflow.vendor_name} entity {entity}")
    workflow_dict = workflow.dict()
    workflow_dict["entity"] = entity
    workflow_dict["created_at"] = datetime.utcnow()
    workflow_dict["updated_at"] = datetime.utcnow()
    
    result = db.vendor_workflows.insert_one(workflow_dict)
    workflow_dict["id"] = str(result.inserted_id)
    del workflow_dict["_id"]
    return workflow_dict


@router.put("/vendor/{workflow_id}", response_model=VendorWorkflowResponse)
async def update_vendor_workflow(
    workflow_id: str,
    workflow: VendorWorkflow,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """Update an existing vendor workflow"""
    db = get_database()
    
    # Check if workflow exists
    # Loosen entity check
    existing = db.vendor_workflows.find_one({
        "_id": ObjectId(workflow_id),
        "$or": [
            {"entity": entity},
            {"entity": {"$exists": False}}
        ]
    })
    
    if not existing:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    workflow_dict = workflow.dict()
    workflow_dict["entity"] = entity
    workflow_dict["updated_at"] = datetime.utcnow()
    workflow_dict["created_at"] = existing.get("created_at", datetime.utcnow())
    
    db.vendor_workflows.update_one(
        {"_id": ObjectId(workflow_id)},
        {"$set": workflow_dict}
    )
    
    workflow_dict["id"] = workflow_id
    return workflow_dict


@router.delete("/vendor/{workflow_id}")
async def delete_vendor_workflow(
    workflow_id: str,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """Delete a vendor workflow"""
    db = get_database()
    
    # Loosen entity check: allow if document has matching entity OR no entity field at all
    result = db.vendor_workflows.delete_one({
        "_id": ObjectId(workflow_id),
        "$or": [
            {"entity": entity},
            {"entity": {"$exists": False}}
        ]
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    return {"message": "Workflow deleted successfully"}


@router.get("/vendor/vendors")
async def get_workflow_vendors(
    current_user: UserResponse = Depends(get_current_user)
):
    """Get all vendors with workflow_applicable = 'Yes' from Vendor Master"""
    db = get_database()
    print("[DEBUG] Fetching workflow vendors...")
    
    # 1. Targeted search for Vendor_Master tab
    meta = db.excel_files.find_one({"tab_name": "Vendor_Master"})
    if not meta or "sheets" not in meta or not meta["sheets"]:
        print("[DEBUG] No Vendor_Master metadata found")
        return []
    
    vendor_collection = meta["sheets"][0].get("collection_name")
    if not vendor_collection:
        print("[DEBUG] No collection name for Vendor_Master")
        return []
    
    print(f"[DEBUG] Loading from collection: {vendor_collection}")
    chunks = list(db[vendor_collection].find())
    
    workflow_vendors = []
    for chunk in chunks:
        rows = chunk.get("rows", [])
        for vendor in rows:
            # Flexible field matching for Workflow Eligibility / Applicability
            workflow_applicable = None
            for key in vendor.keys():
                kl = key.lower()
                if "workflow" in kl and ("applicable" in kl or "applicability" in kl or "eligible" in kl or "eligibility" in kl):
                    workflow_applicable = vendor[key]
                    break
            
            vendor_name = None
            for key in ["VENDOR_NAME", "Vendor Name", "VendorName", "Name", "vendor_name"]:
                if key in vendor:
                    vendor_name = vendor[key]
                    break
            
            vendor_id = None
            for key in ["VENDOR_ID", "Vendor ID", "VendorID", "vendor_id", "Customer_Id"]:
                if key in vendor:
                    vendor_id = vendor[key]
                    break
            
            # Strictly only show if explicitly 'Yes'
            if vendor_name:
                is_applicable = str(workflow_applicable).strip().lower() == "yes"
                if is_applicable:
                    label = f"{vendor_id} - {vendor_name}" if vendor_id else str(vendor_name)
                    workflow_vendors.append({
                        "id": str(vendor_id) if vendor_id else "",
                        "value": str(vendor_name),
                        "label": label
                    })
    
    # Remove duplicates
    unique_vendors = []
    seen = set()
    for v in workflow_vendors:
        if v["value"] not in seen:
            unique_vendors.append(v)
            seen.add(v["value"])
    
    print(f"[DEBUG] Found {len(unique_vendors)} unique vendors")
    return unique_vendors


# ==================== CODIFICATION WORKFLOW ====================

@router.get("/codification", response_model=List[CodificationWorkflowResponse])
async def get_codification_workflows(
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """Get all codification workflows for the current entity"""
    db = get_database()
    
    workflows = list(db.codification_workflows.find({
        "$or": [
            {"entity": entity},
            {"entity": {"$exists": False}}
        ]
    }))
    
    for workflow in workflows:
        workflow["id"] = str(workflow["_id"])
        del workflow["_id"]
    
    return workflows


@router.post("/codification", response_model=CodificationWorkflowResponse)
async def create_codification_workflow(
    workflow: CodificationWorkflow,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """Create a new codification workflow"""
    db = get_database()
    
    # Check if workflow already exists for this LOB/Department combination
    existing = db.codification_workflows.find_one({
        "lob": workflow.lob,
        "department_id": workflow.department_id,
        "entity": entity
    })
    
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Workflow already exists for LOB '{workflow.lob}' and Department '{workflow.department_id}'"
        )
    
    print(f"[DEBUG] Creating codification workflow for LOB {workflow.lob} Dept {workflow.department_id} entity {entity}")
    workflow_dict = workflow.dict()
    workflow_dict["entity"] = entity
    workflow_dict["created_at"] = datetime.utcnow()
    workflow_dict["updated_at"] = datetime.utcnow()
    
    result = db.codification_workflows.insert_one(workflow_dict)
    workflow_dict["id"] = str(result.inserted_id)
    del workflow_dict["_id"]
    
    return workflow_dict


@router.put("/codification/{workflow_id}", response_model=CodificationWorkflowResponse)
async def update_codification_workflow(
    workflow_id: str,
    workflow: CodificationWorkflow,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """Update an existing codification workflow"""
    db = get_database()
    
    # Check if workflow exists
    # Loosen entity check
    existing = db.codification_workflows.find_one({
        "_id": ObjectId(workflow_id),
        "$or": [
            {"entity": entity},
            {"entity": {"$exists": False}}
        ]
    })
    
    if not existing:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Check if updating to a duplicate LOB/Department combination
    if existing["lob"] != workflow.lob or existing["department_id"] != workflow.department_id:
        duplicate = db.codification_workflows.find_one({
            "lob": workflow.lob,
            "department_id": workflow.department_id,
            "entity": entity,
            "_id": {"$ne": ObjectId(workflow_id)}
        })
        
        if duplicate:
            raise HTTPException(
                status_code=400,
                detail=f"Workflow already exists for LOB '{workflow.lob}' and Department '{workflow.department_id}'"
            )
    
    workflow_dict = workflow.dict()
    workflow_dict["entity"] = entity
    workflow_dict["updated_at"] = datetime.utcnow()
    workflow_dict["created_at"] = existing.get("created_at", datetime.utcnow())
    
    db.codification_workflows.update_one(
        {"_id": ObjectId(workflow_id)},
        {"$set": workflow_dict}
    )
    
    workflow_dict["id"] = workflow_id
    return workflow_dict


@router.delete("/codification/{workflow_id}")
async def delete_codification_workflow(
    workflow_id: str,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """Delete a codification workflow"""
    db = get_database()
    
    # Loosen entity check
    result = db.codification_workflows.delete_one({
        "_id": ObjectId(workflow_id),
        "$or": [
            {"entity": entity},
            {"entity": {"$exists": False}}
        ]
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    return {"message": "Workflow deleted successfully"}


@router.get("/codification/lobs")
async def get_lobs(
    current_user: UserResponse = Depends(get_current_user)
):
    """Get all unique LOBs from master data using flexible matching (same as CodingReview)"""
    db = get_database()
    print("[DEBUG] Fetching LOBs with flexible matching...")
    
    lobs = {}
    files = list(db.excel_files.find())
    
    # 1. Broad Search: Look in any collection that might have LOB data
    # CodingReview looks for "Line_Items" or any sheet with "LOB" in the name
    for file in files:
        sheets = file.get("sheets", [])
        for sheet in sheets:
            sheet_name = sheet.get("name", "").lower()
            tab_name = file.get("tab_name", "").lower()
            
            # Match Line_Items tab or any sheet with 'lob' in the name
            if "line_items" in tab_name or "lob" in sheet_name:
                col_name = sheet.get("collection_name")
                if not col_name: continue
                
                chunks = list(db[col_name].find())
                for chunk in chunks:
                    for row in chunk.get("rows", []):
                        # Flexible field matching (from CodingReview logic)
                        lob_id = None
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
                            # We use lob_id as the value for the workflow rule
                            lobs[lob_id] = label
    
    print(f"[DEBUG] Found {len(lobs)} LOBs")
    return [{"value": vid, "label": lbl} for vid, lbl in sorted(lobs.items())]


@router.get("/codification/departments")
async def get_departments(
    current_user: UserResponse = Depends(get_current_user)
):
    """Get all unique Department IDs from master data using flexible matching (same as CodingReview)"""
    db = get_database()
    print("[DEBUG] Fetching Departments with flexible matching...")
    
    departments = {}
    files = list(db.excel_files.find())
    
    for file in files:
        sheets = file.get("sheets", [])
        for sheet in sheets:
            sheet_name = sheet.get("name", "").lower()
            tab_name = file.get("tab_name", "").lower()
            
            # Match Line_Items tab or any sheet with 'department' in the name
            if "line_items" in tab_name or "department" in sheet_name or "dept" in sheet_name:
                col_name = sheet.get("collection_name")
                if not col_name: continue
                
                chunks = list(db[col_name].find())
                for chunk in chunks:
                    for row in chunk.get("rows", []):
                        # Flexible field matching
                        dept_id = None
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
    
    print(f"[DEBUG] Found {len(departments)} Departments")
    return [{"value": did, "label": lbl} for did, lbl in sorted(departments.items())]


# ==================== APPROVERS ====================

@router.get("/approvers")
async def get_approvers(
    current_user: UserResponse = Depends(get_current_user)
):
    """Get all users who can act as approvers (Strict: role='approver' and status='active')"""
    db = get_database()
    print("[DEBUG] Fetching active approvers...")
    
    approvers = list(db.users.find({
        "role": "approver",
        "status": "active"
    }))
    
    entity_approvers = []
    for approver in approvers:
        email = approver.get("email")
        if email:
            entity_approvers.append({
                "value": email,
                "label": f"{approver.get('username', email.split('@')[0])} ({email})"
            })
    
    print(f"[DEBUG] Found {len(entity_approvers)} active approvers")
    return entity_approvers
