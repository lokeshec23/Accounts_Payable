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

    model_config = {
        "populate_by_name": True,
        "from_attributes": True
    }

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.models.sql.delegation import Delegation

async def check_active_delegation(db: AsyncSession, original_approver_email: str, entity: str):
    """
    Checks if there is an active delegation for the given original approver (SQL).
    Returns the list of substitute approver emails if active.
    """
    now = datetime.utcnow()
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = now.replace(hour=23, minute=59, second=59, microsecond=999999)

    stmt = select(Delegation).where(
        and_(
            Delegation.original_approver == original_approver_email.lower(),
            Delegation.entity == entity,
            Delegation.start_date <= day_end,
            Delegation.end_date >= day_start
        )
    )
    
    result = await db.execute(stmt)
    delegations = result.scalars().all()
    
    return [d.substitute_approver.lower() for d in delegations]
