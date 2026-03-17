
import sys
import os
import json
from unittest.mock import MagicMock, patch

# Add backend to path
sys.path.insert(0, os.path.join(os.getcwd(), 'backend'))

from app.postapbill import post_ap_bill

def test_dynamic_location_in_headers():
    print("Testing dynamic location in auth headers...")
    
    # Mock invoice object
    mock_invoice = MagicMock()
    mock_invoice.id = 999
    mock_invoice.file_path = "dummy.pdf"
    
    # Mock helpers to avoid real API calls
    with patch('app.postapbill._get_access_token', return_value="mock-token"), \
         patch('app.postapbill._create_attachment', return_value=("key123", "id123")), \
         patch('app.postapbill._upload_files'), \
         patch('app.postapbill._create_ap_bill') as mock_create_bill, \
         patch('os.path.exists', return_value=True):
        
        # Call with a specific location
        test_location = "999-SPECIAL"
        post_ap_bill(mock_invoice, "dummy_approval.pdf", location=test_location)
        
        # Verify that _create_ap_bill was called with headers containing the correct locationid
        args, kwargs = mock_create_bill.call_args
        headers = args[0]
        
        print(f"Auth Headers: {json.dumps(headers, indent=2)}")
        
        assert headers["locationid"] == test_location, f"Expected {test_location}, got {headers['locationid']}"
        print("✅ Passed: Dynamic location ID correctly passed to Sage headers.")

if __name__ == "__main__":
    try:
        test_dynamic_location_in_headers()
        print("\n✨ Dynamic location verification passed!")
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
