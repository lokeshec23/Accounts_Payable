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
        if not item.description or not item.gl_code:
            continue

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
    if any(i.gl_code for i in suggestions):
        doc = {
            "invoice_id": invoice_id,
            "vendor_name": vendor_name,
            "line_items": [i.dict() for i in suggestions],
            "created_at": datetime.utcnow(),
            "updated_at": None,
            "status": "auto-coded"
        }

        result = db.coding.insert_one(doc)

        db.workflow_steps.insert_one({
            "invoice_id": invoice_id,
            "step_name": "Coding (Auto)",
            "step_type": WorkflowStepType.CODING,
            "user": "System",
            "status": WorkflowStepStatus.COMPLETED,
            "timestamp": datetime.utcnow(),
            "entity": entity
        })

        saved = db.coding.find_one({"_id": result.inserted_id})
        saved["id"] = str(saved["_id"])
        return CodingResponse(**saved)

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

    db.coding.delete_one({"invoice_id": coding_data.invoice_id})

    doc = coding_data.dict(exclude={"vendor_name"})
    doc["created_at"] = datetime.utcnow()
    doc["updated_at"] = None

    result = db.coding.insert_one(doc)

    vendor_name = coding_data.vendor_name or get_vendor_name(invoice)
    if vendor_name:
        update_coding_history(db, vendor_name, coding_data.line_items)

    saved = db.coding.find_one({"_id": result.inserted_id})
    saved["id"] = str(saved["_id"])
    return CodingResponse(**saved)
