from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, status
from fastapi.responses import FileResponse
from typing import List
from app.services.invoice_processor import InvoiceProcessor
from app.services.line_grouping import aggregate_items
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
import asyncio
from app.services.audit_service import audit_service
from app.models.audit_log import AuditAction

router = APIRouter()
invoice_processor = InvoiceProcessor()


@router.post("/check-duplicate")
async def check_duplicate_invoice_endpoint(
    payload: dict,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    from app.utils.invoice_registry import check_registry_duplicate
    from app.ai.duplicate_detector import check_duplicate_invoice

    db = get_database()
    
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
        if current_invoice_id and str(existing.get("_id")) == current_invoice_id:
             return {"is_duplicate": False}
             
        uploaded_date = existing.get("uploaded_at")
        date_str = uploaded_date.strftime("%Y-%m-%d %H:%M") if uploaded_date else "N/A"
        
        return {
            "is_duplicate": True,
            "message": f"Duplicate found: Vendor '{existing.get('vendor_name', vendor_id)}', Invoice #{invoice_number} (Uploaded {date_str})",
            "original_invoice_id": str(existing.get("_id"))
        }

    return {"is_duplicate": False}



@router.post("/upload")
async def upload_invoices(
    files: List[UploadFile] = File(...),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    from app.ai.duplicate_detector import (
        get_vendor_id_from_master
    )
    from app.utils.invoice_registry import check_registry_duplicate, register_invoice
    
    db = get_database()
    upload_dir = "uploads"
    os.makedirs(upload_dir, exist_ok=True)

    duplicates = []  # Track duplicate files
    saved_invoices = []  # Track successfully uploaded invoices
    failed_uploads = []  # Track failed uploads

    async def _process_single_file(file: UploadFile):
        clean_name = file.filename.replace("\\", "/").split("/")[-1]
        file_path = None
        try:
            import time
            total_start = time.time()
            
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

            # ---- CREATE DB RECORD (INITIAL) ----
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
            
            db_start = time.time()
            result = db.invoices.insert_one(invoice_dict)
            invoice_id = str(result.inserted_id)
            print(f"[Backend] Initial DB record created in {time.time() - db_start:.2f}s: {invoice_id}")

            # ---- RUN EXTRACTION ----
            extract_start = time.time()
            print(f"[Backend] Starting full extraction for {invoice_id}")
            extraction = await invoice_processor.process_invoice_extraction(file_path)
            print(f"[Backend] Full extraction completed in {time.time() - extract_start:.2f}s")


            update_data = {
                "extracted_data": extraction.get("extracted_data", {}),
                "processing_steps": extraction.get("processing_steps", []),
                "validation_results": extraction.get("validation_results", {}),
                "confidence_score": extraction.get("metadata", {}).get("confidence_score", "low"),
                "processed_at": datetime.utcnow()
            }
            
            # Update vendor_id and vendor_name from full extraction
            extracted_data = extraction.get("extracted_data", {})
            current_line_grouping = "No"
            
            # Resolve vendor from master data
            vendor_info = extracted_data.get("vendor_info", {})
            extracted_vendor = vendor_info.get("name", {}).get("value")
            extracted_address = vendor_info.get("address", {}).get("value")
            
            if extracted_vendor or extracted_address:
                update_data["azure_vendor_name"] = extracted_vendor
                vendor_start = time.time()
                res_v_id, res_v_name, res_v_grouping, vendor_details = get_vendor_id_from_master(db, extracted_vendor, entity, extracted_address)
                print(f"[Backend] Vendor matching completed in {time.time() - vendor_start:.2f}s")
                if res_v_id:
                    update_data["vendor_id"] = res_v_id
                    update_data["vendor_name"] = res_v_name
                    update_data["line_grouping"] = res_v_grouping
                    update_data["vendor_details"] = vendor_details
                    current_line_grouping = res_v_grouping
            if not invoice_dict.get("vendor_id"):
                # Try to get vendor name from full extraction
                vendor_info = extracted_data.get("vendor_info", {})
                extracted_vendor = vendor_info.get("name", {}).get("value")
                extracted_address = vendor_info.get("address", {}).get("value")
                if extracted_vendor or extracted_address:
                    update_data["azure_vendor_name"] = extracted_vendor
                    res_v_id, res_v_name, res_v_grouping, vendor_details = get_vendor_id_from_master(db, extracted_vendor, entity, extracted_address)
                    if res_v_id:
                        update_data["vendor_id"] = res_v_id
                        update_data["vendor_name"] = res_v_name
                        update_data["line_grouping"] = res_v_grouping
                        update_data["vendor_details"] = vendor_details
                        current_line_grouping = res_v_grouping
                        
                        # Sync to extracted_data for frontend consistency
                        if "vendor_info" not in extracted_data:
                            extracted_data["vendor_info"] = {}
                        extracted_data["vendor_info"]["vendor_id"] = {"value": res_v_id}
                        extracted_data["vendor_info"]["name"] = {"value": res_v_name}
                        update_data["extracted_data"] = extracted_data
            
            if not invoice_dict.get("invoice_number"):
                # Try to get invoice number from extraction
                invoice_details = extracted_data.get("invoice_details", {})
                extracted_invoice_num = invoice_details.get("invoice_number", {}).get("value")
                if extracted_invoice_num:
                    update_data["invoice_number"] = extracted_invoice_num

            # ---- LINE GROUPING LOGIC ----
            if current_line_grouping == "Yes":
                # ---- LINE GROUPING LOGIC (NON-DESTRUCTIVE) ----
                # ---- PRESERVE ORIGINAL ITEMS (FIRST, ALWAYS) ----
                items = extracted_data.get("Items", {}).get("value", [])

                if items and "original_items" not in update_data:
                    import copy
                    update_data["original_items"] = copy.deepcopy(items)

                if current_line_grouping == "Yes" and items:
                    first_item = items[0]

                    aggregated_description = first_item.get("description", {}).get("value") or "Aggregated Items"
                    total_quantity = 0.0
                    total_unit_price = 0.0
                    total_net_amount = 0.0

                    def safe_to_float(v):
                        if v is None: return 0.0
                        if isinstance(v, (int, float)): return float(v)
                        try:
                            return float(str(v).replace('$', '').replace(',', '').strip())
                        except:
                            return 0.0

                    for item in items:
                        total_quantity += safe_to_float(item.get("quantity", {}).get("value"))
                        total_unit_price += safe_to_float(item.get("unit_price", {}).get("value"))
                        total_net_amount += safe_to_float(item.get("amount", {}).get("value"))

                    aggregated_item = {
                        "description": {"value": aggregated_description, "source": "aggregation", "confidence": 1.0},
                        "quantity": {"value": total_quantity, "source": "aggregation", "confidence": 1.0},
                        "unit_price": {"value": total_unit_price, "source": "aggregation", "confidence": 1.0},
                        "amount": {"value": total_net_amount, "source": "aggregation", "confidence": 1.0},
                        "item_code": first_item.get("item_code", {"value": None}),
                        "unit_of_measure": first_item.get("unit_of_measure", {"value": None}),
                        "discount": {"value": 0.0},
                        "tax_rate": {"value": 0.0},
                        "tax_amount": {"value": 0.0},
                        "gross_amount": {"value": total_net_amount}
                    }

                    extracted_data["Items"]["value"] = [aggregated_item]
                    update_data["extracted_data"] = extracted_data

                else:
                    # Restore original items when grouping is No
                    original_items = invoice_dict.get("original_items", items)
                    extracted_data["Items"]["value"] = original_items
                    update_data["extracted_data"] = extracted_data

            db.invoices.update_one({"_id": result.inserted_id}, {"$set": update_data})

            # ---- POST-EXTRACTION DUPLICATE CHECK (Fallback) ----
            # If quick extraction failed, check for duplicates after full extraction
            final_vendor_id = update_data.get("vendor_id") or invoice_dict.get("vendor_id")
            final_invoice_number = update_data.get("invoice_number") or invoice_dict.get("invoice_number")
            
            if final_vendor_id and final_invoice_number:
                # Check if this combination already exists (excluding current invoice)
                existing_duplicate = check_registry_duplicate(db, final_vendor_id, final_invoice_number, entity)
                
                if existing_duplicate and str(existing_duplicate.get("_id")) != invoice_id:
                     # Duplicate found AFTER extraction - Flag it
                    uploaded_date = existing_duplicate.get("uploaded_at")
                    date_str = uploaded_date.strftime("%Y-%m-%d %H:%M") if uploaded_date else "N/A"
                    
                    update_data["duplicate_info"] = {
                         "is_duplicate": True,
                         "reason": f"Duplicate (Full): Vendor {update_data.get('vendor_name', final_vendor_id)}, Invoice #{final_invoice_number} (Uploaded {date_str})",
                         "original_invoice_id": str(existing_duplicate.get("_id"))
                    }


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
                "entity": entity
            }
            db.workflow_steps.insert_one(workflow_step)
            
            # [AUDIT] Log Upload
            await audit_service.log_action(
                invoice_id=invoice_id, 
                action=AuditAction.UPLOADED, 
                user=current_user.username,
                entity=entity,
                details={"filename": clean_name}
            )

            # ---- REGISTER IN FAST LOOKUP REGISTRY ----
            # Get final vendor_id and invoice_number (may have been updated from full extraction)
            final_vendor_id = update_data.get("vendor_id") or invoice_dict.get("vendor_id")
            final_invoice_number = update_data.get("invoice_number") or invoice_dict.get("invoice_number")
            
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
            
            # ---- PREPARE JSON SAFE RESPONSE ----
            invoice_dict.update(update_data)
            invoice_dict["id"] = invoice_id
            invoice_dict.pop("_id", None)
            
            # Convert datetime objects to ISO strings for JSON serialization
            for key, value in invoice_dict.items():
                if isinstance(value, datetime):
                    invoice_dict[key] = value.isoformat()
                elif isinstance(value, list):
                    # Handle lists (like status_history)
                    for i, item in enumerate(value):
                        if isinstance(item, dict):
                            for k, v in item.items():
                                if isinstance(v, datetime):
                                    value[i][k] = v.isoformat()
            
            return {"success": True, "data": invoice_dict}

        except Exception as e:
            if file_path and os.path.exists(file_path):
                os.remove(file_path)
            import traceback
            print(f"❌ ERROR processing file {file.filename}: {e}")
            traceback.print_exc()
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
    # FIND CURRENT APPROVAL CYCLE (AFTER LAST REWORK)
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
    currency = invoice.get("extracted_data", {}).get("invoice_details", {}).get("currency", {}).get("value", "USD")
    requirement_data = get_required_approver_count(db, vendor_name, total_amount, invoice_id, invoice_data=invoice, currency=currency, entity=invoice.get("entity"))
    assigned_approvers = requirement_data.get("assigned_approvers", [])
    
    existing_approvals = sum(1 for h in current_cycle_history if h["status"] == InvoiceStatus.APPROVED)
    
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
            substitutes = check_active_delegation(db, expected_email, invoice.get("entity"))
            if current_user.email.lower() in substitutes:
                is_authorized = True

    # Modified "already acted" check: 
    # Only block if they ALREADY acted for the CURRENT level in this cycle.
    # Since we create a workflow_step every time, we can check how many actions the user took vs their assignments.
    # However, a simpler way: If they are the AUTHORIZED person for the CURRENT level, let them act, 
    # even if they acted for a previous level.
    
    already_acted_for_this_level = any(
        h["user"] == approver_name and 
        h.get("approver_level") == existing_approvals + 1 and # We should ideally track level in history
        h["status"] in [InvoiceStatus.APPROVED, InvoiceStatus.REJECTED, InvoiceStatus.REWORKED]
        for h in current_cycle_history
    )

    # If they are NOT authorized for this turn, or they already acted FOR THIS TURN, block them.
    # BUT if they are authorized for THIS turn, even if they acted for a PREVIOUS turn, allow.
    if already_acted_for_this_level and status in [InvoiceStatus.APPROVED, InvoiceStatus.REJECTED, InvoiceStatus.REWORKED]:
         raise HTTPException(
            status_code=400,
            detail=f"User {approver_name} has already taken action for this level."
        )

    # =====================================================
    # PREPARE STATUS ENTRY
    # =====================================================
    new_status_entry = {
        "status": status,
        "user": approver_name,
        "timestamp": timestamp,
        "comment": comment,
        "approver_level": existing_approvals + 1 if status in [InvoiceStatus.APPROVED, InvoiceStatus.REJECTED, InvoiceStatus.REWORKED] else None
    }

    main_status = InvoiceStatus.WAITING_APPROVAL
    extra_fields = {}

    # =====================================================
    #  WAITING_CODING (RECALL)
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
                "$set": {
                    "status": main_status, 
                    "validation_results": {}, 
                    "approved_by": [],
                    "current_approver_level": 1
                },
                "$push": {"status_history": new_status_entry}
            }
        )

        # [AUDIT] Log Recall
        await audit_service.log_action(
            invoice_id=invoice_id, 
            action=AuditAction.RECALLED, 
            user=current_user.username,
            entity=invoice.get("entity"),
            details={"comment": comment}
        )
        
        return {"message": "Status updated", "main_status": main_status}

    # Remove the second (now redundant/unreachable) WAITING_CODING audit block


    # =====================================================
    # REJECT / REWORK
    # =====================================================
    if status in [InvoiceStatus.REJECTED, InvoiceStatus.REWORKED, InvoiceStatus.APPROVED]:
        from app.routes.workflow import (
            get_vendor_data_from_invoice,
            get_required_approver_count,
            get_invoice_total_from_invoice
        )

        vendor_name, vendor_id = get_vendor_data_from_invoice(db, invoice_id)
        total_amount = get_invoice_total_from_invoice(db, invoice_id)
        currency = invoice.get("extracted_data", {}).get("invoice_details", {}).get("currency", {}).get("value", "USD")

        requirement_data = get_required_approver_count(
            db, vendor_name, total_amount, invoice_id, invoice_data=invoice, currency=currency, entity=invoice.get("entity")
        )
        required_approvers = requirement_data["required"]
        assigned_approvers = requirement_data.get("assigned_approvers", [])

        # COUNT ONLY CURRENT CYCLE APPROVALS
        existing_approvals = sum(
            1 for h in current_cycle_history
            if h["status"] == InvoiceStatus.APPROVED
        )

        # SEQUENTIAL ORDER ENFORCEMENT
        if assigned_approvers:
            if not is_authorized: # Use the is_authorized flag we calculated above
                 raise HTTPException(
                    status_code=403,
                    detail=f"Only {expected_email} (or their active substitute) can take action at this level."
                )

        if status == InvoiceStatus.APPROVED:
            approvals = existing_approvals + 1
            if approvals >= required_approvers:
                main_status = InvoiceStatus.APPROVED
            else:
                main_status = InvoiceStatus.WAITING_APPROVAL
        else:
            main_status = status

    # =====================================================
    # SAVE INVOICE
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
        # Sequential: Increment current_approver_level if not final approval
        if main_status == InvoiceStatus.WAITING_APPROVAL:
            update_query["$set"]["current_approver_level"] = approvals + 1
    elif status in [InvoiceStatus.REJECTED, InvoiceStatus.REWORKED, InvoiceStatus.WAITING_CODING]:
        update_query["$set"]["approved_by"] = []
        update_query["$set"]["current_approver_level"] = 1

    db.invoices.update_one(
        {"_id": ObjectId(invoice_id)},
        update_query
    )

    # =====================================================
    # CREATE WORKFLOW STEP (RESET AFTER REWORK)
    # =====================================================
    if status in [
        InvoiceStatus.APPROVED,
        InvoiceStatus.REJECTED,
        InvoiceStatus.REWORKED
    ]:
        #COUNT APPROVERS IN *CURRENT CYCLE ONLY*
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

    # [AUDIT] Log Detailed Status Change
    action_map = {
        InvoiceStatus.APPROVED: AuditAction.APPROVED,
        InvoiceStatus.REJECTED: AuditAction.REJECTED,
        InvoiceStatus.REWORKED: AuditAction.REWORKED,
        InvoiceStatus.WAITING_CODING: AuditAction.RECALLED
    }
    
    if status in action_map:
        base_action = action_map[status].value
        if status == InvoiceStatus.APPROVED:
            level_suffix = f" ({approver_number}{['st','nd','rd','th'][min(approver_number-1,3)]} Approver)"
            display_action = base_action + level_suffix
        else:
            display_action = base_action
            
        await audit_service.log_action(
            invoice_id=invoice_id, 
            action=display_action, 
            user=current_user.username,
            entity=invoice.get("entity"),
            details={
                "status": {"old": invoice.get("status"), "new": main_status},
                "comment": comment,
                "approver_level": approver_number if status in [InvoiceStatus.APPROVED, InvoiceStatus.REJECTED, InvoiceStatus.REWORKED] else None
            }
        )

    return {"message": "Status updated", "main_status": main_status}


