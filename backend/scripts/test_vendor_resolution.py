
import sys
import os
import json
from unittest.mock import MagicMock, patch

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "app"))
sys.path.append(os.getcwd())

from app.ai.duplicate_detector import get_vendor_id_from_master
from app.models.db_models import ExcelFile, MasterDataChunk, VendorMetadata, Invoice

def test_vendor_resolution():
    print("--- Testing Vendor Resolution ---")
    
    # Mock DB Session
    db = MagicMock()
    
    # Mock Vendor Master File
    mock_file = MagicMock(id=1)
    db.query(ExcelFile).filter.return_value.first.return_value = mock_file
    
    # Mock Chunks
    rows = [
        {"Vendor ID": "V1", "Vendor Name": "GURU CABS", "Vendor Address": "123 Main St, Mumbai"},
        {"Vendor ID": "V2", "Vendor Name": "GURU CABS", "Vendor Address": "456 Side Ave, Bangalore"},
        {"Vendor ID": "V3", "Vendor Name": "RELIANCE", "Vendor Address": "Reliance Corporate Park"}
    ]
    mock_chunk = MagicMock(data_json=json.dumps(rows))
    db.query(MasterDataChunk).filter.return_value.order_by.return_value.all.return_value = [mock_chunk]
    
    # Cases to test:
    # 1. Exact Address Match for GURU CABS
    print("\nCase 1: Ambiguous Name, Exact Address match")
    v_id, v_name, grouping, details = get_vendor_id_from_master(
        db, "GURU CABS", "E1", "456 Side Ave, Bangalore"
    )
    print(f"Resolved to: {v_id} ({v_name}) | Source: {details.get('source')}")
    assert v_id == "V2"
    
    # 2. Historical Match for GURU CABS
    print("\nCase 2: Ambiguous Name, No Address match, but Historical data exists")
    with patch('app.ai.duplicate_detector._get_historical_vendor_id', return_value="V1"):
        # Mock metadata lookup for history
        mock_meta = MagicMock(official_name="GURU CABS (HIST)", vendor_id="V1", line_grouping="No")
        db.query(VendorMetadata).filter.return_value.first.return_value = mock_meta
        
        v_id, v_name, grouping, details = get_vendor_id_from_master(
            db, "GURU CABS", "E1", "Unknown Address"
        )
        print(f"Resolved to: {v_id} ({v_name}) | Source: {details.get('source')}")
        assert v_id == "V1"

    # 3. New Vendor (No History, No Address) - Should pick best AI match
    print("\nCase 3: Ambiguous Name, No Address, No History")
    with patch('app.ai.duplicate_detector._get_historical_vendor_id', return_value=None):
        db.query(VendorMetadata).filter.return_value.first.return_value = None
        
        v_id, v_name, grouping, details = get_vendor_id_from_master(
            db, "GURU CABS", "E1", "Unknown Address"
        )
        print(f"Resolved to: {v_id} ({v_name}) | Source: {details.get('source')}")
        assert v_id in ["V1", "V2"]

    print("\n--- All tests passed! ---")

if __name__ == "__main__":
    try:
        test_vendor_resolution()
    except Exception as e:
        print(f"Test Failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
