from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List, Dict, Any
from datetime import datetime
import json

from app.models.coding import CodingCreate, CodingResponse, LineItemCoding
from app.models.workflow import WorkflowStepType, WorkflowStepStatus
from app.auth.jwt import get_current_user
from app.dependencies import get_current_entity, get_db
from app.models.user import UserResponse
from sqlalchemy.ext.asyncio import AsyncSession

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

async def update_coding_history(db: AsyncSession, vendor_name: str, line_items: List[LineItemCoding], entity: str):
    if not vendor_name:
        return
    
    from app.models.sql.coding import CodingHistory
    from sqlalchemy import select

    vendor_key = normalize_vendor(vendor_name)

    for item in line_items:
        norm_desc = normalize_description(item.description)
        embedding = embed_text(norm_desc)

        stmt = select(CodingHistory).where(
            CodingHistory.vendor_key == vendor_key,
            CodingHistory.normalized_description == norm_desc,
            CodingHistory.entity == entity
        )
        res = await db.execute(stmt)
        history_item = res.scalar_one_or_none()

        coding_data = {
            "gl_code": item.gl_code,
            "lob": item.lob,
            "department": item.department,
            "customer": item.customer,
            "item": item.item
        }

        if history_item:
            history_item.coding = coding_data
            history_item.embedding = embedding
            history_item.updated_at = datetime.utcnow()
        else:
            new_history = CodingHistory(
                vendor_key=vendor_key,
                vendor_name=vendor_name,
                description=item.description,
                normalized_description=norm_desc,
                embedding=embedding,
                coding=coding_data,
                updated_at=datetime.utcnow(),
                entity=entity
            )
            db.add(new_history)
    
    await db.commit()

async def get_coding_suggestions(
    db: AsyncSession,
    vendor_name: str,
    extracted_items: List[Dict[str, Any]],
    entity: str
) -> List[LineItemCoding]:
    from app.models.sql.coding import CodingHistory
    from sqlalchemy import select

    vendor_key = normalize_vendor(vendor_name)
    stmt = select(CodingHistory).where(
        CodingHistory.vendor_key == vendor_key,
        CodingHistory.entity == entity
    )
    res = await db.execute(stmt)
    history = res.scalars().all()

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
            if h.embedding:
                score = cosine_similarity(query_embedding, h.embedding)
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

        if best_match:
            coding = best_match.coding
            item.gl_code = coding.get("gl_code", "")
            item.lob = coding.get("lob", "")
            item.department = coding.get("department", "")
            item.customer = coding.get("customer", "")
            item.item = coding.get("item", "")

        suggestions.append(item)

    return suggestions

@router.get("/{invoice_id}", response_model=CodingResponse)
async def get_coding(
    invoice_id: str,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db)
):
    from app.models.sql.invoice import Invoice as SQLInvoice
    from app.models.sql.coding import Coding as SQLCoding
    from sqlalchemy import select

    try:
        inv_id_int = int(invoice_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid invoice ID format")

    stmt = select(SQLInvoice).where(SQLInvoice.id == inv_id_int, SQLInvoice.entity == entity)
    res = await db.execute(stmt)
    invoice = res.scalar_one_or_none()
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    stmt_coding = select(SQLCoding).where(SQLCoding.invoice_id == str(invoice.id))
    res_coding = await db.execute(stmt_coding)
    existing = res_coding.scalar_one_or_none()
    
    if existing:
        return CodingResponse(
            id=str(existing.id),
            invoice_id=existing.invoice_id,
            line_items=[LineItemCoding(**it) for it in existing.line_items],
            total_amount=existing.total_amount,
            created_at=existing.created_at
        )

    vendor_name = invoice.vendor_name
    items = get_line_items({"extracted_data": invoice.extracted_data})

    if not vendor_name or not items:
        return CodingResponse(
            id="",
            invoice_id=str(invoice.id),
            line_items=[],
            total_amount=0.0,
            created_at=datetime.utcnow()
        )

    suggestions = await get_coding_suggestions(db, vendor_name, items, entity)

    return CodingResponse(
        id="suggested",
        invoice_id=str(invoice.id),
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
    entity: str = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db)
):
    from app.models.sql.invoice import Invoice as SQLInvoice
    from app.models.sql.coding import Coding as SQLCoding
    from sqlalchemy import select
    
    try:
        inv_id_int = int(coding_data.invoice_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid invoice ID format")

    stmt = select(SQLInvoice).where(SQLInvoice.id == inv_id_int, SQLInvoice.entity == entity)
    res = await db.execute(stmt)
    invoice = res.scalar_one_or_none()
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    stmt_coding = select(SQLCoding).where(SQLCoding.invoice_id == str(invoice.id))
    res_coding = await db.execute(stmt_coding)
    existing_coding = res_coding.scalar_one_or_none()

    line_items_data = [item.dict() for item in coding_data.line_items]

    if existing_coding:
        existing_coding.line_items = line_items_data
        existing_coding.total_amount = sum(item.net_amount for item in coding_data.line_items)
        existing_coding.updated_at = datetime.utcnow()
    else:
        new_coding = SQLCoding(
            invoice_id=str(invoice.id),
            line_items=line_items_data,
            total_amount=sum(item.net_amount for item in coding_data.line_items),
            created_at=datetime.utcnow(),
            entity=entity
        )
        db.add(new_coding)

    # Update coding history
    vendor_name = coding_data.vendor_name or invoice.vendor_name
    if vendor_name and coding_data.line_items:
        await update_coding_history(db, vendor_name, coding_data.line_items, entity)

    # Update gl_summary in invoice
    summary_map = {}
    for item in coding_data.line_items:
        if item.gl_code:
            summary_map[item.gl_code] = summary_map.get(item.gl_code, 0.0) + item.net_amount
    
    invoice.gl_summary = [{"gl_code": code, "total_amount": total} for code, total in summary_map.items()]

    # Sync to extracted_data
    extracted_data = dict(invoice.extracted_data or {})
    if "Items" not in extracted_data:
        extracted_data["Items"] = {"value": []}
    
    # Simple sync logic (can be more complex like original)
    new_extracted_items = []
    for item in coding_data.line_items:
        new_extracted_items.append({
            "description": {"value": item.description, "confidence": 1.0},
            "quantity": {"value": item.quantity, "confidence": 1.0},
            "unit_price": {"value": item.unit_price, "confidence": 1.0},
            "amount": {"value": item.net_amount, "confidence": 1.0},
            "item_code": {"value": item.item, "confidence": 1.0}
        })
    extracted_data["Items"]["value"] = new_extracted_items
    invoice.extracted_data = extracted_data

    # Log Audit
    await audit_service.log_action(
        db,
        invoice_id=str(invoice.id), 
        action=AuditAction.CODING_SAVED, 
        user=current_user.username,
        entity=entity,
        details={"line_items_count": len(coding_data.line_items), "total_amount": sum(i.net_amount for i in coding_data.line_items)}
    )

    await db.commit()
    
    # Return result
    stmt_final = select(SQLCoding).where(SQLCoding.invoice_id == str(invoice.id))
    res_final = await db.execute(stmt_final)
    saved = res_final.scalar_one()

    return CodingResponse(
        id=str(saved.id),
        invoice_id=saved.invoice_id,
        line_items=[LineItemCoding(**it) for it in saved.line_items],
        total_amount=saved.total_amount,
        created_at=saved.created_at
    )
