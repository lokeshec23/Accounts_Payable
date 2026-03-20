from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime

class VendorWorkflow(BaseModel):
    vendor_name: str
    vendor_id: Optional[str] = None
    mandatory_approver_1: Optional[EmailStr] = None
    mandatory_approver_2: Optional[EmailStr] = None
    mandatory_approver_3: Optional[EmailStr] = None
    mandatory_approver_4: Optional[EmailStr] = None
    mandatory_approver_5: Optional[EmailStr] = None
    is_threshold_enabled: bool = False
    threshold_approver: Optional[EmailStr] = None  # 4th or nth approver based on amount threshold
    amount_threshold: Optional[float] = None  # threshold for threshold approver
    approver_count: int = 1  # 1 to 5
    entity: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

class VendorWorkflowInDB(VendorWorkflow):
    id: str

class VendorWorkflowResponse(BaseModel):
    id: int
    vendor_name: str
    vendor_id: Optional[str] = None
    mandatory_approver_1: Optional[str] = None
    mandatory_approver_2: Optional[str] = None
    mandatory_approver_3: Optional[str] = None
    mandatory_approver_4: Optional[str] = None
    mandatory_approver_5: Optional[str] = None
    is_threshold_enabled: bool = False
    threshold_approver: Optional[str] = None
    amount_threshold: Optional[float] = None
    approver_count: int
    entity: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
