# from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, status
# from fastapi.responses import FileResponse
# from typing import List
# from app.services.invoice_processor import InvoiceProcessor
# from app.models.invoice import InvoiceCreate, InvoiceResponse, InvoiceStatus, InvoiceUpdate
# from app.models.workflow import WorkflowStepType, WorkflowStepStatus
# from app.database.mongodb import get_database
# from app.auth.jwt import get_current_user
# from app.dependencies import get_current_entity
# from app.models.user import UserResponse
# from datetime import datetime
# import os
# from bson.objectid import ObjectId
# import uuid
# import asyncio

# router = APIRouter()
# invoice_processor = InvoiceProcessor()


# @router.post("/check-duplicate")
# async def check_duplicate_invoice_endpoint(
#     payload: dict,
#     current_user: UserResponse = Depends(get_current_user),
#     entity: str = Depends(get_current_entity)
# ):
#     from app.utils.invoice_registry import check_registry_duplicate
#     from app.ai.duplicate_detector import check_duplicate_invoice

#     db = get_database()
    
#     vendor_id = payload.get("vendor_id")
#     invoice_number = payload.get("invoice_number")
#     current_invoice_id = payload.get("current_invoice_id")
    
#     if not vendor_id or not invoice_number:
#          return {"is_duplicate": False}

#     # 1. Try Fast Registry Lookup
#     existing = check_registry_duplicate(db, vendor_id, invoice_number, entity)
    
#     # 2. Fallback to Direct Collection Lookup (if registry empty or out of sync)
#     if not existing:
#         existing = check_duplicate_invoice(db, vendor_id, invoice_number, entity)

#     if existing:
#         # Check if it is the SAME invoice
#         if current_invoice_id and str(existing.get("_id")) == current_invoice_id:
#              return {"is_duplicate": False}
             
#         uploaded_date = existing.get("uploaded_at")
#         date_str = uploaded_date.strftime("%Y-%m-%d %H:%M") if uploaded_date else "N/A"
        
#         return {
#             "is_duplicate": True,
#             "message": f"Duplicate found: Vendor '{existing.get('vendor_name', vendor_id)}', Invoice #{invoice_number} (Uploaded {date_str})",
#             "original_invoice_id": str(existing.get("_id"))
#         }

#     return {"is_duplicate": False}



# @router.post("/upload")
# async def upload_invoices(
#     files: List[UploadFile] = File(...),
#     current_user: UserResponse = Depends(get_current_user),
#     entity: str = Depends(get_current_entity)
# ):
#     from app.ai.duplicate_detector import (
#         extract_vendor_invoice_and_address,
#         get_vendor_id_from_master
#     )
#     from app.utils.invoice_registry import check_registry_duplicate, register_invoice
    
#     db = get_database()
#     upload_dir = "uploads"
#     os.makedirs(upload_dir, exist_ok=True)

#     duplicates = []  # Track duplicate files
#     saved_invoices = []  # Track successfully uploaded invoices
#     failed_uploads = []  # Track failed uploads

#     async def _process_single_file(file: UploadFile):
#         clean_name = file.filename.replace("\\", "/").split("/")[-1]
#         file_path = None
#         try:
#             # ---- CLEAN FILENAME ----
#             clean_name = file.filename.replace("\\", "/").split("/")[-1]
#             new_name = f"{uuid.uuid4()}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{clean_name}"
#             file_path = os.path.join(upload_dir, new_name)

#             # ---- SAVE FILE ----
#             contents = await file.read()
#             with open(file_path, "wb") as f:
#                 f.write(contents)

#             # ---- DUPLICATE DETECTION (BEFORE EXTRACTION) ----
#             extracted_vendor_name, invoice_number, extracted_vendor_address = await extract_vendor_invoice_and_address(file_path)
            
#             duplicate_info = None
#             if (extracted_vendor_name or extracted_vendor_address) and invoice_number:
#                 # Get vendor ID, OFFICIAL vendor name, and line grouping config from master
#                 vendor_id, official_vendor_name, line_grouping = get_vendor_id_from_master(db, extracted_vendor_name, entity, extracted_vendor_address)
                
#                 if vendor_id:
#                     # Fast O(1) duplicate check using registry
#                     existing_invoice = check_registry_duplicate(db, vendor_id, invoice_number, entity)
                    
#                     if existing_invoice:
#                         # Duplicate found BUT allow upload with warning
#                         uploaded_date = existing_invoice.get("uploaded_at")
#                         date_str = uploaded_date.strftime("%Y-%m-%d %H:%M") if uploaded_date else "N/A"
                        
#                         duplicate_info = {
#                              "is_duplicate": True,
#                              "reason": f"Duplicate: Vendor '{official_vendor_name}', Invoice #{invoice_number} (Uploaded {date_str})",
#                              "original_invoice_id": str(existing_invoice.get("_id"))
#                         }

#             # ---- CREATE DB RECORD ----
#             invoice_data = InvoiceCreate(
#                 filename=new_name,
#                 original_filename=clean_name,
#                 file_path=file_path,
#                 uploaded_by=current_user.username,
#                 status=InvoiceStatus.PROCESSED,
#                 entity=entity
#             )

#             invoice_dict = invoice_data.dict()
#             invoice_dict["uploaded_at"] = datetime.utcnow()
#             invoice_dict["extracted_data"] = {}
#             invoice_dict["processing_steps"] = []
#             invoice_dict["status_history"] = [{
#                 "status": InvoiceStatus.PROCESSED,
#                 "user": current_user.username,
#                 "timestamp": datetime.utcnow(),
#                 "comment": None
#             }]
            
#             # Add vendor_id, official vendor name, and invoice_number if available
#             current_line_grouping = "No"
#             if (extracted_vendor_name or extracted_vendor_address) and invoice_number:
#                 vendor_id, official_vendor_name, line_grouping = get_vendor_id_from_master(db, extracted_vendor_name, entity, extracted_vendor_address)
#                 if vendor_id:
#                     invoice_dict["azure_vendor_name"] = extracted_vendor_name
#                     invoice_dict["vendor_id"] = vendor_id
#                     invoice_dict["vendor_name"] = official_vendor_name  # Official name from master
#                     invoice_dict["invoice_number"] = invoice_number
#                     current_line_grouping = line_grouping
            
#             invoice_dict["line_grouping"] = current_line_grouping
#             if duplicate_info:
#                 invoice_dict["duplicate_info"] = duplicate_info

#             result = db.invoices.insert_one(invoice_dict)
#             invoice_id = str(result.inserted_id)

#             # ---- RUN EXTRACTION ----
#             extraction = await invoice_processor.process_invoice_extraction(file_path)

#             update_data = {
#                 "extracted_data": extraction.get("extracted_data", {}),
#                 "processing_steps": extraction.get("processing_steps", []),
#                 "validation_results": extraction.get("validation_results", {}),
#                 "confidence_score": extraction.get("metadata", {}).get("confidence_score", "low"),
#                 "processed_at": datetime.utcnow()
#             }
            
#             # Update vendor_id and vendor_name from full extraction if not already set
#             extracted_data = extraction.get("extracted_data", {})
#             if not invoice_dict.get("vendor_id"):
#                 # Try to get vendor name from full extraction
#                 vendor_info = extracted_data.get("vendor_info", {})
#                 extracted_vendor = vendor_info.get("name", {}).get("value")
#                 extracted_address = vendor_info.get("address", {}).get("value")
#                 if extracted_vendor or extracted_address:
#                     update_data["azure_vendor_name"] = extracted_vendor
#                     vendor_id, official_vendor_name, line_grouping = get_vendor_id_from_master(db, extracted_vendor, entity, extracted_address)
#                     if vendor_id:
#                         update_data["vendor_id"] = vendor_id
#                         update_data["vendor_name"] = official_vendor_name
#                         update_data["line_grouping"] = line_grouping
#                         current_line_grouping = line_grouping
            
#             if not invoice_dict.get("invoice_number"):
#                 # Try to get invoice number from extraction
#                 invoice_details = extracted_data.get("invoice_details", {})
#                 extracted_invoice_num = invoice_details.get("invoice_number", {}).get("value")
#                 if extracted_invoice_num:
#                     update_data["invoice_number"] = extracted_invoice_num

#             # ---- LINE GROUPING LOGIC ----
#             if current_line_grouping == "Yes":
#                 if "Items" in extracted_data and "value" in extracted_data["Items"] and extracted_data["Items"]["value"]:
#                     items = extracted_data["Items"]["value"]
#                     first_item = items[0]
                    
#                     aggregated_description = first_item.get("description", {}).get("value") or "Aggregated Items"
#                     total_quantity = 0.0
#                     total_unit_price = 0.0
#                     total_net_amount = 0.0
                    
