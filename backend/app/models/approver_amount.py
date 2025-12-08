from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class ApproverAmountBase(BaseModel):
    min_amount: float = Field(ge=0, description="Minimum amount for the rule")
    max_amount: float = Field(ge=0, description="Maximum amount for the rule")
    approver_count: int = Field(ge=1, le=4, description="Number of approvers required (1-4)")
    currency: Optional[str] = None
    description: Optional[str] = None

class ApproverAmountCreate(ApproverAmountBase):
    pass

class ApproverAmountUpdate(BaseModel):
    min_amount: Optional[float] = Field(None, ge=0)
    max_amount: Optional[float] = Field(None, ge=0)
    approver_count: Optional[int] = Field(None, ge=1, le=4)
    currency: Optional[str] = None
    description: Optional[str] = None

class ApproverAmount(BaseModel):
    id: str
    min_amount: Optional[float] = None
    max_amount: Optional[float] = None
    approver_count: Optional[int] = None
    currency: Optional[str] = None
    description: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class ApproverAmountResponse(ApproverAmount):
    pass
