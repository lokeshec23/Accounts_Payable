from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, status
from fastapi.responses import FileResponse
from typing import List
from app.services.invoice_processor import InvoiceProcessor
from app.models.invoice import InvoiceCreate, InvoiceResponse, InvoiceStatus, InvoiceUpdate
from app.models.workflow import WorkflowStepType, WorkflowStepStatus
from app.database.mongodb import get_database
from app.auth.jwt import get_current_user
from app.models.user import UserResponse
from datetime import datetime
import os
from bson.objectid import ObjectId
import uuid

router = APIRouter()
invoice_processor = InvoiceProcessor()


@router.post("/upload")
async def upload_invoices(
    files: List[UploadFile] = File(...),
    current_user: UserResponse = Depends(get_current_user)
):
    db = get_database()
    saved_invoices = []

    upload_dir = "uploads"
    os.makedirs(upload_dir, exist_ok=True)

    for file in files:
        try:
            # ---- CLEAN FILENAME ----
            clean_name = file.filename.replace("\\", "/").split("/")[-1]

            new_name = f"{uuid.uuid4()}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{clean_name}"
            file_path = os.path.join(upload_dir, new_name)

            # ---- SAVE FILE ----
            with open(file_path, "wb") as f:
                f.write(await file.read())

            # ---- CREATE DB RECORD ----
            invoice_data = InvoiceCreate(
                filename=new_name,
                original_filename=clean_name,
                file_path=file_path,
                uploaded_by=current_user.username,
                status=InvoiceStatus.PROCESSED
            )

            invoice_dict = invoice_data.dict()
            invoice_dict["uploaded_at"] = datetime.utcnow()
            invoice_dict["extracted_data"] = {}
            invoice_dict["processing_steps"] = []
            invoice_dict["status_history"] = [{
                "status": InvoiceStatus.PROCESSED,
                "user": current_user.username,
                "timestamp": datetime.utcnow(),
                "comment": None
            }]

            result = db.invoices.insert_one(invoice_dict)
            invoice_id = str(result.inserted_id)

            # ---- RUN EXTRACTION ----
            extraction = invoice_processor.process_invoice_extraction(file_path)

            update_data = {
                "extracted_data": extraction.get("extracted_data", {}),
                "processing_steps": extraction.get("processing_steps", []),
                "validation_results": extraction.get("validation_results", {}),
                "confidence_score": extraction.get("metadata", {}).get("confidence_score", "low"),
                "processed_at": datetime.utcnow()
            }

            db.invoices.update_one({"_id": result.inserted_id}, {"$set": update_data})

            # ---- CREATE WORKFLOW STEP: PROCESSED ----
            workflow_step = {
                "invoice_id": invoice_id,
                "step_name": "Processed",
                "step_type": WorkflowStepType.PROCESSED,
                "user": current_user.username,
                "status": WorkflowStepStatus.COMPLETED,
                "timestamp": datetime.utcnow(),
                "approver_number": None,
                "comment": None
            }
            db.workflow_steps.insert_one(workflow_step)

            # ---- PREPARE JSON SAFE RESPONSE ----
            invoice_dict.update(update_data)
            invoice_dict["id"] = invoice_id
            invoice_dict.pop("_id", None)  # ❗ remove ObjectId

            saved_invoices.append(invoice_dict)

        except Exception as e:
            print("Error processing file:", e)
            continue

    return {
        "count": len(saved_invoices),
        "invoices": saved_invoices
    }

@router.get("/", response_model=List[InvoiceResponse])
async def get_invoices(
    current_user: UserResponse = Depends(get_current_user),
    skip: int = 0,
    limit: int = 10,
    show_all: bool = True
):
    db = get_database()

    if show_all:
        invoices = db.invoices.find().sort("uploaded_at", -1).skip(skip).limit(limit)
    else:
        invoices = db.invoices.find(
            {"uploaded_by": current_user.username}
        ).sort("uploaded_at", -1).skip(skip).limit(limit)

    invoice_list = []
    for invoice in invoices:
        invoice["id"] = str(invoice["_id"])
        invoice_list.append(InvoiceResponse(**invoice))

    return invoice_list


@router.get("/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    db = get_database()

    invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    invoice["id"] = str(invoice["_id"])
    return InvoiceResponse(**invoice)


@router.get("/{invoice_id}/pdf")
async def get_invoice_pdf(
    invoice_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    db = get_database()

    invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    file_path = invoice.get("file_path")
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="PDF file not found")

    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=invoice.get("original_filename", "invoice.pdf")
    )

