from fastapi import APIRouter, HTTPException, Depends, Body
from typing import List
from datetime import datetime
from bson import ObjectId
from app.database.mongodb import get_database
from app.auth.jwt import get_current_user
from app.models.user import UserResponse
from app.models.currency import CurrencyCreate, CurrencyUpdate, CurrencyResponse

router = APIRouter(tags=["Currencies"])

def format_currency(doc):
    doc["id"] = str(doc["_id"])
    return doc

@router.get("/", response_model=List[CurrencyResponse])
async def get_currencies(current_user: UserResponse = Depends(get_current_user)):
    db = get_database()
    currencies = list(db["currencies"].find())
    
    # Seed default currencies if none exist
    if not currencies:
        default_currencies = [
            {"name": "US Dollar", "symbol": "$", "code": "USD", "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()},
            {"name": "Indian Rupee", "symbol": "₹", "code": "INR", "created_at": datetime.utcnow(), "updated_at": datetime.utcnow()}
        ]
        db["currencies"].insert_many(default_currencies)
        currencies = list(db["currencies"].find())
        
    return [format_currency(c) for c in currencies]

@router.post("/", response_model=CurrencyResponse)
async def create_currency(
    currency: CurrencyCreate,
    current_user: UserResponse = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can add currencies")
        
    db = get_database()
    new_currency = currency.dict()
    new_currency["created_at"] = datetime.utcnow()
    new_currency["updated_at"] = datetime.utcnow()
    
    result = db["currencies"].insert_one(new_currency)
    new_currency["_id"] = result.inserted_id
    
    return format_currency(new_currency)

@router.put("/{currency_id}", response_model=CurrencyResponse)
async def update_currency(
    currency_id: str,
    currency: CurrencyUpdate,
    current_user: UserResponse = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update currencies")
        
    db = get_database()
    update_data = {k: v for k, v in currency.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    result = db["currencies"].update_one(
        {"_id": ObjectId(currency_id)},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Currency not found")
        
    updated_doc = db["currencies"].find_one({"_id": ObjectId(currency_id)})
    return format_currency(updated_doc)

@router.delete("/{currency_id}")
async def delete_currency(
    currency_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete currencies")
        
    db = get_database()
    result = db["currencies"].delete_one({"_id": ObjectId(currency_id)})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Currency not found")
        
    return {"message": "Currency deleted successfully"}
