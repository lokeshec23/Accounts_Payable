from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, status
from fastapi.responses import FileResponse
from typing import List
from app.services.invoice_processor import InvoiceProcessor
from app.models.invoice import InvoiceCreate, InvoiceResponse, InvoiceStatus, InvoiceUpdate
from app.models.workflow import WorkflowStepType, WorkflowStepStatus
from app.database.mongodb import get_database
from app.auth.jwt import get_current_user
from app.dependencies import get_current_entity
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
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
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
                status=InvoiceStatus.PROCESSED,
                entity=entity
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
                "comment": None,
                "entity": entity  # Store entity in workflow step too?
            }
            db.workflow_steps.insert_one(workflow_step)

            # ---- PREPARE JSON SAFE RESPONSE ----
            invoice_dict.update(update_data)
            invoice_dict["id"] = invoice_id
            invoice_dict.pop("_id", None)  # ❗ remove ObjectId

            saved_invoices.append(invoice_dict)

        except Exception as e:
            import traceback
            print(f"❌ ERROR processing file {file.filename}: {e}")
            traceback.print_exc()
            continue

    return {
        "count": len(saved_invoices),
        "invoices": saved_invoices
    }

@router.get("/", response_model=List[InvoiceResponse])
async def get_invoices(
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    skip: int = 0,
    limit: int = 10,
    show_all: bool = True
):
    db = get_database()

    query = {"entity": entity}
    if not show_all:
        query["uploaded_by"] = current_user.username

    invoices = db.invoices.find(query).sort("uploaded_at", -1).skip(skip).limit(limit)

    invoice_list = []
    for invoice in invoices:
        invoice["id"] = str(invoice["_id"])
        invoice_list.append(InvoiceResponse(**invoice))

    return invoice_list


