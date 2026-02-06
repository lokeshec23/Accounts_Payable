from fastapi import APIRouter, HTTPException, Depends, status
from typing import List
from sqlalchemy.orm import Session
from sqlalchemy import or_
from datetime import datetime

from app.database.database import get_db
from app.models.db_models import Delegation as DBDelegation
from app.models.delegation import DelegationCreate, DelegationResponse
from app.auth.jwt import get_current_user
from app.dependencies import get_current_entity
from app.models.user import UserResponse

router = APIRouter()

@router.post("/", response_model=DelegationResponse)
async def create_delegation(
    delegation: DelegationCreate,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    # Validation
    if delegation.original_approver == delegation.substitute_approver:
        raise HTTPException(400, "Original approver and substitute approver cannot be the same.")
    
    if current_user.role != "admin" and current_user.email != delegation.original_approver:
        raise HTTPException(403, "You do not have permission to delegate this user's approvals.")

    new_del = DBDelegation(
        delegator_email=delegation.original_approver.lower(),
        substitute_email=delegation.substitute_approver.lower(),
         is_active=True,
        original_approver=delegation.original_approver.lower(),
        substitute_approver=delegation.substitute_approver.lower(),
        start_date=delegation.start_date,
        end_date=delegation.end_date,
        entity=entity,
        created_at=datetime.utcnow(),
        created_by=current_user.email
    )
    db.add(new_del)
    db.commit()
    db.refresh(new_del)
    
    return DelegationResponse(
        id=new_del.id,
        original_approver=new_del.original_approver,
        substitute_approver=new_del.substitute_approver,
        start_date=new_del.start_date,
        end_date=new_del.end_date,
        entity=new_del.entity,
        created_at=new_del.created_at,
        created_by=new_del.created_by
    )

@router.get("/", response_model=List[DelegationResponse])
async def get_delegations(
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    query = db.query(DBDelegation).filter(DBDelegation.entity == entity)
    
    if current_user.role != "admin":
        email = current_user.email.lower()
        query = query.filter(or_(
            DBDelegation.original_approver == email,
            DBDelegation.substitute_approver == email,
            DBDelegation.created_by == current_user.email
        ))
        
    delegations = query.order_by(DBDelegation.created_at.desc()).all()
    return delegations

@router.delete("/{delegation_id}")
async def delete_delegation(
    delegation_id: int,
    db: Session = Depends(get_db),
    current_user: UserResponse = Depends(get_current_user)
):
    delegation = db.query(DBDelegation).filter(DBDelegation.id == delegation_id).first()
    if not delegation:
        raise HTTPException(404, "Delegation not found")
    
    print(f"DEBUG REVERT: User={current_user.email} Role={current_user.role} CreatedBy={delegation.created_by} Orig={delegation.original_approver}")

    if current_user.role != "admin" and \
       current_user.email.lower() != (delegation.created_by or "").lower() and \
       current_user.email.lower() != (delegation.original_approver or "").lower():
        raise HTTPException(403, "You do not have permission to revert this delegation.")
        
    db.delete(delegation)
    db.commit()
    return {"message": "Delegation reverted successfully"}
