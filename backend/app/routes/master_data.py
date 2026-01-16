from fastapi import APIRouter, HTTPException, Body, UploadFile, File
from bson import ObjectId
from pymongo import ASCENDING
from app.database.mongodb import get_database
import pandas as pd
import numpy as np
# Trigger reload
from fastapi import Depends
from app.auth.jwt import get_current_user
from app.models.user import UserResponse

from app.ai.embeddings import embed_text
from app.ai.similarity import cosine_similarity
from app.ai.normalizer import normalize_vendor
from pydantic import BaseModel

router = APIRouter(tags=["Master Data"])

class SearchVendorRequest(BaseModel):
    vendor_name: str
    vendor_address: str = None

@router.post("/search-vendor")
def search_vendor(
    request: SearchVendorRequest,
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Search for a vendor in the active Vendor Master list using address (priority) then name similarity.
    """
    db = get_database()
    
    # Use shared robust matcher
    from app.ai.vector_matcher import find_best_vendor_match
    
    result = find_best_vendor_match(db, request.vendor_name, request.vendor_address)
    
    if result and result["match"]:
        # Match found (Exact Address, Exact Name, Embedding, or Text)
        return {"match": result["match"], "score": result["score"], "method": result["method"]}
        
    return {"match": None, "score": 0.0, "method": "none"}



@router.get("/files")
def list_files(
    current_user: UserResponse = Depends(get_current_user)
):
    db = get_database()
    files_meta = db["excel_files"]

    files = list(files_meta.find({}, {"rows": 0}))
    for f in files:
        f["_id"] = str(f["_id"])
    return files
    
@router.post("/upload")
async def upload_master_file(
    tab_name: str,
    file: UploadFile = File(...),
    current_user: UserResponse = Depends(get_current_user)
):
    try:
        db = get_database()
        
        # Check extension
        if not file.filename.endswith(('.xls', '.xlsx', '.csv')):
             raise HTTPException(400, "Invalid file format. Please upload .xls, .xlsx, or .csv")
             
        contents = await file.read()
        import io
        import re

        def slugify(text):
            return re.sub(r'[^a-zA-Z0-9]', '_', str(text)).strip('_')

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

        # Prepare metadata
        sheet_metadata = []
        
        # Clear existing metadata and collections for this tab first
        existing_meta = db.excel_files.find_one({"tab_name": tab_name})
        if existing_meta and "sheets" in existing_meta:
            for s in existing_meta["sheets"]:
                db[s["collection_name"]].drop()
        elif existing_meta:
            # Fallback for old structure
            db[f"master_data_{tab_name}"].drop()

        for idx, (sheet_name, df) in enumerate(sheets_data.items()):
            safe_name = slugify(sheet_name)
            sub_collection = f"master_data_{tab_name}_{idx}_{safe_name}"
            
            # Inject Vendor_Master default fields ONLY for the first sheet of Vendor_Master tab
            if tab_name == "Vendor_Master" and idx == 0:
                if "GST / Use Tax Eligibility Configuration" not in df.columns:
                    df["GST / Use Tax Eligibility Configuration"] = "Eligible"
                if "TDS/Withhold Tax Applicability Configuration" not in df.columns:
                    df["TDS/Withhold Tax Applicability Configuration"] = "No"
                if "TDS Percentage" not in df.columns:
                    df["TDS Percentage"] = ""
                if "TDS Section Code and Description" not in df.columns:
                    df["TDS Section Code and Description"] = ""
                if "Workflow Applicability Configuration" not in df.columns:
                    df["Workflow Applicability Configuration"] = "Yes"
                if "Line Grouping" not in df.columns:
                    df["Line Grouping"] = "No"
            
            rows = df.to_dict(orient="records")
            
            # Clear (redundant but safe) and Insert
            db[sub_collection].delete_many({})
            chunk_size = 5000
            if rows:
                for i in range(0, len(rows), chunk_size):
                    db[sub_collection].insert_one({
                        "chunk_index": i // chunk_size,
                        "rows": rows[i:i + chunk_size]
                    })
            
            sheet_metadata.append({
                "name": sheet_name,
                "collection_name": sub_collection
            })

        # Update metadata
        from datetime import datetime
        db.excel_files.update_one(
            {"tab_name": tab_name},
            {"$set": {
                "file_name": file.filename,
                "uploaded_at": datetime.utcnow(),
                "uploaded_by": current_user.username,
                "status": "active",
                "sheets": sheet_metadata
            }},
            upsert=True
        )
        
        return {
            "message": "File uploaded successfully", 
            "sheets": sheet_metadata
        }
        
    except Exception as e:
        print(f"Error uploading file: {e}")
        raise HTTPException(500, f"Failed to upload file: {str(e)}")

@router.delete("/files/{tab_name}")
async def delete_tab_data(
    tab_name: str,
    current_user: UserResponse = Depends(get_current_user)
):
    try:
        db = get_database()
        meta = db.excel_files.find_one({"tab_name": tab_name})
        
        if meta and "sheets" in meta:
            for s in meta["sheets"]:
                db[s["collection_name"]].drop()
        else:
            # Fallback
            db[f"master_data_{tab_name}"].drop()

        db.excel_files.delete_one({"tab_name": tab_name})
        return {"message": f"Data for {tab_name} deleted successfully"}
    except Exception as e:
        print(f"Error deleting data: {e}")
        raise HTTPException(500, f"Failed to delete data: {str(e)}")




@router.get("/files")
def list_files(
    current_user: UserResponse = Depends(get_current_user)
):
    db = get_database()
    # Return status of the 4 fixed tabs
    tabs = ["Entity_Master", "Vendor_Master", "Line_Items", "TDS_Rates"]
    result = []
    for tab in tabs:
        meta = db.excel_files.find_one({"tab_name": tab})
        if meta:
            meta["_id"] = str(meta["_id"])
            result.append(meta)
        else:
            result.append({
                "tab_name": tab,
                "file_name": None,
                "status": "missing"
            })
    return result

# Removed get_sheets as we use fixed tabs now

@router.get("/entities")
def get_entities(
    current_user: UserResponse = Depends(get_current_user)
):
    db = get_database()
    
    # Support multi-sheet collection naming
    meta = db.excel_files.find_one({"tab_name": "Entity_Master"})
    collection_name = "master_data_Entity_Master"
    if meta and "sheets" in meta and len(meta["sheets"]) > 0:
        collection_name = meta["sheets"][0]["collection_name"]
    
    chunks = list(
        db[collection_name].find().sort("chunk_index", ASCENDING)
    )

    entities = []
    for chunk in chunks:
        entities.extend(chunk.get("rows", []))

    # --- AUTO-CREATE DEFAULT ENTITY IF NONE EXISTS ---
    if not entities:
        from datetime import datetime
        print("DEBUG: No entities found. Creating Default Entity.")
        
        default_entity = {
            "Entity Name": "Default Entity",
            "Entity No": "1",
            "EntityId": "1"
        }
        
        # 1. Define Collection
        default_collection = "master_data_Entity_Master_default"
        
        # 2. Insert Data
        db[default_collection].delete_many({}) 
        db[default_collection].insert_one({
             "chunk_index": 0,
             "rows": [default_entity]
        })
        
        # 3. Update/Create Metadata
        db.excel_files.update_one(
            {"tab_name": "Entity_Master"},
            {"$set": {
                "file_name": "auto_generated_default",
                "uploaded_at": datetime.utcnow(),
                "uploaded_by": "system",
                "status": "active",
                "sheets": [{
                    "name": "Default",
                    "collection_name": default_collection
                }]
            }},
            upsert=True
        )
        
        entities = [default_entity]

    return entities



def load_full_sheet(collection_name: str):
    db = get_database()
    chunks = list(db[collection_name].find().sort("chunk_index", ASCENDING))

    rows = []
    for chunk in chunks:
        rows.extend(chunk.get("rows", []))

    return rows, chunks


@router.get("/sheet/{collection_name}")
async def get_sheet_data(
    collection_name: str,
    current_user: UserResponse = Depends(get_current_user)
):
    try:
        db = get_database()
        docs = list(db[collection_name].find())

        cleaned_rows = []

        for doc in docs:
            # REMOVE chunk-level _id
            doc.pop("_id", None)

            rows = doc.get("rows", [])
            for row in rows:
                # REMOVE row-level _id if exists
                if "_id" in row:
                    row["_id"] = str(row["_id"])
                # Replace illegal JSON values
                for k, v in row.items():
                    if v is None or v != v:  # NaN check (v != v is true for NaN)
                        row[k] = ""
                cleaned_rows.append(row)

        return cleaned_rows

    except Exception as e:
        print("ERROR IN SHEET:", e)
        raise HTTPException(status_code=500, detail=str(e))


from pydantic import BaseModel
from typing import Dict, Any

class AddRowRequest(BaseModel):
    new_row: Dict[str, Any]

class EditRowRequest(BaseModel):
    row_index: int
    updated_row: Dict[str, Any]

class DeleteRowRequest(BaseModel):
    row_index: int

@router.post("/sheet/{collection_name}/add")
def add_row(
    collection_name: str, 
    request: AddRowRequest,
    current_user: UserResponse = Depends(get_current_user)
):
    db = get_database()
    rows, chunks = load_full_sheet(collection_name)

    rows.append(request.new_row)

    # Save back in 5000-row chunks
    chunk_size = 5000
    db[collection_name].delete_many({})

    for i in range(0, len(rows), chunk_size):
        db[collection_name].insert_one({
            "chunk_index": i // chunk_size,
            "rows": rows[i:i + chunk_size]
        })

    return {"status": "success", "total": len(rows)}


@router.patch("/sheet/{collection_name}/edit")
def edit_row(
    collection_name: str, 
    request: EditRowRequest,
    current_user: UserResponse = Depends(get_current_user)
):
    db = get_database()
    rows, chunks = load_full_sheet(collection_name)

    if request.row_index >= len(rows):
        raise HTTPException(400, "Row index out of range")

    rows[request.row_index] = request.updated_row

    # Rewrite chunks
    chunk_size = 5000
    db[collection_name].delete_many({})

    for i in range(0, len(rows), chunk_size):
        db[collection_name].insert_one({
            "chunk_index": i // chunk_size,
            "rows": rows[i:i + chunk_size]
        })

    return {"status": "updated"}

@router.delete("/sheet/{collection_name}/delete")
def delete_row(
    collection_name: str,
    row_index: int,  # 👈 QUERY PARAM
    current_user: UserResponse = Depends(get_current_user)
):
    db = get_database()
    rows, _ = load_full_sheet(collection_name)

    if row_index < 0 or row_index >= len(rows):
        raise HTTPException(
            status_code=400,
            detail=f"Row index {row_index} out of range (total={len(rows)})"
        )

    rows.pop(row_index)

    # Rewrite chunks
    chunk_size = 5000
    db[collection_name].delete_many({})

    for i in range(0, len(rows), chunk_size):
        db[collection_name].insert_one({
            "chunk_index": i // chunk_size,
            "rows": rows[i:i + chunk_size]
        })

    return {"status": "deleted"}