#                     def safe_to_float(v):
#                         if v is None: return 0.0
#                         if isinstance(v, (int, float)): return float(v)
#                         try:
#                             # Clean currency symbols and commas
#                             return float(str(v).replace('$', '').replace(',', '').strip())
#                         except:
#                             return 0.0

#                     for item in items:
#                         total_quantity += safe_to_float(item.get("quantity", {}).get("value"))
#                         total_unit_price += safe_to_float(item.get("unit_price", {}).get("value"))
#                         total_net_amount += safe_to_float(item.get("amount", {}).get("value"))
                    
#                     # Create single aggregated line
#                     aggregated_item = {
#                         "description": {"value": aggregated_description, "source": "aggregation", "confidence": 1.0},
#                         "quantity": {"value": total_quantity, "source": "aggregation", "confidence": 1.0},
#                         "unit_price": {"value": total_unit_price, "source": "aggregation", "confidence": 1.0},
#                         "amount": {"value": total_net_amount, "source": "aggregation", "confidence": 1.0},
#                         "item_code": first_item.get("item_code", {"value": None}),
#                         "unit_of_measure": first_item.get("unit_of_measure", {"value": None}),
#                         "discount": {"value": 0.0},
#                         "tax_rate": {"value": 0.0},
#                         "tax_amount": {"value": 0.0},
#                         "gross_amount": {"value": total_net_amount}
#                     }
                    
#                     extracted_data["Items"]["value"] = [aggregated_item]
#                     update_data["extracted_data"] = extracted_data

#             db.invoices.update_one({"_id": result.inserted_id}, {"$set": update_data})

#             # ---- POST-EXTRACTION DUPLICATE CHECK (Fallback) ----
#             # If quick extraction failed, check for duplicates after full extraction
#             final_vendor_id = update_data.get("vendor_id") or invoice_dict.get("vendor_id")
#             final_invoice_number = update_data.get("invoice_number") or invoice_dict.get("invoice_number")
            
#             if final_vendor_id and final_invoice_number:
#                 # Check if this combination already exists (excluding current invoice)
#                 existing_duplicate = check_registry_duplicate(db, final_vendor_id, final_invoice_number, entity)
                
#                 if existing_duplicate and str(existing_duplicate.get("_id")) != invoice_id:
#                      # Duplicate found AFTER extraction - Flag it
#                     uploaded_date = existing_duplicate.get("uploaded_at")
#                     date_str = uploaded_date.strftime("%Y-%m-%d %H:%M") if uploaded_date else "N/A"
                    
#                     update_data["duplicate_info"] = {
#                          "is_duplicate": True,
#                          "reason": f"Duplicate (Full): Vendor {update_data.get('vendor_name', final_vendor_id)}, Invoice #{final_invoice_number} (Uploaded {date_str})",
#                          "original_invoice_id": str(existing_duplicate.get("_id"))
#                     }


#             # ---- CREATE WORKFLOW STEP: PROCESSED ----
#             workflow_step = {
#                 "invoice_id": invoice_id,
#                 "step_name": "Processed",
#                 "step_type": WorkflowStepType.PROCESSED,
#                 "user": current_user.username,
#                 "status": WorkflowStepStatus.COMPLETED,
#                 "timestamp": datetime.utcnow(),
#                 "approver_number": None,
#                 "comment": None,
#                 "entity": entity
#             }
#             db.workflow_steps.insert_one(workflow_step)

#             # ---- REGISTER IN FAST LOOKUP REGISTRY ----
#             # Get final vendor_id and invoice_number (may have been updated from full extraction)
#             final_vendor_id = update_data.get("vendor_id") or invoice_dict.get("vendor_id")
#             final_invoice_number = update_data.get("invoice_number") or invoice_dict.get("invoice_number")
            
#             if final_vendor_id and final_invoice_number:
#                 register_invoice(
#                     db,
#                     vendor_id=final_vendor_id,
#                     invoice_number=final_invoice_number,
#                     entity=entity,
#                     invoice_id=invoice_id,
#                     uploaded_by=current_user.username
#                 )

#             # ---- PREPARE JSON SAFE RESPONSE ----
#             invoice_dict.update(update_data)
#             invoice_dict["id"] = invoice_id
#             invoice_dict.pop("_id", None)
            
#             # Convert datetime objects to ISO strings for JSON serialization
#             for key, value in invoice_dict.items():
#                 if isinstance(value, datetime):
#                     invoice_dict[key] = value.isoformat()
#                 elif isinstance(value, list):
#                     # Handle lists (like status_history)
#                     for i, item in enumerate(value):
#                         if isinstance(item, dict):
#                             for k, v in item.items():
#                                 if isinstance(v, datetime):
#                                     value[i][k] = v.isoformat()
            
#             return {"success": True, "data": invoice_dict}

#         except Exception as e:
#             if file_path and os.path.exists(file_path):
#                 os.remove(file_path)
#             import traceback
#             print(f"❌ ERROR processing file {file.filename}: {e}")
#             traceback.print_exc()
#             return {"success": False, "filename": clean_name, "reason": str(e)}

#     # Run processing tasks concurrently
#     tasks = [_process_single_file(file) for file in files]
#     results = await asyncio.gather(*tasks)

#     # Handle results
#     for res in results:
#         if res["success"]:
#             saved_invoices.append(res["data"])
#         else:
#             failed_uploads.append({"filename": res["filename"], "reason": res["reason"]})

#     return {
#         "count": len(saved_invoices),
#         "invoices": saved_invoices,
#         "failed": failed_uploads
#     }


# @router.get("/", response_model=List[InvoiceResponse])
# async def get_invoices(
#     current_user: UserResponse = Depends(get_current_user),
#     entity: str = Depends(get_current_entity),
#     skip: int = 0,
#     limit: int = 10,
#     show_all: bool = True
# ):
#     db = get_database()

#     query = {"entity": entity}
#     if not show_all:
#         query["uploaded_by"] = current_user.username

#     invoices = db.invoices.find(query).sort("uploaded_at", -1).skip(skip).limit(limit)

#     invoice_list = []
#     for invoice in invoices:
#         invoice["id"] = str(invoice["_id"])
#         invoice_list.append(InvoiceResponse(**invoice))

#     return invoice_list


# @router.get("/{invoice_id}", response_model=InvoiceResponse)
# async def get_invoice(
#     invoice_id: str,
#     current_user: UserResponse = Depends(get_current_user),
#     entity: str = Depends(get_current_entity)
# ):
#     db = get_database()

#     invoice = db.invoices.find_one({"_id": ObjectId(invoice_id), "entity": entity})
#     if not invoice:
#         raise HTTPException(status_code=404, detail="Invoice not found")

#     invoice["id"] = str(invoice["_id"])
#     return InvoiceResponse(**invoice)

# @router.get("/debug/raw/{invoice_id}")
# async def get_raw_invoice(invoice_id: str):
#     db = get_database()
#     invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
#     if not invoice:
#         return {"error": "Not found"}
#     invoice["_id"] = str(invoice["_id"])
#     return invoice


# @router.get("/{invoice_id}/pdf")
# async def get_invoice_pdf(
#     invoice_id: str,
#     current_user: UserResponse = Depends(get_current_user)
# ):
#     db = get_database()

#     invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
#     if not invoice:
#         raise HTTPException(status_code=404, detail="Invoice not found")

#     file_path = invoice.get("file_path")
#     if not file_path or not os.path.exists(file_path):
#         raise HTTPException(status_code=404, detail="PDF file not found")

#     return FileResponse(
#         path=file_path,
#         media_type="application/pdf",
#         filename=invoice.get("original_filename", "invoice.pdf")
#     )

# @router.put("/{invoice_id}/status")
# async def update_invoice_status(
#     invoice_id: str,
#     status: InvoiceStatus,
#     comment: str = None,
#     current_user: UserResponse = Depends(get_current_user)
# ):
#     db = get_database()

#     approver_name = current_user.username
#     timestamp = datetime.utcnow()

#     invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
#     if not invoice:
#         raise HTTPException(status_code=404, detail="Invoice not found")

#     status_history = invoice.get("status_history", [])

#     # =====================================================
#     # FIND CURRENT APPROVAL CYCLE (AFTER LAST REWORK)
#     # =====================================================
#     last_rework_index = -1
#     for i in range(len(status_history) - 1, -1, -1):
#         if status_history[i]["status"] == InvoiceStatus.REWORKED:
#             last_rework_index = i
#             break

#     current_cycle_history = (
#         status_history[last_rework_index + 1 :]
#         if last_rework_index != -1
#         else status_history
#     )

