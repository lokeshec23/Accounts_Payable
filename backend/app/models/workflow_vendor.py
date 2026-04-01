from pydantic import BaseModel, EmailStr
from typing import Optional, List, Union
from datetime import datetime

class VendorWorkflow(BaseModel):
    vendor_name: str
    vendor_id: Optional[str] = None
    mandatory_approver_1: Optional[Union[str, List[str]]] = None
    mandatory_approver_2: Optional[Union[str, List[str]]] = None
    mandatory_approver_3: Optional[Union[str, List[str]]] = None
    mandatory_approver_4: Optional[Union[str, List[str]]] = None
    mandatory_approver_5: Optional[Union[str, List[str]]] = None
    is_threshold_enabled: bool = False
    threshold_approver: Optional[Union[str, List[str]]] = None
    amount_threshold: Optional[float] = None
    approver_count: int = 1  # 1 to 5
    entity: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        extra = "ignore"

class VendorWorkflowInDB(VendorWorkflow):
    id: str

class VendorWorkflowResponse(BaseModel):
    id: int
    vendor_name: str
    vendor_id: Optional[str] = None
    mandatory_approver_1: Optional[Union[str, List[str]]] = None
    mandatory_approver_2: Optional[Union[str, List[str]]] = None
    mandatory_approver_3: Optional[Union[str, List[str]]] = None
    mandatory_approver_4: Optional[Union[str, List[str]]] = None
    mandatory_approver_5: Optional[Union[str, List[str]]] = None
    is_threshold_enabled: bool = False
    threshold_approver: Optional[Union[str, List[str]]] = None
    amount_threshold: Optional[float] = None
    approver_count: int = 1
    entity: str = "Consolidated Analytics Inc"
    created_at: datetime = datetime.utcnow()
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
