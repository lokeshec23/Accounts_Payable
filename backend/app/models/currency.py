from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class CurrencyBase(BaseModel):
    name: str = Field(..., example="US Dollar")
    symbol: str = Field(..., symbol="$")
    code: str = Field(..., code="USD")

class CurrencyCreate(CurrencyBase):
    pass

class CurrencyUpdate(BaseModel):
    name: Optional[str] = None
    symbol: Optional[str] = None
    code: Optional[str] = None

class CurrencyResponse(CurrencyBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
