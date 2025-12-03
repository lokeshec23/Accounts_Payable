from fastapi import APIRouter, HTTPException, Body
from bson import ObjectId
from pymongo import ASCENDING
from app.database.mongodb import get_database
import pandas as pd
import numpy as np

router = APIRouter(tags=["Master Data"])


@router.get("/files")
def list_files():
    db = get_database()
    files_meta = db["excel_files"]

    files = list(files_meta.find({}, {"rows": 0}))
    for f in files:
        f["_id"] = str(f["_id"])
    return files


@router.get("/{file_id}/sheets")
def get_sheets(file_id: str):
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
async def get_sheet_data(collection_name: str):
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
def add_row(collection_name: str, request: AddRowRequest):
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
def edit_row(collection_name: str, request: EditRowRequest):
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
def delete_row(collection_name: str, request: DeleteRowRequest):
    db = get_database()
    rows, chunks = load_full_sheet(collection_name)

    if request.row_index >= len(rows):
        raise HTTPException(400, "Row index out of range")

    rows.pop(request.row_index)

    # Save updated chunks
    chunk_size = 5000
    db[collection_name].delete_many({})

    for i in range(0, len(rows), chunk_size):
        db[collection_name].insert_one({
            "chunk_index": i // chunk_size,
            "rows": rows[i:i + chunk_size]
        })

    return {"status": "deleted"}