#     # =====================================================
#     # BLOCK DOUBLE ACTION IN SAME CYCLE (SOPHISTICATED CHECK)
#     # =====================================================
    
#     # We need to know which approvers are assigned to fetch delegation
#     from app.routes.workflow import (
#         get_vendor_data_from_invoice,
#         get_required_approver_count,
#         get_invoice_total_from_invoice
#     )
#     vendor_name, vendor_id = get_vendor_data_from_invoice(db, invoice_id)
#     total_amount = get_invoice_total_from_invoice(db, invoice_id)
#     currency = invoice.get("extracted_data", {}).get("invoice_details", {}).get("currency", {}).get("value", "USD")
#     requirement_data = get_required_approver_count(db, vendor_name, total_amount, invoice_id, invoice_data=invoice, currency=currency, entity=invoice.get("entity"))
#     assigned_approvers = requirement_data.get("assigned_approvers", [])
    
#     existing_approvals = sum(1 for h in current_cycle_history if h["status"] == InvoiceStatus.APPROVED)
    
#     # Who is the EXPECTED approver right now?
#     expected_email = None
#     if assigned_approvers and existing_approvals < len(assigned_approvers):
#         expected_email = assigned_approvers[existing_approvals].lower()

#     # Is the current user the expected approver OR their active substitute?
#     is_authorized = False
#     if expected_email:
#         if current_user.email.lower() == expected_email:
#             is_authorized = True
#         else:
#             from app.models.delegation import check_active_delegation
#             substitutes = check_active_delegation(db, expected_email, invoice.get("entity"))
#             if current_user.email.lower() in substitutes:
#                 is_authorized = True

#     # Modified "already acted" check: 
#     # Only block if they ALREADY acted for the CURRENT level in this cycle.
#     # Since we create a workflow_step every time, we can check how many actions the user took vs their assignments.
#     # However, a simpler way: If they are the AUTHORIZED person for the CURRENT level, let them act, 
#     # even if they acted for a previous level.
    
#     already_acted_for_this_level = any(
#         h["user"] == approver_name and 
#         h.get("approver_level") == existing_approvals + 1 and # We should ideally track level in history
#         h["status"] in [InvoiceStatus.APPROVED, InvoiceStatus.REJECTED, InvoiceStatus.REWORKED]
#         for h in current_cycle_history
#     )

#     # If they are NOT authorized for this turn, or they already acted FOR THIS TURN, block them.
#     # BUT if they are authorized for THIS turn, even if they acted for a PREVIOUS turn, allow.
#     if already_acted_for_this_level and status in [InvoiceStatus.APPROVED, InvoiceStatus.REJECTED, InvoiceStatus.REWORKED]:
#          raise HTTPException(
#             status_code=400,
#             detail=f"User {approver_name} has already taken action for this level."
#         )

#     # =====================================================
#     # PREPARE STATUS ENTRY
#     # =====================================================
#     new_status_entry = {
#         "status": status,
#         "user": approver_name,
#         "timestamp": timestamp,
#         "comment": comment,
#         "approver_level": existing_approvals + 1 if status in [InvoiceStatus.APPROVED, InvoiceStatus.REJECTED, InvoiceStatus.REWORKED] else None
#     }

#     main_status = InvoiceStatus.WAITING_APPROVAL
#     extra_fields = {}

#     # =====================================================
#     #  WAITING_CODING (RECALL)
#     # =====================================================
#     if status == InvoiceStatus.WAITING_CODING:
#         main_status = InvoiceStatus.WAITING_CODING

#         db.workflow_steps.delete_many({
#             "invoice_id": invoice_id,
#             "step_type": WorkflowStepType.CODING
#         })

#         db.invoices.update_one(
#             {"_id": ObjectId(invoice_id)},
#             {
#                 "$set": {"status": main_status, "validation_results": {}, "approved_by": []},
#                 "$push": {"status_history": new_status_entry}
#             }
#         )
#         return {"message": "Status updated", "main_status": main_status}

#     # =====================================================
#     # REJECT / REWORK
#     # =====================================================
#     if status in [InvoiceStatus.REJECTED, InvoiceStatus.REWORKED, InvoiceStatus.APPROVED]:
#         from app.routes.workflow import (
#             get_vendor_data_from_invoice,
#             get_required_approver_count,
#             get_invoice_total_from_invoice
#         )

#         vendor_name, vendor_id = get_vendor_data_from_invoice(db, invoice_id)
#         total_amount = get_invoice_total_from_invoice(db, invoice_id)
#         currency = invoice.get("extracted_data", {}).get("invoice_details", {}).get("currency", {}).get("value", "USD")

#         requirement_data = get_required_approver_count(
#             db, vendor_name, total_amount, invoice_id, invoice_data=invoice, currency=currency, entity=invoice.get("entity")
#         )
#         required_approvers = requirement_data["required"]
#         assigned_approvers = requirement_data.get("assigned_approvers", [])

#         # COUNT ONLY CURRENT CYCLE APPROVALS
#         existing_approvals = sum(
#             1 for h in current_cycle_history
#             if h["status"] == InvoiceStatus.APPROVED
#         )

#         # SEQUENTIAL ORDER ENFORCEMENT
#         if assigned_approvers:
#             if not is_authorized: # Use the is_authorized flag we calculated above
#                  raise HTTPException(
#                     status_code=403,
#                     detail=f"Only {expected_email} (or their active substitute) can take action at this level."
#                 )

#         if status == InvoiceStatus.APPROVED:
#             approvals = existing_approvals + 1
#             if approvals >= required_approvers:
#                 main_status = InvoiceStatus.APPROVED
#             else:
#                 main_status = InvoiceStatus.WAITING_APPROVAL
#         else:
#             main_status = status

#     # =====================================================
#     # SAVE INVOICE
#     # =====================================================
    
#     # Per-Approver Visibility Logic
#     # (handled by explicit operators in update_query construction below)
#     pass

#     # Update operation construction
#     update_query = {
#         "$set": {
#             "status": main_status,
#             "validation_results.approver_name": approver_name,
#             "validation_results.approval_timestamp": timestamp.isoformat(),
#             "validation_results.last_action": status,
#             "validation_results.approver_comment": comment,
#             **extra_fields
#         },
#         "$push": {"status_history": new_status_entry}
#     }

#     # Add specific operator for approved_by
#     if status == InvoiceStatus.APPROVED:
#         update_query["$addToSet"] = {"approved_by": current_user.email}
#         # Sequential: Increment current_approver_level if not final approval
#         if main_status == InvoiceStatus.WAITING_APPROVAL:
#             update_query["$set"]["current_approver_level"] = approvals + 1
#     elif status in [InvoiceStatus.REJECTED, InvoiceStatus.REWORKED, InvoiceStatus.WAITING_CODING]:
#         update_query["$set"]["approved_by"] = []
#         update_query["$set"]["current_approver_level"] = 1

#     db.invoices.update_one(
#         {"_id": ObjectId(invoice_id)},
#         update_query
#     )

#     db.invoices.update_one(
#         {"_id": ObjectId(invoice_id)},
#         update_query
#     )

#     # =====================================================
#     # CREATE WORKFLOW STEP (RESET AFTER REWORK)
#     # =====================================================
#     if status in [
#         InvoiceStatus.APPROVED,
#         InvoiceStatus.REJECTED,
#         InvoiceStatus.REWORKED
#     ]:
#         #COUNT APPROVERS IN *CURRENT CYCLE ONLY*
#         cycle_approvals = [
#             h for h in current_cycle_history
#             if h["status"] == InvoiceStatus.APPROVED
#         ]

#         approver_number = reminder = len(cycle_approvals) + 1

#         step_type_map = {
#             1: WorkflowStepType.APPROVER_1,
#             2: WorkflowStepType.APPROVER_2,
#             3: WorkflowStepType.APPROVER_3,
#             4: WorkflowStepType.APPROVER_4
#         }

#         workflow_status = WorkflowStepStatus.APPROVED
#         if status == InvoiceStatus.REJECTED:
#             workflow_status = WorkflowStepStatus.REJECTED
#         elif status == InvoiceStatus.REWORKED:
#             workflow_status = WorkflowStepStatus.REWORKED

#         db.workflow_steps.insert_one({
#             "invoice_id": invoice_id,
#             "step_name": f"{approver_number}{['st','nd','rd','th'][min(approver_number-1,3)]} Approver",
#             "step_type": step_type_map.get(approver_number, WorkflowStepType.APPROVER_4),
#             "user": approver_name,
#             "status": workflow_status,
#             "timestamp": timestamp,
#             "approver_number": approver_number,
#             "comment": comment
#         })

