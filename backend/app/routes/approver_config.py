from fastapi import APIRouter, HTTPException, Depends
from typing import List
from app.dependencies import get_current_entity
from app.models.approver_number import (
    ApproverNumberCreate,
    ApproverNumberResponse,
    ApproverNumberUpdate
)
from app.models.approver_gl import (
    ApproverGLCreate,
    ApproverGLResponse,
    ApproverGLUpdate
)
from app.models.approver_amount import (
    ApproverAmountCreate,
    ApproverAmountResponse,
    ApproverAmountUpdate
)
from app.auth.jwt import get_current_user
from app.models.user import UserResponse
from datetime import datetime

router = APIRouter()

# --- Default Rules (Retained) ---


# --- Default Rules ---




