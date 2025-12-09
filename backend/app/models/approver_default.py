from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class ApproverDefaultBase(BaseModel):
    default_approver_count: int = Field(ge=1, le=4, description="Default number of approvers required (1-4)")

class ApproverDefaultCreate(ApproverDefaultBase):
    pass

class ApproverDefaultResponse(ApproverDefaultBase):
    id: str
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