#     return {"message": "Status updated", "main_status": main_status}


# @router.put("/{invoice_id}")
# async def update_invoice(
#     invoice_id: str,
#     invoice_update: InvoiceUpdate,
#     current_user: UserResponse = Depends(get_current_user)
# ):
#     from app.utils.invoice_registry import check_registry_duplicate
#     from app.ai.duplicate_detector import check_duplicate_invoice
    
#     db = get_database()

#     update_data = {k: v for k, v in invoice_update.dict().items() if v is not None}
#     if not update_data:
#         raise HTTPException(status_code=400, detail="No data to update")

#     invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
#     if not invoice:
#         raise HTTPException(status_code=404, detail="Invoice not found")

#     # --- Duplicate Check Logic (Constraint Enforcement) ---
#     # Determine the effective vendor_id and invoice_number after update
#     # Check if they are being updated in extracted_data
    
#     current_vendor_id = invoice.get("vendor_id")
#     current_invoice_number = invoice.get("invoice_number")
    
#     new_vendor_id = current_vendor_id
#     new_invoice_number = current_invoice_number
    
#     requires_check = False
    
#     # 1. Check top-level updates
#     if "vendor_id" in update_data:
#         new_vendor_id = update_data["vendor_id"]
#         requires_check = True
#     if "invoice_number" in update_data:
#         new_invoice_number = update_data["invoice_number"]
#         requires_check = True
        
#     # 2. Check extracted_data updates (which might override or sync with top-level)
#     extracted_data = update_data.get("extracted_data")
#     if extracted_data:
#         # Vendor ID
#         ev_id = extracted_data.get("vendor_info", {}).get("vendor_id", {}).get("value")
#         if ev_id:
#             new_vendor_id = ev_id
#             requires_check = True
            
#         # Invoice Number
#         ein_num = extracted_data.get("invoice_details", {}).get("invoice_number", {}).get("value")
#         if ein_num:
#             new_invoice_number = ein_num
#             requires_check = True

#     if requires_check and new_vendor_id and new_invoice_number:
#         # If either changed, or if we just want to be safe, check for duplicates (excluding self)
#         # We need to ensure we don't block saving the SAME invoice (self)
        
#         # 1. Try Fast Registry Lookup
#         duplicate = check_registry_duplicate(db, new_vendor_id, new_invoice_number, invoice.get("entity"))
        
#         # 2. Fallback to Robust DB Lookup (Case-Insensitive)
#         if not duplicate:
#             duplicate = check_duplicate_invoice(db, new_vendor_id, new_invoice_number, invoice.get("entity"))
        
#         if duplicate and str(duplicate.get("_id")) != invoice_id:
#              raise HTTPException(
#                 status_code=409, 
#                 detail=f"Duplicate detected: Vendor ID '{new_vendor_id}' already has Invoice #'{new_invoice_number}'."
#             )

#     # --- Vendor Mapping Persistence ---
#     extracted_data = update_data.get("extracted_data")
#     if extracted_data:
#         # Check if vendor info is being updated
#         new_vendor_id = extracted_data.get("vendor_info", {}).get("vendor_id", {}).get("value")
#         new_vendor_name = extracted_data.get("vendor_info", {}).get("name", {}).get("value")
        
#         old_vendor_id = invoice.get("vendor_id")
#         azure_vendor_name = invoice.get("azure_vendor_name")
        
#         if azure_vendor_name and new_vendor_id and new_vendor_id != old_vendor_id:
#             from app.ai.normalizer import normalize_vendor, normalize_address
            
#             # Persist Name-based mapping
#             norm_azure_name = normalize_vendor(azure_vendor_name)
#             if norm_azure_name:
#                 mapping = {
#                     "extracted_name": azure_vendor_name,
#                     "extracted_name_normalized": norm_azure_name,
#                     "vendor_id": new_vendor_id,
#                     "official_name": new_vendor_name or invoice.get("vendor_name"),
#                     "entity": invoice.get("entity"),
#                     "updated_at": datetime.utcnow(),
#                     "updated_by": current_user.username
#                 }
#                 db.vendor_metadata.update_one(
#                     {"extracted_name_normalized": norm_azure_name, "entity": invoice.get("entity")},
#                     {"$set": mapping},
#                     upsert=True
#                 )
            
#             # Persist Address-based mapping if available
#             vendor_info = extracted_data.get("vendor_info", {})
#             azure_address = vendor_info.get("address", {}).get("value")
#             if azure_address:
#                 norm_azure_addr = normalize_address(azure_address)
#                 if norm_azure_addr:
#                     addr_mapping = {
#                         "extracted_address": azure_address,
#                         "extracted_address_normalized": norm_azure_addr,
#                         "vendor_id": new_vendor_id,
#                         "official_name": new_vendor_name or invoice.get("vendor_name"),
#                         "entity": invoice.get("entity"),
#                         "updated_at": datetime.utcnow(),
#                         "updated_by": current_user.username
#                     }
#                     db.vendor_metadata.update_one(
#                         {"extracted_address_normalized": norm_azure_addr, "entity": invoice.get("entity")},
#                         {"$set": addr_mapping},
#                         upsert=True
#                     )
#                 # Also update top-level vendor fields in the invoice
#                 update_data["vendor_id"] = new_vendor_id
#                 if new_vendor_name:
#                     update_data["vendor_name"] = new_vendor_name

#     # merge validation
#     if "validation_results" in update_data:
#         existing_validation = invoice.get("validation_results", {}) or {}
#         update_data["validation_results"] = {
#             **existing_validation,
#             **update_data["validation_results"]
#         }

    
#     # Check if status is being updated to WAITING_APPROVAL in generic update
#     if "status" in update_data and update_data["status"] == InvoiceStatus.WAITING_APPROVAL:
#         existing_req = invoice.get("required_approvers")
        
#         if existing_req is not None:
#              # Ensure these are preserved/set if passed, implicitly they might be missing from update_data
#              # If update_data doesn't have them, we don't need to add them if they are already in DB?
#              # No, update_data overwrites. If we don't include them, update_one only sets what is in update_data.
#              # but we want to ensure they are NOT cleared? No, update_data only keys are updated.
#              # We want to Ensure they are PRESENT if we are "transitioning" effectively.
#              # Actually, if the DB has them, we don't need to do anything.
#              pass
#         else:
#              from app.routes.workflow import get_vendor_data_from_invoice, get_required_approver_count, get_invoice_total_from_invoice
             
#              vendor_name, vendor_id = get_vendor_data_from_invoice(db, invoice_id)
#              total_amount = get_invoice_total_from_invoice(db, invoice_id)
#              currency = invoice.get("extracted_data", {}).get("invoice_details", {}).get("currency", {}).get("value", "USD")
#              requirement_data = get_required_approver_count(db, vendor_name, total_amount, invoice_id, currency=currency, entity=invoice.get("entity"))
             
#              update_data["required_approvers"] = requirement_data["required"]
#              update_data["approver_breakdown"] = requirement_data["breakdown"]

#     update_query = {"$set": update_data}
#     if "invoice_number" in update_data:
#         update_query["$unset"] = {"duplicate_info": ""}

#     db.invoices.update_one(
#         {"_id": ObjectId(invoice_id)},
#         update_query
#     )

#     # --- Registry Sync ---
#     # If critical fields changed, update the fast lookup registry
#     if new_vendor_id != current_vendor_id or new_invoice_number != current_invoice_number:
#         from app.utils.invoice_registry import remove_from_registry, register_invoice
        
#         # Remove old entry (keyed by invoice_id)
#         remove_from_registry(db, invoice_id)
        
#         # Add new entry if fields are present
#         if new_vendor_id and new_invoice_number:
#             register_invoice(
#                 db,
#                 vendor_id=new_vendor_id,
#                 invoice_number=new_invoice_number,
#                 entity=invoice.get("entity", ""),
#                 invoice_id=invoice_id,
#                 uploaded_by=invoice.get("uploaded_by", "system")
#             )

#     updated_invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
#     updated_invoice["id"] = str(updated_invoice["_id"])

#     return InvoiceResponse(**updated_invoice)


# @router.delete("/{invoice_id}")
# async def delete_invoice(
#     invoice_id: str,
#     current_user: UserResponse = Depends(get_current_user)
# ):
#     db = get_database()

#     invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
#     if not invoice:
#         raise HTTPException(status_code=404, detail="Invoice not found")

#     db.invoices.delete_one({"_id": ObjectId(invoice_id)})
    
#     # Remove from registry
#     from app.utils.invoice_registry import remove_from_registry
#     remove_from_registry(db, invoice_id)

#     return {"message": "Invoice deleted successfully"}



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
import asyncio
import time
import logging
from functools import lru_cache

