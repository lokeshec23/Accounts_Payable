from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List, Dict, Any
from app.models.coding import CodingCreate, CodingResponse, CodingUpdate, LineItemCoding
from app.models.workflow import WorkflowStepType, WorkflowStepStatus
from app.database.mongodb import get_database
from app.auth.jwt import get_current_user
from app.dependencies import get_current_entity
from app.models.user import UserResponse
from datetime import datetime
from bson.objectid import ObjectId

router = APIRouter()

def get_vendor_name(invoice: Dict[str, Any]) -> Optional[str]:
    """Helper to extract vendor name from invoice data"""
    extracted = invoice.get("extracted_data", {})
    print(f"DEBUG: Extracting vendor from keys: {list(extracted.keys())}")
    
    # Check new nested structure first
    if "vendor_info" in extracted:
        v_info = extracted["vendor_info"]
        if isinstance(v_info, dict):
            name_obj = v_info.get("name", {})
            if isinstance(name_obj, dict):
                val = name_obj.get("value")
                if val:
                    print(f"DEBUG: Found vendor_name in vendor_info: {val}")
                    return str(val).strip()

    # Try common fields for vendor name (fallback for older or flat structures)
    for field in ["VendorName", "MerchantName", "vendor_name", "merchant_name"]:
        if field in extracted and isinstance(extracted[field], dict):
            val = extracted[field].get("value")
            if val:
                print(f"DEBUG: Found vendor_name in common fields: {val}")
                return str(val).strip()
    
    print("DEBUG: Vendor name NOT found")
    return None

def update_coding_history(db, vendor_name: str, line_items: List[LineItemCoding]):
    """Update coding history for future suggestions"""
    if not vendor_name:
        return

    history_coll = db.coding_history
    print(f"DEBUG: Updating history for vendor: {vendor_name} with {len(line_items)} items")
    
    for item in line_items:
        if not item.description:
            continue
            
        print(f"DEBUG: Saving history for description: {item.description}")
        # Create a signature based on description
        # We store the coding used for this specific description from this vendor
        filter_query = {
            "vendor_name": vendor_name, 
            "description": item.description.strip()
        }
        
        update_doc = {
            "$set": {
                "vendor_name": vendor_name,
                "description": item.description.strip(),
                "coding": {
                    "gl_code": item.gl_code,
                    "lob": item.lob,
                    "department": item.department,
                    "customer": item.customer,
                    "item": item.item
                },
                "updated_at": datetime.utcnow()
            }
        }
        
        history_coll.update_one(filter_query, update_doc, upsert=True)

def safe_float(value) -> float:
    """Safely convert a value to float, handling currency strings"""
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        # Remove currency symbols and commas
        cleaned = value.replace('$', '').replace(',', '').strip()
        try:
            return float(cleaned) if cleaned else 0.0
        except ValueError:
            return 0.0
    return 0.0

def get_coding_suggestions(db, vendor_name: str, extracted_items: List[Dict[str, Any]]) -> List[LineItemCoding]:
    """Get coding suggestions based on history"""
    print(f"DEBUG: Getting suggestions for vendor: {vendor_name}")
    if not vendor_name or not extracted_items:
        return []

    history_coll = db.coding_history
    suggested_items = []
    
    for idx, item in enumerate(extracted_items):
        desc = item.get("description", {}).get("value")
        if not desc:
            continue
            
        desc = str(desc).strip()
        history = history_coll.find_one({"vendor_name": vendor_name, "description": desc})
        
        # Build base item from extraction - use safe_float for numeric values
        line_item = LineItemCoding(
            s_no=idx + 1,
            description=desc,
            line_type="Expense", # Default
            quantity=safe_float(item.get("quantity", {}).get("value")),
            unit_price=safe_float(item.get("unit_price", {}).get("value")),
            net_amount=safe_float(item.get("amount", {}).get("value")),
            gl_code="",
        )
        
        if history and "coding" in history:
            print(f"DEBUG: Match found for {desc}")
            coding = history["coding"]
            line_item.gl_code = coding.get("gl_code", "")
            line_item.lob = coding.get("lob", "")
            line_item.department = coding.get("department", "")
            line_item.customer = coding.get("customer", "")
            line_item.item = coding.get("item", "")
        else:
            print(f"DEBUG: No match for {desc}")
            
        suggested_items.append(line_item)
        
    return suggested_items

