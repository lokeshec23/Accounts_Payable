from fastapi import APIRouter, HTTPException, Body, UploadFile, File, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import asc, func, Boolean, String, DateTime
import traceback
import pandas as pd
import numpy as np
import io
import re
import json
from datetime import datetime
from typing import Dict, Any, List, Union

from app.database.database import get_db
from app.models.db_models import (
    EntityMaster, VendorMaster, TdsRate, GLMaster, 
    LOBMaster, DepartmentMaster, CustomerMaster, ItemMaster
)
from app.auth.jwt import get_current_user
from app.models.user import UserResponse
from app.ai.vector_matcher import find_best_vendor_match

router = APIRouter(tags=["Master Data"])

# Mapping frontend tab names to SQLAlchemy models
TAB_MODEL_MAP = {
    "Entity_Master": EntityMaster,
    "Vendor_Master": VendorMaster,
    "Line_Items": ItemMaster,
    "TDS_Rates": TdsRate,
    "GL": GLMaster,
    "LOB": LOBMaster,
    "Department": DepartmentMaster,
    "Customer": CustomerMaster,
    "Entity": EntityMaster,
    "Vendor": VendorMaster,
    "Item": ItemMaster,
    "TDS": TdsRate,
    # Frontend fallback aliases
    "master_data_Entity_Master": EntityMaster,
    "master_data_Vendor_Master": VendorMaster,
    "master_data_Line_Items": ItemMaster,
    "master_data_TDS_Rates": TdsRate,
    "master_data_GL": GLMaster,
    "master_data_LOB": LOBMaster,
    "master_data_Department": DepartmentMaster,
    "master_data_Customer": CustomerMaster,
    "master_data_Item": ItemMaster
}

def normalize_column(col_name: str) -> str:
    """Normalize Excel column names to snake_case attribute names."""
    # Remove special characters, replace spaces/hyphens with underscores, lowercase
    name = re.sub(r'[^a-zA-Z0-9\s_]', '', str(col_name))
    name = name.strip().replace(' ', '_').replace('-', '_').lower()
    # Handle specific common variations/typos
    if 'terittory' in name:
        name = name.replace('terittory', 'territory')
    
    # Explicit mappings for Vendor Master Config fields
    mapping = {
        "gst_use_tax_eligibility_configuration": "gst_eligibility",
        "tdswithhold_tax_applicability_configuration": "tds_applicability",
        "tds_percentage": "tds_percentage",
        "tds_section_code_and_description": "tds_section_code",
        "workflow_applicability_configuration": "workflow_applicable",
        "line_grouping": "line_grouping"
    }
    return mapping.get(name, name)

class SearchVendorRequest(BaseModel):
    vendor_name: str
    vendor_address: str = None