router = APIRouter()
invoice_processor = InvoiceProcessor()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global cache for vendors to avoid repeated DB loads
_vendor_cache = {}
_vendor_cache_timestamp = 0
VENDOR_CACHE_TTL = 300  # 5 minutes

def log_time(step_name: str, start_time: float, invoice_id: str = None, filename: str = None):
    """Helper function to log time taken for each step"""
    elapsed = time.time() - start_time
    log_msg = f"⏱️ TIME LOG - {step_name}: {elapsed:.3f}s"
    if invoice_id:
        log_msg += f" | Invoice: {invoice_id}"
    if filename:
        log_msg += f" | File: {filename}"
    logger.info(log_msg)
    return elapsed

def get_cached_vendors(db, entity: str, force_refresh: bool = False):
    """Get vendors from cache or load from DB if cache expired"""
    global _vendor_cache, _vendor_cache_timestamp
    
    cache_key = f"vendors_{entity}"
    current_time = time.time()
    
    # Check if cache exists and is not expired
    if (not force_refresh and 
        cache_key in _vendor_cache and 
        (current_time - _vendor_cache_timestamp) < VENDOR_CACHE_TTL):
        logger.info(f"📦 Using cached vendors for entity: {entity}")
        return _vendor_cache[cache_key]
    
    # Load from database
    logger.info(f"🔄 Loading vendors from database for entity: {entity}")
    start = time.time()
    
    # Load vendor master data
    vendors = {}
    cursor = db.vendor_master.find({"entity": entity})
    for vendor in cursor:
        vendor_id = vendor.get("vendor_id")
        if vendor_id:
            vendors[vendor_id] = {
                "vendor_id": vendor_id,
                "vendor_name": vendor.get("vendor_name", ""),
                "line_grouping": vendor.get("line_grouping", "No"),
                "address": vendor.get("address", "")
            }
    
    # Also load vendor metadata for name/address mappings
    cursor = db.vendor_metadata.find({"entity": entity})
    for meta in cursor:
        extracted_name = meta.get("extracted_name")
        extracted_name_normalized = meta.get("extracted_name_normalized")
        extracted_address = meta.get("extracted_address")
        extracted_address_normalized = meta.get("extracted_address_normalized")
        vendor_id = meta.get("vendor_id")
        
        if extracted_name and vendor_id:
            if "name_mappings" not in vendors:
                vendors["name_mappings"] = {}
            vendors["name_mappings"][extracted_name_normalized] = vendor_id
            
        if extracted_address and vendor_id:
            if "address_mappings" not in vendors:
                vendors["address_mappings"] = {}
            vendors["address_mappings"][extracted_address_normalized] = vendor_id
    
    _vendor_cache[cache_key] = vendors
    _vendor_cache_timestamp = current_time
    
    elapsed = time.time() - start
    logger.info(f"✅ Loaded {len(vendors.get('name_mappings', {}))} vendor mappings in {elapsed:.2f}s")
    return vendors

def get_vendor_id_from_master_cached(db, extracted_vendor: str, entity: str, extracted_address: str = None):
    """Cached version of vendor ID lookup"""
    vendors = get_cached_vendors(db, entity)
    
    vendor_id = None
    official_vendor_name = None
    line_grouping = "No"
    
    # Try to find vendor in master data
    for vid, data in vendors.items():
        if vid == "name_mappings" or vid == "address_mappings":
            continue
            
        vendor_name = data.get("vendor_name", "").lower()
        if extracted_vendor and vendor_name and extracted_vendor.lower() in vendor_name:
            vendor_id = vid
            official_vendor_name = data.get("vendor_name")
            line_grouping = data.get("line_grouping", "No")
            break
    
    # If not found, try metadata mappings
    if not vendor_id and extracted_vendor:
        from app.ai.normalizer import normalize_vendor
        norm_name = normalize_vendor(extracted_vendor)
        if norm_name and "name_mappings" in vendors:
            vendor_id = vendors["name_mappings"].get(norm_name)
            if vendor_id and vendor_id in vendors:
                official_vendor_name = vendors[vendor_id].get("vendor_name")
                line_grouping = vendors[vendor_id].get("line_grouping", "No")
    
    # Try address mapping as fallback
    if not vendor_id and extracted_address:
        from app.ai.normalizer import normalize_address
        norm_addr = normalize_address(extracted_address)
        if norm_addr and "address_mappings" in vendors:
            vendor_id = vendors["address_mappings"].get(norm_addr)
            if vendor_id and vendor_id in vendors:
                official_vendor_name = vendors[vendor_id].get("vendor_name")
                line_grouping = vendors[vendor_id].get("line_grouping", "No")
    
    return vendor_id, official_vendor_name, line_grouping

def clear_vendor_cache(entity: str = None):
    """Clear vendor cache for a specific entity or all entities"""
    global _vendor_cache, _vendor_cache_timestamp
    
    if entity:
        cache_key = f"vendors_{entity}"
        if cache_key in _vendor_cache:
            del _vendor_cache[cache_key]
            logger.info(f"🧹 Cleared vendor cache for entity: {entity}")
    else:
        _vendor_cache.clear()
        _vendor_cache_timestamp = 0
        logger.info("🧹 Cleared all vendor caches")
    
    return True


