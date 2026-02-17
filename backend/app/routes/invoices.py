from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, status
from fastapi.responses import FileResponse
from typing import List
from app.services.invoice_processor import InvoiceProcessor
from app.services.line_grouping import aggregate_items
from app.models.invoice import InvoiceCreate, InvoiceResponse, InvoiceStatus, InvoiceUpdate
from app.models.workflow import WorkflowStepType, WorkflowStepStatus
from app.database.database import get_db
from sqlalchemy.orm import Session
from app.middleware.logger import logger


from app.models.db_models import (
    Invoice, WorkflowStep, WorkflowStepTypeEnum, 
    WorkflowStepStatusEnum, InvoiceStatusEnum, InvoiceStatusHistory,
    VendorMetadata, RawExtractionData
)
from app.database.db_utils import (
    invoice_to_dict, serialize_json_field, deserialize_json_field
)
from app.auth.jwt import get_current_user
from app.dependencies import get_current_entity
from app.models.user import UserResponse
from datetime import datetime
import os
import uuid
import asyncio
from app.services.audit_service import audit_service
from app.models.audit_log import AuditAction

router = APIRouter()
invoice_processor = InvoiceProcessor()


@router.post("/check-duplicate")
async def check_duplicate_invoice_endpoint(
    payload: dict,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    db: Session = Depends(get_db)
):
    from app.utils.invoice_registry import check_registry_duplicate
    from app.ai.duplicate_detector import check_duplicate_invoice

    vendor_id = payload.get("vendor_id")
    invoice_number = payload.get("invoice_number")
    current_invoice_id = payload.get("current_invoice_id")
    
    if not vendor_id or not invoice_number:
         return {"is_duplicate": False}

    # 1. Try Fast Registry Lookup
    existing = check_registry_duplicate(db, vendor_id, invoice_number, entity)
    
    # 2. Fallback to Direct Collection Lookup (if registry empty or out of sync)
    if not existing:
        existing = check_duplicate_invoice(db, vendor_id, invoice_number, entity)

    if existing:
        # Check if it is the SAME invoice
        if current_invoice_id and str(existing.get("id")) == str(current_invoice_id):
             return {"is_duplicate": False}
             
        uploaded_date = existing.get("uploaded_at")
        date_str = uploaded_date.strftime("%Y-%m-%d %H:%M") if uploaded_date else "N/A"
        
        return {
            "is_duplicate": True,
            "message": f"Duplicate found: Vendor '{existing.get('vendor_name', vendor_id)}', Invoice #{invoice_number} (Uploaded {date_str})",
            "original_invoice_id": str(existing.get("id"))
        }

    return {"is_duplicate": False}



