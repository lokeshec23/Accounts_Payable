from fastapi import APIRouter, HTTPException, Body
from bson import ObjectId
from pymongo import ASCENDING
from app.database.mongodb import db

router = APIRouter(prefix="/master", tags=["Master Data"])

files_meta = db["excel_files"]


@router.get("/files")
def list_files():
    files = list(files_meta.find({}, {"rows": 0}))
    for f in files:
        f["_id"] = str(f["_id"])
    return files

@router.get("/{file_id}/sheets")
def get_sheets(file_id: str):
    doc = files_meta.find_one({"_id": ObjectId(file_id)})
    if not doc:
        raise HTTPException(404, "File not found")
    return doc["sheet_collections"]


def load_full_sheet(collection_name: str):
    chunks = list(db[collection_name].find().sort("chunk_index", ASCENDING))
    rows = []
    for chunk in chunks:
        rows.extend(chunk["rows"])
    return rows, chunks


@router.get("/sheet/{collection_name}")
def get_sheet(collection_name: str):
    rows, _ = load_full_sheet(collection_name)
    return {
        "collection": collection_name,
        "rows": rows,
        "total": len(rows)
    }

@router.post("/sheet/{collection_name}/add")
def add_row(collection_name: str, new_row: dict):
    rows, chunks = load_full_sheet(collection_name)

    rows.append(new_row)

    # Re-chunk into 5000 rows each
    chunk_size = 5000
    db[collection_name].delete_many({})

    for i in range(0, len(rows), chunk_size):
        db[collection_name].insert_one({
            "chunk_index": i // chunk_size,
            "rows": rows[i:i + chunk_size]
        })

    return {"status": "success", "total": len(rows)}



@router.patch("/sheet/{collection_name}/edit")
def edit_row(collection_name: str, row_index: int, updated_row: dict):
    rows, chunks = load_full_sheet(collection_name)

    if row_index >= len(rows):
        raise HTTPException(400, "Row index out of range")

    rows[row_index] = updated_row

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
def delete_row(collection_name: str, row_index: int = Body(...)):
    rows, chunks = load_full_sheet(collection_name)

    if row_index >= len(rows):
        raise HTTPException(400, "Row index out of range")

    rows.pop(row_index)

    chunk_size = 5000
    db[collection_name].delete_many({})

    for i in range(0, len(rows), chunk_size):
        db[collection_name].insert_one({
            "chunk_index": i // chunk_size,
            "rows": rows[i:i + chunk_size]
        })

    return {"status": "deleted"}