@router.put("/{invoice_id}/status")
async def update_invoice_status(
    invoice_id: str,
    status: InvoiceStatus,
    comment: str = None,
    current_user: UserResponse = Depends(get_current_user)
):
    db = get_database()

    approver_name = current_user.username
    timestamp = datetime.utcnow()

    # Get current invoice
    invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Check if current user has already approved/rejected this invoice
    status_history = invoice.get("status_history", [])
    user_actions = [entry for entry in status_history 
                   if entry.get("user") == approver_name 
                   and entry.get("status") in ["approved", "rejected", "reworked"]]
    
    if user_actions and status in [InvoiceStatus.APPROVED, InvoiceStatus.REJECTED, InvoiceStatus.REWORKED]:
        raise HTTPException(
            status_code=400,
            detail=f"User {approver_name} has already taken action on this invoice."
        )

    # Append new action to status_history
    new_status_entry = {
        "status": status,
        "user": approver_name,
        "timestamp": timestamp,
        "comment": comment
    }
    
    # Determine the main status field based on action and approver count
    main_status = InvoiceStatus.WAITING_APPROVAL  # Default: keep waiting
    
    if status in [InvoiceStatus.REJECTED, InvoiceStatus.REWORKED]:
        # Rejection or rework immediately changes status
        main_status = status
    elif status == InvoiceStatus.APPROVED:
        # Check if all required approvers have approved
        # Check if all required approvers have approved
        from app.routes.workflow import get_vendor_name_from_invoice, get_required_approver_count, get_invoice_total_from_invoice
        vendor_name = get_vendor_name_from_invoice(db, invoice_id)
        total_amount = get_invoice_total_from_invoice(db, invoice_id)
        required_approvers = get_required_approver_count(db, vendor_name, total_amount)
        
        # Count approvals in status_history (including this one)
        approvals = sum(1 for entry in status_history if entry.get("status") == "approved")
        approvals += 1  # Current approval
        
        if approvals >= required_approvers:
            # All approvers have approved - change to approved
            main_status = InvoiceStatus.APPROVED
        else:
            # More approvers needed - keep waiting_approval
            main_status = InvoiceStatus.WAITING_APPROVAL
    
    db.invoices.update_one(
        {"_id": ObjectId(invoice_id)},
        {
            "$set": {
                "status": main_status,
                "validation_results.approver_name": approver_name,
                "validation_results.approval_timestamp": timestamp.isoformat(),
                "validation_results.last_action": status,
                "validation_results.approver_comment": comment
            },
            "$push": {"status_history": new_status_entry}
        }
    )

    # ---- CREATE WORKFLOW STEP FOR APPROVAL/REJECTION ----
    if status in [InvoiceStatus.APPROVED, InvoiceStatus.REJECTED, InvoiceStatus.REWORKED]:
        # Determine which approver number this is
        existing_approvers = list(db.workflow_steps.find({
            "invoice_id": invoice_id,
            "step_type": {"$in": ["approver_1", "approver_2", "approver_3", "approver_4"]}
        }))
        
        approver_number = len(existing_approvers) + 1
        
        # Map approver number to step type
        step_type_map = {
            1: WorkflowStepType.APPROVER_1,
            2: WorkflowStepType.APPROVER_2,
            3: WorkflowStepType.APPROVER_3,
            4: WorkflowStepType.APPROVER_4
        }
        
        # Map status to workflow status
        workflow_status = WorkflowStepStatus.APPROVED
        if status == InvoiceStatus.REJECTED:
            workflow_status = WorkflowStepStatus.REJECTED
        elif status == InvoiceStatus.REWORKED:
            workflow_status = WorkflowStepStatus.REWORKED
        
        workflow_step = {
            "invoice_id": invoice_id,
            "step_name": f"{approver_number}{['st', 'nd', 'rd', 'th'][min(approver_number-1, 3)]} Approver",
            "step_type": step_type_map.get(approver_number, WorkflowStepType.APPROVER_4),
            "user": approver_name,
            "status": workflow_status,
            "timestamp": timestamp,
            "approver_number": approver_number,
            "comment": comment
        }
        db.workflow_steps.insert_one(workflow_step)

    return {"message": "Status updated", "main_status": main_status}


@router.put("/{invoice_id}")
async def update_invoice(
    invoice_id: str,
    invoice_update: InvoiceUpdate,
    current_user: UserResponse = Depends(get_current_user)
):
    db = get_database()

    update_data = {k: v for k, v in invoice_update.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")

    invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # merge validation
    if "validation_results" in update_data:
        existing_validation = invoice.get("validation_results", {}) or {}
        update_data["validation_results"] = {
            **existing_validation,
            **update_data["validation_results"]
        }

    db.invoices.update_one(
        {"_id": ObjectId(invoice_id)},
        {"$set": update_data}
    )

    updated_invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
    updated_invoice["id"] = str(updated_invoice["_id"])

    return InvoiceResponse(**updated_invoice)


@router.delete("/{invoice_id}")
async def delete_invoice(
    invoice_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    db = get_database()

    invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    db.invoices.delete_one({"_id": ObjectId(invoice_id)})

    return {"message": "Invoice deleted successfully"}
