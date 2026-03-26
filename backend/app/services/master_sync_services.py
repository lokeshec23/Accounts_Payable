import asyncio
import logging
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from datetime import datetime
import json

from app.services.base_sync_service import BaseSyncService
from app.models.db_models import (
    GLMaster, LOBMaster, DepartmentMaster, CustomerMaster, ItemMaster
)

logger = logging.getLogger(__name__)

class GLSyncService(BaseSyncService):
    def _extract_map(self, v: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "gl_key": str(v.get("key")),
            "account_number": v.get("id"),
            "title": v.get("name") or "Unknown",
            "normal_balance": v.get("normalBalance"),
            "status": v.get("status", "active"),
            "raw_data": json.dumps(v, default=str),
            "updated_at": datetime.utcnow()
        }

    async def sync_gl_accounts(self, event: Optional[asyncio.Event] = None):
        fields = ["key", "id", "name", "normalBalance", "status"]
        await self.sync_object(GLMaster, "general-ledger/account", fields, "gl_key", event)

    async def get_all_data(self) -> List[GLMaster]:
        return await super().get_all_data(GLMaster, "sync_gl_accounts")

class LOBSyncService(BaseSyncService):
    def _extract_map(self, v: Dict[str, Any]) -> Dict[str, Any]:
        parent = v.get("parent") or {}
        parent_id = parent.get("id") if isinstance(parent, dict) else v.get("parent.id")
        return {
            "lob_key": str(v.get("key")),
            "lob_id": v.get("id"),
            "name": v.get("name") or "Unknown",
            "parent_id": parent_id,
            "status": v.get("status", "active"),
            "raw_data": json.dumps(v, default=str),
            "updated_at": datetime.utcnow()
        }

    async def sync_lob(self, event: Optional[asyncio.Event] = None):
        fields = ["key", "id", "name", "parent.id", "status"]
        await self.sync_object(LOBMaster, "company-config/class", fields, "lob_key", event)

    async def get_all_data(self) -> List[LOBMaster]:
        return await super().get_all_data(LOBMaster, "sync_lob")

class DepartmentSyncService(BaseSyncService):
    def _extract_map(self, v: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "dept_key": str(v.get("key")),
            "department_id": v.get("id"),
            "department_name": v.get("name") or "Unknown",
            "status": v.get("status", "active"),
            "raw_data": json.dumps(v, default=str),
            "updated_at": datetime.utcnow()
        }

    async def sync_departments(self, event: Optional[asyncio.Event] = None):
        fields = ["key", "id", "name", "status"]
        await self.sync_object(DepartmentMaster, "company-config/department", fields, "dept_key", event)

    async def get_all_data(self) -> List[DepartmentMaster]:
        return await super().get_all_data(DepartmentMaster, "sync_departments")

class CustomerSyncService(BaseSyncService):
    def _extract_map(self, v: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "customer_key": str(v.get("key")),
            "customer_id": v.get("id"),
            "customer_name": v.get("name") or "Unknown",
            "status": v.get("status", "active"),
            "raw_data": json.dumps(v, default=str),
            "updated_at": datetime.utcnow()
        }

    async def sync_customers(self, event: Optional[asyncio.Event] = None):
        fields = ["key", "id", "name", "status"]
        await self.sync_object(CustomerMaster, "accounts-receivable/customer", fields, "customer_key", event)

    async def get_all_data(self) -> List[CustomerMaster]:
        return await super().get_all_data(CustomerMaster, "sync_customers")

class ItemSyncService(BaseSyncService):
    def _extract_map(self, v: Dict[str, Any]) -> Dict[str, Any]:
        product_line = v.get("productLine") or {}
        product_line_id = product_line.get("id") if isinstance(product_line, dict) else v.get("productLineId")
        
        gl_group = v.get("glGroup") or {}
        gl_group_name = gl_group.get("name") if isinstance(gl_group, dict) else v.get("glGroupName")

        return {
            "item_key": str(v.get("key")),
            "item_id": v.get("id"),
            "name": v.get("name") or "Unknown",
            "product_line_id": product_line_id,
            "gl_group": gl_group_name,
            "status": v.get("status", "active"),
            "raw_data": json.dumps(v, default=str),
            "updated_at": datetime.utcnow()
        }

    async def sync_items(self, event: Optional[asyncio.Event] = None):
        fields = ["key", "id", "name", "productLineId", "glGroupName", "status"]
        await self.sync_object(ItemMaster, "inventory-control/item", fields, "item_key", event)

    async def get_all_data(self) -> List[ItemMaster]:
        return await super().get_all_data(ItemMaster, "sync_items")
