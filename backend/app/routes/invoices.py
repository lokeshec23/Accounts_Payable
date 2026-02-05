from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, status
from fastapi.responses import FileResponse
from typing import List, Optional, Dict, Any
from sqlalchemy import select, delete, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.database.sql_server import get_db
from app.auth.jwt import get_current_user
from app.dependencies import get_current_entity
from app.models.user import UserResponse
from app.models.invoice import InvoiceCreate, InvoiceResponse, InvoiceStatus, InvoiceUpdate
from app.models.workflow import WorkflowStepType, WorkflowStepStatus
from app.models.sql.invoice import Invoice as SQLInvoice
from app.models.sql.workflow_step import WorkflowStep as SQLWorkflowStep
from app.services.invoice_processor import InvoiceProcessor
from app.services.line_grouping import aggregate_items
from app.services.audit_service import audit_service
from app.models.audit_log import AuditAction
from datetime import datetime
import os
import uuid
import asyncio

router = APIRouter()
invoice_processor = InvoiceProcessor()

@router.post("/check-duplicate")
async def check_duplicate_invoice_endpoint(
    payload: dict,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db)
):
    from app.ai.duplicate_detector import check_duplicate_invoice
    
    vendor_id = payload.get("vendor_id")
    invoice_number = payload.get("invoice_number")
    current_invoice_id = payload.get("current_invoice_id")
    
    if not vendor_id or not invoice_number:
         return {"is_duplicate": False}

    existing = await check_duplicate_invoice(db, vendor_id, invoice_number, entity)

    if existing:
        if current_invoice_id and str(existing.id) == current_invoice_id:
             return {"is_duplicate": False}
             
        uploaded_date = existing.uploaded_at
        date_str = uploaded_date.strftime("%Y-%m-%d %H:%M") if uploaded_date else "N/A"
        
        return {
            "is_duplicate": True,
            "message": f"Duplicate found: Vendor '{existing.vendor_name or vendor_id}', Invoice #{invoice_number} (Uploaded {date_str})",
            "original_invoice_id": str(existing.id)
        }

    return {"is_duplicate": False}

