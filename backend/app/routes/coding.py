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
from app.services.audit_service import audit_service
from app.models.audit_log import AuditAction

router = APIRouter()

# ---------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------

def safe_float(value) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.replace("$", "").replace(",", "").strip()
        try:
            return float(cleaned)
        except:
            return 0.0
    return 0.0


def get_vendor_name(invoice: Dict[str, Any]) -> Optional[str]:
    extracted = invoice.get("extracted_data", {})

    if "vendor_info" in extracted:
        name = extracted.get("vendor_info", {}).get("name", {}).get("value")
        if name:
            return str(name).strip()

    for field in ["VendorName", "MerchantName", "vendor_name", "merchant_name"]:
        val = extracted.get(field, {}).get("value")
        if val:
            return str(val).strip()

    return None


def get_line_items(invoice: Dict[str, Any]) -> List[Dict[str, Any]]:
    extracted = invoice.get("extracted_data", {})

    for key in [
        "line_items", "items", "LineItems", "lineItems",
        "item_list", "products", "details"
    ]:
        if isinstance(extracted.get(key), list):
            return extracted[key]

    if isinstance(extracted.get("Items"), dict):
        return extracted["Items"].get("value", [])

    return []


# ---------------------------------------------------------
# CODING HISTORY (Learning)
# ---------------------------------------------------------