@router.post("/check-duplicate")
async def check_duplicate_invoice_endpoint(
    payload: dict,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    start_total = time.time()
    logger.info(f"🔍 Starting duplicate check for vendor: {payload.get('vendor_id')}")
    
    from app.utils.invoice_registry import check_registry_duplicate
    from app.ai.duplicate_detector import check_duplicate_invoice

    db = get_database()
    
    vendor_id = payload.get("vendor_id")
    invoice_number = payload.get("invoice_number")
    current_invoice_id = payload.get("current_invoice_id")
    
    if not vendor_id or not invoice_number:
        log_time("Duplicate Check Total", start_total)
        return {"is_duplicate": False}

    # 1. Try Fast Registry Lookup
    start_registry = time.time()
    existing = check_registry_duplicate(db, vendor_id, invoice_number, entity)
    log_time("Registry Duplicate Check", start_registry, filename=f"{vendor_id}/{invoice_number}")
    
    # 2. Fallback to Direct Collection Lookup (if registry empty or out of sync)
    if not existing:
        start_db_check = time.time()
        existing = check_duplicate_invoice(db, vendor_id, invoice_number, entity)
        log_time("Database Duplicate Check", start_db_check, filename=f"{vendor_id}/{invoice_number}")

    if existing:
        # Check if it is the SAME invoice
        if current_invoice_id and str(existing.get("_id")) == current_invoice_id:
            log_time("Duplicate Check Total", start_total)
            return {"is_duplicate": False}
             
        uploaded_date = existing.get("uploaded_at")
        date_str = uploaded_date.strftime("%Y-%m-%d %H:%M") if uploaded_date else "N/A"
        
        result = {
            "is_duplicate": True,
            "message": f"Duplicate found: Vendor '{existing.get('vendor_name', vendor_id)}', Invoice #{invoice_number} (Uploaded {date_str})",
            "original_invoice_id": str(existing.get("_id"))
        }
    else:
        result = {"is_duplicate": False}
    
    log_time("Duplicate Check Total", start_total)
    return result


@router.post("/upload")
async def upload_invoices(
    files: List[UploadFile] = File(...),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    start_total = time.time()
    logger.info(f"📤 Starting upload of {len(files)} files for entity: {entity}")
    
    from app.utils.invoice_registry import check_registry_duplicate, register_invoice
    
    db = get_database()
    upload_dir = "uploads"
    os.makedirs(upload_dir, exist_ok=True)

    saved_invoices = []  # Track successfully uploaded invoices
    failed_uploads = []  # Track failed uploads

    async def _process_single_file(file: UploadFile):
        file_start_total = time.time()
        clean_name = file.filename.replace("\\", "/").split("/")[-1]
        file_path = None
        try:
            logger.info(f"📄 Processing file: {clean_name}")
            
            # ---- SAVE FILE ----
            start_save = time.time()
            clean_name = file.filename.replace("\\", "/").split("/")[-1]
            new_name = f"{uuid.uuid4()}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{clean_name}"
            file_path = os.path.join(upload_dir, new_name)
            
            contents = await file.read()
            with open(file_path, "wb") as f:
                f.write(contents)
            log_time("File Save", start_save, filename=clean_name)

            # ---- SINGLE AZURE EXTRACTION ----
            start_azure_extract = time.time()
            extraction = await invoice_processor.process_invoice_extraction(file_path)
            azure_time = log_time("Azure Extraction", start_azure_extract, filename=clean_name)
            
            extracted_data = extraction.get("extracted_data", {})
            vendor_info = extracted_data.get("vendor_info", {})
            invoice_details = extracted_data.get("invoice_details", {})
            
            # Extract vendor and invoice number from full extraction
            extracted_vendor = vendor_info.get("name", {}).get("value")
            extracted_address = vendor_info.get("address", {}).get("value")
            extracted_invoice_number = invoice_details.get("invoice_number", {}).get("value")
            
            # ---- VENDOR LOOKUP (CACHED) ----
            start_vendor_lookup = time.time()
            vendor_id = None
            official_vendor_name = None
            line_grouping = "No"
            duplicate_info = None
            
            if (extracted_vendor or extracted_address) and extracted_invoice_number:
                vendor_id, official_vendor_name, line_grouping = get_vendor_id_from_master_cached(
                    db, extracted_vendor, entity, extracted_address
                )
                
                if vendor_id:
                    # ---- DUPLICATE CHECK ----
                    start_duplicate_check = time.time()
                    existing_invoice = check_registry_duplicate(db, vendor_id, extracted_invoice_number, entity)
                    log_time("Duplicate Check", start_duplicate_check, filename=clean_name)
                    
                    if existing_invoice:
                        uploaded_date = existing_invoice.get("uploaded_at")
                        date_str = uploaded_date.strftime("%Y-%m-%d %H:%M") if uploaded_date else "N/A"
                        
                        duplicate_info = {
                            "is_duplicate": True,
                            "reason": f"Duplicate: Vendor '{official_vendor_name}', Invoice #{extracted_invoice_number} (Uploaded {date_str})",
                            "original_invoice_id": str(existing_invoice.get("_id"))
                        }
            
            vendor_lookup_time = log_time("Vendor Lookup", start_vendor_lookup, filename=clean_name)

            # ---- PREPARE INVOICE DATA ----
            start_invoice_prep = time.time()
            
            # Apply line grouping if needed
            final_extracted_data = extracted_data.copy()
            if line_grouping == "Yes" and "Items" in final_extracted_data:
                items = final_extracted_data["Items"].get("value", [])
                if items and len(items) > 1:
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
                    
                    # Create single aggregated line
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
                    
                    final_extracted_data["Items"]["value"] = [aggregated_item]
            
            # Create invoice dictionary
            invoice_data = InvoiceCreate(
                filename=new_name,
                original_filename=clean_name,
                file_path=file_path,
                uploaded_by=current_user.username,
                status=InvoiceStatus.PROCESSED,
                entity=entity
            )

            invoice_dict = invoice_data.dict()
            invoice_dict.update({
                "uploaded_at": datetime.utcnow(),
                "extracted_data": final_extracted_data,
                "processing_steps": extraction.get("processing_steps", []),
                "validation_results": extraction.get("validation_results", {}),
                "confidence_score": extraction.get("metadata", {}).get("confidence_score", "low"),
                "processed_at": datetime.utcnow(),
                "status_history": [{
                    "status": InvoiceStatus.PROCESSED,
                    "user": current_user.username,
                    "timestamp": datetime.utcnow(),
                    "comment": None
                }]
            })
            
            # Add vendor and invoice data
            if vendor_id:
                invoice_dict["azure_vendor_name"] = extracted_vendor
                invoice_dict["vendor_id"] = vendor_id
                invoice_dict["vendor_name"] = official_vendor_name
                invoice_dict["line_grouping"] = line_grouping
            
            if extracted_invoice_number:
                invoice_dict["invoice_number"] = extracted_invoice_number
            
            if duplicate_info:
                invoice_dict["duplicate_info"] = duplicate_info
            
            log_time("Invoice Preparation", start_invoice_prep, filename=clean_name)

            # ---- SAVE TO DATABASE ----
            start_db_insert = time.time()
            result = db.invoices.insert_one(invoice_dict)
            invoice_id = str(result.inserted_id)
            log_time("Database Insert", start_db_insert, invoice_id=invoice_id)

            # ---- REGISTER IN FAST LOOKUP REGISTRY ----
            if vendor_id and extracted_invoice_number:
                start_registry_register = time.time()
                register_invoice(
                    db,
                    vendor_id=vendor_id,
                    invoice_number=extracted_invoice_number,
                    entity=entity,
                    invoice_id=invoice_id,
                    uploaded_by=current_user.username
                )
                log_time("Registry Registration", start_registry_register, invoice_id=invoice_id)

            # ---- CREATE WORKFLOW STEP ----
            start_workflow = time.time()
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
            log_time("Workflow Step Creation", start_workflow, invoice_id=invoice_id)

            # ---- PREPARE RESPONSE ----
            start_response_prep = time.time()
            invoice_dict["id"] = invoice_id
            invoice_dict.pop("_id", None)
            
            # Convert datetime objects to ISO strings
            for key, value in invoice_dict.items():
                if isinstance(value, datetime):
                    invoice_dict[key] = value.isoformat()
                elif isinstance(value, list):
                    for i, item in enumerate(value):
                        if isinstance(item, dict):
                            for k, v in item.items():
                                if isinstance(v, datetime):
                                    value[i][k] = v.isoformat()
            log_time("Response Preparation", start_response_prep, invoice_id=invoice_id)
            
            # ---- LOG PERFORMANCE SUMMARY ----
            file_total_time = time.time() - file_start_total
            logger.info(f"✅ Successfully processed {clean_name} in {file_total_time:.2f}s (Invoice: {invoice_id})")
            logger.info(f"   Breakdown:")
            logger.info(f"   ⏱️  Azure Extraction: {azure_time:.2f}s ({azure_time/file_total_time*100:.1f}%)")
            logger.info(f"   ⏱️  Vendor Lookup: {vendor_lookup_time:.2f}s ({vendor_lookup_time/file_total_time*100:.1f}%)")
            logger.info(f"   ⏱️  Database/Other: {file_total_time - azure_time - vendor_lookup_time:.2f}s")
            
            return {"success": True, "data": invoice_dict}

        except Exception as e:
            if file_path and os.path.exists(file_path):
                os.remove(file_path)
            error_time = time.time() - file_start_total
            logger.error(f"❌ ERROR processing file {clean_name} after {error_time:.2f}s: {e}")
            import traceback
            traceback.print_exc()
            return {"success": False, "filename": clean_name, "reason": str(e)}

    # Run processing tasks concurrently
    start_concurrent = time.time()
    tasks = [_process_single_file(file) for file in files]
    results = await asyncio.gather(*tasks)
    concurrent_time = log_time("Concurrent Processing", start_concurrent)

    # Handle results
    start_results = time.time()
    for res in results:
        if res["success"]:
            saved_invoices.append(res["data"])
        else:
            failed_uploads.append({"filename": res["filename"], "reason": res["reason"]})
    log_time("Results Processing", start_results)

    total_time = time.time() - start_total
    logger.info(f"📊 Upload Summary: {len(saved_invoices)} successful, {len(failed_uploads)} failed")
    logger.info(f"   Total time: {total_time:.2f}s ({total_time/len(files):.2f}s per file)")
    logger.info(f"   Azure cost reduction: ~50% (single extraction vs double)")
    
    return {
        "count": len(saved_invoices),
        "invoices": saved_invoices,
        "failed": failed_uploads,
        "processing_time_seconds": total_time,
        "processing_time_per_file": total_time / len(files) if files else 0
    }


@router.get("/", response_model=List[InvoiceResponse])
async def get_invoices(
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    skip: int = 0,
    limit: int = 10,
    show_all: bool = True
):
    start_time = time.time()
    logger.info(f"📋 Getting invoices for entity: {entity}, show_all: {show_all}")
    
    db = get_database()

    query = {"entity": entity}
    if not show_all:
        query["uploaded_by"] = current_user.username

    start_db_query = time.time()
    invoices = db.invoices.find(query).sort("uploaded_at", -1).skip(skip).limit(limit)
    invoices_list = list(invoices)
    log_time("Database Query", start_db_query, filename=f"skip={skip}, limit={limit}")

    start_model_convert = time.time()
    invoice_list = []
    for invoice in invoices_list:
        invoice["id"] = str(invoice["_id"])
        invoice_list.append(InvoiceResponse(**invoice))
    log_time("Model Conversion", start_model_convert, filename=f"count={len(invoices_list)}")
    
    total_time = time.time() - start_time
    logger.info(f"📋 Retrieved {len(invoice_list)} invoices in {total_time:.2f}s")
    
    return invoice_list


@router.get("/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: str,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    start_time = time.time()
    logger.info(f"🔍 Getting invoice: {invoice_id}")
    
    db = get_database()

    start_db_find = time.time()
    invoice = db.invoices.find_one({"_id": ObjectId(invoice_id), "entity": entity})
    log_time("Database Find", start_db_find, invoice_id=invoice_id)
    
    if not invoice:
        logger.warning(f"❌ Invoice not found: {invoice_id}")
        raise HTTPException(status_code=404, detail="Invoice not found")

    invoice["id"] = str(invoice["_id"])
    
    start_model = time.time()
    response = InvoiceResponse(**invoice)
    log_time("Response Model Creation", start_model, invoice_id=invoice_id)
    
    total_time = time.time() - start_time
    logger.info(f"✅ Retrieved invoice {invoice_id} in {total_time:.2f}s")
    
    return response


@router.get("/debug/raw/{invoice_id}")
async def get_raw_invoice(invoice_id: str):
    start_time = time.time()
    logger.info(f"🐛 Debug raw invoice: {invoice_id}")
    
    db = get_database()
    
    start_db = time.time()
    invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
    log_time("Database Query", start_db, invoice_id=invoice_id)
    
    if not invoice:
        logger.warning(f"❌ Invoice not found for debug: {invoice_id}")
        return {"error": "Not found"}
    
    invoice["_id"] = str(invoice["_id"])
    
    total_time = time.time() - start_time
    logger.info(f"✅ Debug raw invoice {invoice_id} retrieved in {total_time:.2f}s")
    
    return invoice


@router.get("/{invoice_id}/pdf")
async def get_invoice_pdf(
    invoice_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    start_time = time.time()
    logger.info(f"📄 Getting PDF for invoice: {invoice_id}")
    
    db = get_database()

    start_db_find = time.time()
    invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
    log_time("Database Find", start_db_find, invoice_id=invoice_id)
    
    if not invoice:
        logger.warning(f"❌ Invoice not found for PDF: {invoice_id}")
        raise HTTPException(status_code=404, detail="Invoice not found")

    file_path = invoice.get("file_path")
    if not file_path or not os.path.exists(file_path):
        logger.error(f"❌ PDF file not found on disk: {file_path}")
        raise HTTPException(status_code=404, detail="PDF file not found")

    total_time = time.time() - start_time
    logger.info(f"✅ PDF retrieval for {invoice_id} ready in {total_time:.2f}s")
    
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
    start_total = time.time()
    logger.info(f"🔄 Updating status for invoice {invoice_id} to {status}")
    
    db = get_database()

    approver_name = current_user.username
    timestamp = datetime.utcnow()

    start_db_find = time.time()
    invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
    log_time("Database Find Invoice", start_db_find, invoice_id=invoice_id)
    
    if not invoice:
        logger.warning(f"❌ Invoice not found for status update: {invoice_id}")
        raise HTTPException(status_code=404, detail="Invoice not found")

    status_history = invoice.get("status_history", [])

    # =====================================================
    # FIND CURRENT APPROVAL CYCLE (AFTER LAST REWORK)
    # =====================================================
    start_cycle_find = time.time()
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
    log_time("Cycle Finding", start_cycle_find, invoice_id=invoice_id)

    # =====================================================
    # BLOCK DOUBLE ACTION IN SAME CYCLE (SOPHISTICATED CHECK)
    # =====================================================
    
    start_auth_check = time.time()
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
    already_acted_for_this_level = any(
        h["user"] == approver_name and 
        h.get("approver_level") == existing_approvals + 1 and
        h["status"] in [InvoiceStatus.APPROVED, InvoiceStatus.REJECTED, InvoiceStatus.REWORKED]
        for h in current_cycle_history
    )
    log_time("Authorization Check", start_auth_check, invoice_id=invoice_id)

    if already_acted_for_this_level and status in [InvoiceStatus.APPROVED, InvoiceStatus.REJECTED, InvoiceStatus.REWORKED]:
        logger.warning(f"⚠️ User {approver_name} already acted for level {existing_approvals + 1} on invoice {invoice_id}")
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

        start_cleanup = time.time()
        db.workflow_steps.delete_many({
            "invoice_id": invoice_id,
            "step_type": WorkflowStepType.CODING
        })
        log_time("Workflow Cleanup", start_cleanup, invoice_id=invoice_id)

        start_update = time.time()
        db.invoices.update_one(
            {"_id": ObjectId(invoice_id)},
            {
                "$set": {"status": main_status, "validation_results": {}, "approved_by": []},
                "$push": {"status_history": new_status_entry}
            }
        )
        log_time("Database Update", start_update, invoice_id=invoice_id)
        
        total_time = time.time() - start_total
        logger.info(f"✅ Status updated to WAITING_CODING for {invoice_id} in {total_time:.2f}s")
        return {"message": "Status updated", "main_status": main_status}

    # =====================================================
    # REJECT / REWORK
    # =====================================================
    if status in [InvoiceStatus.REJECTED, InvoiceStatus.REWORKED, InvoiceStatus.APPROVED]:
        start_requirement_calc = time.time()
        vendor_name, vendor_id = get_vendor_data_from_invoice(db, invoice_id)
        total_amount = get_invoice_total_from_invoice(db, invoice_id)
        currency = invoice.get("extracted_data", {}).get("invoice_details", {}).get("currency", {}).get("value", "USD")

        requirement_data = get_required_approver_count(
            db, vendor_name, total_amount, invoice_id, invoice_data=invoice, currency=currency, entity=invoice.get("entity")
        )
        required_approvers = requirement_data["required"]
        assigned_approvers = requirement_data.get("assigned_approvers", [])
        log_time("Requirement Calculation", start_requirement_calc, invoice_id=invoice_id)

        # COUNT ONLY CURRENT CYCLE APPROVALS
        existing_approvals = sum(
            1 for h in current_cycle_history
            if h["status"] == InvoiceStatus.APPROVED
        )

        # SEQUENTIAL ORDER ENFORCEMENT
        if assigned_approvers:
            if not is_authorized:
                logger.warning(f"⛔ Unauthorized status update attempt by {current_user.email} on invoice {invoice_id}")
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
    
    start_db_update = time.time()
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
    log_time("Database Status Update", start_db_update, invoice_id=invoice_id)

    # =====================================================
    # CREATE WORKFLOW STEP (RESET AFTER REWORK)
    # =====================================================
    if status in [
        InvoiceStatus.APPROVED,
        InvoiceStatus.REJECTED,
        InvoiceStatus.REWORKED
    ]:
        start_workflow_step = time.time()
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
        log_time("Workflow Step Creation", start_workflow_step, invoice_id=invoice_id)

    total_time = time.time() - start_total
    logger.info(f"✅ Status updated to {main_status} for invoice {invoice_id} in {total_time:.2f}s")
    
    return {"message": "Status updated", "main_status": main_status}


@router.put("/{invoice_id}")
async def update_invoice(
    invoice_id: str,
    invoice_update: InvoiceUpdate,
    current_user: UserResponse = Depends(get_current_user)
):
    start_total = time.time()
    logger.info(f"✏️ Updating invoice: {invoice_id}")
    
    from app.utils.invoice_registry import check_registry_duplicate
    from app.ai.duplicate_detector import check_duplicate_invoice
    
    db = get_database()

    start_prep = time.time()
    update_data = {k: v for k, v in invoice_update.dict().items() if v is not None}
    if not update_data:
        logger.warning(f"⚠️ No data to update for invoice: {invoice_id}")
        raise HTTPException(status_code=400, detail="No data to update")

    start_db_find = time.time()
    invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
    log_time("Database Find", start_db_find, invoice_id=invoice_id)
    
    if not invoice:
        logger.warning(f"❌ Invoice not found for update: {invoice_id}")
        raise HTTPException(status_code=404, detail="Invoice not found")

    # --- Duplicate Check Logic (Constraint Enforcement) ---
    start_duplicate_check = time.time()
    current_vendor_id = invoice.get("vendor_id")
    current_invoice_number = invoice.get("invoice_number")
    
    new_vendor_id = current_vendor_id
    new_invoice_number = current_invoice_number
    
    requires_check = False
    
    # 1. Check top-level updates
    if "vendor_id" in update_data:
        new_vendor_id = update_data["vendor_id"]
        requires_check = True
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
        # 1. Try Fast Registry Lookup
        duplicate = check_registry_duplicate(db, new_vendor_id, new_invoice_number, invoice.get("entity"))
        
        # 2. Fallback to Robust DB Lookup (Case-Insensitive)
        if not duplicate:
            duplicate = check_duplicate_invoice(db, new_vendor_id, new_invoice_number, invoice.get("entity"))
        
        if duplicate and str(duplicate.get("_id")) != invoice_id:
            logger.warning(f"⚠️ Duplicate detected for invoice {invoice_id}: {new_vendor_id}/{new_invoice_number}")
            raise HTTPException(
                status_code=409, 
                detail=f"Duplicate detected: Vendor ID '{new_vendor_id}' already has Invoice #'{new_invoice_number}'."
            )
    log_time("Duplicate Check", start_duplicate_check, invoice_id=invoice_id)

    # --- Vendor Information Refresh Logic (FIXED) ---
    start_vendor_refresh = time.time()
    extracted_data = update_data.get("extracted_data")
    
    if extracted_data:
        # Get current vendor info from invoice
        old_vendor_id = invoice.get("vendor_id")
        old_vendor_name = invoice.get("vendor_name")
        azure_vendor_name = invoice.get("azure_vendor_name")
        
        # Check if vendor info is being updated in extracted_data
        vendor_info = extracted_data.get("vendor_info", {})
        new_vendor_name = vendor_info.get("name", {}).get("value")
        new_vendor_id = vendor_info.get("vendor_id", {}).get("value")
        
        # Also check if vendor details are directly in update_data
        if "vendor_id" in update_data:
            new_vendor_id = update_data["vendor_id"]
        if "vendor_name" in update_data:
            new_vendor_name = update_data["vendor_name"]
        
        # If vendor is being changed, fetch and update vendor details from vendor_master
        if new_vendor_id and new_vendor_id != old_vendor_id:
            logger.info(f"🔄 Vendor ID changed from {old_vendor_id} to {new_vendor_id}. Refreshing vendor details.")
            
            # Fetch updated vendor details from vendor_master
            vendor_doc = db.vendor_master.find_one(
                {"vendor_id": new_vendor_id, "entity": invoice.get("entity")}
            )
            
            if vendor_doc:
                # Update vendor details in update_data
                update_data["vendor_id"] = new_vendor_id
                update_data["vendor_name"] = vendor_doc.get("vendor_name", new_vendor_name)
                update_data["line_grouping"] = vendor_doc.get("line_grouping", "No")
                
                # Also update extracted_data vendor info if it exists
                if "vendor_info" in extracted_data:
                    extracted_data["vendor_info"]["vendor_id"]["value"] = new_vendor_id
                    extracted_data["vendor_info"]["name"]["value"] = vendor_doc.get("vendor_name", new_vendor_name)
                    if "address" in vendor_doc and vendor_doc["address"]:
                        extracted_data["vendor_info"]["address"]["value"] = vendor_doc.get("address", "")
                    
                    # Update extracted_data in update_data
                    update_data["extracted_data"] = extracted_data
                
                logger.info(f"✅ Updated vendor details: {vendor_doc.get('vendor_name')} (Line Grouping: {vendor_doc.get('line_grouping', 'No')})")
            
            # Create vendor mapping for future use if we have azure vendor name
            if azure_vendor_name:
                from app.ai.normalizer import normalize_vendor, normalize_address
                
                # Persist Name-based mapping
                norm_azure_name = normalize_vendor(azure_vendor_name)
                if norm_azure_name:
                    mapping = {
                        "extracted_name": azure_vendor_name,
                        "extracted_name_normalized": norm_azure_name,
                        "vendor_id": new_vendor_id,
                        "official_name": update_data.get("vendor_name", new_vendor_name),
                        "entity": invoice.get("entity"),
                        "updated_at": datetime.utcnow(),
                        "updated_by": current_user.username
                    }
                    db.vendor_metadata.update_one(
                        {"extracted_name_normalized": norm_azure_name, "entity": invoice.get("entity")},
                        {"$set": mapping},
                        upsert=True
                    )
                    logger.info(f"💾 Updated vendor name mapping: {azure_vendor_name} → {new_vendor_id}")
                
                # Persist Address-based mapping if available
                azure_address = vendor_info.get("address", {}).get("value")
                if azure_address:
                    norm_azure_addr = normalize_address(azure_address)
                    if norm_azure_addr:
                        addr_mapping = {
                            "extracted_address": azure_address,
                            "extracted_address_normalized": norm_azure_addr,
                            "vendor_id": new_vendor_id,
                            "official_name": update_data.get("vendor_name", new_vendor_name),
                            "entity": invoice.get("entity"),
                            "updated_at": datetime.utcnow(),
                            "updated_by": current_user.username
                        }
                        db.vendor_metadata.update_one(
                            {"extracted_address_normalized": norm_azure_addr, "entity": invoice.get("entity")},
                            {"$set": addr_mapping},
                            upsert=True
                        )
                        logger.info(f"💾 Updated vendor address mapping: {azure_address} → {new_vendor_id}")
                
                # Clear vendor cache to ensure fresh data on next lookup
                clear_vendor_cache(invoice.get("entity"))
    
    log_time("Vendor Refresh", start_vendor_refresh, invoice_id=invoice_id)

    # --- Sync Invoice Number from extracted_data to top-level ---
    start_sync = time.time()
    if extracted_data:
        ein_num = extracted_data.get("invoice_details", {}).get("invoice_number", {}).get("value")
        if ein_num:
            update_data["invoice_number"] = ein_num
            logger.info(f"🔗 Synced invoice number from extracted_data: {ein_num}")
    log_time("Invoice Number Sync", start_sync, invoice_id=invoice_id)

    # merge validation
    start_validation = time.time()
    if "validation_results" in update_data:
        existing_validation = invoice.get("validation_results", {}) or {}
        update_data["validation_results"] = {
            **existing_validation,
            **update_data["validation_results"]
        }
    log_time("Validation Merge", start_validation, invoice_id=invoice_id)

    # Check if status is being updated to WAITING_APPROVAL in generic update
    start_status_check = time.time()
    if "status" in update_data and update_data["status"] == InvoiceStatus.WAITING_APPROVAL:
        existing_req = invoice.get("required_approvers")
        
        if existing_req is None:
            from app.routes.workflow import get_vendor_data_from_invoice, get_required_approver_count, get_invoice_total_from_invoice
             
            vendor_name, vendor_id = get_vendor_data_from_invoice(db, invoice_id)
            total_amount = get_invoice_total_from_invoice(db, invoice_id)
            currency = invoice.get("extracted_data", {}).get("invoice_details", {}).get("currency", {}).get("value", "USD")
            requirement_data = get_required_approver_count(db, vendor_name, total_amount, invoice_id, currency=currency, entity=invoice.get("entity"))
             
            update_data["required_approvers"] = requirement_data["required"]
            update_data["approver_breakdown"] = requirement_data["breakdown"]
    log_time("Status Check", start_status_check, invoice_id=invoice_id)

    start_db_update = time.time()
    update_query = {"$set": update_data}
    if "invoice_number" in update_data:
        update_query["$unset"] = {"duplicate_info": ""}

    db.invoices.update_one(
        {"_id": ObjectId(invoice_id)},
        update_query
    )
    log_time("Database Update", start_db_update, invoice_id=invoice_id)

    # --- Registry Sync ---
    start_registry_sync = time.time()
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
        logger.info(f"📋 Updated registry for invoice {invoice_id}")
    log_time("Registry Sync", start_registry_sync, invoice_id=invoice_id)

    start_final_fetch = time.time()
    updated_invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
    updated_invoice["id"] = str(updated_invoice["_id"])
    log_time("Final Invoice Fetch", start_final_fetch, invoice_id=invoice_id)

    start_response = time.time()
    response = InvoiceResponse(**updated_invoice)
    log_time("Response Creation", start_response, invoice_id=invoice_id)
    
    total_time = time.time() - start_total
    logger.info(f"✅ Invoice {invoice_id} updated in {total_time:.2f}s")
    
    return response


@router.delete("/{invoice_id}")
async def delete_invoice(
    invoice_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    start_total = time.time()
    logger.info(f"🗑️ Deleting invoice: {invoice_id}")
    
    db = get_database()

    start_db_find = time.time()
    invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
    log_time("Database Find", start_db_find, invoice_id=invoice_id)
    
    if not invoice:
        logger.warning(f"❌ Invoice not found for deletion: {invoice_id}")
        raise HTTPException(status_code=404, detail="Invoice not found")

    start_db_delete = time.time()
    db.invoices.delete_one({"_id": ObjectId(invoice_id)})
    log_time("Database Delete", start_db_delete, invoice_id=invoice_id)
    
    # Remove from registry
    start_registry = time.time()
    from app.utils.invoice_registry import remove_from_registry
    remove_from_registry(db, invoice_id)
    log_time("Registry Cleanup", start_registry, invoice_id=invoice_id)

    total_time = time.time() - start_total
    logger.info(f"✅ Invoice {invoice_id} deleted in {total_time:.2f}s")
    
    return {"message": "Invoice deleted successfully"}
