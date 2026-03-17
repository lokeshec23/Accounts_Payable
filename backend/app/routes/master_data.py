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
from concurrent.futures import ThreadPoolExecutor

from app.database.database import get_db, SessionLocal
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

# Centralized Pretty Mappings for Frontend Display
PRETTY_MAPS = {
    "Vendor_Master": {
        "vendor_is_an_individual_person": "Vendor is an individual person",
        "gst_eligibility": "GST / Use Tax Eligibility Configuration",
        "tds_applicability": "TDS/Withhold Tax Applicability Configuration",
        "tds_percentage": "TDS Percentage",
        "tds_section_code": "TDS Section Code and Description",
        "workflow_applicable": "Workflow Applicability Configuration",
        "line_grouping": "Line Grouping"
    },
    "GL": {
        "account_number": "Account Number",
        "title": "Title",
        "normal_balance": "Normal Balance",
        "require_department": "Require Department",
        "require_location": "Require Location",
        "period_end_closing_type": "Period End Closing Type",
        "close_into_account": "Close Into Account",
        "disallow_direct_posting": "Disallow Direct Posting",
        "internal_rate": "Internal Rate"
    },
    "Entity_Master": {
        "entity_id": "Entity ID",
        "entity_name": "Entity Name",
        "registered_address": "Registered Address",
        "address_line1": "Address Line 1",
        "address_line2": "Address Line 2",
        "address_line3": "Address Line 3",
        "city": "City",
        "state_or_territory": "State or Territory",
        "zip_or_postal_code": "Zip or Postal Code",
        "country_code": "Country Code"
    },
    "TDS_Rates": {
        "section": "Section",
        "nature_of_payment": "Nature of Payment",
        "tds_rate": "TDS Rate"
    },
    "LOB": {
        "lob_id": "LOB ID",
        "name": "Name",
        "parent_id": "Parent ID"
    },
    "Department": {
        "department_id": "Department ID",
        "department_name": "Department Name"
    },
    "Customer": {
        "customer_id": "Customer ID",
        "customer_name": "Customer Name"
    },
    "Item": {
        "item_id": "Item ID",
        "name": "Name",
        "product_line_id": "Product Line ID",
        "gl_group": "GL Group"
    }
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

def insert_records_chunk(model_class, records_list: List[Dict[str, Any]]):
    """Worker function for parallel insertion."""
    if not records_list:
        return
    db = SessionLocal()
    try:
        db.bulk_insert_mappings(model_class, records_list)
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Parallel Insert Error: {e}")
        raise
    finally:
        db.close()

def process_chunk_worker(model_class, chunk_df):
    """Worker to convert chunk to dict and insert."""
    # Convert to list of dicts inside the worker to save memory in main thread
    records = chunk_df.to_dict('records')
    insert_records_chunk(model_class, records)

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
    import time
    start_time = time.time()
    try:
        print(f"DEBUG: Starting upload for {tab_name}")
        model = TAB_MODEL_MAP.get(tab_name)
        if not model:
            raise HTTPException(400, f"Unsupported tab: {tab_name}")

        if not file.filename.endswith(('.xls', '.xlsx', '.csv')):
             raise HTTPException(400, "Invalid format. Use .xls, .xlsx, or .csv")
             
        # Measure file read
        t0 = time.time()
        contents = await file.read()
        print(f"DEBUG: File read took {time.time() - t0:.4f}s")
        
        # Measure Excel/CSV parsing
        t1 = time.time()
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents))
        else:
            # openpyxl can be slow; calamine is faster if installed
            df = pd.read_excel(io.BytesIO(contents))
        print(f"DEBUG: Excel/CSV parsing took {time.time() - t1:.4f}s for {len(df)} rows")
            
        # Get model columns (excluding metadata)
        model_cols = [c.name for c in model.__table__.columns if c.name not in ['id', 'created_at', 'updated_at']]
        
        # 1. Normalize DataFrame columns once
        df.columns = [normalize_column(c) for c in df.columns]
        
        # 2. Filter to only columns that exist in the model
        existing_cols = [c for c in df.columns if c in model_cols]
        df = df[existing_cols].copy()
        
        # 3. Vectorized Type Conversions
        t2 = time.time()
        for m_col in existing_cols:
            col_info = model.__table__.columns.get(m_col)
            if col_info is None:
                continue
                
            # Boolean Conversion
            if isinstance(col_info.type, Boolean):
                bool_map = {
                    "yes": True, "true": True, "1": True, "y": True, "t": True, "eligible": True,
                    "no": False, "false": False, "0": False, "n": False, "f": False, "ineligible": False
                }
                def convert_to_bool(val):
                    if pd.isna(val) or val is None: return None
                    if isinstance(val, (bool, np.bool_)): return bool(val)
                    if isinstance(val, (int, float, np.integer, np.floating)): return bool(val)
                    if isinstance(val, str): return bool_map.get(val.strip().lower(), None)
                    return None
                df[m_col] = df[m_col].apply(convert_to_bool)
            
            # String Conversion
            elif isinstance(col_info.type, String):
                def convert_to_str(val):
                    if pd.isna(val) or val is None: return None
                    if isinstance(val, float) and val.is_integer(): return str(int(val))
                    return str(val)
                df[m_col] = df[m_col].apply(convert_to_str)
        print(f"DEBUG: Type conversion took {time.time() - t2:.4f}s")

        # 4. Handle Defaults for Vendor Master
        if tab_name in ["Vendor_Master", "vendor_master", "Vendor"]:
            defaults = {
                "gst_eligibility": False,
                "tds_applicability": False,
                "workflow_applicable": True,
                "line_grouping": False
            }
            for col, val in defaults.items():
                if col in model_cols:
                    if col not in df.columns:
                        df[col] = val
                    else:
                        df[col] = df[col].fillna(val)

        # 5. Clean up NAs to None for SQL - Use faster where/notna
        t3 = time.time()
        df = df.where(df.notna(), None)
        print(f"DEBUG: NA cleanup took {time.time() - t3:.4f}s")
        
        # 6. Prepare Parallel Insertion
        if df.empty:
             return {"message": f"No valid rows found to upload to {tab_name}"}

        # Clear existing data - Use more efficient core delete
        t4 = time.time()
        db.execute(model.__table__.delete())
        db.commit() 
        print(f"DEBUG: Clear existing data took {time.time() - t4:.4f}s")
        
        # Parallel Multi-threaded Insertion
        t5 = time.time()
        CHUNK_SIZE = 5000
        # Use native pandas slicing to avoid numpy's deprecated swapaxes calls
        df_chunks = [df.iloc[i : i + CHUNK_SIZE] for i in range(0, len(df), CHUNK_SIZE)]
        
        max_workers = min(len(df_chunks) if df_chunks else 1, 8)
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Process each chunk in a separate thread
            list(executor.map(lambda chunk: process_chunk_worker(model, chunk), df_chunks))
            
        print(f"DEBUG: Parallel insert ({len(df_chunks)} chunks) took {time.time() - t5:.4f}s")
        
        total_time = time.time() - start_time
        print(f"DEBUG: Total upload process took {total_time:.4f}s")
        return {"message": f"Uploaded {len(df)} rows using {max_workers} threads in {total_time:.2f}s."}
        
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
    skip: int = 0,
    limit: int = 10,
    search: str = None,
    db: Session = Depends(get_db)
):
    model = TAB_MODEL_MAP.get(identifier)
    if not model:
        raise HTTPException(404, "Table not found")
        
    query = db.query(model)
    
    if search:
        search_filter = []
        search_term = f"%{search}%"
        for column in model.__table__.columns:
            # Check for any string-like type (NVARCHAR, Text, String, etc.)
            if hasattr(column.type, 'python_type') and column.type.python_type == str:
                search_filter.append(column.ilike(search_term))
        
        if search_filter:
            from sqlalchemy import or_
            query = query.filter(or_(*search_filter))

    total = query.count()
    rows = query.order_by(model.id.asc()).offset(skip).limit(limit).all()
    
    # Normalize identifier for mapping lookup
    clean_id = identifier.replace("master_data_", "")
    pretty_map = PRETTY_MAPS.get(clean_id, {})
    
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

            if column.name in pretty_map:
                pretty_val = val
                # Handle boolean to Yes/No/Eligible conversion
                col_info = model.__table__.columns.get(column.name)
                if col_info is not None and isinstance(col_info.type, Boolean):
                    if column.name == "gst_eligibility":
                        pretty_val = "Eligible" if val is True or val == 1 else "Ineligible"
                    else:
                        pretty_val = "Yes" if val is True or val == 1 else "No"
                
                row_dict[pretty_map[column.name]] = pretty_val
            else:
                row_dict[column.name] = val
        result.append(row_dict)
        
    return {"data": result, "total": total}

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
    clean_id = identifier.replace("master_data_", "")
    pretty_map = PRETTY_MAPS.get(clean_id, {})
    reverse_map = {v: k for k, v in pretty_map.items()}
    
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
            elif v is None:
                v = False
        
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
        record = db.query(model).order_by(model.id.asc()).offset(row_index).limit(1).first()

    if not record:
        raise HTTPException(404, "Record not found")
    
    # Reverse mapping for pretty names
    clean_id = identifier.replace("master_data_", "")
    pretty_map = PRETTY_MAPS.get(clean_id, {})
    reverse_map = {v: k for k, v in pretty_map.items()}
        
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
                elif v is None:
                    v = False
            
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
    record = db.query(model).order_by(model.id.asc()).offset(row_index).limit(1).first()
    if record:
        db.delete(record)
        db.commit()
    
    return {"status": "deleted"}
