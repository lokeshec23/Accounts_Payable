from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class ApproverGLBase(BaseModel):
    glTitle: str = Field(..., description="General Ledger Code", alias="gl_code")
    approverCount: int = Field(ge=1, le=4, description="Number of approvers required (1-4)", alias="approver_count")

    class Config:
        populate_by_name = True
        by_alias = False

class ApproverGLCreate(ApproverGLBase):
    pass

class ApproverGLUpdate(BaseModel):
    glTitle: Optional[str] = Field(None, alias="gl_code")
    approverCount: Optional[int] = Field(None, ge=1, le=4, alias="approver_count")
    
    class Config:
        populate_by_name = True
        by_alias = False

class ApproverGL(ApproverGLBase):
    id: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
        populate_by_name = True
        by_alias = False

class ApproverGLResponse(ApproverGL):
    pass
