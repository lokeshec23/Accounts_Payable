
import sys
import os
from unittest.mock import MagicMock

# Add backend to path
sys.path.insert(0, os.path.join(os.getcwd(), 'backend'))

from app.agents.extraction_agent import InvoiceExtractionAgent

def test_line_item_extraction_no_description():
    """Test that line items without descriptions are no longer filtered out."""
    agent = InvoiceExtractionAgent()
    
    # Mock item from Azure DI
    mock_item = MagicMock()
    mock_field_amount = MagicMock()
    mock_field_amount.value_currency.amount = 123.45
    mock_field_amount.confidence = 0.99
    mock_field_amount.bounding_regions = []
    mock_field_amount.spans = []
    
    mock_item.value_object = {
        "Amount": mock_field_amount
        # Description is missing
    }
    mock_item.bounding_regions = []

    # Run extraction
    result = agent._extract_single_line_item_working(mock_item, 1)
    
    # Verify result is not None
    assert result is not None, "Line item with missing description was filtered out!"
    assert result["amount"]["value"] == 123.45
    print("✅ Passed: Line item without description is preserved.")

def test_negative_value_extraction():
    """Test that bracketed/negative values are prioritised via structured fields."""
    agent = InvoiceExtractionAgent()
    
    # Mock field with both content and structured value
    mock_field = MagicMock()
    mock_field.content = "($100.00)"
    mock_field.value_currency.amount = -100.00
    mock_field.confidence = 0.99
    mock_field.bounding_regions = []
    mock_field.spans = []
    
    # Run field extraction
    result = agent._extract_line_item_field_working(mock_field)
    
    # Verify prioritisation of structured value
    assert result["value"] == -100.00, f"Expected -100.00, got {result['value']}"
    print("✅ Passed: Negative value correctly prioritised from structured currency field.")

    # Test with value_number
    mock_field_num = MagicMock()
    # Remove content to test fallback/prioritisation
    del mock_field_num.content
    mock_field_num.value_number = -50.0
    mock_field_num.confidence = 0.95
    mock_field_num.bounding_regions = []
    mock_field_num.spans = []
    
    result_num = agent._extract_line_item_field_working(mock_field_num)
    assert result_num["value"] == -50.0
    print("✅ Passed: Negative value correctly extracted from value_number.")

if __name__ == "__main__":
    try:
        # Mock initialization to avoid real client calls
        InvoiceExtractionAgent.initialize_clients = MagicMock(return_value=(None, None))
        
        test_line_item_extraction_no_description()
        test_negative_value_extraction()
        print("\n✨ All extraction logic tests passed!")
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
