import httpx
import asyncio
import os
import logging
import json
from typing import List, Dict, Any, Optional, Type
from sqlalchemy.orm import Session
from datetime import datetime
from app.config.settings import settings

logger = logging.getLogger(__name__)

class BaseSyncService:
    """
    Generic Base Service for Sage Intacct Master Data Synchronization.
    Handles authentication, pagination, concurrent fetching, and bulk upserts.
    """
    def __init__(self, db: Session):
        self.db = db
        self.base_url = os.getenv("SAGE_BASE_URL", settings.SAGE_BASE_URL)
        self.token_url = os.getenv("SAGE_TOKEN_URL", settings.SAGE_TOKEN_URL)
        self.client_id = os.getenv("SAGE_CLIENT_ID", settings.SAGE_CLIENT_ID)
        self.client_secret = os.getenv("SAGE_CLIENT_SECRET", settings.SAGE_CLIENT_SECRET)
        self.username = os.getenv("SAGE_USERNAME", settings.SAGE_USERNAME)

    async def _get_access_token(self, client: httpx.AsyncClient) -> str:
        """Fetch OAuth2 token."""
        payload = {
            "grant_type": "client_credentials",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "username": self.username
        }
        r = await client.post(self.token_url, json=payload)
        r.raise_for_status()
        return r.json()["access_token"]

    def _extract_map(self, item: Dict[str, Any]) -> Dict[str, Any]:
        """Override this in subclasses to map Sage fields to DB model fields."""
        raise NotImplementedError("Subclasses must implement _extract_map")

    _locks: Dict[str, asyncio.Lock] = {}

    @classmethod
    def _get_lock(cls, obj_name: str) -> asyncio.Lock:
        if obj_name not in cls._locks:
            cls._locks[obj_name] = asyncio.Lock()
        return cls._locks[obj_name]

    def _bulk_upsert(self, model: Type, items: List[Dict[str, Any]], key_field: str):
        """Executes high-speed bulk upsert for a single batch."""
        if not items: return 0, 0
        
        to_insert = []
        to_update = []
        
        # Pre-fetch existing keys for the batch to decide between insert and update
        keys = [str(item.get("key")) for item in items if item.get("key")]
        # Use label to ensure we can access the column value consistently
        col = getattr(model, key_field)
        existing = self.db.query(col).filter(col.in_(keys)).all()
        # existing is a list of tuples like [('key1',), ('key2',)]
        existing_keys = {str(r[0]) for r in existing}

        for item in items:
            mapped = self._extract_map(item)
            if mapped[key_field] in existing_keys:
                to_update.append(mapped)
            else:
                to_insert.append(mapped)

        if to_insert:
            self.db.bulk_insert_mappings(model, to_insert)
        
        if to_update:
            # Fetch IDs for the entire update batch
            existing_records = self.db.query(model.id, col).filter(col.in_(keys)).all()
            key_to_id = {str(r[1]): r.id for r in existing_records}
            
            for m in to_update:
                if m[key_field] in key_to_id:
                    m["id"] = key_to_id[m[key_field]]
            
            # Filter out any that somehow missed their ID
            to_update = [m for m in to_update if "id" in m]
            if to_update:
                self.db.bulk_update_mappings(model, to_update)
        
        self.db.commit()
        return len(to_insert), len(to_update)

    async def sync_object(self, 
                    model: Type, 
                    sage_object: str, 
                    fields: List[str], 
                    key_field: str,
                    event: Optional[asyncio.Event] = None):
        """Two-Stage Sync: Fetch Keys -> Fetch Details."""
        lock = self._get_lock(sage_object)
        if lock.locked(): 
            logger.info(f"Sync already in progress for {sage_object}. Skipping.")
            return
        
        async with lock:
            start_time = datetime.utcnow()
            logger.info(f"Starting Two-Stage Sync for {sage_object}...")
            
            try:
                async with httpx.AsyncClient(timeout=120.0, limits=httpx.Limits(max_connections=50)) as client:
                    token = await self._get_access_token(client)
                    # Extract location ID from username if possible (e.g. Apex...|201)
                    location_id = "201"
                    if "|" in self.username:
                        location_id = self.username.split("|")[-1].strip()
                        
                    headers = {
                        "Authorization": f"Bearer {token}", 
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                        "locationid": location_id
                    }
                    
                    # 1. Fetch Data in Bulk using Query API (Proven pattern from VendorSync)
                    query_url = f"{self.base_url}/services/core/query"
                    page_size = 1000
                    
                    query_body = {
                        "object": sage_object,
                        "fields": fields, # Try to get all fields at once
                        "start": 1,
                        "size": page_size
                    }
                    
                    logger.info(f"Syncing {sage_object} via Query API...")
                    r = await client.post(query_url, json=query_body, headers=headers)
                    
                    # If Query API fails with full fields, try minimal fields then detail fetch (fallback)
                    if not r.is_success:
                        logger.warning(f"Query API failed for {sage_object} with full fields. Falling back to two-stage sync.")
                        query_body["fields"] = ["key", "id", "name", "status"]
                        r = await client.post(query_url, json=query_body, headers=headers)
                        r.raise_for_status()
                        use_detail_fallback = True
                    else:
                        use_detail_fallback = False

                    res_data = r.json()
                    total_count = res_data.get("ia::meta", {}).get("totalCount", 0)
                    first_batch_raw = res_data.get("ia::result", [])
                    
                    async def get_details(items):
                        if not use_detail_fallback: return items
                        
                        logger.info(f"Fetching {len(items)} details individually for {sage_object}...")
                        semaphore = asyncio.Semaphore(15)
                        async def fetch_one(item):
                            key = item.get("key")
                            if not key: return item
                            async with semaphore:
                                try:
                                    detail_url = f"{self.base_url}/objects/{sage_object}/{key}"
                                    resp = await client.get(detail_url, headers=headers)
                                    if resp.status_code == 200:
                                        res_json = resp.json()
                                        return res_json.get("ia::result", res_json)
                                    else:
                                        logger.warning(f"Detail fetch failed for {sage_object} key {key}: {resp.status_code}")
                                        return item # Fallback to basic data if detail fails
                                except Exception:
                                    return item
                        
                        tasks = [fetch_one(it) for it in items]
                        return await asyncio.gather(*tasks)

                    # Process Batches
                    if first_batch_raw:
                        data = await get_details(first_batch_raw)
                        self._bulk_upsert(model, data, key_field)

                    if total_count > page_size:
                        for start in range(page_size + 1, total_count + 1, page_size):
                            query_body["start"] = start
                            r = await client.post(query_url, json=query_body, headers=headers)
                            if r.is_success:
                                batch_raw = r.json().get("ia::result", [])
                                if batch_raw:
                                    data = await get_details(batch_raw)
                                    self._bulk_upsert(model, data, key_field)
                                    logger.info(f"Synced batch of {len(data)} for {sage_object}.")

                logger.info(f"Sync complete for {sage_object}. Duration: {datetime.utcnow() - start_time}")
                if event: event.set()
            except Exception as e:
                logger.error(f"Sync failed for {sage_object}: {e}", exc_info=True)
                if event: event.set()

    async def sync_rest_object(self, 
                    model: Type, 
                    sage_object: str, 
                    key_field: str,
                    event: Optional[asyncio.Event] = None):
        """Pure REST Sync: List Keys -> Fetch Details."""
        lock = self._get_lock(sage_object)
        if lock.locked(): 
            logger.info(f"Sync already in progress for {sage_object}. Skipping.")
            return
        
        async with lock:
            start_time = datetime.utcnow()
            logger.info(f"Starting REST Sync for {sage_object}...")
            
            try:
                async with httpx.AsyncClient(timeout=120.0, limits=httpx.Limits(max_connections=50)) as client:
                    token = await self._get_access_token(client)
                    # Extract location ID from username if possible
                    location_id = "201"
                    if "|" in self.username:
                        location_id = self.username.split("|")[-1].strip()
                        
                    headers = {
                        "Authorization": f"Bearer {token}", 
                        "Accept": "application/json",
                        "Content-Type": "application/json",
                        "locationid": location_id
                    }
                    
                    # 1. Fetch List of Objects (to get keys)
                    # Note: offset/limit query parameters are NOT supported for all objects in v1 (REST)
                    list_url = f"{self.base_url}/objects/{sage_object}"
                    logger.info(f"Fetching REST list from {list_url}...")
                    r = await client.get(list_url, headers=headers)
                    if r.status_code == 400:
                        # Fallback try if it only likes no params
                        r = await client.get(list_url, headers=headers)
                    r.raise_for_status()
                    
                    res_data = r.json()
                    all_list_items = res_data.get("ia::result", [])
                    total_count = res_data.get("ia::meta", {}).get("totalCount", 0)
                    
                    if not all_list_items:
                        logger.info(f"No records found for {sage_object}.")
                        if event: event.set()
                        return

                    # 2. Fetch Details for each key concurrently
                    semaphore = asyncio.Semaphore(15)
                    async def fetch_one(item):
                        key = item.get("key")
                        if not key: return None
                        async with semaphore:
                            try:
                                detail_url = f"{self.base_url}/objects/{sage_object}/{key}"
                                resp = await client.get(detail_url, headers=headers)
                                if resp.status_code == 200:
                                    res_json = resp.json()
                                    return res_json.get("ia::result", res_json)
                                return None
                            except Exception as e:
                                logger.warning(f"Failed to fetch detail for {key}: {e}")
                                return None
                    
                    tasks = [fetch_one(it) for it in all_list_items]
                    batch_details = await asyncio.gather(*tasks)
                    # Filter out None and process
                    valid_details = [d for d in batch_details if d]
                    
                    if valid_details:
                        self._bulk_upsert(model, valid_details, key_field)
                        logger.info(f"Synced/Updated {len(valid_details)} records for {sage_object}.")

                logger.info(f"REST Sync complete for {sage_object}. Duration: {datetime.utcnow() - start_time}")
                if event: event.set()
            except Exception as e:
                logger.error(f"REST Sync failed for {sage_object}: {e}", exc_info=True)
                if event: event.set()

    async def get_all_data(self, model: Type, sync_func_name: str) -> List[Any]:
        """Generic entry point for master data; triggers sync if DB empty."""
        count = self.db.query(model).count()
        if count == 0:
            logger.info(f"Database for {model.__name__} is empty. Triggering sync...")
            # Trigger sync and wait for first batch or completion
            event = asyncio.Event()
            # Call the sync function by name (e.g. 'sync_gl_accounts')
            sync_func = getattr(self, sync_func_name)
            asyncio.create_task(sync_func(event=event))
            try:
                # Wait up to 60 seconds for at least one batch or completion
                await asyncio.wait_for(event.wait(), timeout=60)
                logger.info(f"First batch or full sync complete for {model.__name__}.")
            except asyncio.TimeoutError:
                logger.warning(f"Timed out waiting for initial {model.__name__} sync batch.")
        
        return self.db.query(model).all()
