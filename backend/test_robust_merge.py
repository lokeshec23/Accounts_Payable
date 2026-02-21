import asyncio
import os
import sys
import json
from unittest.mock import MagicMock, AsyncMock

# Add the current directory to sys.path to allow imports from app
sys.path.append(os.getcwd())

from app.agents.extraction_agent import InvoiceExtractionAgent

async def test_robust_merge():
    agent = InvoiceExtractionAgent()
    
    # Mock azure data
    azure_data = {
        "VendorName": {"value": "Test Vendor", "confidence": 0.99},
        "InvoiceId": {"value": "INV-123", "confidence": 0.98},
        "InvoiceTotal": {"value": 100.0, "confidence": 0.97}
    }
    
    # Case 1: Empty LLM response
    empty_llm = {}
    
    merged = agent._merge_azure_and_llm(azure_data, empty_llm)
    
    print("--- Test Case 1: Empty LLM Response ---")
    vendor_name = merged.get("vendor_info", {}).get("name", {}).get("value")
    invoice_num = merged.get("invoice_details", {}).get("invoice_number", {}).get("value")
    total = merged.get("amounts", {}).get("total_invoice_amount", {}).get("value")
    
    print(f"Vendor Name: {vendor_name} (Expected: Test Vendor)")
    print(f"Invoice Number: {invoice_num} (Expected: INV-123)")
    print(f"Total Amount: {total} (Expected: 100.0)")
    
    success = (vendor_name == "Test Vendor" and invoice_num == "INV-123" and total == 100.0)
    print(f"Result: {'PASS' if success else 'FAIL'}")
    
    # Case 2: Partial LLM response with new fields
    partial_llm = {
        "vendor_info": {"phone": "123-456-7890"},
        "invoice_details": {"currency": "USD"}
    }
    
    merged2 = agent._merge_azure_and_llm(azure_data, partial_llm)
    
    print("\n--- Test Case 2: Partial LLM Response ---")
    vendor_phone = merged2.get("vendor_info", {}).get("phone", {}).get("value")
    currency = merged2.get("invoice_details", {}).get("currency", {}).get("value")
    
    print(f"Vendor Name: {merged2.get('vendor_info', {}).get('name', {}).get('value')} (Expected: Test Vendor)")
    print(f"Vendor Phone: {vendor_phone} (Expected: 123-456-7890)")
    print(f"Currency: {currency} (Expected: USD)")
    
    success2 = (merged2.get("vendor_info", {}).get("name", {}).get("value") == "Test Vendor" and 
                vendor_phone == "123-456-7890" and 
                currency == "USD")
    print(f"Result: {'PASS' if success2 else 'FAIL'}")

if __name__ == "__main__":
    # Mocking initialization to avoid requiring real env vars for this unit test
    InvoiceExtractionAgent.initialize_clients = MagicMock(return_value=(MagicMock(), MagicMock()))
    asyncio.run(test_robust_merge())