@router.post("/upload")
async def upload_invoices(
    files: List[UploadFile] = File(...),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    db: Session = Depends(get_db)
):
    from app.ai.duplicate_detector import (
        get_vendor_id_from_master
    )
    from app.utils.invoice_registry import check_registry_duplicate, register_invoice
    upload_dir = "uploads"
    os.makedirs(upload_dir, exist_ok=True)

    duplicates = []  # Track duplicate files
    saved_invoices = []  # Track successfully uploaded invoices
    failed_uploads = []  # Track failed uploads

    async def _process_single_file(file: UploadFile):
        request_id = str(uuid.uuid4())

        clean_name = file.filename.replace("\\", "/").split("/")[-1]
        file_path = None
        try:
            import time
            total_start = time.time()

            logger.info({
            "request_id": request_id,
            "event": "file_processing_started",
            "filename": clean_name,
            "user": current_user.username,
            "entity": entity
            })
            
            # ---- CLEAN FILENAME ----
            clean_name = file.filename.replace("\\", "/").split("/")[-1]
            new_name = f"{uuid.uuid4()}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{clean_name}"
            file_path = os.path.join(upload_dir, new_name)

            # ---- SAVE FILE ----
            save_start = time.time()
            contents = await file.read()
            with open(file_path, "wb") as f:
                f.write(contents)
            print(f"[Backend] File saved in {time.time() - save_start:.2f}s: {file_path}")

            logger.info({
            "request_id": request_id,
            "stage": "file_saved",
            "file_path": file_path,
            "size_bytes": len(contents)
            })





            # ---- CREATE DB RECORD (INITIAL) ----
            new_invoice = Invoice(
                filename=new_name,
                original_filename=clean_name,
                file_path=file_path,
                uploaded_by=current_user.username,
                status=InvoiceStatusEnum.PROCESSED,
                entity=entity,
                uploaded_at=datetime.utcnow(),
                extracted_data=serialize_json_field({}),
                processing_steps=serialize_json_field([]),
            )
            
            # Initial Status History
            history_item = InvoiceStatusHistory(
                status=InvoiceStatusEnum.PROCESSED,
                user=current_user.username,
                timestamp=datetime.utcnow()
            )
            new_invoice.status_history.append(history_item)
            
            db_start = time.time()
            db.add(new_invoice)
            db.commit()
            db.refresh(new_invoice)
            invoice_id = new_invoice.id
            print(f"[Backend] Initial DB record created in {time.time() - db_start:.2f}s: {invoice_id}")
            logger.info({
            "request_id": request_id,
            "stage": "db_record_created",
            "invoice_id": invoice_id
            })




            # ---- RUN EXTRACTION ----
            extract_start = time.time()
            print(f"[Backend] Starting full extraction for {invoice_id}")
            extraction = await invoice_processor.process_invoice_extraction(file_path)
            extract_time = time.time() - extract_start
            print(f"[Backend] Full extraction completed in {extract_time:.2f}s")

            # Extract key values from Azure response
            extracted_data = extraction.get("extracted_data", {})
            raw_azure_response = extraction.get("raw_azure_full", {})
            
            # Extract raw OCR text from Azure response
            raw_ocr_text = ""
            if raw_azure_response and "content" in raw_azure_response:
                raw_ocr_text = raw_azure_response.get("content", "")
            
            # Log raw OCR text separately
            logger.info({
                "request_id": request_id,
                "stage": "azure_ocr_text_extracted",
                "invoice_id": invoice_id,
                "raw_ocr_text": raw_ocr_text
            })
            
            # Log structured extraction data separately
            logger.info({
                "request_id": request_id,
                "stage": "azure_extraction_completed",
                "invoice_id": invoice_id,
                "duration_sec": extract_time,
                "confidence_score": extraction.get("metadata", {}).get("confidence_score"),
                "azure_extracted_data": extracted_data
            })
            
            # ---- LLM LOGGING ----
            # Log LLM metadata
            logger.info({
                "request_id": request_id,
                "stage": "llm_invocation",
                "prompt_length": len(extraction.get("llm_prompt", "")),
                "response_length": len(str(extraction.get("llm_raw_response", "")))
            })
            
            # Log LLM response values separately
            logger.info({
                "request_id": request_id,
                "stage": "llm_response_values",
                "llm_response": extraction.get("llm_raw_response", "")
            })




            # ---- SAVE RAW EXTRACTION DATA ----
            try:
                raw_start = time.time()
                # Read PDF binary
                with open(file_path, "rb") as f:
                    pdf_bytes = f.read()
                
                raw_record = RawExtractionData(
                    invoice_id=invoice_id,
                    pdf_binary=pdf_bytes,
                    raw_azure_response=serialize_json_field(extraction.get("raw_azure_full", {})),
                    llm_prompt=extraction.get("llm_prompt"),
                    llm_raw_response=extraction.get("llm_raw_response")
                )
                db.add(raw_record)
                db.commit()
                print(f"[Backend] Raw extraction data and PDF binary saved in {time.time() - raw_start:.2f}s")
                logger.info({
                    "request_id": request_id,
                    "stage": "raw_extraction_persisted",
                    "invoice_id": invoice_id
                })

           
            except Exception as e:
                print(f"[Backend] Warning: Failed to save raw extraction data: {e}")
                # Don't fail the whole upload if this part fails
                logger.warning({
                    "request_id": request_id,
                    "stage": "raw_extraction_save_failed",
                    "error": str(e)
                })

            # Update invoice instance with extraction results
            new_invoice.extracted_data = serialize_json_field(extraction.get("extracted_data", {}))
            new_invoice.processing_steps = serialize_json_field(extraction.get("processing_steps", []))
            new_invoice.validation_results = serialize_json_field(extraction.get("validation_results", {}))
            new_invoice.confidence_score = extraction.get("metadata", {}).get("confidence_score", "low")
            new_invoice.processed_at = datetime.utcnow()

            logger.info({
                "request_id": request_id,
                "stage": "structured_extraction_completed",
                "invoice_id": invoice_id,
                "confidence_score": new_invoice.confidence_score
            })
            
            # Update vendor_id and vendor_name from full extraction
            extracted_data = extraction.get("extracted_data", {})
            current_line_grouping = "No"
            
            # Resolve vendor from master data
            vendor_info = extracted_data.get("vendor_info", {})
            extracted_vendor = vendor_info.get("name", {}).get("value")
            extracted_address = vendor_info.get("address", {}).get("value")
            
            if extracted_vendor or extracted_address:
                new_invoice.azure_vendor_name = extracted_vendor
                vendor_start = time.time()
                res_v_id, res_v_name, res_v_grouping, vendor_details = get_vendor_id_from_master(db, extracted_vendor, entity, extracted_address)
                print(f"[Backend] Vendor matching completed in {time.time() - vendor_start:.2f}s")
                if res_v_id:
                    new_invoice.vendor_id = res_v_id
                    new_invoice.vendor_name = res_v_name
                    new_invoice.line_grouping = res_v_grouping
                    new_invoice.vendor_details = serialize_json_field(vendor_details)
                    current_line_grouping = res_v_grouping
                    
                    # Sync to extracted_data for frontend consistency
                    if "vendor_info" not in extracted_data:
                        extracted_data["vendor_info"] = {}
                    extracted_data["vendor_info"]["vendor_id"] = {"value": res_v_id}
                    extracted_data["vendor_info"]["name"] = {"value": res_v_name}
                    new_invoice.extracted_data = serialize_json_field(extracted_data)
            
                logger.info({
                    "request_id": request_id,
                    "stage": "vendor_matching_completed",
                    "vendor_matching_details": {
                        "azure_extracted_vendor": extracted_vendor,
                        "azure_extracted_address": extracted_address,
                        "matched_vendor_id": res_v_id,
                        "matched_vendor_name": res_v_name,
                        "line_grouping": res_v_grouping,
                        "vendor_details": vendor_details
                    }
                })




            if not new_invoice.invoice_number:
                # Try to get invoice number from extraction
                invoice_details = extracted_data.get("invoice_details", {})
                extracted_invoice_num = invoice_details.get("invoice_number", {}).get("value")
                if extracted_invoice_num:
                    new_invoice.invoice_number = extracted_invoice_num

            # ---- LINE GROUPING LOGIC ----
            if current_line_grouping == "Yes":
                # ---- LINE GROUPING LOGIC (NON-DESTRUCTIVE) ----
                # ---- PRESERVE ORIGINAL ITEMS (FIRST, ALWAYS) ----
                items = extracted_data.get("Items", {}).get("value", [])

                if items and not new_invoice.original_items:
                    import copy
                    new_invoice.original_items = serialize_json_field(copy.deepcopy(items))

                if current_line_grouping == "Yes" and items:
                    from app.services.line_grouping import aggregate_items
                    aggregated_items = aggregate_items(items)
                    extracted_data["Items"]["value"] = [aggregated_items]
                    new_invoice.extracted_data = serialize_json_field(extracted_data)

                else:
                    # Restore original items when grouping is No
                    original_items = deserialize_json_field(new_invoice.original_items) or items
                    extracted_data["Items"]["value"] = original_items
                    new_invoice.extracted_data = serialize_json_field(extracted_data)



            db.commit()

            # ---- POST-EXTRACTION DUPLICATE CHECK (Fallback) ----
            # If quick extraction failed, check for duplicates after full extraction
            final_vendor_id = new_invoice.vendor_id
            final_invoice_number = new_invoice.invoice_number
            
            if final_vendor_id and final_invoice_number:
                # Check if this combination already exists (excluding current invoice)
                # Note: check_registry_duplicate now returns dict from invoice_to_dict
                existing_duplicate = check_registry_duplicate(db, final_vendor_id, final_invoice_number, entity)
                
                if existing_duplicate and str(existing_duplicate.get("id")) != str(invoice_id):
                     # Duplicate found AFTER extraction - Flag it
                    uploaded_date = existing_duplicate.get("uploaded_at")
                    date_str = str(uploaded_date)[:16] if uploaded_date else "N/A"
                    
                    new_invoice.duplicate_info = serialize_json_field({
                         "is_duplicate": True,
                         "reason": f"Duplicate (Full): Vendor {new_invoice.vendor_name or final_vendor_id}, Invoice #{final_invoice_number} (Uploaded {date_str})",
                         "original_invoice_id": str(existing_duplicate.get("id"))
                    })
                    db.commit()
                    logger.info({
                        "request_id": request_id,
                        "stage": "duplicate_check_completed",
                        "vendor_id": final_vendor_id,
                        "invoice_number": final_invoice_number,
                        "is_duplicate": bool(existing_duplicate)
                    })


            # ---- CREATE WORKFLOW STEP: PROCESSED ----
            workflow_step = WorkflowStep(
                invoice_id=invoice_id,
                step_name="Processed",
                step_type=WorkflowStepTypeEnum.PROCESSED,
                user=current_user.username,
                status=WorkflowStepStatusEnum.COMPLETED,
                timestamp=datetime.utcnow(),
                entity=entity
            )
            db.add(workflow_step)
            db.commit()

            logger.info({
                "request_id": request_id,
                "stage": "workflow_step_created",
                "invoice_id": invoice_id
            })
            
            # [AUDIT] Log Upload (Passing DB Session)
            await audit_service.log_action(
                db=db,
                invoice_id=invoice_id, 
                action=AuditAction.UPLOADED, 
                user=current_user.username,
                entity=entity,
                details={"filename": clean_name}
            )

            # ---- REGISTER IN FAST LOOKUP REGISTRY ----
            final_vendor_id = new_invoice.vendor_id
            final_invoice_number = new_invoice.invoice_number
            
            if final_vendor_id and final_invoice_number:
                reg_start = time.time()
                register_invoice(
                    db,
                    vendor_id=final_vendor_id,
                    invoice_number=final_invoice_number,
                    entity=entity,
                    invoice_id=invoice_id,
                    uploaded_by=current_user.username
                )
                print(f"[Backend] Registered in fast lookup registry in {time.time() - reg_start:.2f}s")

            print(f"[Backend] TOTAL processing for {invoice_id} completed in {time.time() - total_start:.2f}s")
            # ✅ 6️⃣ SUCCESS LOGGER (ADD HERE)
            total_time = round(time.time() - total_start, 2)

            logger.info({
                "request_id": request_id,
                "event": "invoice_processing_completed",
                "invoice_id": invoice_id,
                "total_time_sec": total_time
            })

            return {"success": True, "data": invoice_to_dict(new_invoice)}

        except Exception as e:
            # ❌ FAILURE LOGGER (ADD HERE)
            if file_path and os.path.exists(file_path):
                os.remove(file_path)

            logger.error({
                "request_id": request_id,
                "event": "invoice_processing_failed",
                "filename": clean_name,
                "error": str(e)
            }, exc_info=True)

            return {"success": False, "filename": clean_name, "reason": str(e)}

    # Run processing tasks concurrently
    tasks = [_process_single_file(file) for file in files]
    results = await asyncio.gather(*tasks)

    # Handle results
    for res in results:
        if res["success"]:
            saved_invoices.append(res["data"])
        else:
            failed_uploads.append({"filename": res["filename"], "reason": res["reason"]})

    return {
        "count": len(saved_invoices),
        "invoices": saved_invoices,
        "failed": failed_uploads
    }


