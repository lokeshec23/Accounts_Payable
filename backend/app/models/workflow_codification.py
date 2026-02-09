from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class CodificationWorkflow(BaseModel):
    lob: str  # Line of Business
    department_id: str
    mandatory_approver_1: EmailStr
    mandatory_approver_2: EmailStr
    mandatory_approver_3: EmailStr
    threshold_approver: Optional[EmailStr] = None  # 4th approver based on amount threshold
    optional_approver: Optional[EmailStr] = None
    amount_threshold: Optional[float] = None  # threshold for 4th approver
    approver_count: int = 3  # 3, 4, or 5
    entity: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class CodificationWorkflowInDB(CodificationWorkflow):
    id: str

class CodificationWorkflowResponse(BaseModel):
    id: int
    lob: str
    department_id: str
    mandatory_approver_1: str
    mandatory_approver_2: str
    mandatory_approver_3: str
    threshold_approver: Optional[str] = None
    optional_approver: Optional[str] = None
    amount_threshold: Optional[float] = None
    approver_count: int
    entity: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
