from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from app.models.coding import CodingCreate, CodingResponse, CodingUpdate
from app.database.mongodb import get_database
from app.auth.jwt import get_current_user
from app.models.user import UserResponse
from datetime import datetime
from bson.objectid import ObjectId

router = APIRouter()

@router.post("/", response_model=CodingResponse)
async def create_or_update_coding(
    coding_data: CodingCreate,
    current_user: UserResponse = Depends(get_current_user)
):
    """Create or update coding data for an invoice"""
    db = get_database()
    
    try:
        # Verify invoice exists
        invoice = db.invoices.find_one({"_id": ObjectId(coding_data.invoice_id)})
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        # Check if coding already exists for this invoice
        existing_coding = db.coding.find_one({"invoice_id": coding_data.invoice_id})
        
        if existing_coding:
            # Update existing coding
            update_data = coding_data.dict(exclude={'invoice_id'})
            update_data['updated_at'] = datetime.utcnow()
            
            db.coding.update_one(
                {"invoice_id": coding_data.invoice_id},
                {"$set": update_data}
            )
            
            # Update invoice status to waiting_approval
            db.invoices.update_one(
                {"_id": ObjectId(coding_data.invoice_id)},
                {"$set": {"status": "waiting_approval"}}
            )
            
            # Fetch updated document
            updated_coding = db.coding.find_one({"invoice_id": coding_data.invoice_id})
            updated_coding["id"] = str(updated_coding["_id"])
            return CodingResponse(**updated_coding)
        else:
            # Create new coding
            coding_dict = coding_data.dict()
            coding_dict["created_at"] = datetime.utcnow()
            coding_dict["updated_at"] = None
            
            result = db.coding.insert_one(coding_dict)
            coding_id = str(result.inserted_id)
            
            # Update invoice status to waiting_approval
            db.invoices.update_one(
                {"_id": ObjectId(coding_data.invoice_id)},
                {"$set": {"status": "waiting_approval"}}
            )
            
            # Fetch created document
            created_coding = db.coding.find_one({"_id": result.inserted_id})
            created_coding["id"] = str(created_coding["_id"])
            return CodingResponse(**created_coding)
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{invoice_id}", response_model=CodingResponse)
async def get_coding(
    invoice_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Get coding data by invoice ID"""
    db = get_database()
    
    coding = db.coding.find_one({"invoice_id": invoice_id})
    
    if not coding:
        raise HTTPException(status_code=404, detail="Coding data not found for this invoice")
    
    coding["id"] = str(coding["_id"])
    return CodingResponse(**coding)

@router.delete("/{invoice_id}")
async def delete_coding(
    invoice_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Delete coding data by invoice ID"""
    db = get_database()
    
    result = db.coding.delete_one({"invoice_id": invoice_id})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Coding data not found for this invoice")
    
    return {"message": "Coding data deleted successfully"}
