# from fastapi import APIRouter, HTTPException, Depends
# from typing import Optional, List, Dict, Any
# from app.models.coding import CodingCreate, CodingResponse, CodingUpdate, LineItemCoding
# from app.models.workflow import WorkflowStepType, WorkflowStepStatus
# from app.database.mongodb import get_database
# from app.auth.jwt import get_current_user
# from app.dependencies import get_current_entity
# from app.models.user import UserResponse
# from datetime import datetime
# from bson.objectid import ObjectId

# router = APIRouter()

# def get_vendor_name(invoice: Dict[str, Any]) -> Optional[str]:
#     """Helper to extract vendor name from invoice data"""
#     extracted = invoice.get("extracted_data", {})
#     print(f"DEBUG: Extracting vendor from keys: {list(extracted.keys())}")
    
#     # Check new nested structure first
#     if "vendor_info" in extracted:
#         v_info = extracted["vendor_info"]
#         if isinstance(v_info, dict):
#             name_obj = v_info.get("name", {})
#             if isinstance(name_obj, dict):
#                 val = name_obj.get("value")
#                 if val:
#                     print(f"DEBUG: Found vendor_name in vendor_info: {val}")
#                     return str(val).strip()

#     # Try common fields for vendor name (fallback for older or flat structures)
#     for field in ["VendorName", "MerchantName", "vendor_name", "merchant_name"]:
#         if field in extracted and isinstance(extracted[field], dict):
#             val = extracted[field].get("value")
#             if val:
#                 print(f"DEBUG: Found vendor_name in common fields: {val}")
#                 return str(val).strip()
    
#     print("DEBUG: Vendor name NOT found")
#     return None

# def update_coding_history(db, vendor_name: str, line_items: List[LineItemCoding]):
#     """Update coding history for future suggestions"""
#     if not vendor_name:
#         return

#     history_coll = db.coding_history
#     print(f"DEBUG: Updating history for vendor: {vendor_name} with {len(line_items)} items")
    
#     for item in line_items:
#         if not item.description:
#             continue
            
#         print(f"DEBUG: Saving history for description: {item.description}")
#         # Create a signature based on description
#         # We store the coding used for this specific description from this vendor
#         filter_query = {
#             "vendor_name": vendor_name, 
#             "description": item.description.strip()
#         }
        
#         update_doc = {
#             "$set": {
#                 "vendor_name": vendor_name,
#                 "description": item.description.strip(),
#                 "coding": {
#                     "gl_code": item.gl_code,
#                     "lob": item.lob,
#                     "department": item.department,
#                     "customer": item.customer,
#                     "item": item.item
#                 },
#                 "updated_at": datetime.utcnow()
#             }
#         }
        
#         history_coll.update_one(filter_query, update_doc, upsert=True)

# def safe_float(value) -> float:
#     """Safely convert a value to float, handling currency strings"""
#     if value is None:
#         return 0.0
#     if isinstance(value, (int, float)):
#         return float(value)
#     if isinstance(value, str):
#         # Remove currency symbols and commas
#         cleaned = value.replace('$', '').replace(',', '').strip()
#         try:
#             return float(cleaned) if cleaned else 0.0
#         except ValueError:
#             return 0.0
#     return 0.0

# def get_coding_suggestions(db, vendor_name: str, extracted_items: List[Dict[str, Any]]) -> List[LineItemCoding]:
#     """Get coding suggestions based on history"""
#     print(f"DEBUG: Getting suggestions for vendor: {vendor_name}")
#     if not vendor_name or not extracted_items:
#         return []

#     history_coll = db.coding_history
#     suggested_items = []
    
#     for idx, item in enumerate(extracted_items):
#         desc = item.get("description", {}).get("value")
#         if not desc:
#             continue
            
#         desc = str(desc).strip()
#         history = history_coll.find_one({"vendor_name": vendor_name, "description": desc})
        
#         # Build base item from extraction - use safe_float for numeric values
#         line_item = LineItemCoding(
#             s_no=idx + 1,
#             description=desc,
#             line_type="Expense", # Default
#             quantity=safe_float(item.get("quantity", {}).get("value")),
#             unit_price=safe_float(item.get("unit_price", {}).get("value")),
#             net_amount=safe_float(item.get("amount", {}).get("value")),
#             gl_code="",
#         )
        
#         if history and "coding" in history:
#             print(f"DEBUG: Match found for {desc}")
#             coding = history["coding"]
#             line_item.gl_code = coding.get("gl_code", "")
#             line_item.lob = coding.get("lob", "")
#             line_item.department = coding.get("department", "")
#             line_item.customer = coding.get("customer", "")
#             line_item.item = coding.get("item", "")
#         else:
#             print(f"DEBUG: No match for {desc}")
            
#         suggested_items.append(line_item)
        
#     return suggested_items

# @router.post("/", response_model=CodingResponse)
# async def create_or_update_coding(
#     coding_data: CodingCreate,
#     current_user: UserResponse = Depends(get_current_user),
#     entity: str = Depends(get_current_entity)
# ):
#     """Create or update coding data for an invoice"""
#     db = get_database()
    
#     try:
#         # Verify invoice exists AND belongs to entity
#         invoice = db.invoices.find_one({"_id": ObjectId(coding_data.invoice_id)})
#         if not invoice:
#             raise HTTPException(status_code=404, detail="Invoice not found")
        
#         # Entity Check
#         if invoice.get("entity") != entity:
#             raise HTTPException(status_code=403, detail="Access denied to this entity's data")
        
#         # Check if coding already exists for this invoice
#         existing_coding = db.coding.find_one({"invoice_id": coding_data.invoice_id})
        
#         if existing_coding:
#             # Update existing coding
#             update_data = coding_data.dict(exclude={'invoice_id', 'vendor_name'})
#             update_data['updated_at'] = datetime.utcnow()
            
#             db.coding.update_one(
#                 {"invoice_id": coding_data.invoice_id},
#                 {"$set": update_data}
#             )
            
#             # Update History - Use vendor_name from payload if available, else extract
#             v_name = getattr(coding_data, 'vendor_name', None)
#             if not v_name:
#                 v_name = get_vendor_name(invoice)
                
#             if v_name and coding_data.line_items:
#                 update_coding_history(db, v_name, coding_data.line_items)