@router.get("/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: str,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    db = get_database()

    invoice = db.invoices.find_one({"_id": ObjectId(invoice_id), "entity": entity})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    invoice["id"] = str(invoice["_id"])
    return InvoiceResponse(**invoice)

@router.get("/debug/raw/{invoice_id}")
async def get_raw_invoice(invoice_id: str):
    db = get_database()
    invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
    if not invoice:
        return {"error": "Not found"}
    invoice["_id"] = str(invoice["_id"])
    return invoice


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

    invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    status_history = invoice.get("status_history", [])

    # =====================================================
    # 1️⃣ FIND CURRENT APPROVAL CYCLE (AFTER LAST REWORK)
    # =====================================================
    last_rework_index = -1
    for i in range(len(status_history) - 1, -1, -1):
        if status_history[i]["status"] == InvoiceStatus.REWORKED:
            last_rework_index = i
            break

    current_cycle_history = (
        status_history[last_rework_index + 1 :]
        if last_rework_index != -1
        else status_history
    )

    # =====================================================
    # 2️⃣ BLOCK DOUBLE ACTION IN SAME CYCLE
    # =====================================================
    already_acted = any(
        h["user"] == approver_name and
        h["status"] in [
            InvoiceStatus.APPROVED,
            InvoiceStatus.REJECTED,
            InvoiceStatus.REWORKED
        ]
        for h in current_cycle_history
    )

    if already_acted and status in [
        InvoiceStatus.APPROVED,
        InvoiceStatus.REJECTED,
        InvoiceStatus.REWORKED
    ]:
        raise HTTPException(
            status_code=400,
            detail=f"User {approver_name} has already taken action in this approval cycle."
        )

    # =====================================================
    # 3️⃣ PREPARE STATUS ENTRY
    # =====================================================
    new_status_entry = {
        "status": status,
        "user": approver_name,
        "timestamp": timestamp,
        "comment": comment
    }

    main_status = InvoiceStatus.WAITING_APPROVAL
    extra_fields = {}

    # =====================================================
    # 4️⃣ WAITING_CODING (RECALL)
    # =====================================================
    if status == InvoiceStatus.WAITING_CODING:
        main_status = InvoiceStatus.WAITING_CODING

        db.workflow_steps.delete_many({
            "invoice_id": invoice_id,
            "step_type": WorkflowStepType.CODING
        })

        db.invoices.update_one(
            {"_id": ObjectId(invoice_id)},
            {
                "$set": {"status": main_status, "validation_results": {}, "approved_by": []},
                "$push": {"status_history": new_status_entry}
            }
        )
        return {"message": "Status updated", "main_status": main_status}

    # =====================================================
    # 5️⃣ REJECT / REWORK
    # =====================================================
    if status in [InvoiceStatus.REJECTED, InvoiceStatus.REWORKED]:
        main_status = status

    # =====================================================
    # 6️⃣ APPROVAL LOGIC (CYCLE AWARE)
    # =====================================================
    elif status == InvoiceStatus.APPROVED:
        from app.routes.workflow import (
            get_vendor_name_from_invoice,
            get_required_approver_count,
            get_invoice_total_from_invoice
        )

        vendor_name = get_vendor_name_from_invoice(db, invoice_id)
        total_amount = get_invoice_total_from_invoice(db, invoice_id)
        currency = invoice.get("extracted_data", {}).get("invoice_details", {}).get("currency", {}).get("value", "USD")

        requirement_data = get_required_approver_count(
            db, vendor_name, total_amount, invoice_id, invoice_data=invoice, currency=currency, entity=invoice.get("entity")
        )
        required_approvers = requirement_data["required"]

        # ✅ COUNT ONLY CURRENT CYCLE APPROVALS
        approvals = sum(
            1 for h in current_cycle_history
            if h["status"] == InvoiceStatus.APPROVED
        ) + 1  # include current approval

        if approvals >= required_approvers:
            main_status = InvoiceStatus.APPROVED
        else:
            main_status = InvoiceStatus.WAITING_APPROVAL

    # =====================================================
    # 7️⃣ SAVE INVOICE
    # =====================================================
    # =====================================================
    # 7️⃣ SAVE INVOICE
    # =====================================================
    
    # Per-Approver Visibility Logic
    # (handled by explicit operators in update_query construction below)
    pass

    # Update operation construction
    update_query = {
        "$set": {
            "status": main_status,
            "validation_results.approver_name": approver_name,
            "validation_results.approval_timestamp": timestamp.isoformat(),
            "validation_results.last_action": status,
            "validation_results.approver_comment": comment,
            **extra_fields
        },
        "$push": {"status_history": new_status_entry}
    }

    # Add specific operator for approved_by
    if status == InvoiceStatus.APPROVED:
         update_query["$addToSet"] = {"approved_by": current_user.email}
    elif status in [InvoiceStatus.REJECTED, InvoiceStatus.REWORKED, InvoiceStatus.WAITING_CODING]:
         update_query["$set"]["approved_by"] = []

    db.invoices.update_one(
        {"_id": ObjectId(invoice_id)},
        update_query
    )

    # =====================================================
    # 8️⃣ CREATE WORKFLOW STEP (RESET AFTER REWORK)
    # =====================================================
    if status in [
        InvoiceStatus.APPROVED,
        InvoiceStatus.REJECTED,
        InvoiceStatus.REWORKED
    ]:
        # ✅ COUNT APPROVERS IN *CURRENT CYCLE ONLY*
        cycle_approvals = [
            h for h in current_cycle_history
            if h["status"] == InvoiceStatus.APPROVED
        ]

        approver_number = reminder = len(cycle_approvals) + 1

        step_type_map = {
            1: WorkflowStepType.APPROVER_1,
            2: WorkflowStepType.APPROVER_2,
            3: WorkflowStepType.APPROVER_3,
            4: WorkflowStepType.APPROVER_4
        }

        workflow_status = WorkflowStepStatus.APPROVED
        if status == InvoiceStatus.REJECTED:
            workflow_status = WorkflowStepStatus.REJECTED
        elif status == InvoiceStatus.REWORKED:
            workflow_status = WorkflowStepStatus.REWORKED

        db.workflow_steps.insert_one({
            "invoice_id": invoice_id,
            "step_name": f"{approver_number}{['st','nd','rd','th'][min(approver_number-1,3)]} Approver",
            "step_type": step_type_map.get(approver_number, WorkflowStepType.APPROVER_4),
            "user": approver_name,
            "status": workflow_status,
            "timestamp": timestamp,
            "approver_number": approver_number,
            "comment": comment
        })

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

    
    # Check if status is being updated to WAITING_APPROVAL in generic update
    if "status" in update_data and update_data["status"] == InvoiceStatus.WAITING_APPROVAL:
        print(f"DEBUG: Generic update setting status to WAITING_APPROVAL for {invoice_id}")
        existing_req = invoice.get("required_approvers")
        
        if existing_req is not None:
             print(f"DEBUG: Using persisted approver count (Generic Update): {existing_req}")
             # Ensure these are preserved/set if passed, implicitly they might be missing from update_data
             # If update_data doesn't have them, we don't need to add them if they are already in DB?
             # No, update_data overwrites. If we don't include them, update_one only sets what is in update_data.
             # but we want to ensure they are NOT cleared? No, update_data only keys are updated.
             # We want to Ensure they are PRESENT if we are "transitioning" effectively.
             # Actually, if the DB has them, we don't need to do anything.
             pass
        else:
             print("DEBUG: Calculating FRESH approver count (Generic Update)")
             from app.routes.workflow import get_vendor_name_from_invoice, get_required_approver_count, get_invoice_total_from_invoice
             
             vendor_name = get_vendor_name_from_invoice(db, invoice_id)
             total_amount = get_invoice_total_from_invoice(db, invoice_id)
             currency = invoice.get("extracted_data", {}).get("invoice_details", {}).get("currency", {}).get("value", "USD")
             requirement_data = get_required_approver_count(db, vendor_name, total_amount, invoice_id, currency=currency, entity=invoice.get("entity"))
             
             update_data["required_approvers"] = requirement_data["required"]
             update_data["approver_breakdown"] = requirement_data["breakdown"]

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
