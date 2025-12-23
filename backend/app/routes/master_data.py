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

router = APIRouter(tags=["Master Data"])


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
        
        file_id = ObjectId()
        sheet_collections = []
        
        # Handle CSV files
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents))
            
            # Basic cleaning
            df = df.replace({np.nan: None})
            
            # Use filename without extension as sheet name
            sheet_name = file.filename.rsplit('.', 1)[0]
            safe_sheet_name = "".join(c for c in sheet_name if c.isalnum() or c in (' ', '_', '-')).strip()
            safe_sheet_name = safe_sheet_name.replace(" ", "_")
            
            collection_name = f"master_{file_id}_{safe_sheet_name}"
            
            rows = df.to_dict(orient="records")
            
            # Insert into new collection (chunked)
            chunk_size = 5000
            if rows:
                for i in range(0, len(rows), chunk_size):
                    db[collection_name].insert_one({
                        "chunk_index": i // chunk_size,
                        "rows": rows[i:i + chunk_size]
                    })
            
            sheet_collections.append({
                "sheet_name": sheet_name,
                "collection_name": collection_name
            })
        
        # Handle Excel files
        else:
            xls = pd.ExcelFile(io.BytesIO(contents))
            
            for sheet_name in xls.sheet_names:
                df = pd.read_excel(xls, sheet_name=sheet_name)
                
                # Basic cleaning
                df = df.replace({np.nan: None})
                
                # Create a unique collection name
                # sanitize sheet name
                safe_sheet_name = "".join(c for c in sheet_name if c.isalnum() or c in (' ', '_', '-')).strip()
                safe_sheet_name = safe_sheet_name.replace(" ", "_")
                
                collection_name = f"master_{file_id}_{safe_sheet_name}"
                
                rows = df.to_dict(orient="records")
                
                # Insert into new collection (chunked)
                chunk_size = 5000
                if rows:
                    for i in range(0, len(rows), chunk_size):
                        db[collection_name].insert_one({
                            "chunk_index": i // chunk_size,
                            "rows": rows[i:i + chunk_size]
                        })
                
                sheet_collections.append({
                    "sheet_name": sheet_name,
                    "collection_name": collection_name
                })
            
        # Store metadata in excel_files
        from datetime import datetime
        file_meta = {
            "_id": file_id,
            "file_name": file.filename,
            "uploaded_at": datetime.utcnow(),
            "uploaded_by": current_user.username,
            "sheet_collections": sheet_collections,
            "status": "active"
        }
        
        db.excel_files.insert_one(file_meta)
        
        return {"message": "File uploaded successfully", "file_id": str(file_id)}
        
        
    except Exception as e:
        print(f"Error uploading file: {e}")
        raise HTTPException(500, f"Failed to upload file: {str(e)}")

@router.delete("/files/{file_id}")
async def delete_master_file(
    file_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    try:
        db = get_database()
        
        # Get file metadata to find all collections
        file_meta = db.excel_files.find_one({"_id": ObjectId(file_id)})
        if not file_meta:
            raise HTTPException(404, "File not found")
        
        # Delete all sheet collections
        for sheet in file_meta.get("sheet_collections", []):
            collection_name = sheet.get("collection_name")
            if collection_name:
                db[collection_name].drop()
        
        # Delete file metadata
        db.excel_files.delete_one({"_id": ObjectId(file_id)})
        
        return {"message": "File deleted successfully"}
        
    except Exception as e:
        print(f"Error deleting file: {e}")
        raise HTTPException(500, f"Failed to delete file: {str(e)}")


@router.get("/{file_id}/sheets")
def get_sheets(
    file_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    db = get_database()
    files_meta = db["excel_files"]

    doc = files_meta.find_one({"_id": ObjectId(file_id)})
    if not doc:
        raise HTTPException(404, "File not found")

    return doc["sheet_collections"]


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

@router.get("/entities")
def get_entities(
    current_user: UserResponse = Depends(get_current_user)
):
    db = get_database()

    # 🔹 Find the Entity sheet metadata
    excel_files = db["excel_files"]
    entity_file = excel_files.find_one(
        {"sheet_collections.sheet_name": "Entity"},
        {"sheet_collections.$": 1}
    )

    if not entity_file:
        raise HTTPException(status_code=404, detail="Entity master not found")

    # 🔹 Get collection name for Entity sheet
    entity_sheet = entity_file["sheet_collections"][0]
    collection_name = entity_sheet["collection_name"]

    # 🔹 Load all chunks
    chunks = list(
        db[collection_name].find().sort("chunk_index", ASCENDING)
    )

    entities = []
    for chunk in chunks:
        entities.extend(chunk.get("rows", []))

    return entities
