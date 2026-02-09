from fastapi import APIRouter, HTTPException, Depends
from typing import Optional, List, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc
import json

from app.models.coding import CodingCreate, CodingResponse, LineItemCoding
from app.models.workflow import WorkflowStepType, WorkflowStepStatus
from app.database.database import get_db
from app.models.db_models import (
    Invoice, Coding as DBCoding, CodingHistory, InvoiceStatusHistory
)
from app.database.db_utils import invoice_to_dict
from app.auth.jwt import get_current_user
from app.dependencies import get_current_entity
from app.models.user import UserResponse

# AI helpers
from app.ai.normalizer import normalize_description, normalize_vendor
from app.ai.embeddings import embed_text
from app.ai.similarity import cosine_similarity
from app.services.audit_service import audit_service
from app.models.audit_log import AuditAction

import logging

logger = logging.getLogger(__name__)

router = APIRouter()

def safe_float(value) -> float:
    if value is None: return 0.0
    if isinstance(value, (int, float)): return float(value)
    if isinstance(value, str):
        cleaned = value.replace("$", "").replace(",", "").strip()
        try: return float(cleaned)
        except: return 0.0
    return 0.0

def get_vendor_name(invoice: Any) -> Optional[str]:
    if invoice.vendor_name: return invoice.vendor_name
    extracted = {}
    if invoice.extracted_data:
        try: extracted = json.loads(invoice.extracted_data) if isinstance(invoice.extracted_data, str) else invoice.extracted_data
        except: pass
    if "vendor_info" in extracted:
        name = extracted.get("vendor_info", {}).get("name", {}).get("value")
        if name: return str(name).strip()
    return None

def get_line_items(invoice: Any) -> List[Dict[str, Any]]:
    extracted = {}
    if invoice.extracted_data:
        try: extracted = json.loads(invoice.extracted_data) if isinstance(invoice.extracted_data, str) else invoice.extracted_data
        except: pass
    for key in ["line_items", "items", "LineItems", "lineItems", "item_list", "products", "details"]:
        if isinstance(extracted.get(key), list): return extracted[key]
    if isinstance(extracted.get("Items"), dict): return extracted["Items"].get("value", [])
    return []

def update_coding_history(db: Session, vendor_name: str, line_items: List[LineItemCoding], vendor_id: str = None):
    if not vendor_name and not vendor_id: return
    vendor_key = normalize_vendor(vendor_name) if vendor_name else None
    try:
        for item in line_items:
            if not item.description: continue
            
            # Skip if gl_code is empty - don't store empty/unfilled coding in history
            if not item.gl_code:
                continue

            # Skip system-generated lines from polluting history
            if item.gl_code in ["TDS_PAYABLE", "GST_INPUT", "GST_PAYABLE"]:
                continue
            
            if item.description and (
                item.description.startswith("TDS Deduction") or 
                item.description.startswith("Total GST") or
                item.description.startswith("GST for item")
            ):
                continue

            norm_desc = normalize_description(item.description)
            embedding = embed_text(norm_desc)
            
            # Priority 1: vendor_id, Priority 2: vendor_key
            query = db.query(CodingHistory)
            if vendor_id:
                query = query.filter(CodingHistory.vendor_id == vendor_id)
            else:
                query = query.filter(CodingHistory.vendor_key == vendor_key)
                
            history = query.filter(CodingHistory.normalized_description == norm_desc).first()

            coding_data = {
                "gl_code": item.gl_code,
                "lob": item.lob,
                "department": item.department,
                "customer": item.customer,
                "item": item.item
            }

            if history:
                history.description = item.description
                history.embedding = json.dumps(embedding)
                history.coding_json = json.dumps(coding_data)
                history.updated_at = datetime.utcnow()
                if vendor_id: history.vendor_id = vendor_id # Update id if missing
            else:
                new_history = CodingHistory(
                    vendor_id=vendor_id,
                    vendor_key=vendor_key,
                    vendor_name=vendor_name,
                    description=item.description,
                    normalized_description=norm_desc,
                    embedding=json.dumps(embedding),
                    coding_json=json.dumps(coding_data)
                )
                db.add(new_history)
        db.commit()
    except Exception as e:
        logger.error(f"Error updating coding history: {e}")
        db.rollback()