@router.post("/", response_model=CodingResponse)
async def create_or_update_coding(
    coding_data: CodingCreate,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """Create or update coding data for an invoice"""
    db = get_database()
    
    try:
        # Verify invoice exists AND belongs to entity
        invoice = db.invoices.find_one({"_id": ObjectId(coding_data.invoice_id)})
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        # Entity Check
        if invoice.get("entity") != entity:
            raise HTTPException(status_code=403, detail="Access denied to this entity's data")
        
        # Check if coding already exists for this invoice
        existing_coding = db.coding.find_one({"invoice_id": coding_data.invoice_id})
        
        if existing_coding:
            # Update existing coding
            update_data = coding_data.dict(exclude={'invoice_id', 'vendor_name'})
            update_data['updated_at'] = datetime.utcnow()
            
            db.coding.update_one(
                {"invoice_id": coding_data.invoice_id},
                {"$set": update_data}
            )
            
            # Update History - Use vendor_name from payload if available, else extract
            v_name = getattr(coding_data, 'vendor_name', None)
            if not v_name:
                v_name = get_vendor_name(invoice)
                
            if v_name and coding_data.line_items:
                update_coding_history(db, v_name, coding_data.line_items)

            # DO NOT update invoice status here - let frontend control status changes
            # Status should only change when user clicks "Send to Approval"
            
            # ---- CREATE/UPDATE WORKFLOW STEP: CODING ----
            # Check if coding workflow step already exists *for this cycle*
            
            # 1. Determine start of current cycle (timestamp of last REWORKED or WAITING_CODING status)
            status_history = invoice.get("status_history", [])
            last_cycle_start = datetime.min
            
            for entry in reversed(status_history):
                # We look for the LATEST rework or recall event
                if entry.get("status") in ["reworked", "waiting_coding"] and entry.get("timestamp"):
                    # ensure timestamp is datetime
                    ts = entry.get("timestamp")
                    if isinstance(ts, str):
                        try:
                           ts = datetime.fromisoformat(ts.replace('Z', '+00:00'))
                        except:
                           pass # ignore invalid
                    if isinstance(ts, datetime):
                        last_cycle_start = ts
                        break
            
            # 2. Find if we have a CODING step after this time
            existing_coding_step = db.workflow_steps.find_one({
                "invoice_id": coding_data.invoice_id,
                "step_type": WorkflowStepType.CODING,
                "timestamp": {"$gt": last_cycle_start}
            })
            
            if not existing_coding_step:
                # Create coding workflow step only on first save OF THIS CYCLE
                workflow_step = {
                    "invoice_id": coding_data.invoice_id,
                    "step_name": "Coding",
                    "step_type": WorkflowStepType.CODING,
                    "user": current_user.username,
                    "status": WorkflowStepStatus.COMPLETED,
                    "timestamp": datetime.utcnow(),
                    "approver_number": None,
                    "comment": None,
                    "entity": entity
                }
                db.workflow_steps.insert_one(workflow_step)
            
            # Fetch updated document
            updated_coding = db.coding.find_one({"invoice_id": coding_data.invoice_id})
            updated_coding["id"] = str(updated_coding["_id"])
            return CodingResponse(**updated_coding)
        else:
            # Create new coding
            coding_dict = coding_data.dict()
            coding_dict["created_at"] = datetime.utcnow()
            coding_dict["updated_at"] = None
            
            # coding_dict might contain vendor_name, remove it before saving to DB
            if 'vendor_name' in coding_dict:
                del coding_dict['vendor_name']
                
            result = db.coding.insert_one(coding_dict)
            coding_id = str(result.inserted_id)
            
            # Update History
            v_name = getattr(coding_data, 'vendor_name', None)
            if not v_name:
                v_name = get_vendor_name(invoice)
                
            if v_name and coding_data.line_items:
                update_coding_history(db, v_name, coding_data.line_items)
            
            # DO NOT update invoice status here - let frontend control status changes
            # Status should only change when user clicks "Send to Approval"
            
            # ---- CREATE WORKFLOW STEP: CODING ----
            workflow_step = {
                "invoice_id": coding_data.invoice_id,
                "step_name": "Coding",
                "step_type": WorkflowStepType.CODING,
                "user": current_user.username,
                "status": WorkflowStepStatus.COMPLETED,
                "timestamp": datetime.utcnow(),
                "approver_number": None,
                "comment": None,
                "entity": entity
            }
            db.workflow_steps.insert_one(workflow_step)
            
            # Fetch created document
            created_coding = db.coding.find_one({"_id": result.inserted_id})
            created_coding["id"] = str(created_coding["_id"])
            return CodingResponse(**created_coding)
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{invoice_id}", response_model=CodingResponse)
async def get_coding(
    invoice_id: str,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """Get coding data by invoice ID"""
    db = get_database()
    
    # Verify invoice ownership first
    invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Entity Check
    if invoice.get("entity") != entity:
        raise HTTPException(status_code=403, detail="Access denied to this entity's data")
    
    print(f"DEBUG: get_coding called for invoice_id: {invoice_id}")
    coding = db.coding.find_one({"invoice_id": invoice_id})
    
    if not coding:
        print("DEBUG: No existing coding found, checking for suggestions...")
        # Check for auto-coding suggestions
        vendor_name = get_vendor_name(invoice)
        print(f"DEBUG: Extracted vendor_name: {vendor_name}")
        extracted_data = invoice.get("extracted_data", {})
        items_data = extracted_data.get("Items", {}).get("value", [])
        print(f"DEBUG: Found {len(items_data)} items in invoice")
        
        if vendor_name and items_data:
            suggestions = get_coding_suggestions(db, vendor_name, items_data)
            print(f"DEBUG: Generated {len(suggestions)} suggestions")
            
            # If we have suggestions (even if partially filled), return them as a "preview"
            # We return a transient CodingResponse that isn't saved yet
            if suggestions:
                print("DEBUG: Returning suggestions to frontend")
                return CodingResponse(
                    id="suggested", # Dummy ID
                    invoice_id=invoice_id,
                    created_at=datetime.utcnow(),
                    line_items=suggestions
                )
            else:
                print("DEBUG: No suggestions generated")
        else:
            print(f"DEBUG: Missing vendor_name or items_data (vendor: {vendor_name}, items: {len(items_data)})")

        raise HTTPException(status_code=404, detail="Coding data not found for this invoice")
    
    print("DEBUG: Returning existing coding")
    coding["id"] = str(coding["_id"])
    return CodingResponse(**coding)

@router.delete("/{invoice_id}")
async def delete_coding(
    invoice_id: str,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """Delete coding data by invoice ID"""
    db = get_database()
    
    # Verify invoice ownership first
    invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Entity Check
    if invoice.get("entity") != entity:
        raise HTTPException(status_code=403, detail="Access denied to this entity's data")
    
    result = db.coding.delete_one({"invoice_id": invoice_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Coding data not found for this invoice")
    
    return {"message": "Coding data deleted successfully"}
