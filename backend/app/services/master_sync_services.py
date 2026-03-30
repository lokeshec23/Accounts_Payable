import asyncio
import logging
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from datetime import datetime
import json

from app.services.base_sync_service import BaseSyncService
from app.models.db_models import (
    GLMaster, LOBMaster, DepartmentMaster, CustomerMaster, ItemMaster, ExchangeRateMaster
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

class ExchangeRateSyncService(BaseSyncService):
    def __init__(self, db: Session):
        super().__init__(db)
        self._exchange_rate_cache = {} # Cache Parent (exchange-rate) by key

    def _extract_map(self, v: Dict[str, Any]) -> Dict[str, Any]:
        """
        Custom map for exchange-rate-line objects.
        Handles nested objects and fetches currencies from parent cache.
        """
        # 1. Rate Type Handling
        er_obj = v.get("exchangeRate") or {}
        rate_type = er_obj.get("id") if isinstance(er_obj, dict) else v.get("exchangeRateTypeId")
        
        # 2. Currency Handling (from parent cache populated in sync_exchange_rates)
        er_key = er_obj.get("key") if isinstance(er_obj, dict) else None
        base_curr, target_curr = self._exchange_rate_cache.get(er_key, (None, None))
        
        # 3. Rate and Date (Specific field names in REST v1)
        rate_value = v.get("rate")
        # Ensure we don't accidentally grab a dict if field is missing
        if isinstance(rate_value, dict): rate_value = 0.0
        
        return {
            "rate_key": str(v.get("key")),
            "rate_type": rate_type or "Actual",
            "base_currency": base_curr or "INR",
            "target_currency": target_curr or "USD",
            "exchange_rate": float(rate_value) if rate_value is not None else 0.0,
            "effective_date": v.get("effectiveStartDate") or v.get("date"),
            "status": v.get("status", "active"),
            "raw_data": json.dumps(v, default=str),
            "updated_at": datetime.utcnow()
        }

    async def sync_exchange_rates(self, event: Optional[asyncio.Event] = None):
        """
        Enhanced REST Sync: Fetches lines, then resolves parent currencies.
        """
        lock = self._get_lock("company-config/exchange-rate-line")
        if lock.locked(): return
        
        async with lock:
            try:
                import httpx
                async with httpx.AsyncClient(timeout=120.0) as client:
                    token = await self._get_access_token(client)
                    location_id = "201"
                    if "|" in self.username:
                        location_id = self.username.split("|")[-1].strip()
                        
                    headers = {
                        "Authorization": f"Bearer {token}", 
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                        "locationid": location_id
                    }
                    
                    # 1. Fetch List of Lines with Query API (Handles Pagination)
                    query_url = f"{self.base_url}/services/core/query"
                    all_lines = []
                    page_size = 1000
                    query_body = {
                        "object": "company-config/exchange-rate-line",
                        "fields": ["key", "exchangeRate.key"],
                        "start": 1,
                        "size": page_size
                    }

                    logger.info(f"Syncing exchange-rate-line via Query API...")
                    
                    # Initial call
                    r = await client.post(query_url, json=query_body, headers=headers)
                    r.raise_for_status()
                    
                    res_json = r.json()
                    batch = res_json.get("ia::result", [])
                    meta = res_json.get("ia::meta", {})
                    total_count = meta.get("totalCount", 0)
                    
                    all_lines.extend(batch)
                    
                    if total_count > page_size:
                        for start in range(page_size + 1, total_count + 1, page_size):
                            query_body["start"] = start
                            r = await client.post(query_url, json=query_body, headers=headers)
                            if r.is_success:
                                batch_raw = r.json().get("ia::result", [])
                                if batch_raw:
                                    all_lines.extend(batch_raw)

                    logger.info(f"Fetched {len(all_lines)} exchange rate line keys (Expected Total: {total_count})")
                    
                    if not all_lines:
                        if event: event.set()
                        return

                    # 2. Batch Fetch Details and Parent Currencies
                    from app.models.db_models import ExchangeRateMaster
                    
                    # Pre-cache unique parent rate info
                    parent_keys = set()
                    for line in all_lines:
                        er = line.get("exchangeRate")
                        if isinstance(er, dict) and er.get("key"):
                            parent_keys.add(er.get("key"))
                    
                    # Fetch Parents Concurrently with Limit
                    logger.info(f"Pre-fetching {len(parent_keys)} exchange rate parents for currency info...")
                    parent_semaphore = asyncio.Semaphore(15)
                    async def fetch_parent(pkey):
                        async with parent_semaphore:
                            try:
                                resp = await client.get(f"{self.base_url}/objects/company-config/exchange-rate/{pkey}", headers=headers)
                                if resp.status_code == 200:
                                    pdata = resp.json().get("ia::result", {})
                                    f_curr = pdata.get("fromCurrency")
                                    t_curr = pdata.get("toCurrency")
                                    # Handle if currencies are objects
                                    f_code = f_curr.get("key") if isinstance(f_curr, dict) else f_curr
                                    t_code = t_curr.get("key") if isinstance(t_curr, dict) else t_curr
                                    self._exchange_rate_cache[pkey] = (f_code, t_code)
                            except Exception as e:
                                logger.error(f"Failed to fetch parent exchange rate {pkey}: {e}")

                    if parent_keys:
                        await asyncio.gather(*[fetch_parent(pk) for pk in parent_keys])

                    # Fetch line details (if not already fully populated in list)
                    # For REST v1 objects, detailed fetch is often needed for all fields
                    line_semaphore = asyncio.Semaphore(15)
                    async def fetch_line_detail(line):
                        key = line.get("key")
                        if not key: return line
                        async with line_semaphore:
                            try:
                                resp = await client.get(f"{self.base_url}/objects/company-config/exchange-rate-line/{key}", headers=headers)
                                if resp.status_code == 200:
                                    return resp.json().get("ia::result", {})
                                return line
                            except: return line

                    detailed_lines = await asyncio.gather(*[fetch_line_detail(l) for l in all_lines])
                    valid_lines = [l for l in detailed_lines if l]
                    
                    if valid_lines:
                        self._bulk_upsert(ExchangeRateMaster, valid_lines, "rate_key")
                        logger.info(f"Successfully synced {len(valid_lines)} exchange rates.")

                if event: event.set()
            except Exception as e:
                logger.error(f"Exchange Rate Sync failed: {e}", exc_info=True)
                if event: event.set()

    async def get_all_data(self) -> List[ExchangeRateMaster]:
        return await super().get_all_data(ExchangeRateMaster, "sync_exchange_rates")