def get_coding_suggestions(db: Session, vendor_name: str, extracted_items: List[Dict[str, Any]], vendor_id: str = None) -> List[LineItemCoding]:
    vendor_key = normalize_vendor(vendor_name) if vendor_name else None
    
    history_entries = []
    seen_ids = set()

    # 1. Fetch by Vendor ID (Strong matching)
    if vendor_id:
        try:
            id_entries = db.query(CodingHistory).filter(CodingHistory.vendor_id == vendor_id).all()
            for h in id_entries:
                history_entries.append(h)
                seen_ids.add(h.id)
        except Exception as e:
            logger.error(f"Error fetching ID-based history: {e}")

    # 2. Fetch by Vendor Name (Broad matching) - ALWAYS fetch to fill gaps
    if vendor_key:
        try:
            name_query = db.query(CodingHistory).filter(CodingHistory.vendor_key == vendor_key)
            if vendor_id:
                # Exclude what we already fetched
                name_query = name_query.filter(CodingHistory.vendor_id != vendor_id)
            
            name_entries = name_query.all()
            history_entries.extend(name_entries)
        except Exception as e:
            logger.error(f"Error fetching Name-based history: {e}")
            
    # Suggestions logic follows...
    
    suggestions: List[LineItemCoding] = []
    for idx, raw in enumerate(extracted_items):
        desc = raw.get("description")
        if isinstance(desc, dict): desc = desc.get("value")
        if not desc: continue
        
        query_embedding = embed_text(normalize_description(desc))
        best_match = None
        best_score = 0.0

        try:
            for h in history_entries:
                if not h.embedding: continue
                h_emb = json.loads(h.embedding)
                score = cosine_similarity(query_embedding, h_emb)
                if score > best_score:
                    best_score = score
                    best_match = h
        except Exception as e:
            logger.error(f"Error processing history entries: {e}")
            best_match = None

        # SIMILARITY THRESHOLD: Only accept match if similarity is high enough
        # This prevents "forcing" a match when only irrelevant history exists (like TDS lines)
        SIMILARITY_THRESHOLD = 0.75
        if best_score < SIMILARITY_THRESHOLD:
            best_match = None

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

        if best_match and best_match.coding_json:
            coding = json.loads(best_match.coding_json)
            item.gl_code = coding.get("gl_code", "")
            item.lob = coding.get("lob", "")
            item.department = coding.get("department", "")
            item.customer = coding.get("customer", "")
            item.item = coding.get("item", "")
        suggestions.append(item)
    return suggestions

