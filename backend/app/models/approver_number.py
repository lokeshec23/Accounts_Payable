from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class ApproverNumberBase(BaseModel):
    vendor_name: str
    approver_count: int = Field(ge=1, le=4, description="Number of approvers required (1-4)")

class ApproverNumberCreate(ApproverNumberBase):
    pass

class ApproverNumberUpdate(BaseModel):
    approver_count: Optional[int] = Field(None, ge=1, le=4)

class ApproverNumber(ApproverNumberBase):
    id: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class ApproverNumberResponse(ApproverNumber):
    pass