@router.get("/", response_model=List[InvoiceResponse])
async def get_invoices(
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    skip: int = 0,
    limit: int = 10,
    show_all: bool = True,
    db: Session = Depends(get_db)
):
    from sqlalchemy import desc
    query = db.query(Invoice).filter(Invoice.entity == entity)
    
    if not show_all:
        query = query.filter(Invoice.uploaded_by == current_user.username)

    invoices = query.order_by(desc(Invoice.uploaded_at)).offset(skip).limit(limit).all()

    return [InvoiceResponse(**invoice_to_dict(inv)) for inv in invoices]


@router.get("/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: int,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    db: Session = Depends(get_db)
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.entity == entity).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    return InvoiceResponse(**invoice_to_dict(invoice))

@router.get("/debug/raw/{invoice_id}")
async def get_raw_invoice(invoice_id: int, db: Session = Depends(get_db)):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        return {"error": "Not found"}
    return invoice_to_dict(invoice)


@router.get("/{invoice_id}/file")
async def get_invoice_pdf(
    invoice_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    file_path = invoice.file_path
    
    # Ensure path is absolute/resolvable
    if file_path and not os.path.isabs(file_path):
        base_dir = os.getcwd()
        full_path = os.path.join(base_dir, file_path)
        if os.path.exists(full_path):
            file_path = full_path

    if not file_path or not os.path.exists(file_path):
        # Fallback: try to find it in uploads folder if path looks like just a filename
        if file_path and "/" not in file_path and "\\" not in file_path:
             alt_path = os.path.join("uploads", file_path)
             if os.path.exists(alt_path):
                 file_path = alt_path

    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail=f"PDF file not found at {file_path}")

    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=invoice.original_filename or "invoice.pdf"
    )