@router.post("/upload")
async def upload_invoices(
    files: List[UploadFile] = File(...),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db)
):
    from app.ai.duplicate_detector import get_vendor_id_from_master, check_duplicate_invoice
    from app.utils.invoice_registry import register_invoice
    
    upload_dir = "uploads"
    os.makedirs(upload_dir, exist_ok=True)

    saved_invoices = []
    failed_uploads = []

    async def _process_single_file(file: UploadFile):
        clean_name = file.filename.replace("\\", "/").split("/")[-1]
        file_path = None
        try:
            new_name = f"{uuid.uuid4()}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{clean_name}"
            file_path = os.path.join(upload_dir, new_name)
            contents = await file.read()
            with open(file_path, "wb") as f:
                f.write(contents)

            new_invoice = SQLInvoice(
                filename=new_name,
                original_filename=clean_name,
                file_path=file_path,
                uploaded_by=current_user.username,
                status="processed",
                entity=entity,
                uploaded_at=datetime.utcnow(),
                extracted_data={},
                status_history=[{
                    "status": "processed",
                    "user": current_user.username,
                    "timestamp": datetime.utcnow().isoformat(),
                    "comment": None
                }]
            )
            
            db.add(new_invoice)
            await db.commit()
            await db.refresh(new_invoice)

            extraction = await invoice_processor.process_invoice_extraction(file_path)
            new_invoice.extracted_data = extraction.get("extracted_data", {})
            new_invoice.validation_results = extraction.get("validation_results", {})
            new_invoice.confidence_score = extraction.get("metadata", {}).get("confidence_score", "low")
            new_invoice.processed_at = datetime.utcnow()
            
            extracted_data = extraction.get("extracted_data", {})
            vendor_info = extracted_data.get("vendor_info", {})
            extracted_vendor = vendor_info.get("name", {}).get("value")
            extracted_address = vendor_info.get("address", {}).get("value")
            
            current_line_grouping = "No"
            if extracted_vendor or extracted_address:
                res_v_id, res_v_name, res_v_grouping, vendor_details = await get_vendor_id_from_master(db, extracted_vendor, entity, extracted_address)
                if res_v_id:
                    new_invoice.vendor_id = res_v_id
                    new_invoice.vendor_name = res_v_name
                    new_invoice.line_grouping = res_v_grouping
                    current_line_grouping = res_v_grouping
                    
                    if "vendor_info" not in extracted_data:
                        extracted_data["vendor_info"] = {}
                    extracted_data["vendor_info"]["vendor_id"] = {"value": res_v_id}
                    extracted_data["vendor_info"]["name"] = {"value": res_v_name}
            
            invoice_details = extracted_data.get("invoice_details", {})
            new_invoice.invoice_number = invoice_details.get("invoice_number", {}).get("value")

            if current_line_grouping == "Yes":
                items = extracted_data.get("Items", {}).get("value", [])
                if items:
                    new_invoice.original_items = items
                    aggregated = aggregate_items(items)
                    extracted_data["Items"]["value"] = [aggregated]
                    new_invoice.extracted_data = extracted_data

            if new_invoice.vendor_id and new_invoice.invoice_number:
                existing_duplicate = await check_duplicate_invoice(db, new_invoice.vendor_id, new_invoice.invoice_number, entity)
                if existing_duplicate and existing_duplicate.id != new_invoice.id:
                    new_invoice.duplicate_info = {
                         "is_duplicate": True,
                         "reason": f"Duplicate found during upload",
                         "original_invoice_id": existing_duplicate.id
                    }

            workflow_step = SQLWorkflowStep(
                invoice_id=str(new_invoice.id),
                step_name="Processed",
                step_type="processed",
                user=current_user.username,
                status="completed",
                timestamp=datetime.utcnow(),
                entity=entity
            )
            db.add(workflow_step)
            
            await audit_service.log_action(
                db,
                invoice_id=str(new_invoice.id), 
                action=AuditAction.UPLOADED, 
                user=current_user.username,
                entity=entity,
                details={"filename": clean_name}
            )

            if new_invoice.vendor_id and new_invoice.invoice_number:
                await register_invoice(db, new_invoice.vendor_id, new_invoice.invoice_number, entity, new_invoice.id, current_user.username)

            await db.commit()
            
            invoice_dict = {
                "id": str(new_invoice.id),
                "filename": new_invoice.filename,
                "original_filename": new_invoice.original_filename,
                "status": new_invoice.status,
                "uploaded_at": new_invoice.uploaded_at.isoformat(),
                "vendor_name": new_invoice.vendor_name,
                "invoice_number": new_invoice.invoice_number
            }
            return {"success": True, "data": invoice_dict}

        except Exception as e:
            if file_path and os.path.exists(file_path):
                os.remove(file_path)
            await db.rollback()
            return {"success": False, "filename": clean_name, "reason": str(e)}

    tasks = [_process_single_file(file) for file in files]
    results = await asyncio.gather(*tasks)

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
    db: AsyncSession = Depends(get_db),
    skip: int = 0,
    limit: int = 20,
    show_all: bool = True
):
    stmt = select(SQLInvoice).where(SQLInvoice.entity == entity)
    if not show_all:
        stmt = stmt.where(SQLInvoice.uploaded_by == current_user.username)
    
    stmt = stmt.order_by(SQLInvoice.uploaded_at.desc()).offset(skip).limit(limit)
    result = await db.execute(stmt)
    invoices = result.scalars().all()

    invoice_list = []
    for inv in invoices:
        inv_dict = {c.name: getattr(inv, c.name) for c in inv.__table__.columns}
        inv_dict["id"] = str(inv.id)
        invoice_list.append(InvoiceResponse(**inv_dict))

    return invoice_list

@router.get("/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: str,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db)
):
    try:
        inv_id_int = int(invoice_id)
    except ValueError:
         raise HTTPException(status_code=400, detail="Invalid invoice ID format")

    stmt = select(SQLInvoice).where(SQLInvoice.id == inv_id_int, SQLInvoice.entity == entity)
    result = await db.execute(stmt)
    invoice = result.scalar_one_or_none()
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    inv_dict = {c.name: getattr(invoice, c.name) for c in invoice.__table__.columns}
    inv_dict["id"] = str(invoice.id)
    return InvoiceResponse(**inv_dict)