@router.get("/{invoice_id}", response_model=CodingResponse)
async def get_coding(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice or invoice.entity != entity:
        raise HTTPException(404, "Invoice not found or access denied")

    existing = db.query(DBCoding).filter(DBCoding.invoice_id == invoice_id).first()
    if existing:
        saved_items = json.loads(existing.line_items) if existing.line_items else []
        
        # Auto-fill: If any saved item has NO GL Code, try to fetch suggestions to fill it
        # This handles cases where the user opened the invoice previously (creating empty records) 
        # but we now have better suggestions (e.g. via fallback logic).
        if any(not item.get("gl_code") for item in saved_items):
            try:
                vendor_name = get_vendor_name(invoice)
                raw_items = get_line_items(invoice)
                # Fetch fresh suggestions
                fresh_suggestions = get_coding_suggestions(db, vendor_name, raw_items, vendor_id=invoice.vendor_id)
                
                # Create a map of suggestions by description (or index)
                # Using index is riskier if lines changed, but description is safer
                suggestion_map = {s.description: s for s in fresh_suggestions}
                
                for idx, item in enumerate(saved_items):
                    if not item.get("gl_code"):
                        # Try to find match by description
                        desc = item.get("description")
                        if desc and desc in suggestion_map:
                            item["gl_code"] = suggestion_map[desc].gl_code
                            item["lob"] = suggestion_map[desc].lob
                            item["department"] = suggestion_map[desc].department
                            item["customer"] = suggestion_map[desc].customer
                            item["item"] = suggestion_map[desc].item
                        # Fallback: Try by index if descriptions perfectly align
                        elif idx < len(fresh_suggestions) and fresh_suggestions[idx].description == desc:
                             s = fresh_suggestions[idx]
                             item["gl_code"] = s.gl_code
                             item["lob"] = s.lob
                             item["department"] = s.department
                             item["customer"] = s.customer
                             item["item"] = s.item
            except Exception as e:
                logger.error(f"Error auto-filling coding suggestions: {e}")

        return CodingResponse(
            id=str(existing.id),
            invoice_id=str(existing.invoice_id),
            header_coding=existing.header_coding,
            line_items=saved_items,
            created_at=existing.created_at
        )

    vendor_name = get_vendor_name(invoice)
    items = get_line_items(invoice)
    if not vendor_name or not items:
        return CodingResponse(id="", invoice_id=str(invoice_id), line_items=[], total_amount=0.0, created_at=datetime.utcnow())

    suggestions = get_coding_suggestions(db, vendor_name, items, vendor_id=invoice.vendor_id)
    return CodingResponse(
        id="suggested",
        invoice_id=str(invoice_id),
        vendor_name=vendor_name,
        line_items=suggestions,
        total_amount=sum(i.net_amount for i in suggestions),
        created_at=datetime.utcnow()
    )

@router.get("/{invoice_id}/suggestions", response_model=List[LineItemCoding])
async def get_suggestions(
    invoice_id: int,
    vendor_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    """
    Fetch coding suggestions for an invoice, optionally overriding the vendor_id.
    """
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice or invoice.entity != entity:
        raise HTTPException(404, "Invoice not found or access denied")

    vendor_name = get_vendor_name(invoice)
    items = get_line_items(invoice)
    
    if not items:
        return []

    # Use provided vendor_id or fallback to invoice's vendor_id
    target_vendor_id = vendor_id or invoice.vendor_id
    
    logger.info(f"Fetching suggestions for invoice {invoice_id} with vendor {target_vendor_id}")
    
    suggestions = get_coding_suggestions(db, vendor_name, items, vendor_id=target_vendor_id)
    
    logger.info(f"Found {len(suggestions)} suggestions. First item GL: {suggestions[0].gl_code if suggestions else 'None'}")
    return suggestions

@router.post("/", response_model=CodingResponse)
async def create_or_update_coding(
    coding_data: CodingCreate,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    # inv_id must be int
    try: inv_id = int(coding_data.invoice_id)
    except: raise HTTPException(400, "Invalid invoice ID")

    invoice = db.query(Invoice).filter(Invoice.id == inv_id).first()
    if not invoice or invoice.entity != entity:
        raise HTTPException(404, "Invoice not found or access denied")

    existing_coding = db.query(DBCoding).filter(DBCoding.invoice_id == inv_id).first()
    
    line_items_json = json.dumps([item.dict() for item in coding_data.line_items]) if coding_data.line_items else "[]"
    
    if existing_coding:
        existing_coding.header_coding = coding_data.header_coding
        existing_coding.line_items = line_items_json
        existing_coding.updated_at = datetime.utcnow()
    else:
        new_coding = DBCoding(
            invoice_id=inv_id,
            header_coding=coding_data.header_coding,
            line_items=line_items_json,
            entity=entity,
            created_at=datetime.utcnow()
        )
        db.add(new_coding)
    
    db.commit()

    # Update history and gl_summary
    vendor_name = coding_data.vendor_name or get_vendor_name(invoice)
    vendor_id = invoice.vendor_id
    if (vendor_name or vendor_id) and coding_data.line_items:
        update_coding_history(db, vendor_name, coding_data.line_items, vendor_id=vendor_id)

    summary_map = {}
    for item in coding_data.line_items:
        if item.gl_code:
            summary_map[item.gl_code] = summary_map.get(item.gl_code, 0.0) + item.net_amount
    
    gl_summary = [{"gl_code": k, "total_amount": v} for k, v in summary_map.items()]
    invoice.gl_summary = json.dumps(gl_summary)
    
    # Sync to extracted_data
    try:
        ext_data = json.loads(invoice.extracted_data) if isinstance(invoice.extracted_data, str) else invoice.extracted_data
        if "Items" not in ext_data: ext_data["Items"] = {"value": []}
        
        orig_items = ext_data["Items"].get("value", [])
        new_ext_items = []
        for c_item in coding_data.line_items:
            if c_item.original_index is not None and 0 <= c_item.original_index < len(orig_items):
                bi = orig_items[c_item.original_index]
                if "description" not in bi: bi["description"] = {}
                bi["description"]["value"] = c_item.description
                if "quantity" not in bi: bi["quantity"] = {}
                bi["quantity"]["value"] = c_item.quantity
                if "unit_price" not in bi: bi["unit_price"] = {}
                bi["unit_price"]["value"] = c_item.unit_price
                if "amount" not in bi: bi["amount"] = {}
                bi["amount"]["value"] = c_item.net_amount
                new_ext_items.append(bi)
            else:
                new_ext_items.append({
                    "description": {"value": c_item.description},
                    "quantity": {"value": c_item.quantity},
                    "unit_price": {"value": c_item.unit_price},
                    "amount": {"value": c_item.net_amount},
                    "item_code": {"value": c_item.item}
                })
        ext_data["Items"]["value"] = new_ext_items
        invoice.extracted_data = json.dumps(ext_data)
    except: pass
    
    db.commit()

    await audit_service.log_action(db, inv_id, AuditAction.CODING_SAVED, current_user.username, entity, 
                                  details={"line_items_count": len(coding_data.line_items)})

    saved = db.query(DBCoding).filter(DBCoding.invoice_id == inv_id).first()
    return CodingResponse(
        id=str(saved.id),
        invoice_id=str(saved.invoice_id),
        header_coding=saved.header_coding,
        line_items=json.loads(saved.line_items) if saved.line_items else [],
        created_at=saved.created_at
    )
