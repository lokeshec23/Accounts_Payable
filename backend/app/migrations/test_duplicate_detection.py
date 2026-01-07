"""
Test script to verify duplicate detection is working
"""
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from pymongo import MongoClient
from app.config.settings import settings
from app.utils.invoice_registry import check_registry_duplicate

def main():
    client = MongoClient(settings.MONGODB_URL)
    db = client[settings.DATABASE_NAME]
    
    print("=" * 60)
    print("Testing Duplicate Detection")
    print("=" * 60)
    
    # Test with FedEx invoice
    test_vendor_id = "V-12345"  # Replace with actual FedEx vendor ID
    test_invoice_number = "8-920-73191"
    test_entity = "Consolidated Analytics"  # Replace with your entity
    
    print(f"\nTesting duplicate check for:")
    print(f"  Vendor ID: {test_vendor_id}")
    print(f"  Invoice #: {test_invoice_number}")
    print(f"  Entity: {test_entity}")
    
    # Check registry
    result = check_registry_duplicate(db, test_vendor_id, test_invoice_number, test_entity)
    
    if result:
        print(f"\n✓ DUPLICATE FOUND in registry!")
        print(f"  Invoice ID: {result.get('_id')}")
        print(f"  Uploaded: {result.get('uploaded_at')}")
    else:
        print(f"\n✗ No duplicate found in registry")
    
    # Check actual invoices in DB
    invoices = list(db.invoices.find({
        "invoice_number": test_invoice_number
    }))
    
    print(f"\n[Database Check]")
    print(f"  Found {len(invoices)} invoices with number '{test_invoice_number}'")
    
    for inv in invoices:
        print(f"\n  Invoice ID: {inv.get('_id')}")
        print(f"    Vendor ID: {inv.get('vendor_id')}")
        print(f"    Vendor Name: {inv.get('vendor_name')}")
        print(f"    Entity: {inv.get('entity')}")
        print(f"    Uploaded: {inv.get('uploaded_at')}")
    
    # Check registry entries
    registry_entries = list(db.invoice_registry.find({
        "invoice_number": test_invoice_number
    }))
    
    print(f"\n[Registry Check]")
    print(f"  Found {len(registry_entries)} registry entries for '{test_invoice_number}'")
    
    for entry in registry_entries:
        print(f"\n  Vendor ID: {entry.get('vendor_id')}")
        print(f"    Invoice #: {entry.get('invoice_number')}")
        print(f"    Entity: {entry.get('entity')}")
        print(f"    Invoice Ref: {entry.get('invoice_id')}")
    
    client.close()
    print("\n" + "=" * 60)

if __name__ == "__main__":
    main()
