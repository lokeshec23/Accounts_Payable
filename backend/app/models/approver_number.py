from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class ApproverNumberBase(BaseModel):
    vendorName: str = Field(..., alias="vendor_name")
    approverCount: int = Field(ge=1, le=4, description="Number of approvers required (1-4)", alias="approver_count")

    model_config = {
        "populate_by_name": True
    }

class ApproverNumberCreate(ApproverNumberBase):
    pass

class ApproverNumberUpdate(BaseModel):
    approverCount: Optional[int] = Field(None, ge=1, le=4, alias="approver_count")
    
    model_config = {
        "populate_by_name": True
    }

class ApproverNumber(ApproverNumberBase):
    id: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {
        "from_attributes": True,
        "populate_by_name": True
    }

class ApproverNumberResponse(ApproverNumber):
    pass
