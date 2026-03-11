
import sys
import os
import json
from unittest.mock import MagicMock, patch

# Add backend to path
sys.path.insert(0, os.path.join(os.getcwd(), 'backend'))

from app.postapbill import _create_ap_bill

def test_dimensions_handling():
    print("Testing dimensions handling in _create_ap_bill...")
    
    # Mock invoice object
    mock_invoice = MagicMock()
    mock_invoice.id = 123
    mock_invoice.vendor_id = "V-001"
    mock_invoice.invoice_number = "INV-123"
    mock_invoice.vendor_name = "Test Vendor"
    mock_invoice.uploaded_at = None
    mock_invoice.extracted_data = json.dumps({"invoice_details": {"invoice_date": {"value": "2026-03-11"}}})
    
    auth_headers = {"Authorization": "Bearer test-token"}
    attachment_id = "att-123"
    
    # Test case 1: Missing dimensions
    with patch('requests.post') as mock_post:
        mock_post.return_value.ok = True
        mock_post.return_value.json.return_value = {"success": True}
        
        _create_ap_bill(
            auth_headers, 
            mock_invoice, 
            attachment_id,
            gl_account="50010",
            location="201",
            dept=None,
            vendor_dim="V-001",
            item=None,
            class_lob=None
        )
        
        # Verify payload
        args, kwargs = mock_post.call_args
        payload = kwargs['json']
        dimensions = payload['lines'][0]['dimensions']
        
        print(f"Payload Dimensions (Missing): {json.dumps(dimensions, indent=2)}")
        
        assert "item" not in dimensions, "Item dimension should NOT be present if None"
        assert "department" not in dimensions, "Department dimension should NOT be present if None"
        assert "class" not in dimensions, "Class dimension should NOT be present if None"
        assert dimensions["location"]["id"] == "201"
        assert dimensions["vendor"]["id"] == "V-001"
        
        print("✅ Passed: Missing dimensions correctly excluded from payload.")

    # Test case 2: Present dimensions
    with patch('requests.post') as mock_post:
        mock_post.return_value.ok = True
        mock_post.return_value.json.return_value = {"success": True}
        
        _create_ap_bill(
            auth_headers, 
            mock_invoice, 
            attachment_id,
            gl_account="50010",
            location="201",
            dept="DEPT-1",
            vendor_dim="V-001",
            item="ITEM-123",
            class_lob="LOB-ABC"
        )
        
        # Verify payload
        args, kwargs = mock_post.call_args
        payload = kwargs['json']
        dimensions = payload['lines'][0]['dimensions']
        
        print(f"Payload Dimensions (Present): {json.dumps(dimensions, indent=2)}")
        
        assert dimensions["item"]["id"] == "ITEM-123"
        assert dimensions["department"]["id"] == "DEPT-1"
        assert dimensions["class"]["id"] == "LOB-ABC"
        
        print("✅ Passed: Present dimensions correctly included in payload.")

if __name__ == "__main__":
    try:
        test_dimensions_handling()
        print("\n✨ All AP Bill posting logic tests passed!")
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