#             # DO NOT update invoice status here - let frontend control status changes
#             # Status should only change when user clicks "Send to Approval"
            
#             # ---- CREATE/UPDATE WORKFLOW STEP: CODING ----
#             # Check if coding workflow step already exists
#             existing_coding_step = db.workflow_steps.find_one({
#                 "invoice_id": coding_data.invoice_id,
#                 "step_type": WorkflowStepType.CODING
#             })
            
#             if not existing_coding_step:
#                 # Create coding workflow step only on first save
#                 workflow_step = {
#                     "invoice_id": coding_data.invoice_id,
#                     "step_name": "Coding",
#                     "step_type": WorkflowStepType.CODING,
#                     "user": current_user.username,
#                     "status": WorkflowStepStatus.COMPLETED,
#                     "timestamp": datetime.utcnow(),
#                     "approver_number": None,
#                     "comment": None,
#                     "entity": entity
#                 }
#                 db.workflow_steps.insert_one(workflow_step)
            
#             # Fetch updated document
#             updated_coding = db.coding.find_one({"invoice_id": coding_data.invoice_id})
#             updated_coding["id"] = str(updated_coding["_id"])
#             return CodingResponse(**updated_coding)
#         else:
#             # Create new coding
#             coding_dict = coding_data.dict()
#             coding_dict["created_at"] = datetime.utcnow()
#             coding_dict["updated_at"] = None
            
#             # coding_dict might contain vendor_name, remove it before saving to DB
#             if 'vendor_name' in coding_dict:
#                 del coding_dict['vendor_name']
                
#             result = db.coding.insert_one(coding_dict)
#             coding_id = str(result.inserted_id)
            
#             # Update History
#             v_name = getattr(coding_data, 'vendor_name', None)
#             if not v_name:
#                 v_name = get_vendor_name(invoice)
                
#             if v_name and coding_data.line_items:
#                 update_coding_history(db, v_name, coding_data.line_items)
            
#             # DO NOT update invoice status here - let frontend control status changes
#             # Status should only change when user clicks "Send to Approval"
            
#             # ---- CREATE WORKFLOW STEP: CODING ----
#             workflow_step = {
#                 "invoice_id": coding_data.invoice_id,
#                 "step_name": "Coding",
#                 "step_type": WorkflowStepType.CODING,
#                 "user": current_user.username,
#                 "status": WorkflowStepStatus.COMPLETED,
#                 "timestamp": datetime.utcnow(),
#                 "approver_number": None,
#                 "comment": None,
#                 "entity": entity
#             }
#             db.workflow_steps.insert_one(workflow_step)
            
#             # Fetch created document
#             created_coding = db.coding.find_one({"_id": result.inserted_id})
#             created_coding["id"] = str(created_coding["_id"])
#             return CodingResponse(**created_coding)
            
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))

# @router.get("/{invoice_id}", response_model=CodingResponse)
# async def get_coding(
#     invoice_id: str,
#     current_user: UserResponse = Depends(get_current_user),
#     entity: str = Depends(get_current_entity)
# ):
#     """Get coding data by invoice ID"""
#     db = get_database()
    
#     # Verify invoice ownership first
#     invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
#     if not invoice:
#         raise HTTPException(status_code=404, detail="Invoice not found")
    
#     # Entity Check
#     if invoice.get("entity") != entity:
#         raise HTTPException(status_code=403, detail="Access denied to this entity's data")
    
#     print(f"DEBUG: get_coding called for invoice_id: {invoice_id}")
#     coding = db.coding.find_one({"invoice_id": invoice_id})
    
#     if not coding:
#         print("DEBUG: No existing coding found, checking for suggestions...")
#         # Check for auto-coding suggestions
#         vendor_name = get_vendor_name(invoice)
#         print(f"DEBUG: Extracted vendor_name: {vendor_name}")
#         extracted_data = invoice.get("extracted_data", {})
#         items_data = extracted_data.get("Items", {}).get("value", [])
#         print(f"DEBUG: Found {len(items_data)} items in invoice")
        
#         if vendor_name and items_data:
#             suggestions = get_coding_suggestions(db, vendor_name, items_data)
#             print(f"DEBUG: Generated {len(suggestions)} suggestions")
            
#             # If we have suggestions (even if partially filled), return them as a "preview"
#             # We return a transient CodingResponse that isn't saved yet
#             if suggestions:
#                 print("DEBUG: Returning suggestions to frontend")
#                 return CodingResponse(
#                     id="suggested", # Dummy ID
#                     invoice_id=invoice_id,
#                     created_at=datetime.utcnow(),
#                     line_items=suggestions
#                 )
#             else:
#                 print("DEBUG: No suggestions generated")
#         else:
#             print(f"DEBUG: Missing vendor_name or items_data (vendor: {vendor_name}, items: {len(items_data)})")

#         raise HTTPException(status_code=404, detail="Coding data not found for this invoice")
    
#     print("DEBUG: Returning existing coding")
#     coding["id"] = str(coding["_id"])
#     return CodingResponse(**coding)

# @router.delete("/{invoice_id}")
# async def delete_coding(
#     invoice_id: str,
#     current_user: UserResponse = Depends(get_current_user),
#     entity: str = Depends(get_current_entity)
# ):
#     """Delete coding data by invoice ID"""
#     db = get_database()
    
#     # Verify invoice ownership first
#     invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
#     if not invoice:
#         raise HTTPException(status_code=404, detail="Invoice not found")
    
#     # Entity Check
#     if invoice.get("entity") != entity:
#         raise HTTPException(status_code=403, detail="Access denied to this entity's data")
    
#     result = db.coding.delete_one({"invoice_id": invoice_id})
    
#     if result.deleted_count == 0:
#         raise HTTPException(status_code=404, detail="Coding data not found for this invoice")
    
#     return {"message": "Coding data deleted successfully"}




# from fastapi import APIRouter, HTTPException, Depends
# from typing import Optional, List, Dict, Any
# from datetime import datetime
# from bson.objectid import ObjectId
# import numpy as np

# from app.models.coding import CodingCreate, CodingResponse, LineItemCoding
# from app.models.workflow import WorkflowStepType, WorkflowStepStatus
# from app.database.mongodb import get_database
# from app.auth.jwt import get_current_user
# from app.dependencies import get_current_entity
# from app.models.user import UserResponse