@router.get("/debug/raw/{invoice_id}")
async def get_raw_invoice(invoice_id: str, db: AsyncSession = Depends(get_db)):
    try:
        inv_id_int = int(invoice_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid invoice ID format")

    stmt = select(SQLInvoice).where(SQLInvoice.id == inv_id_int)
    result = await db.execute(stmt)
    invoice = result.scalar_one_or_none()
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Convert SQL model to a dictionary for raw output
    invoice_dict = {c.name: getattr(invoice, c.name) for c in invoice.__table__.columns}
    invoice_dict["id"] = str(invoice.id) # Ensure ID is string
    
    # Handle JSON fields that might be objects
    for key in ["extracted_data", "validation_results", "status_history", "duplicate_info", "original_items"]:
        if key in invoice_dict and invoice_dict[key] is not None:
            # Assuming these are already dicts/lists from JSONB type
            pass 
    
    return invoice_dict


@router.get("/{invoice_id}/pdf")
async def get_invoice_pdf(
    invoice_id: str,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        inv_id_int = int(invoice_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid invoice ID format")

    stmt = select(SQLInvoice).where(SQLInvoice.id == inv_id_int)
    result = await db.execute(stmt)
    invoice = result.scalar_one_or_none()
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    file_path = invoice.file_path
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="PDF file not found")

    return FileResponse(
        path=file_path,
        media_type="application/pdf",
        filename=invoice.original_filename or "invoice.pdf"
    )

@router.put("/{invoice_id}/status")
async def update_invoice_status(
    invoice_id: str,
    status: InvoiceStatus,
    comment: str = None,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    entity: str = Depends(get_current_entity)
):
    try:
        inv_id_int = int(invoice_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid invoice ID format")

    stmt = select(SQLInvoice).where(SQLInvoice.id == inv_id_int, SQLInvoice.entity == entity)
    result = await db.execute(stmt)
    invoice = result.scalar_one_or_none()
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    status_history = list(invoice.status_history or [])
    
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
    # These functions need to be updated to accept db: AsyncSession and SQLInvoice
    vendor_name, vendor_id = await get_vendor_data_from_invoice(db, invoice.id) # Pass invoice.id
    total_amount = await get_invoice_total_from_invoice(db, invoice.id) # Pass invoice.id
    currency = invoice.extracted_data.get("invoice_details", {}).get("currency", {}).get("value", "USD")
    requirement_data = await get_required_approver_count(db, vendor_name, total_amount, invoice.id, invoice_data=invoice, currency=currency, entity=invoice.entity)
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
            substitutes = await check_active_delegation(db, expected_email, invoice.entity)
            if current_user.email.lower() in substitutes:
                is_authorized = True

    already_acted_for_this_level = any(
        h["user"] == current_user.username and 
        h.get("approver_level") == existing_approvals + 1 and # We should ideally track level in history
        h["status"] in [InvoiceStatus.APPROVED, InvoiceStatus.REJECTED, InvoiceStatus.REWORKED]
        for h in current_cycle_history
    )

    if already_acted_for_this_level and status in [InvoiceStatus.APPROVED, InvoiceStatus.REJECTED, InvoiceStatus.REWORKED]:
         raise HTTPException(
            status_code=400,
            detail=f"User {current_user.username} has already taken action for this level."
        )

    # =====================================================
    # PREPARE STATUS ENTRY
    # =====================================================
    new_status_entry = {
        "status": status,
        "user": current_user.username,
        "timestamp": datetime.utcnow().isoformat(),
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

        # Delete workflow steps for coding
        await db.execute(
            delete(SQLWorkflowStep).where(
                SQLWorkflowStep.invoice_id == str(invoice.id),
                SQLWorkflowStep.step_type == WorkflowStepType.CODING
            )
        )

        invoice.status = main_status
        invoice.validation_results = {} # Reset validation results
        invoice.approved_by = [] # Reset approved_by
        invoice.current_approver_level = 1 # Reset approver level
        invoice.status_history = status_history + [new_status_entry] # Append new status

        # [AUDIT] Log Recall
        await audit_service.log_action(
            db,
            invoice_id=str(invoice.id), 
            action=AuditAction.RECALLED, 
            user=current_user.username,
            entity=invoice.entity,
            details={"comment": comment}
        )
        
        await db.commit()
        return {"message": "Status updated", "main_status": main_status}

    # =====================================================
    # REJECT / REWORK / APPROVE
    # =====================================================
    if status in [InvoiceStatus.REJECTED, InvoiceStatus.REWORKED, InvoiceStatus.APPROVED]:
        # These functions need to be updated to accept db: AsyncSession and SQLInvoice
        vendor_name, vendor_id = await get_vendor_data_from_invoice(db, invoice.id)
        total_amount = await get_invoice_total_from_invoice(db, invoice.id)
        currency = invoice.extracted_data.get("invoice_details", {}).get("currency", {}).get("value", "USD")

        requirement_data = await get_required_approver_count(
            db, vendor_name, total_amount, invoice.id, invoice_data=invoice, currency=currency, entity=invoice.entity
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
    
    invoice.status = main_status
    invoice.validation_results["approver_name"] = current_user.username
    invoice.validation_results["approval_timestamp"] = datetime.utcnow().isoformat()
    invoice.validation_results["last_action"] = status
    invoice.validation_results["approver_comment"] = comment
    invoice.status_history = status_history + [new_status_entry]

    if status == InvoiceStatus.APPROVED:
        if current_user.email not in (invoice.approved_by or []):
            invoice.approved_by = (invoice.approved_by or []) + [current_user.email]
        # Sequential: Increment current_approver_level if not final approval
        if main_status == InvoiceStatus.WAITING_APPROVAL:
            invoice.current_approver_level = (invoice.current_approver_level or 0) + 1
    elif status in [InvoiceStatus.REJECTED, InvoiceStatus.REWORKED, InvoiceStatus.WAITING_CODING]:
        invoice.approved_by = []
        invoice.current_approver_level = 1

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

        approver_number = len(cycle_approvals) + 1

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

        new_workflow_step = SQLWorkflowStep(
            invoice_id=str(invoice.id),
            step_name=f"{approver_number}{['st','nd','rd','th'][min(approver_number-1,3)]} Approver",
            step_type=step_type_map.get(approver_number, WorkflowStepType.APPROVER_4),
            user=current_user.username,
            status=workflow_status,
            timestamp=datetime.utcnow(),
            approver_number=approver_number,
            comment=comment,
            entity=invoice.entity # Add entity to workflow step
        )
        db.add(new_workflow_step)

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
            db,
            invoice_id=str(invoice.id), 
            action=display_action, 
            user=current_user.username,
            entity=invoice.entity,
            details={
                "status": {"old": invoice.status, "new": main_status}, # Use invoice.status before update
                "comment": comment,
                "approver_level": approver_number if status in [InvoiceStatus.APPROVED, InvoiceStatus.REJECTED, InvoiceStatus.REWORKED] else None
            }
        )

    await db.commit()
    return {"message": "Status updated", "main_status": main_status}


@router.put("/{invoice_id}")
async def update_invoice(
    invoice_id: str,
    invoice_update: InvoiceUpdate,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    entity: str = Depends(get_current_entity)
):
    from app.ai.duplicate_detector import check_duplicate_invoice
    from app.utils.invoice_registry import register_invoice, remove_from_registry
    from app.models.sql.vendor import Vendor as SQLVendor # Assuming a SQL Vendor model
    
    try:
        inv_id_int = int(invoice_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid invoice ID format")

    stmt = select(SQLInvoice).where(SQLInvoice.id == inv_id_int, SQLInvoice.entity == entity)
    result = await db.execute(stmt)
    invoice = result.scalar_one_or_none()
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    update_data = invoice_update.dict(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")

    old_status = invoice.status
    old_vendor_id = invoice.vendor_id
    old_invoice_number = invoice.invoice_number

    # --- Line grouping toggle when vendor changes ---
    if "vendor_id" in update_data and update_data["vendor_id"] != old_vendor_id:
        new_vendor_id = update_data["vendor_id"]
        vendor_stmt = select(SQLVendor).where(SQLVendor.vendor_id == new_vendor_id, SQLVendor.entity == entity)
        vendor_result = await db.execute(vendor_stmt)
        vendor = vendor_result.scalar_one_or_none()
        
        new_grouping = vendor.line_grouping if vendor else "No"

        # Get current extracted_data, or use the one from update_data if provided
        extracted_data = update_data.get("extracted_data", invoice.extracted_data.copy() if invoice.extracted_data else {})
        items = extracted_data.get("Items", {}).get("value", [])

        # Preserve original items if they exist, otherwise use current items
        original_items = invoice.original_items if invoice.original_items else items
        
        # Update original_items in the invoice object
        invoice.original_items = original_items

        if new_grouping == "Yes":
            aggregated = aggregate_items(original_items)
            extracted_data["Items"]["value"] = [aggregated]
        else:
            extracted_data["Items"]["value"] = original_items

        update_data["extracted_data"] = extracted_data
        update_data["line_grouping"] = new_grouping # Update line_grouping field in invoice

    # Apply updates to the invoice object
    for key, value in update_data.items():
        if hasattr(invoice, key):
             setattr(invoice, key, value)
    
    # [SYNC] Ensure top-level columns match extracted_data if it was updated
    if "extracted_data" in update_data:
        ex_data = update_data["extracted_data"]
        
        # Sync Vendor Name
        v_name = ex_data.get("vendor_info", {}).get("name", {}).get("value")
        if v_name:
            invoice.vendor_name = v_name
            
        # Sync Vendor ID
        v_id = ex_data.get("vendor_info", {}).get("vendor_id", {}).get("value")
        if v_id:
            invoice.vendor_id = v_id
            
        # Sync Invoice Number
        inv_num = ex_data.get("invoice_details", {}).get("invoice_number", {}).get("value")
        if inv_num:
            invoice.invoice_number = inv_num
    
    new_vendor_id = invoice.vendor_id # Get potentially updated vendor_id
    new_invoice_number = invoice.invoice_number # Get potentially updated invoice_number
    
    # Handle duplicate check if critical fields changed
    if (new_vendor_id != old_vendor_id or new_invoice_number != old_invoice_number) and new_vendor_id and new_invoice_number:
        duplicate = await check_duplicate_invoice(db, new_vendor_id, new_invoice_number, invoice.entity)
        if duplicate and duplicate.id != invoice.id:
            raise HTTPException(
                status_code=409, 
                detail=f"Duplicate detected: Vendor ID '{new_vendor_id}' already has Invoice #'{new_invoice_number}'."
            )
        else:
            invoice.duplicate_info = None # Clear duplicate info if no longer a duplicate

    # Registry Sync
    if new_vendor_id != old_vendor_id or new_invoice_number != old_invoice_number:
        await remove_from_registry(db, str(invoice.id)) # Pass db
        if new_vendor_id and new_invoice_number:
            await register_invoice(
                db,
                vendor_id=new_vendor_id,
                invoice_number=new_invoice_number,
                entity=invoice.entity,
                invoice_id=invoice.id,
                uploaded_by=invoice.uploaded_by
            )

    # Audit Logging
    action = AuditAction.UPDATED
    if "status" in update_data and update_data["status"] != old_status:
         if update_data["status"] == InvoiceStatus.WAITING_CODING:
             action = AuditAction.SENT_FOR_CODING
         elif update_data["status"] == InvoiceStatus.WAITING_APPROVAL:
             action = AuditAction.SENT_TO_APPROVAL

    await audit_service.log_action(
        db,
        invoice_id=str(invoice.id), 
        action=action, 
        user=current_user.username,
        entity=invoice.entity,
        details={"updated_fields": list(update_data.keys())}
    )

    await db.commit()
    await db.refresh(invoice)
    
    inv_dict = {c.name: getattr(invoice, c.name) for c in invoice.__table__.columns}
    inv_dict["id"] = str(invoice.id)
    return InvoiceResponse(**inv_dict)


@router.delete("/{invoice_id}")
async def delete_invoice(
    invoice_id: str,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    entity: str = Depends(get_current_entity)
):
    from app.utils.invoice_registry import remove_from_registry
    
    try:
        inv_id_int = int(invoice_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid invoice ID format")

    stmt = select(SQLInvoice).where(SQLInvoice.id == inv_id_int, SQLInvoice.entity == entity)
    result = await db.execute(stmt)
    invoice = result.scalar_one_or_none()
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    # Delete associated workflow steps
    await db.execute(
        delete(SQLWorkflowStep).where(SQLWorkflowStep.invoice_id == str(invoice.id))
    )

    # Log audit action before deleting the invoice itself
    await audit_service.log_action(
        db,
        invoice_id=str(invoice.id), 
        action=AuditAction.DELETED, 
        user=current_user.username,
        entity=invoice.entity,
        details={"filename": invoice.original_filename}
    )

    await db.delete(invoice)
    await remove_from_registry(db, str(invoice.id))
    await db.commit()

    return {"message": "Invoice deleted successfully"}
