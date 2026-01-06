"""
Check if FedEx exists in the Master Data
"""
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from pymongo import MongoClient
from app.config.settings import settings
from app.ai.vector_matcher import find_best_vendor_match

def main():
    client = MongoClient(settings.MONGODB_URL)
    db = client[settings.DATABASE_NAME]
    
    print("=" * 60)
    print("Checking Master Data for 'FedEx'")
    print("=" * 60)
    
    # 1. Direct regex search
    print("\n[1] Search 'FedEx' in Vendor_Master collection:")
    regex_query = {"$regex": "FedEx", "$options": "i"}
    candidates = list(db.Vendor_Master.find({
        "$or": [
            {"VENDOR_NAME": regex_query},
            {"Vendor Name": regex_query},
            {"VendorName": regex_query},
            {"Name": regex_query}
        ]
    }).limit(5))
    
    if candidates:
        print(f"Found {len(candidates)} candidates:")
        for c in candidates:
            v_id = c.get("VENDOR_ID") or c.get("Vendor ID") or c.get("VendorID")
            v_name = c.get("VENDOR_NAME") or c.get("Vendor Name") or c.get("Name")
            print(f"  - ID: {v_id}, Name: {v_name}")
    else:
        print("No direct text match found for 'FedEx'.")

    # 2. Test vector/fuzzy matching
    print("\n[2] Testing matching logic for 'FedEx':")
    match_result = find_best_vendor_match(db, "FedEx")
    
    if match_result:
        print(f"Match Result: {match_result}")
    else:
        print("No match returned by find_best_vendor_match.")

    client.close()
    print("\n" + "=" * 60)

if __name__ == "__main__":
    main()