# # 🔹 AI helpers
# from app.ai.normalizer import normalize_description
# from app.ai.embeddings import embed_text
# from app.ai.similarity import cosine_similarity

# router = APIRouter()

# SIMILARITY_THRESHOLD = 0.80


# # ---------------------------------------------------------
# # Utility helpers
# # ---------------------------------------------------------

# def safe_float(value) -> float:
#     if value is None:
#         return 0.0
#     if isinstance(value, (int, float)):
#         return float(value)
#     if isinstance(value, str):
#         cleaned = value.replace('$', '').replace(',', '').strip()
#         try:
#             return float(cleaned) if cleaned else 0.0
#         except ValueError:
#             return 0.0
#     return 0.0


# def get_vendor_name(invoice: Dict[str, Any]) -> Optional[str]:
#     extracted = invoice.get("extracted_data", {})

#     if "vendor_info" in extracted:
#         v_info = extracted["vendor_info"]
#         if isinstance(v_info, dict):
#             name_obj = v_info.get("name", {})
#             if isinstance(name_obj, dict):
#                 val = name_obj.get("value")
#                 if val:
#                     return str(val).strip()

#     for field in ["VendorName", "MerchantName", "vendor_name", "merchant_name"]:
#         if field in extracted and isinstance(extracted[field], dict):
#             val = extracted[field].get("value")
#             if val:
#                 return str(val).strip()

#     return None


# # ---------------------------------------------------------
# # CODING HISTORY (Learning)
# # ---------------------------------------------------------

# def update_coding_history(db, vendor_name: str, line_items: List[LineItemCoding]):
#     if not vendor_name:
#         return

#     history_coll = db.coding_history

#     for item in line_items:
#         if not item.description:
#             continue

#         normalized = normalize_description(item.description)
#         embedding = embed_text(f"{vendor_name} {normalized}")

#         history_coll.update_one(
#             {
#                 "vendor_name": vendor_name,
#                 "normalized_description": normalized
#             },
#             {
#                 "$set": {
#                     "vendor_name": vendor_name,
#                     "description": item.description.strip(),
#                     "normalized_description": normalized,
#                     "embedding": embedding,
#                     "coding": {
#                         "gl_code": item.gl_code,
#                         "lob": item.lob,
#                         "department": item.department,
#                         "customer": item.customer,
#                         "item": item.item
#                     },
#                     "updated_at": datetime.utcnow()
#                 }
#             },
#             upsert=True
#         )


# # ---------------------------------------------------------
# # AUTO GL CODING (Similarity)
# # ---------------------------------------------------------

# def get_coding_suggestions(
#     db,
#     vendor_name: str,
#     extracted_items: List[Dict[str, Any]]
# ) -> List[LineItemCoding]:

#     if not vendor_name or not extracted_items:
#         return []

#     history_coll = db.coding_history
#     suggested_items: List[LineItemCoding] = []

#     for idx, item in enumerate(extracted_items):
#         desc = item.get("description", {}).get("value")
#         if not desc:
#             continue

#         normalized = normalize_description(desc)
#         query_embedding = embed_text(f"{vendor_name} {normalized}")

#         candidates = history_coll.find({
#             "vendor_name": vendor_name,
#             "embedding": {"$exists": True}
#         })

#         best_match = None
#         best_score = 0.0

#         for c in candidates:
#             score = cosine_similarity(query_embedding, c.get("embedding"))
#             if score > best_score:
#                 best_score = score
#                 best_match = c

#         line_item = LineItemCoding(
#             s_no=idx + 1,
#             description=desc,
#             line_type="Expense",
#             quantity=safe_float(item.get("quantity", {}).get("value")),
#             unit_price=safe_float(item.get("unit_price", {}).get("value")),
#             net_amount=safe_float(item.get("amount", {}).get("value")),
#             gl_code=""
#         )

#         if best_match and best_score >= SIMILARITY_THRESHOLD:
#             coding = best_match["coding"]
#             line_item.gl_code = coding.get("gl_code", "")
#             line_item.lob = coding.get("lob", "")
#             line_item.department = coding.get("department", "")
#             line_item.customer = coding.get("customer", "")
#             line_item.item = coding.get("item", "")
#             line_item.confidence = round(best_score, 2)

#         suggested_items.append(line_item)

#     return suggested_items


# # ---------------------------------------------------------
# # API ENDPOINTS
# # ---------------------------------------------------------

# @router.post("/", response_model=CodingResponse)
# async def create_or_update_coding(
#     coding_data: CodingCreate,
#     current_user: UserResponse = Depends(get_current_user),
#     entity: str = Depends(get_current_entity)
# ):
#     db = get_database()

#     invoice = db.invoices.find_one({"_id": ObjectId(coding_data.invoice_id)})
#     if not invoice:
#         raise HTTPException(status_code=404, detail="Invoice not found")

#     if invoice.get("entity") != entity:
#         raise HTTPException(status_code=403, detail="Access denied")

#     existing = db.coding.find_one({"invoice_id": coding_data.invoice_id})

#     if existing:
#         update_data = coding_data.dict(exclude={"invoice_id", "vendor_name"})
#         update_data["updated_at"] = datetime.utcnow()

#         db.coding.update_one(
#             {"invoice_id": coding_data.invoice_id},
#             {"$set": update_data}
#         )

#         vendor_name = coding_data.vendor_name or get_vendor_name(invoice)
#         if vendor_name and coding_data.line_items:
#             update_coding_history(db, vendor_name, coding_data.line_items)

#         updated = db.coding.find_one({"invoice_id": coding_data.invoice_id})
#         updated["id"] = str(updated["_id"])
#         return CodingResponse(**updated)

#     coding_dict = coding_data.dict()
#     coding_dict["created_at"] = datetime.utcnow()
#     coding_dict["updated_at"] = None
#     coding_dict.pop("vendor_name", None)

#     result = db.coding.insert_one(coding_dict)

#     vendor_name = coding_data.vendor_name or get_vendor_name(invoice)
#     if vendor_name and coding_data.line_items:
#         update_coding_history(db, vendor_name, coding_data.line_items)

#     workflow_step = {
#         "invoice_id": coding_data.invoice_id,
#         "step_name": "Coding",
#         "step_type": WorkflowStepType.CODING,
#         "user": current_user.username,
#         "status": WorkflowStepStatus.COMPLETED,
#         "timestamp": datetime.utcnow(),
#         "entity": entity
#     }
#     db.workflow_steps.insert_one(workflow_step)