@router.put("/{invoice_id}")
async def update_invoice(
    invoice_id: str,
    invoice_update: InvoiceUpdate,
    current_user: UserResponse = Depends(get_current_user)
):
    from app.utils.invoice_registry import check_registry_duplicate
    from app.ai.duplicate_detector import check_duplicate_invoice
    
    db = get_database()

    update_data = {k: v for k, v in invoice_update.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")

    invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # --- Duplicate Check Logic (Constraint Enforcement) ---
    # Determine the effective vendor_id and invoice_number after update
    # Check if they are being updated in extracted_data
    
    current_vendor_id = invoice.get("vendor_id")
    current_invoice_number = invoice.get("invoice_number")
    
    new_vendor_id = current_vendor_id
    new_invoice_number = current_invoice_number
    
    requires_check = False
    
    # 1. Check top-level updates
    # if "vendor_id" in update_data:
    #     new_vendor_id = update_data["vendor_id"]
    #     requires_check = True
    # ---- Line grouping toggle when vendor changes ----
    if "vendor_id" in update_data:
        vendor = db.vendor_master.find_one({"vendor_id": new_vendor_id})
        new_grouping = vendor.get("Line Grouping", "No") if vendor else "No"

        extracted_data = update_data.get("extracted_data", invoice.get("extracted_data", {}))
        items = extracted_data.get("Items", {}).get("value", [])

        original_items = invoice.get("original_items", items)
        update_data["original_items"] = original_items

        if new_grouping == "Yes":
            # aggregate again
            from app.services.line_grouping import aggregate_items  # or your local method
            aggregated = aggregate_items(original_items)
            extracted_data["Items"]["value"] = [aggregated]
        else:
            # restore
            extracted_data["Items"]["value"] = original_items

        update_data["extracted_data"] = extracted_data

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
        # If either changed, or if we just want to be safe, check for duplicates (excluding self)
        # We need to ensure we don't block saving the SAME invoice (self)
        
        # 1. Try Fast Registry Lookup
        duplicate = check_registry_duplicate(db, new_vendor_id, new_invoice_number, invoice.get("entity"))
        
        # 2. Fallback to Robust DB Lookup (Case-Insensitive)
        if not duplicate:
            duplicate = check_duplicate_invoice(db, new_vendor_id, new_invoice_number, invoice.get("entity"))
        
        if duplicate and str(duplicate.get("_id")) != invoice_id:
             raise HTTPException(
                status_code=409, 
                detail=f"Duplicate detected: Vendor ID '{new_vendor_id}' already has Invoice #'{new_invoice_number}'."
            )
        else:
            # If a check was required and NO duplicate was found, clear the stale duplicate warning
            update_data["duplicate_info"] = None

    # --- Vendor Mapping Persistence ---
    extracted_data = update_data.get("extracted_data")
    if extracted_data:
        # Check if vendor info is being updated
        new_vendor_id = extracted_data.get("vendor_info", {}).get("vendor_id", {}).get("value")
        new_vendor_name = extracted_data.get("vendor_info", {}).get("name", {}).get("value")
        
        old_vendor_id = invoice.get("vendor_id")
        azure_vendor_name = invoice.get("azure_vendor_name")
        
        if azure_vendor_name and new_vendor_id and new_vendor_id != old_vendor_id:
            from app.ai.normalizer import normalize_vendor, normalize_address
            
            # Persist Name-based mapping
            norm_azure_name = normalize_vendor(azure_vendor_name)
            if norm_azure_name:
                mapping = {
                    "extracted_name": azure_vendor_name,
                    "extracted_name_normalized": norm_azure_name,
                    "vendor_id": new_vendor_id,
                    "official_name": new_vendor_name or invoice.get("vendor_name"),
                    "entity": invoice.get("entity"),
                    "updated_at": datetime.utcnow(),
                    "updated_by": current_user.username
                }
                db.vendor_metadata.update_one(
                    {"extracted_name_normalized": norm_azure_name, "entity": invoice.get("entity")},
                    {"$set": mapping},
                    upsert=True
                )
            
            # Persist Address-based mapping if available
            vendor_info = extracted_data.get("vendor_info", {})
            azure_address = vendor_info.get("address", {}).get("value")
            if azure_address:
                norm_azure_addr = normalize_address(azure_address)
                if norm_azure_addr:
                    addr_mapping = {
                        "extracted_address": azure_address,
                        "extracted_address_normalized": norm_azure_addr,
                        "vendor_id": new_vendor_id,
                        "official_name": new_vendor_name or invoice.get("vendor_name"),
                        "entity": invoice.get("entity"),
                        "updated_at": datetime.utcnow(),
                        "updated_by": current_user.username
                    }
                    db.vendor_metadata.update_one(
                        {"extracted_address_normalized": norm_azure_addr, "entity": invoice.get("entity")},
                        {"$set": addr_mapping},
                        upsert=True
                    )
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

    # merge validation
    if "validation_results" in update_data:
        existing_validation = invoice.get("validation_results", {}) or {}
        update_data["validation_results"] = {
            **existing_validation,
            **update_data["validation_results"]
        }

    
    # Check if status is being updated to WAITING_APPROVAL in generic update
    if "status" in update_data and update_data["status"] == InvoiceStatus.WAITING_APPROVAL:
        existing_req = invoice.get("required_approvers")
        
        if existing_req is not None:
             # Ensure these are preserved/set if passed, implicitly they might be missing from update_data
             # If update_data doesn't have them, we don't need to add them if they are already in DB?
             # No, update_data overwrites. If we don't include them, update_one only sets what is in update_data.
             # but we want to ensure they are NOT cleared? No, update_data only keys are updated.
             # We want to Ensure they are PRESENT if we are "transitioning" effectively.
             # Actually, if the DB has them, we don't need to do anything.
             pass
        else:
             from app.routes.workflow import get_vendor_data_from_invoice, get_required_approver_count, get_invoice_total_from_invoice
             
             vendor_name, vendor_id = get_vendor_data_from_invoice(db, invoice_id)
             total_amount = get_invoice_total_from_invoice(db, invoice_id)
             currency = invoice.get("extracted_data", {}).get("invoice_details", {}).get("currency", {}).get("value", "USD")
             requirement_data = get_required_approver_count(db, vendor_name, total_amount, invoice_id, currency=currency, entity=invoice.get("entity"))
             
             update_data["required_approvers"] = requirement_data["required"]
             update_data["approver_breakdown"] = requirement_data["breakdown"]

    update_query = {"$set": update_data}
    if "invoice_number" in update_data:
        update_query["$unset"] = {"duplicate_info": ""}

    db.invoices.update_one(
        {"_id": ObjectId(invoice_id)},
        update_query
    )

    # --- Registry Sync ---
    # If critical fields changed, update the fast lookup registry
    if new_vendor_id != current_vendor_id or new_invoice_number != current_invoice_number:
        from app.utils.invoice_registry import remove_from_registry, register_invoice
        
        # Remove old entry (keyed by invoice_id)
        remove_from_registry(db, invoice_id)
        
        # Add new entry if fields are present
        if new_vendor_id and new_invoice_number:
            register_invoice(
                db,
                vendor_id=new_vendor_id,
                invoice_number=new_invoice_number,
                entity=invoice.get("entity", ""),
                invoice_id=invoice_id,
                uploaded_by=invoice.get("uploaded_by", "system")
            )

    updated_invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
    updated_invoice["id"] = str(updated_invoice["_id"])

    # [AUDIT] Log Update with Deep Diff
    audit_details = {}
    
    # 1. Top level simple fields (Status is unique here)
    if "status" in update_data and update_data["status"] != invoice.get("status"):
        audit_details["Status"] = {"old": invoice.get("status"), "new": update_data["status"]}
            
    # 2. Extracted Data / Critical Fields (Consolidated Mapping)
    # We check both top-level and nested paths but map them to the same human label
    critical_checks = [
        # (Paths to check, Human Label)
        (["vendor_id"], "Vendor ID"),
        (["vendor_name"], "Vendor Name"),
        (["invoice_number"], "Invoice Number"),
        (["extracted_data", "amounts", "total_invoice_amount", "value"], "Total Invoice Amount"),
        (["extracted_data", "amounts", "total_amount_payable", "value"], "Total Amount Payable"),
        (["extracted_data", "invoice_details", "invoice_number", "value"], "Invoice Number"),
        (["extracted_data", "invoice_details", "invoice_date", "value"], "Invoice Date"),
        (["extracted_data", "vendor_info", "name", "value"], "Vendor Name")
    ]

    def get_nested(d, p):
        val = d
        for step in p:
            if isinstance(val, dict):
                val = val.get(step)
            else:
                return None
        return val

    for path, label in critical_checks:
        # Check update_data first (new state)
        new_val = get_nested(update_data, path)
        if new_val is not None:
             old_val = get_nested(invoice, path)
             if new_val != old_val:
                 # Only add if not already captured by another path for the same label
                 if label not in audit_details:
                     audit_details[label] = {"old": old_val, "new": new_val}
                
    # If no specific details found but we know update happened, fall back to generic list
    if not audit_details:
        audit_details = {"updated_fields": list(update_data.keys())}

    # [AUDIT] Log Update with Specific Action if Status Changed
    action = AuditAction.UPDATED
    if "status" in update_data and update_data["status"] != invoice.get("status"):
        new_status = update_data["status"]
        if new_status == InvoiceStatus.WAITING_CODING:
            action = AuditAction.SENT_FOR_CODING
        elif new_status == InvoiceStatus.WAITING_APPROVAL:
            action = AuditAction.SENT_TO_APPROVAL

    await audit_service.log_action(
        invoice_id=invoice_id, 
        action=action, 
        user=current_user.username,
        entity=updated_invoice.get("entity"),
        details=audit_details
    )

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
    
    # Remove from registry
    from app.utils.invoice_registry import remove_from_registry
    remove_from_registry(db, invoice_id)

    return {"message": "Invoice deleted successfully"}