@router.put("/{invoice_id}/status")
async def update_invoice_status(
    invoice_id: int,
    status: InvoiceStatusEnum,
    comment: str = None,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    approver_name = current_user.username
    timestamp = datetime.utcnow()

    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    status_history = list(invoice.status_history) if invoice.status_history else []

    # =====================================================
    # FIND CURRENT APPROVAL CYCLE (AFTER LAST REWORK)
    # =====================================================
    last_rework_index = -1
    for i in range(len(status_history) - 1, -1, -1):
        if status_history[i].status == InvoiceStatusEnum.REWORKED:
            last_rework_index = i
            break

    current_cycle_history = (
        status_history[last_rework_index + 1 :]
        if last_rework_index != -1
        else status_history
    )

    # =====================================================
    # BLOCK DOUBLE ACTION IN SAME CYCLE (SOPHISTICATED CHECK)
    # =====================================================
    
    # We need to know which approvers are assigned to fetch delegation
    from app.routes.workflow import (
        get_vendor_data_from_invoice,
        get_required_approver_count,
        get_invoice_total_from_invoice
    )
    vendor_name, vendor_id = get_vendor_data_from_invoice(db, invoice_id)
    total_amount = get_invoice_total_from_invoice(db, invoice_id)
    
    # extracted_data is stored as string in SQL, but db_utils deserialize it
    extracted_data = deserialize_json_field(invoice.extracted_data) or {}
    currency = extracted_data.get("invoice_details", {}).get("currency", {}).get("value", "USD")
    
    requirement_data = get_required_approver_count(db, vendor_name, total_amount, invoice_id, invoice_data=invoice_to_dict(invoice), currency=currency, entity=invoice.entity)
    assigned_approvers = requirement_data.get("assigned_approvers", [])
    
    existing_approvals = sum(1 for h in current_cycle_history if h.status == InvoiceStatusEnum.APPROVED)
    
    # Who is the EXPECTED approver right now?
    expected_email = None
    if assigned_approvers and existing_approvals < len(assigned_approvers):
        expected_email = assigned_approvers[existing_approvals].lower()

    # Is the current user the expected approver OR their active substitute?
    is_authorized = False
    if expected_email:
        if current_user.email.lower() == expected_email:
            is_authorized = True
        else:
            from app.models.delegation import check_active_delegation
            substitutes = check_active_delegation(db, expected_email, invoice.entity)
            if current_user.email.lower() in substitutes:
                is_authorized = True

    already_acted_for_this_level = any(
        h.user == approver_name and 
        h.approver_level == existing_approvals + 1 and 
        h.status in [InvoiceStatusEnum.APPROVED, InvoiceStatusEnum.REJECTED, InvoiceStatusEnum.REWORKED]
        for h in current_cycle_history
    )

    if already_acted_for_this_level and status in [InvoiceStatusEnum.APPROVED, InvoiceStatusEnum.REJECTED, InvoiceStatusEnum.REWORKED]:
         raise HTTPException(
            status_code=400,
            detail=f"User {approver_name} has already taken action for this level."
        )

    # =====================================================
    # PREPARE STATUS ENTRY
    # =====================================================
    new_status_entry = InvoiceStatusHistory(
        status=status,
        user=approver_name,
        timestamp=timestamp,
        comment=comment,
        approver_level=existing_approvals + 1 if status in [InvoiceStatusEnum.APPROVED, InvoiceStatusEnum.REJECTED, InvoiceStatusEnum.REWORKED] else None
    )

    main_status = InvoiceStatusEnum.WAITING_APPROVAL

    # =====================================================
    #  WAITING_CODING (RECALL)
    # =====================================================
    if status == InvoiceStatusEnum.WAITING_CODING:
        main_status = InvoiceStatusEnum.WAITING_CODING

        db.query(WorkflowStep).filter(
            WorkflowStep.invoice_id == invoice_id,
            WorkflowStep.step_type == WorkflowStepTypeEnum.CODING
        ).delete()

        invoice.status = main_status
        invoice.validation_results = serialize_json_field({})
        # Empty the approved_by list in SQL
        invoice.approved_by_list = []
        invoice.current_approver_level = 1
        invoice.status_history.append(new_status_entry)
        
        db.commit()

        # [AUDIT] Log Recall
        await audit_service.log_action(
            db=db,
            invoice_id=invoice_id, 
            action=AuditAction.RECALLED, 
            user=current_user.username,
            entity=invoice.entity,
            details={"comment": comment}
        )
        
        return {"message": "Status updated", "main_status": main_status}

    # Remove the second (now redundant/unreachable) WAITING_CODING audit block


    # =====================================================
    # REJECT / REWORK
    # =====================================================
    # =====================================================
    # REJECT / REWORK / APPROVE
    # =====================================================
    if status in [InvoiceStatusEnum.REJECTED, InvoiceStatusEnum.REWORKED, InvoiceStatusEnum.APPROVED]:
        from app.routes.workflow import (
            get_vendor_data_from_invoice,
            get_required_approver_count,
            get_invoice_total_from_invoice
        )

        vendor_name, vendor_id = get_vendor_data_from_invoice(db, invoice_id)
        total_amount = get_invoice_total_from_invoice(db, invoice_id)
        
        extracted_data = deserialize_json_field(invoice.extracted_data) or {}
        currency = extracted_data.get("invoice_details", {}).get("currency", {}).get("value", "USD")

        requirement_data = get_required_approver_count(
            db, vendor_name, total_amount, invoice_id, invoice_data=invoice_to_dict(invoice), currency=currency, entity=invoice.entity
        )
        required_approvers = requirement_data["required"]
        assigned_approvers = requirement_data.get("assigned_approvers", [])

        # COUNT ONLY CURRENT CYCLE APPROVALS
        existing_approvals = sum(
            1 for h in current_cycle_history
            if h.status == InvoiceStatusEnum.APPROVED
        )

        if assigned_approvers:
            if not is_authorized:
                 raise HTTPException(
                    status_code=403,
                    detail=f"Only {expected_email} (or their active substitute) can take action at this level."
                )

        if status == InvoiceStatusEnum.APPROVED:
            approvals = existing_approvals + 1
            if approvals >= required_approvers:
                main_status = InvoiceStatusEnum.APPROVED
            else:
                main_status = InvoiceStatusEnum.WAITING_APPROVAL
        else:
            main_status = status

    # =====================================================
    # SAVE INVOICE
    # =====================================================
    invoice.status = main_status
    
    validation_results = deserialize_json_field(invoice.validation_results) or {}
    validation_results.update({
        "approver_name": approver_name,
        "approval_timestamp": timestamp.isoformat(),
        "last_action": status.value if hasattr(status, 'value') else status,
        "approver_comment": comment
    })
    invoice.validation_results = serialize_json_field(validation_results)
    
    invoice.status_history.append(new_status_entry)

    if status == InvoiceStatusEnum.APPROVED:
        # Avoid duplicate approvals in the list
        if not any(a.approver_email == current_user.email for a in invoice.approved_by_list):
            from app.models.db_models import InvoiceApprovedBy
            invoice.approved_by_list.append(InvoiceApprovedBy(approver_email=current_user.email))
        
        if main_status == InvoiceStatusEnum.WAITING_APPROVAL:
            invoice.current_approver_level = approvals + 1
            
    elif status in [InvoiceStatusEnum.REJECTED, InvoiceStatusEnum.REWORKED, InvoiceStatusEnum.WAITING_CODING]:
        invoice.approved_by_list = []
        invoice.current_approver_level = 1

    db.commit()

    # =====================================================
    # CREATE WORKFLOW STEP (RESET AFTER REWORK)
    # =====================================================
    if status in [
        InvoiceStatusEnum.APPROVED,
        InvoiceStatusEnum.REJECTED,
        InvoiceStatusEnum.REWORKED
    ]:
        cycle_approvals = [
            h for h in current_cycle_history
            if h.status == InvoiceStatusEnum.APPROVED
        ]

        approver_number = len(cycle_approvals) + 1

        step_type_map = {
            1: WorkflowStepTypeEnum.APPROVER_1,
            2: WorkflowStepTypeEnum.APPROVER_2,
            3: WorkflowStepTypeEnum.APPROVER_3,
            4: WorkflowStepTypeEnum.APPROVER_4
        }

        workflow_status = WorkflowStepStatusEnum.APPROVED
        if status == InvoiceStatusEnum.REJECTED:
            workflow_status = WorkflowStepStatusEnum.REJECTED
        elif status == InvoiceStatusEnum.REWORKED:
            workflow_status = WorkflowStepStatusEnum.REWORKED

        new_step = WorkflowStep(
            invoice_id=invoice_id,
            step_name=f"{approver_number}{['st','nd','rd','th'][min(approver_number-1,3)]} Approver",
            step_type=step_type_map.get(approver_number, WorkflowStepTypeEnum.APPROVER_4),
            user=approver_name,
            status=workflow_status,
            timestamp=timestamp,
            approver_number=approver_number,
            comment=comment,
            entity=invoice.entity
        )
        db.add(new_step)
        db.commit()

    # [AUDIT] Log Detailed Status Change
    action_map = {
        InvoiceStatusEnum.APPROVED: AuditAction.APPROVED,
        InvoiceStatusEnum.REJECTED: AuditAction.REJECTED,
        InvoiceStatusEnum.REWORKED: AuditAction.REWORKED,
        InvoiceStatusEnum.WAITING_CODING: AuditAction.RECALLED
    }
    
    if status in action_map:
        base_action = action_map[status].value
        if status == InvoiceStatusEnum.APPROVED:
            level_suffix = f" ({approver_number}{['st','nd','rd','th'][min(approver_number-1,3)]} Approver)"
            display_action = base_action + level_suffix
        else:
            display_action = base_action
            
        await audit_service.log_action(
            db=db,
            invoice_id=invoice_id, 
            action=display_action, 
            user=current_user.username,
            entity=invoice.entity,
            details={
                "status": {"old": invoice.status.value if hasattr(invoice.status, 'value') else invoice.status, "new": main_status.value if hasattr(main_status, 'value') else main_status},
                "comment": comment,
                "approver_level": approver_number if status in [InvoiceStatusEnum.APPROVED, InvoiceStatusEnum.REJECTED, InvoiceStatusEnum.REWORKED] else None
            }
        )

    return {"message": "Status updated", "main_status": main_status}


@router.put("/{invoice_id}")
async def update_invoice(
    invoice_id: int,
    invoice_update: InvoiceUpdate,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    update_data = {k: v for k, v in invoice_update.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")

    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Capture state BEFORE updates
    old_invoice_dict = invoice_to_dict(invoice)

    # --- Duplicate Check Logic (Constraint Enforcement) ---
    # Determine the effective vendor_id and invoice_number after update
    # Check if they are being updated in extracted_data
    
    current_vendor_id = invoice.vendor_id
    current_invoice_number = invoice.invoice_number
    
    new_vendor_id = current_vendor_id
    new_invoice_number = current_invoice_number
    
    requires_check = False
    
    # 1. Check top-level updates
    # if "vendor_id" in update_data:
    #     new_vendor_id = update_data["vendor_id"]
    #     requires_check = True
    # ---- Line grouping toggle when vendor changes ----
    if "vendor_id" in update_data:
        from app.models.db_models import ExcelFile, MasterDataChunk
        # Simplified vendor lookup for grouping logic
        vendor_file = db.query(ExcelFile).filter(ExcelFile.tab_name.in_(["Vendor_Master", "Vendor Master"])).first()
        new_grouping = "No"
        if vendor_file:
            chunks = db.query(MasterDataChunk).filter(MasterDataChunk.file_id == vendor_file.id).all()
            for chunk in chunks:
                chunk_data = json.loads(chunk.data_json) if isinstance(chunk.data_json, str) else chunk.data_json
                rows = chunk_data.get("rows", [])
                for r in rows:
                    if r.get("Vendor ID") == new_vendor_id:
                        new_grouping = r.get("Line Grouping", "No")
                        break
                if new_grouping != "No": break

        extracted_data = update_data.get("extracted_data") or deserialize_json_field(invoice.extracted_data) or {}
        items = extracted_data.get("Items", {}).get("value", [])

        original_items = deserialize_json_field(invoice.original_items) or items
        update_data["original_items"] = serialize_json_field(original_items)

        if new_grouping == "Yes":
            from app.services.line_grouping import aggregate_items
            aggregated = aggregate_items(original_items)
            extracted_data["Items"]["value"] = [aggregated]
        else:
            extracted_data["Items"]["value"] = original_items

        update_data["extracted_data"] = serialize_json_field(extracted_data)

    if "invoice_number" in update_data:
        new_invoice_number = update_data["invoice_number"]
        requires_check = True
        
    # 2. Check extracted_data updates (which might override or sync with top-level)
    extracted_data = update_data.get("extracted_data")
    if extracted_data:
        # Vendor ID
        ev_id = extracted_data.get("vendor_info", {}).get("vendor_id", {}).get("value")
        if ev_id:
            new_vendor_id = ev_id
            requires_check = True
            
        # Invoice Number
        ein_num = extracted_data.get("invoice_details", {}).get("invoice_number", {}).get("value")
        if ein_num:
            new_invoice_number = ein_num
            requires_check = True

    if requires_check and new_vendor_id and new_invoice_number:
        from app.utils.invoice_registry import check_registry_duplicate
        from app.ai.duplicate_detector import check_duplicate_invoice
        
        duplicate = check_registry_duplicate(db, new_vendor_id, new_invoice_number, invoice.entity)
        if not duplicate:
            duplicate = check_duplicate_invoice(db, new_vendor_id, new_invoice_number, invoice.entity)
        
        if duplicate and str(duplicate.get("id")) != str(invoice_id):
             raise HTTPException(
                status_code=409, 
                detail=f"Duplicate detected: Vendor ID '{new_vendor_id}' already has Invoice #'{new_invoice_number}'."
            )
        else:
            invoice.duplicate_info = None

    # --- Vendor Mapping Persistence ---
    extracted_data = update_data.get("extracted_data")
    if extracted_data:
        # Check if vendor info is being updated
        new_vendor_id = extracted_data.get("vendor_info", {}).get("vendor_id", {}).get("value")
        new_vendor_name = extracted_data.get("vendor_info", {}).get("name", {}).get("value")
        
        old_vendor_id = invoice.vendor_id
        azure_vendor_name = invoice.azure_vendor_name
        
        if azure_vendor_name and new_vendor_id and new_vendor_id != old_vendor_id:
            from app.ai.normalizer import normalize_vendor, normalize_address
            
            # Persist Name-based mapping
            norm_azure_name = normalize_vendor(azure_vendor_name)
            if norm_azure_name:
                mapping = db.query(VendorMetadata).filter(
                    VendorMetadata.extracted_name_normalized == norm_azure_name,
                    VendorMetadata.entity == invoice.entity
                ).first()
                
                if not mapping:
                    mapping = VendorMetadata(
                        extracted_name_normalized=norm_azure_name,
                        entity=invoice.entity
                    )
                    db.add(mapping)
                
                mapping.extracted_name = azure_vendor_name
                mapping.vendor_id = new_vendor_id
                mapping.official_name = new_vendor_name or invoice.vendor_name
                mapping.updated_at = datetime.utcnow()
                mapping.updated_by = current_user.username
            
            # Persist Address-based mapping if available
            vendor_info = extracted_data.get("vendor_info", {})
            azure_address = vendor_info.get("address", {}).get("value")
            if azure_address:
                norm_azure_addr = normalize_address(azure_address)
                if norm_azure_addr:
                    addr_mapping = db.query(VendorMetadata).filter(
                        VendorMetadata.extracted_address_normalized == norm_azure_addr,
                        VendorMetadata.entity == invoice.entity
                    ).first()
                    
                    if not addr_mapping:
                        addr_mapping = VendorMetadata(
                            extracted_address_normalized=norm_azure_addr,
                            entity=invoice.entity
                        )
                        db.add(addr_mapping)
                    
                    addr_mapping.extracted_address = azure_address
                    addr_mapping.vendor_id = new_vendor_id
                    addr_mapping.official_name = new_vendor_name or invoice.vendor_name
                    addr_mapping.updated_at = datetime.utcnow()
                    addr_mapping.updated_by = current_user.username
                # Also update top-level vendor fields in the invoice
                update_data["vendor_id"] = new_vendor_id
                if new_vendor_name:
                    update_data["vendor_name"] = new_vendor_name
                
                # Sync back to extracted_data.vendor_info for frontend consistency
                if "vendor_info" not in extracted_data:
                    extracted_data["vendor_info"] = {}
                extracted_data["vendor_info"]["vendor_id"] = {"value": new_vendor_id}
                if new_vendor_name:
                    extracted_data["vendor_info"]["name"] = {"value": new_vendor_name}
                update_data["extracted_data"] = extracted_data

    # Merge validation
    if "validation_results" in update_data:
        existing_validation = deserialize_json_field(invoice.validation_results) or {}
        merged_validation = {**existing_validation, **update_data["validation_results"]}
        invoice.validation_results = serialize_json_field(merged_validation)

    # Status transition logic
    if "status" in update_data and update_data["status"] == InvoiceStatusEnum.WAITING_APPROVAL:
        if invoice.required_approvers is None:
             from app.routes.workflow import get_vendor_data_from_invoice, get_required_approver_count, get_invoice_total_from_invoice
             
             vendor_name, vendor_id = get_vendor_data_from_invoice(db, invoice_id)
             total_amount = get_invoice_total_from_invoice(db, invoice_id)
             currency = (deserialize_json_field(invoice.extracted_data) or {}).get("invoice_details", {}).get("currency", {}).get("value", "USD")
             requirement_data = get_required_approver_count(db, vendor_name, total_amount, invoice_id, currency=currency, entity=invoice.entity)
             
             invoice.required_approvers = requirement_data["required"]
             invoice.approver_breakdown = serialize_json_field(requirement_data["breakdown"])

    # Update simple fields
    for field in ["vendor_id", "vendor_name", "invoice_number", "status", "exchange_rate", "confidence_score"]:
        if field in update_data:
            setattr(invoice, field, update_data[field])
            
    if "extracted_data" in update_data:
        invoice.extracted_data = serialize_json_field(update_data["extracted_data"])
        
    db.commit()

    # --- Registry Sync ---
    if new_vendor_id != current_vendor_id or new_invoice_number != current_invoice_number:
        from app.utils.invoice_registry import remove_from_registry, register_invoice
        
        remove_from_registry(db, invoice_id)
        
        if new_vendor_id and new_invoice_number:
            register_invoice(
                db,
                vendor_id=new_vendor_id,
                invoice_number=new_invoice_number,
                entity=invoice.entity or "",
                invoice_id=invoice_id,
                uploaded_by=invoice.uploaded_by or "system"
            )

    # [AUDIT] Log Update with Deep Diff
    audit_details = {}
    
    # Capture state AFTER updates
    new_invoice_dict = invoice_to_dict(invoice)

    # 1. Compare Top-Level Fields
    # List of simple fields to check
    simple_fields = [
        "vendor_id", "vendor_name", "invoice_number", "status", 
        "line_grouping", "confidence_score", "exchange_rate"
    ]
    
    for field in simple_fields:
        old_val = old_invoice_dict.get(field)
        new_val = new_invoice_dict.get(field)
        if old_val != new_val:
            audit_details[field] = {"old": old_val, "new": new_val}

    # 2. Compare Extracted Data (Critical Fields)
    # We check specific paths in the JSON data
    critical_checks = [
        # (Paths to check, Human Label)
        (["vendor_info", "vendor_id", "value"], "Extracted Vendor ID"),
        (["vendor_info", "name", "value"], "Extracted Vendor Name"),
        (["vendor_info", "address", "value"], "Extracted Vendor Address"),
        (["invoice_details", "invoice_number", "value"], "Extracted Invoice Number"),
        (["invoice_details", "invoice_date", "value"], "Extracted Invoice Date"),
        (["invoice_details", "po_number", "value"], "PO Number"),
        (["amounts", "total_invoice_amount", "value"], "Total Invoice Amount"),
        (["amounts", "total_amount_payable", "value"], "Total Amount Payable"),
        (["amounts", "total_tax_amount", "value"], "Total Tax Amount"),
        (["amounts", "total_service_tax_amount", "value"], "Service Tax Amount"),
        (["invoice_details", "currency", "value"], "Currency")
    ]

    def get_nested(d, p):
        val = d
        if not val: return None
        for step in p:
            if isinstance(val, dict):
                val = val.get(step)
            else:
                return None
        return val

    old_extracted = old_invoice_dict.get("extracted_data") or {}
    new_extracted = new_invoice_dict.get("extracted_data") or {}

    for path, label in critical_checks:
        old_val = get_nested(old_extracted, path)
        new_val = get_nested(new_extracted, path)
        if old_val != new_val:
            audit_details[label] = {"old": old_val, "new": new_val}
            
    # Check Line Items Count (High level check)
    old_items = old_extracted.get("Items", {}).get("value", [])
    new_items = new_extracted.get("Items", {}).get("value", [])
    if len(old_items) != len(new_items):
         audit_details["Line Items Count"] = {"old": len(old_items), "new": len(new_items)}

    # If extracted_data changed but no critical fields were caught, log generic
    # This ensures we don't miss updates
    if old_extracted != new_extracted and not any(k in audit_details for _, k in critical_checks) and "Line Items Count" not in audit_details:
         audit_details["Extracted Data"] = "Content Updated (Details not specified)"

    # [AUDIT] Log Update with Specific Action if Status Changed
    action = AuditAction.UPDATED
    
    # If status changed, prioritize that action name
    if "status" in audit_details:
        new_status = new_invoice_dict.get("status")
        if new_status == InvoiceStatusEnum.WAITING_CODING:
            action = AuditAction.SENT_FOR_CODING
        elif new_status == InvoiceStatusEnum.WAITING_APPROVAL:
            action = AuditAction.SENT_TO_APPROVAL
    
    # Only log if there are actual changes
    if audit_details:
        await audit_service.log_action(
            db=db,
            invoice_id=invoice_id, 
            action=action, 
            user=current_user.username,
            entity=invoice.entity,
            details=audit_details
        )
 
    return InvoiceResponse(**invoice_to_dict(invoice))


@router.delete("/{invoice_id}")
async def delete_invoice(
    invoice_id: int,
    current_user: UserResponse = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Remove from registry
    from app.utils.invoice_registry import remove_from_registry
    remove_from_registry(db, invoice_id)

    db.delete(invoice)
    db.commit()

    return {"message": "Invoice deleted successfully"}
