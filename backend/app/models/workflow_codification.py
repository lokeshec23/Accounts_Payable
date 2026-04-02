from pydantic import BaseModel, EmailStr
from typing import Optional, List, Union
from datetime import datetime

class CodificationWorkflow(BaseModel):
    lob: str  # Line of Business
    department_id: str
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

class CodificationWorkflowInDB(CodificationWorkflow):
    id: str

class CodificationWorkflowResponse(BaseModel):
    id: int
    lob: str
    department_id: str
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
