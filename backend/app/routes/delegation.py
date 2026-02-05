from fastapi import APIRouter, HTTPException, Depends, status
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, delete
from app.database.sql_server import get_db
from app.models.delegation import DelegationCreate, DelegationResponse
from app.models.sql.delegation import Delegation as SQLDelegation
from app.auth.jwt import get_current_user
from app.dependencies import get_current_entity
from app.models.user import UserResponse
from datetime import datetime

router = APIRouter()

@router.post("/", response_model=DelegationResponse)
async def create_delegation(
    delegation: DelegationCreate,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db)
):
    # Validation: Cannot delegate to self
    if delegation.original_approver == delegation.substitute_approver:
        raise HTTPException(
            status_code=400,
            detail="Original approver and substitute approver cannot be the same."
        )
    
    # Permission check: Only admin or the original approver themselves can create delegation
    if current_user.role != "admin" and current_user.email != delegation.original_approver:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to delegate this user's approvals."
        )

    new_delegation = SQLDelegation(
        original_approver=delegation.original_approver,
        substitute_approver=delegation.substitute_approver,
        start_date=delegation.start_date,
        end_date=delegation.end_date,
        entity=entity,
        created_at=datetime.utcnow(),
        created_by=current_user.email
    )
    
    db.add(new_delegation)
    await db.commit()
    await db.refresh(new_delegation)
    
    return DelegationResponse(
        id=str(new_delegation.id),
        original_approver=new_delegation.original_approver,
        substitute_approver=new_delegation.substitute_approver,
        start_date=new_delegation.start_date,
        end_date=new_delegation.end_date,
        created_at=new_delegation.created_at,
        created_by=new_delegation.created_by
    )

@router.get("/", response_model=List[DelegationResponse])
async def get_delegations(
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(SQLDelegation).where(SQLDelegation.entity == entity)
    
    # Non-admins only see delegations they created or are involved in
    if current_user.role != "admin":
        stmt = stmt.where(
            or_(
                SQLDelegation.original_approver == current_user.email,
                SQLDelegation.substitute_approver == current_user.email,
                SQLDelegation.created_by == current_user.email
            )
        )
        
    stmt = stmt.order_by(SQLDelegation.created_at.desc())
    result = await db.execute(stmt)
    delegations = result.scalars().all()
    
    return [
        DelegationResponse(
            id=str(d.id),
            original_approver=d.original_approver,
            substitute_approver=d.substitute_approver,
            start_date=d.start_date,
            end_date=d.end_date,
            created_at=d.created_at,
            created_by=d.created_by
        ) for d in delegations
    ]

@router.delete("/{delegation_id}")
async def delete_delegation(
    delegation_id: str,
    current_user: UserResponse = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        del_id_int = int(delegation_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid delegation ID format")

    stmt = select(SQLDelegation).where(SQLDelegation.id == del_id_int)
    result = await db.execute(stmt)
    delegation = result.scalar_one_or_none()

    if not delegation:
        raise HTTPException(status_code=404, detail="Delegation not found")
        
    # Permission check: Only admin, creator, or original approver can delete
    if current_user.role != "admin" and \
       current_user.email != delegation.created_by and \
       current_user.email != delegation.original_approver:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to revert this delegation."
        )
        
    await db.delete(delegation)
    await db.commit()
    
    return {"message": "Delegation reverted successfully"}