def update_coding_history(db, vendor_name: str, line_items: List[LineItemCoding]):
    if not vendor_name:
        return

    vendor_key = normalize_vendor(vendor_name)
    history = db.coding_history

    for item in line_items:
        # if not item.description or not item.gl_code or not item.lob or not item.department or not item.customer or not item.item:
        #     continue

        norm_desc = normalize_description(item.description)
        embedding = embed_text(norm_desc)

        history.update_one(
            {
                "vendor_key": vendor_key,
                "normalized_description": norm_desc
            },
            {
                "$set": {
                    "vendor_key": vendor_key,
                    "vendor_name": vendor_name,
                    "description": item.description,
                    "normalized_description": norm_desc,
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


# ---------------------------------------------------------
# AUTO GL CODING
# ---------------------------------------------------------

def get_coding_suggestions(
    db,
    vendor_name: str,
    extracted_items: List[Dict[str, Any]]
) -> List[LineItemCoding]:

    vendor_key = normalize_vendor(vendor_name)
    history = list(db.coding_history.find({
        "vendor_key": vendor_key,
        "embedding": {"$exists": True}
    }))

    suggestions: List[LineItemCoding] = []

    for idx, raw in enumerate(extracted_items):
        desc = raw.get("description")
        if isinstance(desc, dict):
            desc = desc.get("value")

        if not desc:
            continue

        query_embedding = embed_text(normalize_description(desc))

        best_match = None
        best_score = 0.0

        for h in history:
            score = cosine_similarity(query_embedding, h["embedding"])
            if score > best_score:
                best_score = score
                best_match = h

        def val(key):
            v = raw.get(key)
            return v.get("value") if isinstance(v, dict) else v

        item = LineItemCoding(
            s_no=idx + 1,
            description=desc,
            line_type="Expense",
            quantity=safe_float(val("quantity")),
            unit_price=safe_float(val("unit_price") or val("price")),
            net_amount=safe_float(val("amount") or val("total")),
            gl_code=""
        )

        # 🔥 ALWAYS APPLY BEST MATCH (NO THRESHOLD BLOCKING)
        if best_match:
            coding = best_match["coding"]
            item.gl_code = coding.get("gl_code", "")
            item.lob = coding.get("lob", "")
            item.department = coding.get("department", "")
            item.customer = coding.get("customer", "")
            item.item = coding.get("item", "")

        suggestions.append(item)

    return suggestions


# ---------------------------------------------------------
# GET CODING (AUTO GL ENTRY POINT)
# ---------------------------------------------------------

@router.get("/{invoice_id}", response_model=CodingResponse)
async def get_coding(
    invoice_id: str,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    db = get_database()

    invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if invoice.get("entity") != entity:
        raise HTTPException(status_code=403, detail="Access denied")

    existing = db.coding.find_one({"invoice_id": invoice_id})
    if existing:
        existing["id"] = str(existing["_id"])
        return CodingResponse(**existing)

    vendor_name = get_vendor_name(invoice)
    items = get_line_items(invoice)

    if not vendor_name or not items:
        return CodingResponse(
            id="",
            invoice_id=invoice_id,
            line_items=[],
            total_amount=0.0,
            created_at=datetime.utcnow()
        )

    suggestions = get_coding_suggestions(db, vendor_name, items)

    # ✅ AUTO SAVE IF ANY GL EXISTS
    return CodingResponse(
        id="suggested",
        invoice_id=invoice_id,
        vendor_name=vendor_name,
        line_items=suggestions,
        total_amount=sum(i.net_amount for i in suggestions),
        created_at=datetime.utcnow()
    )


# ---------------------------------------------------------
# SAVE / UPDATE CODING
# ---------------------------------------------------------

@router.post("/", response_model=CodingResponse)
async def create_or_update_coding(
    coding_data: CodingCreate,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    db = get_database()

    invoice = db.invoices.find_one({"_id": ObjectId(coding_data.invoice_id)})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if invoice.get("entity") != entity:
        raise HTTPException(status_code=403, detail="Access denied")

    existing_coding = db.coding.find_one({"invoice_id": coding_data.invoice_id})

    if existing_coding:
        # ✅ UPDATE coding (do NOT delete)
        update_data = coding_data.dict(exclude={"invoice_id", "vendor_name"})
        update_data["updated_at"] = datetime.utcnow()

        db.coding.update_one(
            {"invoice_id": coding_data.invoice_id},
            {"$set": update_data}
        )
    else:
        # ✅ CREATE coding
        doc = coding_data.dict(exclude={"vendor_name"})
        doc["created_at"] = datetime.utcnow()
        doc["updated_at"] = None
        db.coding.insert_one(doc)

    # ✅ Update coding history
    vendor_name = coding_data.vendor_name or get_vendor_name(invoice)
    if vendor_name and coding_data.line_items:
        update_coding_history(db, vendor_name, coding_data.line_items)

    # ✅ Update gl_summary in invoices collection
    summary_map = {}
    for item in coding_data.line_items:
        if item.gl_code:
            summary_map[item.gl_code] = summary_map.get(item.gl_code, 0.0) + item.net_amount
    
    gl_summary = []
    for code, total in summary_map.items():
        gl_summary.append({"gl_code": code, "total_amount": total})
    
    # ---------------------------------------------------------
    # 🔄 SYNC TO EXTRACTED DATA (Reflect in Invoice Review)
    # ---------------------------------------------------------
    
    # ---------------------------------------------------------
    # 🔄 SYNC TO EXTRACTED DATA (Reflect in Invoice Review)
    # ---------------------------------------------------------
    
    # Get current extraction or initialize
    extracted_data = invoice.get("extracted_data") or {}
    
    # Ensure Items structure exists
    if "Items" not in extracted_data:
        extracted_data["Items"] = {"value": []}
    elif not isinstance(extracted_data["Items"], dict):
        extracted_data["Items"] = {"value": []}
    
    if "value" not in extracted_data["Items"] or not isinstance(extracted_data["Items"]["value"], list):
        extracted_data["Items"]["value"] = []

    
    # helper for constructing extracted item structure
    def create_extracted_item(coding_item):
        return {
            "description": {"value": coding_item.description, "confidence": 1.0},
            "quantity": {"value": coding_item.quantity, "confidence": 1.0},
            "unit_price": {"value": coding_item.unit_price, "confidence": 1.0},
            "amount": {"value": coding_item.net_amount, "confidence": 1.0},
            "item_code": {"value": coding_item.item, "confidence": 1.0},
            "unit_of_measure": {"value": None},
            "discount": {"value": None},
            "tax_rate": {"value": None},
            "tax_amount": {"value": None}, 
            "gross_amount": {"value": None}
        }

    original_items = extracted_data["Items"]["value"]
    new_items_list = []

    for item in coding_data.line_items:
        # If original_index is valid, use original item as base
        if item.original_index is not None and 0 <= item.original_index < len(original_items):
            base_item = original_items[item.original_index]
            # Update values
            if "description" not in base_item: base_item["description"] = {}
            base_item["description"]["value"] = item.description
            
            if "quantity" not in base_item: base_item["quantity"] = {}
            base_item["quantity"]["value"] = item.quantity
            
            if "unit_price" not in base_item: base_item["unit_price"] = {}
            base_item["unit_price"]["value"] = item.unit_price
            
            if "amount" not in base_item: base_item["amount"] = {}
            base_item["amount"]["value"] = item.net_amount

            if "item_code" not in base_item: base_item["item_code"] = {}
            base_item["item_code"]["value"] = item.item

            new_items_list.append(base_item)
        else:
            # Create new
            new_items_list.append(create_extracted_item(item))
    
    # Update extracted data in memory
    extracted_data["Items"]["value"] = new_items_list

    db.invoices.update_one(
        {"_id": ObjectId(coding_data.invoice_id)},
        {
            "$set": {
                "gl_summary": gl_summary,
                "extracted_data": extracted_data
            }
        }
    )

    # Determine current cycle
    status_history = invoice.get("status_history", [])
    last_cycle_start = datetime.min

    for entry in reversed(status_history):
        if entry.get("status") in ["reworked", "waiting_coding"] and entry.get("timestamp"):
            ts = entry["timestamp"]
            if isinstance(ts, str):
                try:
                    ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                except:
                    continue
            last_cycle_start = ts
            break


    saved = db.coding.find_one({"invoice_id": coding_data.invoice_id})
    saved["id"] = str(saved["_id"])

    # [AUDIT] Log Coding Saved
    await audit_service.log_action(
        invoice_id=coding_data.invoice_id, 
        action=AuditAction.CODING_SAVED, 
        user=current_user.username,
        entity=invoice.get("entity"),
        details={"line_items_count": len(coding_data.line_items), "total_amount": sum(i.net_amount for i in coding_data.line_items)}
    )

    return CodingResponse(**saved)
