from fastapi import APIRouter, HTTPException, Depends, Body, Query
from typing import List, Optional
from datetime import datetime, date
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.database.database import get_db
from app.models.db_models import Currency, ExchangeRateMaster
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


@router.get("/exchange-rate")
async def get_exchange_rate(
    base_currency: str = Query(..., description="Base currency code, e.g. INR"),
    target_currency: str = Query(..., description="Target currency code, e.g. USD"),
    invoice_date: Optional[str] = Query(None, description="Invoice date in YYYY-MM-DD format"),
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    """
    Fetch the exchange rate for a currency pair from the master table.
    
    Lookup logic:
    1. If invoice_date is provided and is NOT today, find the record whose
       effective_date is <= invoice_date (closest match, i.e. latest date not exceeding invoice date).
    2. If invoice_date is today, or no match found above, fall back to the latest
       record by effective_date (most recently effective rate).
    3. If still no record, return 404.
    """
    today_str = datetime.utcnow().strftime("%Y-%m-%d")
    use_fallback = True
    rate_record = None

    if invoice_date and invoice_date != today_str:
        try:
            # Parse invoice date — accept both YYYY-MM-DD and MM-DD-YYYY
            try:
                inv_date = datetime.strptime(invoice_date, "%Y-%m-%d")
            except ValueError:
                inv_date = datetime.strptime(invoice_date, "%m-%d-%Y")

            # Find the closest rate on or before the invoice date
            rate_record = (
                db.query(ExchangeRateMaster)
                .filter(
                    ExchangeRateMaster.base_currency == base_currency.upper(),
                    ExchangeRateMaster.target_currency == target_currency.upper(),
                    ExchangeRateMaster.status == "active",
                    ExchangeRateMaster.effective_date <= inv_date
                )
                .order_by(ExchangeRateMaster.effective_date.desc())
                .first()
            )
            if rate_record:
                use_fallback = False
        except (ValueError, Exception):
            use_fallback = True

    if use_fallback or not rate_record:
        # Fall back to the latest effective rate available
        rate_record = (
            db.query(ExchangeRateMaster)
            .filter(
                ExchangeRateMaster.base_currency == base_currency.upper(),
                ExchangeRateMaster.target_currency == target_currency.upper(),
                ExchangeRateMaster.status == "active"
            )
            .order_by(ExchangeRateMaster.effective_date.desc())
            .first()
        )

    if not rate_record:
        raise HTTPException(
            status_code=404,
            detail=f"No exchange rate found for {base_currency.upper()} → {target_currency.upper()}"
        )

    return {
        "base_currency": rate_record.base_currency,
        "target_currency": rate_record.target_currency,
        "exchange_rate": float(rate_record.exchange_rate),
        "effective_date": rate_record.effective_date.isoformat() if rate_record.effective_date else None,
        "rate_key": rate_record.rate_key,
        "fallback_used": use_fallback
    }
