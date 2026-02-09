from fastapi import APIRouter, HTTPException, Depends, Body
from typing import List
from datetime import datetime
from sqlalchemy.orm import Session
from app.database.database import get_db
from app.models.db_models import Currency
from app.auth.jwt import get_current_user
from app.models.user import UserResponse
from app.models.currency import CurrencyCreate, CurrencyUpdate, CurrencyResponse

router = APIRouter(tags=["Currencies"])

@router.get("/", response_model=List[CurrencyResponse])
async def get_currencies(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    currencies = db.query(Currency).all()
    
    # Seed default currencies if none exist
    if not currencies:
        default_currencies = [
            Currency(name="US Dollar", symbol="$", code="USD"),
            Currency(name="Indian Rupee", symbol="₹", code="INR")
        ]
        db.add_all(default_currencies)
        db.commit()
        currencies = db.query(Currency).all()
        
    return currencies

@router.post("/", response_model=CurrencyResponse)
async def create_currency(
    currency: CurrencyCreate,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can add currencies")
        
    new_currency = Currency(
        name=currency.name,
        symbol=currency.symbol,
        code=currency.code
    )
    db.add(new_currency)
    db.commit()
    db.refresh(new_currency)
    
    return new_currency

@router.put("/{currency_id}", response_model=CurrencyResponse)
async def update_currency(
    currency_id: int,
    currency: CurrencyUpdate,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update currencies")
        
    db_currency = db.query(Currency).filter(Currency.id == currency_id).first()
    if not db_currency:
        raise HTTPException(status_code=404, detail="Currency not found")
        
    if currency.name is not None: db_currency.name = currency.name
    if currency.symbol is not None: db_currency.symbol = currency.symbol
    if currency.code is not None: db_currency.code = currency.code
    db_currency.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(db_currency)
    return db_currency

@router.delete("/{currency_id}")
async def delete_currency(
    currency_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete currencies")
        
    db_currency = db.query(Currency).filter(Currency.id == currency_id).first()
    if not db_currency:
        raise HTTPException(status_code=404, detail="Currency not found")
        
    db.delete(db_currency)
    db.commit()
    
    return {"message": "Currency deleted successfully"}
