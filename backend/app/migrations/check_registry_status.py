"""
Diagnostic script to check invoice registry status
"""
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from pymongo import MongoClient
from app.config.settings import settings

def main():
    client = MongoClient(settings.MONGODB_URL)
    db = client[settings.DATABASE_NAME]
    
    print("=" * 60)
    print("Invoice Registry Diagnostic")
    print("=" * 60)
    
    # Check registry collection
    registry_count = db.invoice_registry.count_documents({})
    print(f"\n[Registry Collection]")
    print(f"  Total entries: {registry_count}")
    
    if registry_count > 0:
        print(f"\n[Sample Registry Entries]")
        for entry in db.invoice_registry.find().limit(5):
            print(f"  - Vendor ID: {entry.get('vendor_id')}")
            print(f"    Invoice #: {entry.get('invoice_number')}")
            print(f"    Entity: {entry.get('entity')}")
            print(f"    Uploaded: {entry.get('uploaded_at')}")
            print()
    
    # Check invoices collection
    invoices_count = db.invoices.count_documents({})
    invoices_with_data = db.invoices.count_documents({
        "vendor_id": {"$exists": True, "$ne": None},
        "invoice_number": {"$exists": True, "$ne": None}
    })
    
    print(f"[Invoices Collection]")
    print(f"  Total invoices: {invoices_count}")
    print(f"  With vendor_id + invoice_number: {invoices_with_data}")
    
    # Check for duplicates in invoices
    pipeline = [
        {
            "$match": {
                "vendor_id": {"$exists": True, "$ne": None},
                "invoice_number": {"$exists": True, "$ne": None}
            }
        },
        {
            "$group": {
                "_id": {
                    "vendor_id": "$vendor_id",
                    "invoice_number": "$invoice_number",
                    "entity": "$entity"
                },
                "count": {"$sum": 1},
                "ids": {"$push": "$_id"}
            }
        },
        {
            "$match": {"count": {"$gt": 1}}
        }
    ]
    
    duplicates = list(db.invoices.aggregate(pipeline))
    
    if duplicates:
        print(f"\n[WARNING] Found {len(duplicates)} duplicate invoice groups:")
        for dup in duplicates:
            print(f"  - Vendor: {dup['_id']['vendor_id']}")
            print(f"    Invoice #: {dup['_id']['invoice_number']}")
            print(f"    Count: {dup['count']}")
            print(f"    IDs: {dup['ids']}")
            print()
    else:
        print(f"\n[OK] No duplicates found in invoices collection")
    
    # Check indexes
    indexes = list(db.invoice_registry.list_indexes())
    print(f"\n[Registry Indexes]")
    for idx in indexes:
        print(f"  - {idx['name']}: {idx.get('key', {})}")
    
    client.close()
    print("\n" + "=" * 60)

if __name__ == "__main__":
    main()
