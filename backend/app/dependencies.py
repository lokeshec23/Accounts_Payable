from fastapi import Header, HTTPException
from typing import Optional

async def get_current_entity(x_entity: Optional[str] = Header(None, alias="X-Entity")):
    # If no entity header provided, default to first entity
    if not x_entity:
        return "Consolidated Analytics Inc"
    return x_entity