#     created = db.coding.find_one({"_id": result.inserted_id})
#     created["id"] = str(created["_id"])
#     return CodingResponse(**created)


# @router.get("/{invoice_id}", response_model=CodingResponse)
# async def get_coding(
#     invoice_id: str,
#     current_user: UserResponse = Depends(get_current_user),
#     entity: str = Depends(get_current_entity)
# ):
#     db = get_database()

#     invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
#     if not invoice:
#         raise HTTPException(status_code=404, detail="Invoice not found")

#     if invoice.get("entity") != entity:
#         raise HTTPException(status_code=403, detail="Access denied")

#     coding = db.coding.find_one({"invoice_id": invoice_id})

#     if not coding:
#         vendor_name = get_vendor_name(invoice)
#         items = invoice.get("extracted_data", {}).get("Items", {}).get("value", [])

#         if vendor_name and items:
#             suggestions = get_coding_suggestions(db, vendor_name, items)
#             if suggestions:
#                 return CodingResponse(
#                     id="suggested",
#                     invoice_id=invoice_id,
#                     created_at=datetime.utcnow(),
#                     line_items=suggestions
#                 )

#         raise HTTPException(status_code=404, detail="Coding data not found")

#     coding["id"] = str(coding["_id"])
#     return CodingResponse(**coding)


# @router.delete("/{invoice_id}")
# async def delete_coding(
#     invoice_id: str,
#     current_user: UserResponse = Depends(get_current_user),
#     entity: str = Depends(get_current_entity)
# ):
#     db = get_database()

#     invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
#     if not invoice:
#         raise HTTPException(status_code=404, detail="Invoice not found")

#     if invoice.get("entity") != entity:
#         raise HTTPException(status_code=403, detail="Access denied")

#     result = db.coding.delete_one({"invoice_id": invoice_id})
#     if result.deleted_count == 0:
#         raise HTTPException(status_code=404, detail="Coding not found")

#     return {"message": "Coding deleted successfully"}


# from fastapi import APIRouter, HTTPException, Depends
# from typing import Optional, List, Dict, Any
# from datetime import datetime
# from bson.objectid import ObjectId

# from app.models.coding import CodingCreate, CodingResponse, LineItemCoding
# from app.models.workflow import WorkflowStepType, WorkflowStepStatus
# from app.database.mongodb import get_database
# from app.auth.jwt import get_current_user
# from app.dependencies import get_current_entity
# from app.models.user import UserResponse

# # 🔹 AI helpers
# from app.ai.normalizer import normalize_description, normalize_vendor
# from app.ai.embeddings import embed_text
# from app.ai.similarity import cosine_similarity

# router = APIRouter()

# # ✅ FIX 2: realistic threshold for OCR text
# SIMILARITY_THRESHOLD = 0.65


# # ---------------------------------------------------------
# # Utility helpers
# # ---------------------------------------------------------

# def safe_float(value) -> float:
#     if value is None:
#         return 0.0
#     if isinstance(value, (int, float)):
#         return float(value)
#     if isinstance(value, str):
#         cleaned = value.replace('$', '').replace(',', '').strip()
#         try:
#             return float(cleaned) if cleaned else 0.0
#         except ValueError:
#             return 0.0
#     return 0.0


# def get_vendor_name(invoice: Dict[str, Any]) -> Optional[str]:
#     extracted = invoice.get("extracted_data", {})

#     if "vendor_info" in extracted:
#         v_info = extracted["vendor_info"]
#         if isinstance(v_info, dict):
#             name_obj = v_info.get("name", {})
#             if isinstance(name_obj, dict):
#                 val = name_obj.get("value")
#                 if val:
#                     return str(val).strip()

#     for field in ["VendorName", "MerchantName", "vendor_name", "merchant_name"]:
#         if field in extracted and isinstance(extracted[field], dict):
#             val = extracted[field].get("value")
#             if val:
#                 return str(val).strip()

#     return None


# # ---------------------------------------------------------
# # CODING HISTORY (Learning)
# # ---------------------------------------------------------

# def update_coding_history(db, vendor_name: str, line_items: List[LineItemCoding]):
#     """Store coding history for future auto-suggestions"""

#     if not vendor_name:
#         return

#     vendor_key = normalize_vendor(vendor_name)
#     history_coll = db.coding_history

#     print(f"💾 Saving coding history for vendor_key: {vendor_key}")

#     for item in line_items:
#         if not item.description or not item.gl_code or not item.gl_code.strip():
#             continue

#         normalized_desc = normalize_description(item.description)

#         # ✅ FIX 3: embed DESCRIPTION ONLY
#         embedding = embed_text(normalized_desc)

#         history_coll.update_one(
#             {
#                 "vendor_key": vendor_key,
#                 "normalized_description": normalized_desc
#             },
#             {
#                 "$set": {
#                     "vendor_key": vendor_key,
#                     "vendor_name": vendor_name,
#                     "description": item.description.strip(),
#                     "normalized_description": normalized_desc,
#                     "embedding": embedding,
#                     "coding": {
#                         "gl_code": item.gl_code,
#                         "lob": item.lob,
#                         "department": item.department,
#                         "customer": item.customer,
#                         "item": item.item
#                     },
#                     "updated_at": datetime.utcnow()
#                 }
#             },
#             upsert=True
#         )

#         print(f"   ✓ Learned: {item.description} → {item.gl_code}")


# # ---------------------------------------------------------
# # AUTO GL CODING
# # ---------------------------------------------------------

# def get_coding_suggestions(
#     db,
#     vendor_name: str,
#     extracted_items: List[Dict[str, Any]]
# ) -> List[LineItemCoding]:

#     if not vendor_name or not extracted_items:
#         return []

#     vendor_key = normalize_vendor(vendor_name)
#     history_coll = db.coding_history
#     suggested_items: List[LineItemCoding] = []

#     print(f"🔍 Auto-coding for vendor_key: {vendor_key}")

#     # Fetch history ONCE (important for performance)
#     candidates = list(history_coll.find({
#         "vendor_key": vendor_key,
#         "embedding": {"$exists": True}
#     }))

#     print(f"📚 History records found: {len(candidates)}")

