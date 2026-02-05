from fastapi import APIRouter, HTTPException, Depends, Body
from typing import List
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from app.database.sql_server import get_db
from app.auth.jwt import get_current_user
from app.models.user import UserResponse
from app.models.currency import CurrencyCreate, CurrencyUpdate, CurrencyResponse
from app.models.sql.settings import Currency as SQLCurrency

router = APIRouter(tags=["Currencies"])

@router.get("/", response_model=List[CurrencyResponse])
async def get_currencies(
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(SQLCurrency)
    result = await db.execute(stmt)
    currencies = result.scalars().all()
    
    # Seed default currencies if none exist
    if not currencies:
        default_currencies = [
            SQLCurrency(name="US Dollar", symbol="$", code="USD", created_at=datetime.utcnow(), updated_at=datetime.utcnow()),
            SQLCurrency(name="Indian Rupee", symbol="₹", code="INR", created_at=datetime.utcnow(), updated_at=datetime.utcnow())
        ]
        db.add_all(default_currencies)
        await db.commit()
        
        stmt = select(SQLCurrency)
        result = await db.execute(stmt)
        currencies = result.scalars().all()
        
    return [
        CurrencyResponse(
            id=str(c.id),
            name=c.name,
            symbol=c.symbol,
            code=c.code,
            created_at=c.created_at,
            updated_at=c.updated_at
        ) for c in currencies
    ]

@router.post("/", response_model=CurrencyResponse)
async def create_currency(
    currency: CurrencyCreate,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can add currencies")
        
    new_currency = SQLCurrency(
        name=currency.name,
        symbol=currency.symbol,
        code=currency.code,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    
    db.add(new_currency)
    await db.commit()
    await db.refresh(new_currency)
    
    return CurrencyResponse(
        id=str(new_currency.id),
        name=new_currency.name,
        symbol=new_currency.symbol,
        code=new_currency.code,
        created_at=new_currency.created_at,
        updated_at=new_currency.updated_at
    )

@router.put("/{currency_id}", response_model=CurrencyResponse)
async def update_currency(
    currency_id: str,
    currency: CurrencyUpdate,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can update currencies")
        
    try:
        cur_id_int = int(currency_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid currency ID format")

    stmt = select(SQLCurrency).where(SQLCurrency.id == cur_id_int)
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()
    
    if not existing:
        raise HTTPException(status_code=404, detail="Currency not found")
        
    if currency.name is not None: existing.name = currency.name
    if currency.symbol is not None: existing.symbol = currency.symbol
    if currency.code is not None: existing.code = currency.code
    
    existing.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(existing)
    
    return CurrencyResponse(
        id=str(existing.id),
        name=existing.name,
        symbol=existing.symbol,
        code=existing.code,
        created_at=existing.created_at,
        updated_at=existing.updated_at
    )

@router.delete("/{currency_id}")
async def delete_currency(
    currency_id: str,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can delete currencies")
        
    try:
        cur_id_int = int(currency_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid currency ID format")

    stmt = select(SQLCurrency).where(SQLCurrency.id == cur_id_int)
    result = await db.execute(stmt)
    existing = result.scalar_one_or_none()
    
    if not existing:
        raise HTTPException(status_code=404, detail="Currency not found")
        
    await db.delete(existing)
    await db.commit()
    
    return {"message": "Currency deleted successfully"}
