from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, status
from fastapi.responses import FileResponse
from typing import List
from app.services.invoice_processor import InvoiceProcessor
from app.models.invoice import InvoiceCreate, InvoiceResponse, InvoiceStatus, InvoiceUpdate
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
                status=InvoiceStatus.WAITING_APPROVAL
            )

            invoice_dict = invoice_data.dict()
            invoice_dict["uploaded_at"] = datetime.utcnow()
            invoice_dict["extracted_data"] = {}
            invoice_dict["processing_steps"] = []

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
    current_user: UserResponse = Depends(get_current_user)
):
    db = get_database()

    approver_name = current_user.username
    timestamp = datetime.utcnow().isoformat()

    db.invoices.update_one(
        {"_id": ObjectId(invoice_id)},
        {"$set": {
            "status": status,
            "validation_results.approver_name": approver_name,
            "validation_results.approval_timestamp": timestamp,
            "validation_results.last_action": status
        }}
    )

    return {"message": "Status updated"}


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
