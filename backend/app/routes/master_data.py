from fastapi import APIRouter, HTTPException, Body, UploadFile, File, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import asc
import pandas as pd
import numpy as np
import io
import re
import json
from datetime import datetime
from typing import Dict, Any, List,Union

from app.database.database import get_db
from app.models.db_models import ExcelFile, MasterDataChunk
from app.auth.jwt import get_current_user
from app.models.user import UserResponse
from app.ai.vector_matcher import find_best_vendor_match

router = APIRouter(tags=["Master Data"])

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
    Search for a vendor in the active Vendor Master list using address (priority) then name similarity.
    """
    result = find_best_vendor_match(db, request.vendor_name, request.vendor_address)
    
    if result and result["match"]:
        return {"match": result["match"], "score": result["score"], "method": result["method"]}
        
    return {"match": None, "score": 0.0, "method": "none"}

@router.get("/files")
def list_files(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    # Return status of the 4 fixed tabs
    tabs = ["Entity_Master", "Vendor_Master", "Line_Items", "TDS_Rates"]
    result = []
    
    # Query all files for these tabs
    all_files = db.query(ExcelFile).filter(ExcelFile.tab_name.in_(tabs)).all()
    
    # Group by tab_name
    from collections import defaultdict
    tab_groups = defaultdict(list)
    for f in all_files:
        tab_groups[f.tab_name].append(f)
    
    for tab in tabs:
        files_in_tab = tab_groups.get(tab, [])
        if files_in_tab:
            # Sort by uploaded_at desc
            files_in_tab.sort(key=lambda x: x.uploaded_at, reverse=True)
            primary = files_in_tab[0]
            
            # Format sheets for the frontend
            sheets = []
            for f in files_in_tab:
                sheets.append({
                    "name": f.sheet_name or "Sheet1",
                    "collection_name": f"master_data_{tab}:{f.sheet_name}" if f.sheet_name else f"master_data_{tab}"
                })

            result.append({
                "id": primary.id,
                "tab_name": tab,
                "file_name": primary.original_filename,
                "uploaded_at": primary.uploaded_at,
                "uploaded_by": primary.uploaded_by,
                "status": "active",
                "sheets": sheets
            })
        else:
            result.append({
                "tab_name": tab,
                "file_name": None,
                "status": "missing",
                "sheets": []
            })
    return result

def slugify(text):
    return re.sub(r'[^a-zA-Z0-9]', '_', str(text)).strip('_')

@router.post("/upload")
async def upload_master_file(
    tab_name: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    try:
        # Check extension
        if not file.filename.endswith(('.xls', '.xlsx', '.csv')):
             raise HTTPException(400, "Invalid file format. Please upload .xls, .xlsx, or .csv")
             
        contents = await file.read()
        sheets_data = {} # {sheet_name: df}
        
        # Handle CSV files
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents))
            df = df.replace({np.nan: None})
            sheets_data["Sheet1"] = df
        else:
            xls = pd.ExcelFile(io.BytesIO(contents))
            for sheet_name in xls.sheet_names:
                df = pd.read_excel(xls, sheet_name=sheet_name)
                df = df.replace({np.nan: None})
                sheets_data[sheet_name] = df

        # Clear existing file metadata and chunks for this tab (all sheets)
        existing_files = db.query(ExcelFile).filter(ExcelFile.tab_name == tab_name).all()
        for ef in existing_files:
            db.query(MasterDataChunk).filter(MasterDataChunk.file_id == ef.id).delete()
            db.delete(ef)
        db.commit()

        # Process all sheets
        for sheet_name, df in sheets_data.items():
            # Inject Vendor_Master default fields
            if tab_name == "Vendor_Master":
                defaults = {
                    "GST / Use Tax Eligibility Configuration": "Eligible",
                    "TDS/Withhold Tax Applicability Configuration": "No",
                    "TDS Percentage": "",
                    "TDS Section Code and Description": "",
                    "Workflow Applicability Configuration": "Yes",
                    "Line Grouping": "No"
                }
                for col, val in defaults.items():
                    if col not in df.columns:
                        df[col] = val
            
            # Create ExcelFile record for each sheet
            new_file = ExcelFile(
                original_filename=file.filename,
                tab_name=tab_name,
                sheet_name=sheet_name,
                uploaded_by=current_user.username,
                columns_json=json.dumps(df.columns.tolist())
            )
            db.add(new_file)
            db.flush() # Get the ID

            # Save rows in chunks
            rows = df.to_dict(orient="records")
            chunk_size = 5000
            for i in range(0, len(rows), chunk_size):
                chunk = MasterDataChunk(
                    file_id=new_file.id,
                    chunk_index=i // chunk_size,
                    data_json=json.dumps(rows[i:i + chunk_size], default=str)
                )
                db.add(chunk)
            
            db.commit()
        
        return {
            "message": "File uploaded successfully", 
            "id": new_file.id,
            "tab_name": tab_name
        }
        
    except Exception as e:
        db.rollback()
        print(f"Error uploading file: {e}")
        raise HTTPException(500, f"Failed to upload file: {str(e)}")

@router.delete("/files/{tab_name}")
async def delete_tab_data(
    tab_name: str,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    try:
        existing_file = db.query(ExcelFile).filter(ExcelFile.tab_name == tab_name).first()
        if existing_file:
            db.query(MasterDataChunk).filter(MasterDataChunk.file_id == existing_file.id).delete()
            db.delete(existing_file)
            db.commit()
            return {"message": f"Data for {tab_name} deleted successfully"}
        else:
            return {"message": f"No data found for {tab_name}"}
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Failed to delete data: {str(e)}")

@router.get("/entities")
def get_entities(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    # Support multi-sheet collection naming
    file_meta = db.query(ExcelFile).filter(ExcelFile.tab_name == "Entity_Master").first()
    
    entities = []
    if file_meta:
        chunks = db.query(MasterDataChunk).filter(MasterDataChunk.file_id == file_meta.id).order_by(asc(MasterDataChunk.chunk_index)).all()
        for chunk in chunks:
            entities.extend(json.loads(chunk.data_json))

    # --- AUTO-CREATE DEFAULT ENTITY IF NONE EXISTS ---
    if not entities:
        print("DEBUG: No entities found. Creating Default Entity.")
        default_entity = {
            "Entity Name": "Default Entity",
            "Entity No": "1",
            "EntityId": "1"
        }
        
        # 1. Create file record
        new_file = ExcelFile(
            original_filename="auto_generated_default",
            tab_name="Entity_Master",
            uploaded_by="system",
            columns_json=json.dumps(["Entity Name", "Entity No", "EntityId"])
        )
        db.add(new_file)
        db.flush()
        
        # 2. Create chunk
        chunk = MasterDataChunk(
            file_id=new_file.id,
            chunk_index=0,
            data_json=json.dumps([default_entity])
        )
        db.add(chunk)
        db.commit()
        
        entities = [default_entity]

    return entities

def resolve_file_id(db: Session, identifier: Union[int, str]) -> int:
    """Helper to resolve file_id from identity (int) or collection_name (tab:sheet)."""
    try:
        return int(identifier)
    except (ValueError, TypeError):
        name = str(identifier)
        if name.startswith("master_data_"):
            name = name.replace("master_data_", "")
        
        sheet_name = None
        if ":" in name:
            tab_name, sheet_name = name.split(":", 1)
        else:
            tab_name = name

        query = db.query(ExcelFile).filter(ExcelFile.tab_name == tab_name)
        if sheet_name:
            query = query.filter(ExcelFile.sheet_name == sheet_name)
        
        file_meta = query.order_by(ExcelFile.uploaded_at.desc()).first()
        if not file_meta:
            raise HTTPException(404, f"No file found for: {identifier}")
        return file_meta.id

def load_full_sheet_data(db: Session, file_id_or_identifier: Union[int, str]):
    file_id = resolve_file_id(db, file_id_or_identifier)
    chunks = db.query(MasterDataChunk).filter(MasterDataChunk.file_id == file_id).order_by(asc(MasterDataChunk.chunk_index)).all()
    rows = []
    for chunk in chunks:
        rows.extend(json.loads(chunk.data_json))
    return rows

@router.get("/sheet/{identifier}")
async def get_sheet_data(
    identifier: str,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    try:
        rows = load_full_sheet_data(db, identifier)
        # Clean data for JSON response
        for row in rows:
            for k, v in row.items():
                if v is None or (isinstance(v, float) and np.isnan(v)):
                    row[k] = ""
        return rows
    except HTTPException:
        raise
    except Exception as e:
        print("ERROR IN SHEET:", e)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sheet/tab/{tab_name}")
async def get_sheet_data_by_tab(
    tab_name: str,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    return await get_sheet_data(tab_name, db, current_user)

class AddRowRequest(BaseModel):
    new_row: Dict[str, Any]

class EditRowRequest(BaseModel):
    row_index: int
    updated_row: Dict[str, Any]

class DeleteRowRequest(BaseModel):
    row_index: int

@router.post("/sheet/{identifier}/add")
def add_row(
    identifier: str, 
    request: AddRowRequest,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    file_id = resolve_file_id(db, identifier)
    rows = load_full_sheet_data(db, file_id)
    rows.append(request.new_row)

    # Rewrite chunks
    db.query(MasterDataChunk).filter(MasterDataChunk.file_id == file_id).delete()
    
    chunk_size = 5000
    for i in range(0, len(rows), chunk_size):
        chunk = MasterDataChunk(
            file_id=file_id,
            chunk_index=i // chunk_size,
            data_json=json.dumps(rows[i:i + chunk_size], default=str)
        )
        db.add(chunk)
    
    db.commit()
    return {"status": "success", "total": len(rows)}

@router.patch("/sheet/{identifier}/edit")
def edit_row(
    identifier: str, 
    request: EditRowRequest,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    file_id = resolve_file_id(db, identifier)
    rows = load_full_sheet_data(db, file_id)

    if request.row_index >= len(rows):
        raise HTTPException(400, "Row index out of range")

    rows[request.row_index] = request.updated_row

    # Rewrite chunks
    db.query(MasterDataChunk).filter(MasterDataChunk.file_id == file_id).delete()
    
    chunk_size = 5000
    for i in range(0, len(rows), chunk_size):
        chunk = MasterDataChunk(
            file_id=file_id,
            chunk_index=i // chunk_size,
            data_json=json.dumps(rows[i:i + chunk_size], default=str)
        )
        db.add(chunk)
    
    db.commit()
    return {"status": "updated"}

@router.delete("/sheet/{identifier}/delete")
def delete_row(
    identifier: str,
    row_index: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    file_id = resolve_file_id(db, identifier)
    rows = load_full_sheet_data(db, file_id)

    if row_index < 0 or row_index >= len(rows):
        raise HTTPException(status_code=400, detail="Row index out of range")

    rows.pop(row_index)

    # Rewrite chunks
    db.query(MasterDataChunk).filter(MasterDataChunk.file_id == file_id).delete()
    
    chunk_size = 5000
    for i in range(0, len(rows), chunk_size):
        chunk = MasterDataChunk(
            file_id=file_id,
            chunk_index=i // chunk_size,
            data_json=json.dumps(rows[i:i + chunk_size], default=str)
        )
        db.add(chunk)
    
    db.commit()
    return {"status": "deleted"}
