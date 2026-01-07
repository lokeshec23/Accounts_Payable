"""
Test script to debug quick extraction issues
"""
import os
import sys
from dotenv import load_dotenv

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

load_dotenv()

from app.ai.duplicate_detector import extract_vendor_and_invoice_number

# Test with a sample invoice file
test_file = input("Enter path to test PDF file: ").strip()

if not os.path.exists(test_file):
    print(f"❌ File not found: {test_file}")
    sys.exit(1)

print(f"\n🔍 Testing quick extraction on: {test_file}")
print(f"📍 Azure Endpoint: {os.getenv('AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT')}")
print(f"🔑 Azure Key: {'SET' if os.getenv('AZURE_DOCUMENT_INTELLIGENCE_KEY') else 'NOT SET'}")
print("\n" + "="*60)

vendor_name, invoice_number = extract_vendor_and_invoice_number(test_file)

print("\n" + "="*60)
print(f"✅ RESULTS:")
print(f"   Vendor Name: {vendor_name}")
print(f"   Invoice Number: {invoice_number}")
print("="*60)