@router.post("/search-vendor")
def search_vendor(
    request: SearchVendorRequest,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Search for a vendor in the active Vendor Master list.
    """
    result = find_best_vendor_match(db, request.vendor_name, request.vendor_address)
    if result and result["match"]:
        return {"match": result["match"], "score": result["score"], "method": result["method"]}
    return {"match": None, "score": 0.0, "method": "none"}

@router.get("/entities")
def get_entities(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Get all active entities from the structured table.
    Used by SelectEntity.jsx
    """
    entities = db.query(EntityMaster).all()
    result = []
    for e in entities:
        row_dict = {}
        for column in e.__table__.columns:
            val = getattr(e, column.name)
            if isinstance(val, (datetime)):
                val = val.isoformat()
            elif isinstance(val, (float)) and np.isnan(val):
                val = None
            row_dict[column.name] = val
        result.append(row_dict)
    return result

@router.get("/files")
def list_files(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    """
    List status of the fixed master data tabs by checking if tables have data.
    """
    tabs = ["Entity_Master", "Vendor_Master", "TDS_Rates", "Item"]
    # Add new tabs if needed by frontend
    additional_tabs = ["GL", "LOB", "Department", "Customer"]
    
    result = []
    
    for tab in tabs + additional_tabs:
        model = TAB_MODEL_MAP.get(tab)
        if not model:
            continue
            
        count = db.query(func.count(model.id)).scalar()
        
        if count > 0:
            result.append({
                "id": tab,
                "tab_name": tab,
                "file_name": f"Structured Table ({count} rows)",
                "uploaded_at": None, # Could track this separately if needed
                "uploaded_by": "system",
                "status": "active",
                "sheets": [{"name": "Default", "collection_name": tab}]
            })
        else:
            result.append({
                "tab_name": tab,
                "file_name": None,
                "status": "missing",
                "sheets": []
            })
    return result

@router.post("/upload")
async def upload_master_file(
    tab_name: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    try:
        model = TAB_MODEL_MAP.get(tab_name)
        if not model:
            raise HTTPException(400, f"Unsupported tab: {tab_name}")

        if not file.filename.endswith(('.xls', '.xlsx', '.csv')):
             raise HTTPException(400, "Invalid format. Use .xls, .xlsx, or .csv")
             
        contents = await file.read()
        
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))
            
        df = df.replace({np.nan: None})
        
        # Normalize columns and prepare data
        model_cols = [c.name for c in model.__table__.columns if c.name not in ['id', 'created_at', 'updated_at']]
        
        records_to_insert = []
        for _, row in df.iterrows():
            record = {}
            row_dict = row.to_dict()
            
            # Map Excel column to model column
            excel_cols_normalized = {normalize_column(c): c for c in row_dict.keys()}
            
            for m_col in model_cols:
                # Direct match
                if m_col in excel_cols_normalized:
                    raw_val = row_dict[excel_cols_normalized[m_col]]
                    
                    # Boolean Conversion for SQLAlchemy Boolean columns
                    col_info = model.__table__.columns.get(m_col)
                    if col_info is not None and isinstance(col_info.type, Boolean):
                        if isinstance(raw_val, str):
                            rv_lower = raw_val.strip().lower()
                            if rv_lower in ["yes", "true", "1", "y", "t", "eligible"]:
                                raw_val = True
                            elif rv_lower in ["no", "false", "0", "n", "f", "ineligible"]:
                                raw_val = False
                            else:
                                raw_val = None # Or default
                        elif isinstance(raw_val, (int, float)):
                            raw_val = bool(raw_val)
                    
                    elif col_info is not None and isinstance(col_info.type, String):
                        if raw_val is not None:
                            # Handle numeric types becoming strings, remove .0 if it's an integer-like float
                            if isinstance(raw_val, float) and raw_val.is_integer():
                                raw_val = str(int(raw_val))
                            else:
                                raw_val = str(raw_val)
                    
                    record[m_col] = raw_val
                # Also check some variations if needed
            
            if record:
                # Defaults for Vendor Master Config
                if tab_name == "Vendor_Master" or tab_name == "vendor_master":
                    if record.get("gst_eligibility") is None: record["gst_eligibility"] = False
                    if record.get("tds_applicability") is None: record["tds_applicability"] = False
                    if record.get("workflow_applicable") is None: record["workflow_applicable"] = True
                    if record.get("line_grouping") is None: record["line_grouping"] = False

                records_to_insert.append(record)

        # Clear existing and insert
        db.query(model).delete()
        if records_to_insert:
            db.bulk_insert_mappings(model, records_to_insert)
        
        db.commit()
        
        return {"message": f"Uploaded {len(records_to_insert)} rows to {tab_name}"}
        
    except Exception as e:
        db.rollback()
        print(f"Error uploading: {e}")
        traceback.print_exc()
        raise HTTPException(500, f"Upload failed: {str(e)}")

@router.delete("/files/{tab_name}")
async def delete_tab_data(
    tab_name: str,
    db: Session = Depends(get_db)
):
    model = TAB_MODEL_MAP.get(tab_name)
    if not model:
        raise HTTPException(400, "Unsupported tab")
    
    db.query(model).delete()
    db.commit()
    return {"message": f"Data for {tab_name} deleted successfully"}

@router.get("/sheet/{identifier}")
async def get_sheet_data(
    identifier: str,
    db: Session = Depends(get_db)
):
    model = TAB_MODEL_MAP.get(identifier)
    if not model:
        raise HTTPException(404, "Table not found")
        
    rows = db.query(model).all()
    
    # Convert SQLAlchemy objects to dicts
    result = []
    for row in rows:
        row_dict = {}
        for column in row.__table__.columns:
            val = getattr(row, column.name)
            if isinstance(val, (datetime)):
                val = val.isoformat()
            elif isinstance(val, (float)) and np.isnan(val):
                val = None

            # Map back to pretty names for Vendor Master
            if identifier == "Vendor_Master" or identifier == "vendor_master":
                pretty_map = {
                    "gst_eligibility": "GST / Use Tax Eligibility Configuration",
                    "tds_applicability": "TDS/Withhold Tax Applicability Configuration",
                    "tds_percentage": "TDS Percentage",
                    "tds_section_code": "TDS Section Code and Description",
                    "workflow_applicable": "Workflow Applicability Configuration",
                    "line_grouping": "Line Grouping"
                }
                
                if column.name in pretty_map:
                    pretty_val = val
                    # Match frontend switch logic
                    if column.name == "gst_eligibility":
                        pretty_val = "Eligible" if val is True or val == 1 else "Ineligible"
                    elif column.name in ["tds_applicability", "workflow_applicable", "line_grouping"]:
                        pretty_val = "Yes" if val is True or val == 1 else "No"
                    
                    row_dict[pretty_map[column.name]] = pretty_val
                    continue

            if identifier == "TDS_Rates" or identifier == "tds_rates":
                pretty_map = {
                    "section": "Section",
                    "nature_of_payment": "Nature of Payment",
                    "tds_rate": "TDS Rate"
                }
                if column.name in pretty_map:
                    row_dict[pretty_map[column.name]] = val
                    continue

            row_dict[column.name] = val
        result.append(row_dict)
        
    return result

@router.post("/sheet/{identifier}/add")
def add_row(
    identifier: str, 
    request: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    model = TAB_MODEL_MAP.get(identifier)
    if not model:
        raise HTTPException(404, "Table not found")
        
    # Remove metadata if present
    data = request.get("new_row", request)
    data.pop('id', None)
    data.pop('created_at', None)
    data.pop('updated_at', None)
    
    # Reverse mapping for pretty names
    reverse_map = {}
    if identifier in ["Vendor_Master", "vendor_master"]:
        reverse_map = {
            "GST / Use Tax Eligibility Configuration": "gst_eligibility",
            "TDS/Withhold Tax Applicability Configuration": "tds_applicability",
            "TDS Percentage": "tds_percentage",
            "TDS Section Code and Description": "tds_section_code",
            "Workflow Applicability Configuration": "workflow_applicable",
            "Line Grouping": "line_grouping"
        }
    
    final_data = {}
    for k, v in data.items():
        m_col = reverse_map.get(k, k)
        
        # Boolean Conversion
        col_info = model.__table__.columns.get(m_col)
        if col_info is not None and isinstance(col_info.type, Boolean):
            if isinstance(v, str):
                v_lower = v.strip().lower()
                if v_lower in ["yes", "true", "1", "eligible"]: v = True
                elif v_lower in ["no", "false", "0", "ineligible"]: v = False
            elif isinstance(v, (int, float)):
                v = bool(v)
        
        final_data[m_col] = v

    new_record = model(**final_data)
    db.add(new_record)
    db.commit()
    return {"status": "success"}

@router.patch("/sheet/{identifier}/edit")
def edit_row(
    identifier: str, 
    request: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    model = TAB_MODEL_MAP.get(identifier)
    if not model:
        raise HTTPException(404, "Table not found")
        
    row_index = request.get("row_index") # This might be the list index or ID depending on frontend
    updated_data = request.get("updated_row")
    
    record = None
    record_id = updated_data.get('id')
    if record_id:
        record = db.query(model).get(record_id)
    
    if not record and row_index is not None:
        # Fallback to offset
        record = db.query(model).offset(row_index).limit(1).first()

    if not record:
        raise HTTPException(404, "Record not found")
    
    # Reverse mapping for pretty names
    reverse_map = {}
    if identifier in ["Vendor_Master", "vendor_master"]:
        reverse_map = {
            "GST / Use Tax Eligibility Configuration": "gst_eligibility",
            "TDS/Withhold Tax Applicability Configuration": "tds_applicability",
            "TDS Percentage": "tds_percentage",
            "TDS Section Code and Description": "tds_section_code",
            "Workflow Applicability Configuration": "workflow_applicable",
            "Line Grouping": "line_grouping"
        }
        
    for k, v in updated_data.items():
        if k in ['id', 'created_at', 'updated_at']:
            continue
            
        m_col = reverse_map.get(k, k)
        if hasattr(record, m_col):
            # Boolean Conversion
            col_info = model.__table__.columns.get(m_col)
            if col_info is not None and isinstance(col_info.type, Boolean):
                if isinstance(v, str):
                    v_lower = v.strip().lower()
                    if v_lower in ["yes", "true", "1", "eligible"]: v = True
                    elif v_lower in ["no", "false", "0", "ineligible"]: v = False
                elif isinstance(v, (int, float)):
                    v = bool(v)
            
            setattr(record, m_col, v)
            
    db.commit()
    return {"status": "updated"}

@router.delete("/sheet/{identifier}/delete")
def delete_row(
    identifier: str,
    row_index: int, # Frontend sends list index, we need ID or to query by offset
    db: Session = Depends(get_db)
):
    model = TAB_MODEL_MAP.get(identifier)
    if not model:
        raise HTTPException(404, "Table not found")
        
    # If row_index is actually the ID, use it directly. 
    # But usually frontend 'key' is index.
    # Let's try to find the ID from the offset if possible, or assume it's ID if large
    record = db.query(model).offset(row_index).limit(1).first()
    if record:
        db.delete(record)
        db.commit()
    
    return {"status": "deleted"}