#     for idx, item in enumerate(extracted_items):
#         desc = item.get("description", {}).get("value")
#         if not desc:
#             continue

#         normalized_desc = normalize_description(desc)
#         query_embedding = embed_text(normalized_desc)

#         best_match = None
#         best_score = 0.0

#         for c in candidates:
#             score = cosine_similarity(query_embedding, c["embedding"])
#             if score > best_score:
#                 best_score = score
#                 best_match = c

#         line_item = LineItemCoding(
#             s_no=idx + 1,
#             description=desc,
#             line_type="Expense",
#             quantity=safe_float(item.get("quantity", {}).get("value")),
#             unit_price=safe_float(item.get("unit_price", {}).get("value")),
#             net_amount=safe_float(item.get("amount", {}).get("value")),
#             gl_code=""
#         )

#         if best_match and best_score >= SIMILARITY_THRESHOLD:
#             coding = best_match["coding"]
#             line_item.gl_code = coding.get("gl_code", "")
#             line_item.lob = coding.get("lob", "")
#             line_item.department = coding.get("department", "")
#             line_item.customer = coding.get("customer", "")
#             line_item.item = coding.get("item", "")

#             print(f"   ✓ Match [{best_score:.2f}] → {line_item.gl_code}")
#         else:
#             print(f"   ✗ No match (best={best_score:.2f})")

#         suggested_items.append(line_item)

#     return suggested_items


# # ---------------------------------------------------------
# # API ENDPOINTS
# # ---------------------------------------------------------

# @router.post("/", response_model=CodingResponse)
# async def create_or_update_coding(
#     coding_data: CodingCreate,
#     current_user: UserResponse = Depends(get_current_user),
#     entity: str = Depends(get_current_entity)
# ):
#     db = get_database()

#     invoice = db.invoices.find_one({"_id": ObjectId(coding_data.invoice_id)})
#     if not invoice:
#         raise HTTPException(status_code=404, detail="Invoice not found")

#     if invoice.get("entity") != entity:
#         raise HTTPException(status_code=403, detail="Access denied")

#     existing = db.coding.find_one({"invoice_id": coding_data.invoice_id})

#     if existing:
#         update_data = coding_data.dict(exclude={"invoice_id", "vendor_name"})
#         update_data["updated_at"] = datetime.utcnow()

#         db.coding.update_one(
#             {"invoice_id": coding_data.invoice_id},
#             {"$set": update_data}
#         )

#         vendor_name = coding_data.vendor_name or get_vendor_name(invoice)
#         if vendor_name and coding_data.line_items:
#             update_coding_history(db, vendor_name, coding_data.line_items)

#         updated = db.coding.find_one({"invoice_id": coding_data.invoice_id})
#         updated["id"] = str(updated["_id"])
#         return CodingResponse(**updated)

#     coding_dict = coding_data.dict()
#     coding_dict["created_at"] = datetime.utcnow()
#     coding_dict["updated_at"] = None
#     coding_dict.pop("vendor_name", None)

#     result = db.coding.insert_one(coding_dict)

#     vendor_name = coding_data.vendor_name or get_vendor_name(invoice)
#     if vendor_name and coding_data.line_items:
#         update_coding_history(db, vendor_name, coding_data.line_items)

#     db.workflow_steps.insert_one({
#         "invoice_id": coding_data.invoice_id,
#         "step_name": "Coding",
#         "step_type": WorkflowStepType.CODING,
#         "user": current_user.username,
#         "status": WorkflowStepStatus.COMPLETED,
#         "timestamp": datetime.utcnow(),
#         "entity": entity
#     })

#     created = db.coding.find_one({"_id": result.inserted_id})
#     created["id"] = str(created["_id"])
#     return CodingResponse(**created)




# from fastapi import APIRouter, HTTPException, Depends
# from typing import Optional, List, Dict, Any
# from datetime import datetime
# from bson.objectid import ObjectId

# from app.models.coding import CodingCreate, CodingResponse, LineItemCoding
# from app.models.workflow import WorkflowStepType, WorkflowStepStatus
# from app.database.mongodb import get_database
# from app.auth.jwt import get_current_user
# from app.dependencies import get_current_entity
# from app.models.user import UserResponse

# # 🔹 AI helpers
# from app.ai.normalizer import normalize_description, normalize_vendor
# from app.ai.embeddings import embed_text
# from app.ai.similarity import cosine_similarity

# router = APIRouter()

# # ✅ FIX 2: realistic threshold for OCR text
# SIMILARITY_THRESHOLD = 0.65


# # ---------------------------------------------------------
# # Utility helpers
# # ---------------------------------------------------------

# def safe_float(value) -> float:
#     if value is None:
#         return 0.0
#     if isinstance(value, (int, float)):
#         return float(value)
#     if isinstance(value, str):
#         cleaned = value.replace('$', '').replace(',', '').strip()
#         try:
#             return float(cleaned) if cleaned else 0.0
#         except ValueError:
#             return 0.0
#     return 0.0


# def get_vendor_name(invoice: Dict[str, Any]) -> Optional[str]:
#     extracted = invoice.get("extracted_data", {})

#     if "vendor_info" in extracted:
#         v_info = extracted["vendor_info"]
#         if isinstance(v_info, dict):
#             name_obj = v_info.get("name", {})
#             if isinstance(name_obj, dict):
#                 val = name_obj.get("value")
#                 if val:
#                     return str(val).strip()

#     for field in ["VendorName", "MerchantName", "vendor_name", "merchant_name"]:
#         if field in extracted and isinstance(extracted[field], dict):
#             val = extracted[field].get("value")
#             if val:
#                 return str(val).strip()

#     return None


# def get_line_items(invoice: Dict[str, Any]) -> List[Dict[str, Any]]:
#     """Extract line items from invoice"""
#     extracted = invoice.get("extracted_data", {})
    
#     # Try different possible fields where line items might be stored
#     line_items = (
#         extracted.get("line_items") or 
#         extracted.get("items") or 
#         extracted.get("LineItems") or
#         []
#     )
    
#     return line_items if isinstance(line_items, list) else []


# # ---------------------------------------------------------
# # CODING HISTORY (Learning)
# # ---------------------------------------------------------

# def update_coding_history(db, vendor_name: str, line_items: List[LineItemCoding]):
#     """Store coding history for future auto-suggestions"""

