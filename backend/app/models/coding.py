from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class LineItemCoding(BaseModel):
    s_no: int
    description: str
    line_type: str  # Expense, Asset, Liability
    quantity: float
    unit_price: float
    net_amount: float
    gl_code: str
    lob: Optional[str] = None
    department: Optional[str] = None
    customer: Optional[str] = None
    item: Optional[str] = None
    original_index: Optional[int] = None

class CodingBase(BaseModel):
    invoice_id: str
    header_coding: Optional[str] = None
    line_items: Optional[List[LineItemCoding]] = []

class CodingCreate(CodingBase):
    vendor_name: Optional[str] = None

class CodingUpdate(BaseModel):
    header_coding: Optional[str] = None
    line_items: Optional[List[LineItemCoding]] = None

class Coding(CodingBase):
    id: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class CodingResponse(Coding):
    pass
