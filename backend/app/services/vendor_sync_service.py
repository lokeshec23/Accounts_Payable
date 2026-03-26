import httpx
import asyncio
import os
import logging
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from datetime import datetime
import json

from app.config.settings import settings
from app.models.db_models import VendorMaster

# Performance-tuned logging
logger = logging.getLogger(__name__)

class VendorSyncService:
    """
    High-performance Vendor Synchronization Service.
    Optimized to sync 40k+ records in under 5 minutes using Bulk Query API and Pipelined DB writes.
    """
    def __init__(self, db: Session):
        self.db = db
        self.base_url = os.getenv("SAGE_BASE_URL", settings.SAGE_BASE_URL)
        self.token_url = os.getenv("SAGE_TOKEN_URL", settings.SAGE_TOKEN_URL)
        self.client_id = os.getenv("SAGE_CLIENT_ID", settings.SAGE_CLIENT_ID)
        self.client_secret = os.getenv("SAGE_CLIENT_SECRET", settings.SAGE_CLIENT_SECRET)
        self.username = os.getenv("SAGE_USERNAME", settings.SAGE_USERNAME)
        
    async def _get_access_token(self, client: httpx.AsyncClient) -> str:
        """Fetch OAuth2 token with optimized error handling."""
        payload = {
            "grant_type": "client_credentials",
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "username": self.username
        }
        r = await client.post(self.token_url, json=payload)
        r.raise_for_status()
        return r.json()["access_token"]

    def _extract_vendor_map(self, v: Dict[str, Any]) -> Dict[str, Any]:
        """Maps flat Query API response to VendorMaster DB model."""
        v_key = str(v.get("key"))
        v_id = v.get("id") or v.get("vendorId") or v_key
        
        # Extract nested contact data (assuming Query API dot-notation results)
        # Note: Query API often flattens nested fields depending on the request structure.
        # If it returns nested dicts, we handle them; if flat, we map directly.
        contacts = v.get("contacts", {})
        default_contact = contacts.get("default", {}) if isinstance(contacts, dict) else {}
        addr = default_contact.get("mailingAddress", {}) if isinstance(default_contact, dict) else {}
        term = v.get("term", {}) if isinstance(v.get("term"), dict) else {"id": v.get("term.id")}
        
        return {
            "vendor_key": v_key,
            "vendor_id": v_id,
            "vendor_is_an_individual_person": v.get("isIndividualPerson", False),
            "vendor_name": v.get("name") or v.get("vendorName") or "Unknown",
            "status": v.get("status", "active"),
            "primary_email_address": default_contact.get("email1") or v.get("contacts.default.email1"),
            "address_line1": addr.get("addressLine1") or v.get("contacts.default.mailingAddress.addressLine1"),
            "city": addr.get("city") or v.get("contacts.default.mailingAddress.city"),
            "state_or_territory": addr.get("state") or v.get("contacts.default.mailingAddress.state"),
            "zip_or_postal_code": addr.get("postCode") or v.get("contacts.default.mailingAddress.postCode"),
            "country": addr.get("country") or v.get("contacts.default.mailingAddress.country"),
            "primary_phone": default_contact.get("phone1") or v.get("contacts.default.phone1"),
            "pay_terms": term.get("id") or v.get("term.id"),
            "tax_id": v.get("taxId") or v.get("tax_id"),
            "address_line2": addr.get("addressLine2") or v.get("contacts.default.mailingAddress.addressLine2"),
            "raw_data": json.dumps(v, default=str),
            "updated_at": datetime.utcnow()
        }

    def _bulk_upsert_vendors(self, vendor_details: List[Dict[str, Any]], key_to_id: Dict[str, int], vid_to_id: Dict[str, int]):
        """Executes high-speed bulk upsert for a single batch."""
        to_insert = []
        to_update = []
        
        for v in vendor_details:
            vm = self._extract_vendor_map(v)
            exist_id = key_to_id.get(vm["vendor_key"]) or vid_to_id.get(vm["vendor_id"])
            
            if exist_id:
                vm["id"] = exist_id
                to_update.append(vm)
            else:
                to_insert.append(vm)

        if to_insert:
            self.db.bulk_insert_mappings(VendorMaster, to_insert)
        if to_update:
            self.db.bulk_update_mappings(VendorMaster, to_update)
        
        self.db.commit()
        return len(to_insert), len(to_update)

    async def sync_vendors(self, event: Optional[asyncio.Event] = None):
        """Highly optimized sync using concurrent bulk query fetching."""
        lock = self._get_lock()
        if lock.locked(): return
        
        async with lock:
            start_time = datetime.utcnow()
            logger.info("Starting High-Performance Vendor Sync...")
            
            try:
                async with httpx.AsyncClient(timeout=120.0, limits=httpx.Limits(max_connections=50)) as client:
                    token = await self._get_access_token(client)
                    
                    # 1. Pre-fetch existing mappings (crucial for speed)
                    existing = self.db.query(VendorMaster.id, VendorMaster.vendor_key, VendorMaster.vendor_id).all()
                    key_to_id = {str(r.vendor_key): r.id for r in existing if r.vendor_key}
                    vid_to_id = {str(r.vendor_id): r.id for r in existing if r.vendor_id}
                    
                    query_url = f"{self.base_url}/services/core/query"
                    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
                    
                    # Fetch first page to get total count
                    page_size = 1000
                    query_body = {
                        "object": "accounts-payable/vendor",
                        "fields": [
                            "key", "id", "name", "status", "taxId", "term.id",
                            "contacts.default.email1", "contacts.default.phone1",
                            "contacts.default.mailingAddress.addressLine1", "contacts.default.mailingAddress.addressLine2",
                            "contacts.default.mailingAddress.city", "contacts.default.mailingAddress.state",
                            "contacts.default.mailingAddress.postCode", "contacts.default.mailingAddress.country"
                        ],
                        "start": 1,
                        "size": page_size
                    }
                    
                    r = await client.post(query_url, json=query_body, headers=headers)
                    r.raise_for_status()
                    res_data = r.json()
                    total_count = res_data.get("ia::meta", {}).get("totalCount", 0)
                    first_batch = res_data.get("ia::result", [])
                    
                    # Process first batch immediately to unblock UI
                    self._bulk_upsert_vendors(first_batch, key_to_id, vid_to_id)
                    # Note: No event.set() here; wait for full sync completion.
                    
                    # 2. Concurrent Fetching for remaining pages
                    semaphore = asyncio.Semaphore(10)
                    async def fetch_page(start):
                        async with semaphore:
                            body = {**query_body, "start": start}
                            for attempt in range(3):
                                try:
                                    resp = await client.post(query_url, json=body, headers=headers)
                                    resp.raise_for_status()
                                    batch = resp.json().get("ia::result", [])
                                    # DB Write synchronized via a lock if necessary, but here we can just do it
                                    # Note: Session is NOT thread-safe, but here we are in same event loop.
                                    # However, multiple bulk commits might conflict if not careful.
                                    # We'll do it sequentially for safety or use a write-lock.
                                    return batch
                                except Exception as e:
                                    if attempt == 2: raise
                                    await asyncio.sleep(2 ** attempt)

                    # 2. Concurrent Fetching for remaining pages
                    fetch_tasks = [fetch_page(s) for s in range(page_size + 1, total_count + 1, page_size)]
                    for coro in asyncio.as_completed(fetch_tasks):
                        batch = await coro
                        if batch:
                            self._bulk_upsert_vendors(batch, key_to_id, vid_to_id)
                            logger.info(f"Synced batch of {len(batch)} vendors.")

                # After all concurrent pages are processed
                logger.info(f"Sync complete. Duration: {datetime.utcnow() - start_time}")
                if event: event.set()
            except Exception as e:
                logger.error(f"Sync failed: {e}", exc_info=True)
            finally:
                if event and not event.is_set(): event.set()
                VendorSyncService._active_task = None

    # --- Singleton/State Management ---
    _sync_lock: Optional[asyncio.Lock] = None
    _active_task: Optional[asyncio.Task] = None
    _first_batch_event: Optional[asyncio.Event] = None

    @classmethod
    def _get_lock(cls) -> asyncio.Lock:
        if cls._sync_lock is None: cls._sync_lock = asyncio.Lock()
        return cls._sync_lock

    async def get_all_vendors(self) -> List[VendorMaster]:
        """Entry point for UI; triggers sync if DB empty."""
        lock = VendorSyncService._get_lock()
        count = self.db.query(VendorMaster).count()
        
        if count == 0:
            if not lock.locked():
                VendorSyncService._first_batch_event = asyncio.Event()
                VendorSyncService._active_task = asyncio.create_task(self.sync_vendors(event=VendorSyncService._first_batch_event))
            
            if VendorSyncService._first_batch_event:
                try:
                    await asyncio.wait_for(VendorSyncService._first_batch_event.wait(), timeout=300)
                except asyncio.TimeoutError:
                    logger.warning("Timed out waiting for first batch.")
        
        return self.db.query(VendorMaster).all()