#     if not vendor_name:
#         return

#     vendor_key = normalize_vendor(vendor_name)
#     history_coll = db.coding_history

#     print(f"💾 Saving coding history for vendor_key: {vendor_key}")

#     for item in line_items:
#         if not item.description or not item.gl_code or not item.gl_code.strip():
#             continue

#         normalized_desc = normalize_description(item.description)

#         # ✅ FIX 3: embed DESCRIPTION ONLY
#         embedding = embed_text(normalized_desc)

#         history_coll.update_one(
#             {
#                 "vendor_key": vendor_key,
#                 "normalized_description": normalized_desc
#             },
#             {
#                 "$set": {
#                     "vendor_key": vendor_key,
#                     "vendor_name": vendor_name,
#                     "description": item.description.strip(),
#                     "normalized_description": normalized_desc,
#                     "embedding": embedding,
#                     "coding": {
#                         "gl_code": item.gl_code,
#                         "lob": item.lob,
#                         "department": item.department,
#                         "customer": item.customer,
#                         "item": item.item
#                     },
#                     "updated_at": datetime.utcnow()
#                 }
#             },
#             upsert=True
#         )

#         print(f"   ✓ Learned: {item.description} → {item.gl_code}")


# # ---------------------------------------------------------
# # AUTO GL CODING
# # ---------------------------------------------------------

# def get_coding_suggestions(
#     db,
#     vendor_name: str,
#     extracted_items: List[Dict[str, Any]]
# ) -> List[LineItemCoding]:

#     if not vendor_name or not extracted_items:
#         return []

#     vendor_key = normalize_vendor(vendor_name)
#     history_coll = db.coding_history
#     suggested_items: List[LineItemCoding] = []

#     print(f"🔍 Auto-coding for vendor_key: {vendor_key}")

#     # Fetch history ONCE (important for performance)
#     candidates = list(history_coll.find({
#         "vendor_key": vendor_key,
#         "embedding": {"$exists": True}
#     }))

#     print(f"📚 History records found: {len(candidates)}")

#     for idx, item in enumerate(extracted_items):
#         desc = item.get("description", {}).get("value")
#         if not desc:
#             continue

#         normalized_desc = normalize_description(desc)
#         query_embedding = embed_text(normalized_desc)

#         best_match = None
#         best_score = 0.0

#         for c in candidates:
#             score = cosine_similarity(query_embedding, c["embedding"])
#             if score > best_score:
#                 best_score = score
#                 best_match = c

#         line_item = LineItemCoding(
#             s_no=idx + 1,
#             description=desc,
#             line_type="Expense",
#             quantity=safe_float(item.get("quantity", {}).get("value")),
#             unit_price=safe_float(item.get("unit_price", {}).get("value")),
#             net_amount=safe_float(item.get("amount", {}).get("value")),
#             gl_code=""
#         )

#         if best_match and best_score >= SIMILARITY_THRESHOLD:
#             coding = best_match["coding"]
#             line_item.gl_code = coding.get("gl_code", "")
#             line_item.lob = coding.get("lob", "")
#             line_item.department = coding.get("department", "")
#             line_item.customer = coding.get("customer", "")
#             line_item.item = coding.get("item", "")

#             print(f"   ✓ Match [{best_score:.2f}] → {line_item.gl_code}")
#         else:
#             print(f"   ✗ No match (best={best_score:.2f})")

#         suggested_items.append(line_item)

#     return suggested_items


# # ---------------------------------------------------------
# # API ENDPOINTS
# # ---------------------------------------------------------

# @router.get("/{invoice_id}", response_model=CodingResponse)
# async def get_coding(
#     invoice_id: str,
#     current_user: UserResponse = Depends(get_current_user),
#     entity: str = Depends(get_current_entity)
# ):
#     """
#     Get coding data for an invoice. If it doesn't exist, auto-generate suggestions
#     based on historical data.
#     """
#     db = get_database()

#     # Verify invoice exists and user has access
#     try:
#         invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
#     except:
#         raise HTTPException(status_code=400, detail="Invalid invoice ID format")
    
#     if not invoice:
#         raise HTTPException(status_code=404, detail="Invoice not found")

#     if invoice.get("entity") != entity:
#         raise HTTPException(status_code=403, detail="Access denied")

#     # Check if coding already exists
#     existing = db.coding.find_one({"invoice_id": invoice_id})
    
#     if existing:
#         existing["id"] = str(existing["_id"])
#         return CodingResponse(**existing)

#     # No existing coding - generate auto-suggestions
#     vendor_name = get_vendor_name(invoice)
#     line_items_data = get_line_items(invoice)

#     if not vendor_name or not line_items_data:
#         # Return empty coding structure
#         return CodingResponse(
#             id="",
#             invoice_id=invoice_id,
#             line_items=[],
#             total_amount=0.0,
#             created_at=datetime.utcnow()
#         )

#     # Get AI suggestions
#     suggested_items = get_coding_suggestions(db, vendor_name, line_items_data)
    
#     total = sum(item.net_amount for item in suggested_items)

#     return CodingResponse(
#         id="",  # Not saved yet
#         invoice_id=invoice_id,
#         vendor_name=vendor_name,
#         line_items=suggested_items,
#         total_amount=total,
#         created_at=datetime.utcnow()
#     )


# @router.post("/", response_model=CodingResponse)
# async def create_or_update_coding(
#     coding_data: CodingCreate,
#     current_user: UserResponse = Depends(get_current_user),
#     entity: str = Depends(get_current_entity)
# ):
#     """
#     Save coding data and update learning history
#     """
#     db = get_database()

#     invoice = db.invoices.find_one({"_id": ObjectId(coding_data.invoice_id)})
#     if not invoice:
#         raise HTTPException(status_code=404, detail="Invoice not found")

#     if invoice.get("entity") != entity:
#         raise HTTPException(status_code=403, detail="Access denied")

#     existing = db.coding.find_one({"invoice_id": coding_data.invoice_id})

#     if existing:
#         # Update existing
#         update_data = coding_data.dict(exclude={"invoice_id", "vendor_name"})
#         update_data["updated_at"] = datetime.utcnow()

#         db.coding.update_one(
#             {"invoice_id": coding_data.invoice_id},
#             {"$set": update_data}
#         )

