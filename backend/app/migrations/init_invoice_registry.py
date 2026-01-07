"""
One-time migration script to initialize invoice registry.

This script should be run once to:
1. Create the compound index on invoice_registry collection
2. Backfill existing invoices into the registry

Usage:
    python -m backend.app.migrations.init_invoice_registry
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from pymongo import MongoClient
from app.config.settings import settings
from app.utils.invoice_registry import ensure_registry_index, sync_registry_from_invoices


def get_db_connection():
    """Get direct database connection for migration."""
    client = MongoClient(settings.MONGODB_URL)
    db = client[settings.DATABASE_NAME]
    return client, db


def main():
    """Initialize invoice registry collection."""
    print("=" * 60)
    print("Invoice Registry Initialization")
    print("=" * 60)
    
    # Get database connection
    client, db = get_db_connection()
    
    try:
        # Step 1: Create index
        print("\n[1/2] Creating compound index...")
        ensure_registry_index(db)
        print("[OK] Index created successfully")
        
        # Step 2: Backfill existing invoices
        print("\n[2/2] Backfilling existing invoices...")
        registered, skipped = sync_registry_from_invoices(db)
        print(f"[OK] Backfill complete:")
        print(f"  - {registered} invoices registered")
        print(f"  - {skipped} invoices skipped (duplicates or missing data)")
        
        # Step 3: Verify
        total_in_registry = db.invoice_registry.count_documents({})
        total_invoices = db.invoices.count_documents({
            "vendor_id": {"$exists": True, "$ne": None},
            "invoice_number": {"$exists": True, "$ne": None}
        })
        
        print(f"\n[Verification]")
        print(f"  - Registry entries: {total_in_registry}")
        print(f"  - Eligible invoices: {total_invoices}")
        
        if total_in_registry == total_invoices:
            print("\n[SUCCESS] Registry is fully synchronized")
        else:
            print(f"\n[WARNING] Mismatch detected ({total_in_registry} vs {total_invoices})")
            print("  This may be normal if some invoices lack vendor_id or invoice_number")
        
        print("\n" + "=" * 60)
        print("Migration complete!")
        print("=" * 60)
        
    finally:
        # Close connection
        client.close()


if __name__ == "__main__":
    main()

