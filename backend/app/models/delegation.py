from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class DelegationBase(BaseModel):
    original_approver: str = Field(..., description="Email of the original approver")
    substitute_approver: str = Field(..., description="Email of the substitute approver")
    start_date: datetime = Field(..., description="Start date of the delegation")
    end_date: datetime = Field(..., description="End date of the delegation")
    entity: Optional[str] = Field(None, description="Entity to which this delegation applies")

class DelegationCreate(DelegationBase):
    pass

class DelegationResponse(DelegationBase):
    id: str = Field(..., alias="_id")
    created_at: datetime
    created_by: str

    class Config:
        allow_population_by_field_name = True

def check_active_delegation(db, original_approver_email: str, entity: str):
    """
    Checks if there is an active delegation for the given original approver.
    Returns the list of substitute approver emails if active.
    """
    now = datetime.utcnow()
    # Normalize now to start of day for comparison if using date-only storage, 
    # but here we want to match any delegation that overlaps with TODAY.
    # To be safe and day-inclusive:
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = now.replace(hour=23, minute=59, second=59, microsecond=999999)

    delegations = db.delegations.find({
        "original_approver": original_approver_email.lower(),
        "entity": entity,
        "start_date": {"$lte": day_end},
        "end_date": {"$gte": day_start}
    })
    
    return [d["substitute_approver"].lower() for d in delegations]