#         vendor_name = coding_data.vendor_name or get_vendor_name(invoice)
#         if vendor_name and coding_data.line_items:
#             update_coding_history(db, vendor_name, coding_data.line_items)

#         updated = db.coding.find_one({"invoice_id": coding_data.invoice_id})
#         updated["id"] = str(updated["_id"])
#         return CodingResponse(**updated)

#     # Create new
#     coding_dict = coding_data.dict()
#     coding_dict["created_at"] = datetime.utcnow()
#     coding_dict["updated_at"] = None
#     coding_dict.pop("vendor_name", None)

#     result = db.coding.insert_one(coding_dict)

#     vendor_name = coding_data.vendor_name or get_vendor_name(invoice)
#     if vendor_name and coding_data.line_items:
#         update_coding_history(db, vendor_name, coding_data.line_items)

#     # Create workflow step
#     db.workflow_steps.insert_one({
#         "invoice_id": coding_data.invoice_id,
#         "step_name": "Coding",
#         "step_type": WorkflowStepType.CODING,
#         "user": current_user.username,
#         "status": WorkflowStepStatus.COMPLETED,
#         "timestamp": datetime.utcnow(),
#         "entity": entity
#     })

#     created = db.coding.find_one({"_id": result.inserted_id})
#     created["id"] = str(created["_id"])
#     return CodingResponse(**created)



from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List, Dict, Any
from datetime import datetime
from bson.objectid import ObjectId
import json

from app.models.coding import CodingCreate, CodingResponse, LineItemCoding
from app.models.workflow import WorkflowStepType, WorkflowStepStatus
from app.database.mongodb import get_database
from app.auth.jwt import get_current_user
from app.dependencies import get_current_entity
from app.models.user import UserResponse

# 🔹 AI helpers
from app.ai.normalizer import normalize_description, normalize_vendor
from app.ai.embeddings import embed_text
from app.ai.similarity import cosine_similarity

router = APIRouter()

# ✅ FIX 2: realistic threshold for OCR text
SIMILARITY_THRESHOLD = 0.65


# ---------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------

def safe_float(value) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.replace('$', '').replace(',', '').strip()
        try:
            return float(cleaned) if cleaned else 0.0
        except ValueError:
            return 0.0
    return 0.0


def get_vendor_name(invoice: Dict[str, Any]) -> Optional[str]:
    extracted = invoice.get("extracted_data", {})

    if "vendor_info" in extracted:
        v_info = extracted["vendor_info"]
        if isinstance(v_info, dict):
            name_obj = v_info.get("name", {})
            if isinstance(name_obj, dict):
                val = name_obj.get("value")
                if val:
                    return str(val).strip()

    for field in ["VendorName", "MerchantName", "vendor_name", "merchant_name"]:
        if field in extracted and isinstance(extracted[field], dict):
            val = extracted[field].get("value")
            if val:
                return str(val).strip()

    return None


