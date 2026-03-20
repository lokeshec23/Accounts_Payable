import sys
import os
import json
from unittest.mock import MagicMock

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.models.db_models import VendorWorkflow, CodificationWorkflow
from app.routes.workflow import get_required_approver_count

def test_workflow_logic():
    db = MagicMock()
    
    # 1. Test Vendor Workflow with 2 approvers
    v_wf = VendorWorkflow(
        id=1,
        vendor_id="V123",
        vendor_name="Test Vendor",
        approver_count=2,
        mandatory_approver_1="a1@example.com",
        mandatory_approver_2="a2@example.com",
        mandatory_approver_3="a3@example.com",
        is_threshold_enabled=False,
        entity="E1"
    )
    
    db.query().filter().first.return_value = v_wf
    
    res = get_required_approver_count(db, "Test Vendor", amount=100.0, entity="E1", force_vendor_id="V123")
    print("Vendor 2 Approvers:", res["assigned_approvers"])
    assert len(res["assigned_approvers"]) == 2
    assert res["assigned_approvers"] == ["a1@example.com", "a2@example.com"]

    # 2. Test Vendor Workflow with threshold enabled
    v_wf.is_threshold_enabled = True
    v_wf.amount_threshold = 500.0
    v_wf.threshold_approver = "threshold@example.com"
    
    # Amount below threshold
    res = get_required_approver_count(db, "Test Vendor", amount=100.0, entity="E1", force_vendor_id="V123")
    print("Vendor Threshold (NOT MET):", res["assigned_approvers"])
    assert len(res["assigned_approvers"]) == 2
    
    # Amount above threshold
    res = get_required_approver_count(db, "Test Vendor", amount=1000.0, entity="E1", force_vendor_id="V123")
    print("Vendor Threshold (MET):", res["assigned_approvers"])
    assert len(res["assigned_approvers"]) == 3
    assert "threshold@example.com" in res["assigned_approvers"]

    # 3. Test 5 approvers
    v_wf.approver_count = 5
    v_wf.mandatory_approver_4 = "a4@example.com"
    v_wf.mandatory_approver_5 = "a5@example.com"
    v_wf.is_threshold_enabled = False
    
    res = get_required_approver_count(db, "Test Vendor", amount=100.0, entity="E1", force_vendor_id="V123")
    print("Vendor 5 Approvers:", res["assigned_approvers"])
    assert len(res["assigned_approvers"]) == 5
    assert res["assigned_approvers"] == ["a1@example.com", "a2@example.com", "a3@example.com", "a4@example.com", "a5@example.com"]

    print("\nALL BACKEND LOGIC TESTS PASSED!")

if __name__ == "__main__":
    try:
        # Mocking get_cached_vendors and other utilities might be needed if they are called
        import app.routes.workflow as workflow_mod
        workflow_mod.get_cached_vendors = MagicMock(return_value=([], {}, {}))
        
        test_workflow_logic()
    except Exception as e:
        print(f"Test failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