def get_line_items(invoice: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Extract line items from invoice with extensive logging"""
    extracted = invoice.get("extracted_data", {})
    
    print("\n" + "="*60)
    print("🔍 DEBUG: Extracting line items from invoice")
    print("="*60)
    
    # Log available keys
    print(f"📋 Available keys in extracted_data: {list(extracted.keys())}")
    
    # Try different possible fields where line items might be stored
    possible_fields = [
        "line_items", "items", "LineItems", "lineItems",
        "line_item", "item_list", "products", "details"
    ]
    
    for field in possible_fields:
        if field in extracted:
            data = extracted[field]
            print(f"✅ Found field '{field}': type={type(data)}")
            
            if isinstance(data, list) and len(data) > 0:
                print(f"   └─ Contains {len(data)} items")
                print(f"   └─ First item structure: {json.dumps(data[0], indent=2)[:200]}...")
                return data
            elif isinstance(data, list):
                print(f"   └─ Empty list")
            else:
                print(f"   └─ Not a list: {type(data)}")
    
    # If no standard field found, check if items are at root level
    if "Items" in extracted or "items" in extracted:
        items_data = extracted.get("Items") or extracted.get("items")
        if isinstance(items_data, dict) and "value" in items_data:
            print(f"✅ Found Items with 'value' wrapper")
            return items_data["value"] if isinstance(items_data["value"], list) else []
    
    print("❌ No line items found in any expected location")
    print("📄 Full extracted_data structure:")
    print(json.dumps(extracted, indent=2)[:500])
    print("="*60 + "\n")
    
    return []


# ---------------------------------------------------------
# CODING HISTORY (Learning)
# ---------------------------------------------------------

def update_coding_history(db, vendor_name: str, line_items: List[LineItemCoding]):
    """Store coding history for future auto-suggestions"""

    if not vendor_name:
        return

    vendor_key = normalize_vendor(vendor_name)
    history_coll = db.coding_history

    print(f"💾 Saving coding history for vendor_key: {vendor_key}")

    for item in line_items:
        if not item.description or not item.gl_code or not item.gl_code.strip():
            continue

        normalized_desc = normalize_description(item.description)

        # ✅ FIX 3: embed DESCRIPTION ONLY
        embedding = embed_text(normalized_desc)

        history_coll.update_one(
            {
                "vendor_key": vendor_key,
                "normalized_description": normalized_desc
            },
            {
                "$set": {
                    "vendor_key": vendor_key,
                    "vendor_name": vendor_name,
                    "description": item.description.strip(),
                    "normalized_description": normalized_desc,
                    "embedding": embedding,
                    "coding": {
                        "gl_code": item.gl_code,
                        "lob": item.lob,
                        "department": item.department,
                        "customer": item.customer,
                        "item": item.item
                    },
                    "updated_at": datetime.utcnow()
                }
            },
            upsert=True
        )

        print(f"   ✓ Learned: {item.description} → {item.gl_code}")


# ---------------------------------------------------------
# AUTO GL CODING
# ---------------------------------------------------------

def get_coding_suggestions(
    db,
    vendor_name: str,
    extracted_items: List[Dict[str, Any]]
) -> List[LineItemCoding]:

    if not vendor_name or not extracted_items:
        print(f"⚠️ Cannot generate suggestions: vendor={vendor_name}, items={len(extracted_items) if extracted_items else 0}")
        return []

    vendor_key = normalize_vendor(vendor_name)
    history_coll = db.coding_history
    suggested_items: List[LineItemCoding] = []

    print(f"🔍 Auto-coding for vendor_key: {vendor_key}")

    # Fetch history ONCE (important for performance)
    candidates = list(history_coll.find({
        "vendor_key": vendor_key,
        "embedding": {"$exists": True}
    }))

    print(f"📚 History records found: {len(candidates)}")

    for idx, item in enumerate(extracted_items):
        # Handle both wrapped and unwrapped descriptions
        if isinstance(item.get("description"), dict):
            desc = item.get("description", {}).get("value")
        else:
            desc = item.get("description")
            
        if not desc:
            print(f"   ⚠️ Item {idx+1}: No description found")
            continue

        print(f"   📝 Item {idx+1}: {desc[:50]}...")

        normalized_desc = normalize_description(desc)
        query_embedding = embed_text(normalized_desc)

        best_match = None
        best_score = 0.0

        for c in candidates:
            score = cosine_similarity(query_embedding, c["embedding"])
            if score > best_score:
                best_score = score
                best_match = c

        # Handle both wrapped and unwrapped values
        def get_value(field):
            val = item.get(field)
            if isinstance(val, dict) and "value" in val:
                return val["value"]
            return val

        line_item = LineItemCoding(
            s_no=idx + 1,
            description=desc,
            line_type="Expense",
            quantity=safe_float(get_value("quantity")),
            unit_price=safe_float(get_value("unit_price") or get_value("price")),
            net_amount=safe_float(get_value("amount") or get_value("total") or get_value("net_amount")),
            gl_code=""
        )

        if best_match and best_score >= SIMILARITY_THRESHOLD:
            coding = best_match["coding"]
            line_item.gl_code = coding.get("gl_code", "")
            line_item.lob = coding.get("lob", "")
            line_item.department = coding.get("department", "")
            line_item.customer = coding.get("customer", "")
            line_item.item = coding.get("item", "")

            print(f"      ✓ Match [{best_score:.2f}] → {line_item.gl_code}")
        else:
            print(f"      ✗ No match (best={best_score:.2f})")

        suggested_items.append(line_item)

    return suggested_items


# ---------------------------------------------------------
# API ENDPOINTS
# ---------------------------------------------------------

@router.get("/{invoice_id}", response_model=CodingResponse)
async def get_coding(
    invoice_id: str,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """
    Get coding data for an invoice. If it doesn't exist, auto-generate suggestions
    based on historical data.
    """
    db = get_database()

    # Verify invoice exists and user has access
    try:
        invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
    except:
        raise HTTPException(status_code=400, detail="Invalid invoice ID format")
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if invoice.get("entity") != entity:
        raise HTTPException(status_code=403, detail="Access denied")

    # Check if coding already exists
    existing = db.coding.find_one({"invoice_id": invoice_id})
    
    if existing:
        print(f"✅ Found existing coding for invoice {invoice_id}")
        existing["id"] = str(existing["_id"])
        return CodingResponse(**existing)

    print(f"\n🆕 No existing coding for invoice {invoice_id} - generating suggestions")

    # No existing coding - generate auto-suggestions
    vendor_name = get_vendor_name(invoice)
    print(f"🏢 Vendor name: {vendor_name}")
    
    line_items_data = get_line_items(invoice)
    print(f"📦 Line items extracted: {len(line_items_data)}")

    if not line_items_data:
        print("⚠️ No line items found - returning empty coding structure")
        # Return empty coding structure
        return CodingResponse(
            id="",
            invoice_id=invoice_id,
            vendor_name=vendor_name,
            line_items=[],
            total_amount=0.0,
            created_at=datetime.utcnow()
        )

    if not vendor_name:
        print("⚠️ No vendor name - cannot generate suggestions")
        return CodingResponse(
            id="",
            invoice_id=invoice_id,
            line_items=[],
            total_amount=0.0,
            created_at=datetime.utcnow()
        )

    # Get AI suggestions
    suggested_items = get_coding_suggestions(db, vendor_name, line_items_data)
    
    total = sum(item.net_amount for item in suggested_items)

    print(f"✨ Generated {len(suggested_items)} suggestions, total: {total}")

    return CodingResponse(
        id="",  # Not saved yet
        invoice_id=invoice_id,
        vendor_name=vendor_name,
        line_items=suggested_items,
        total_amount=total,
        created_at=datetime.utcnow()
    )


@router.post("/", response_model=CodingResponse)
async def create_or_update_coding(
    coding_data: CodingCreate,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """
    Save coding data and update learning history
    """
    db = get_database()

    invoice = db.invoices.find_one({"_id": ObjectId(coding_data.invoice_id)})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if invoice.get("entity") != entity:
        raise HTTPException(status_code=403, detail="Access denied")

    existing = db.coding.find_one({"invoice_id": coding_data.invoice_id})

    if existing:
        # Update existing
        update_data = coding_data.dict(exclude={"invoice_id", "vendor_name"})
        update_data["updated_at"] = datetime.utcnow()

        db.coding.update_one(
            {"invoice_id": coding_data.invoice_id},
            {"$set": update_data}
        )

        vendor_name = coding_data.vendor_name or get_vendor_name(invoice)
        if vendor_name and coding_data.line_items:
            update_coding_history(db, vendor_name, coding_data.line_items)

        updated = db.coding.find_one({"invoice_id": coding_data.invoice_id})
        updated["id"] = str(updated["_id"])
        return CodingResponse(**updated)

    # Create new
    coding_dict = coding_data.dict()
    coding_dict["created_at"] = datetime.utcnow()
    coding_dict["updated_at"] = None
    coding_dict.pop("vendor_name", None)

    result = db.coding.insert_one(coding_dict)

    vendor_name = coding_data.vendor_name or get_vendor_name(invoice)
    if vendor_name and coding_data.line_items:
        update_coding_history(db, vendor_name, coding_data.line_items)

    # Create workflow step
    db.workflow_steps.insert_one({
        "invoice_id": coding_data.invoice_id,
        "step_name": "Coding",
        "step_type": WorkflowStepType.CODING,
        "user": current_user.username,
        "status": WorkflowStepStatus.COMPLETED,
        "timestamp": datetime.utcnow(),
        "entity": entity
    })

    created = db.coding.find_one({"_id": result.inserted_id})
    created["id"] = str(created["_id"])
    return CodingResponse(**created)