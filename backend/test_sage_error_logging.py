
import sys
import os
import logging
import tempfile
from unittest.mock import MagicMock, patch

# Add the backend directory to path (this file IS inside backend/)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Get the shared 'application_error' logger by name — same object used by postapbill.py
# No need to import trace_middleware (which drags in FastAPI).
error_logger = logging.getLogger("application_error")
error_logger.setLevel(logging.ERROR)

from app.postapbill import post_ap_bill


def test_error_logging():
    print("Testing Sage error logging...")

    # Use a temp file so we control exactly where the log goes
    with tempfile.NamedTemporaryFile(mode='w', suffix='.log', delete=False) as tf:
        log_path = tf.name

    # Attach a fresh handler pointing at our temp file
    test_handler = logging.FileHandler(log_path, mode='w')
    test_handler.setLevel(logging.ERROR)
    test_handler.setFormatter(logging.Formatter('%(asctime)s | %(levelname)s | %(name)s | %(message)s'))
    error_logger.addHandler(test_handler)

    try:
        # Mock invoice object
        mock_invoice = MagicMock()
        mock_invoice.id = 777
        mock_invoice.entity = "Test Entity"

        # Force an exception in _get_access_token
        with patch('app.postapbill._get_access_token', side_effect=Exception("Connection timed out")):
            result = post_ap_bill(mock_invoice, "dummy.pdf")

            print(f"Result: {result}")
            assert result["success"] is False, f"Expected success=False, got {result}"
            assert "Connection timed out" in result["error"], \
                f"Expected 'Connection timed out' in error: {result['error']}"

        # Flush and close before reading
        test_handler.flush()
        test_handler.close()

        with open(log_path, 'r') as f:
            log_content = f.read()
            print(f"Log Content:\n{log_content}")

            assert "[PostAPBill] Failed to post AP Bill for invoice 777" in log_content, \
                f"Expected log message not found.\nLog was:\n{log_content}"
            assert "Connection timed out" in log_content, \
                f"'Connection timed out' not found in log.\nLog was:\n{log_content}"
            assert "Test Entity" in log_content, \
                f"'Test Entity' not found in log.\nLog was:\n{log_content}"

    finally:
        error_logger.removeHandler(test_handler)
        try:
            os.unlink(log_path)
        except Exception:
            pass

    print("✅ Passed: Sage errors are correctly logged to error_logger")


if __name__ == "__main__":
    try:
        test_error_logging()
        print("\n✨ Error logging verification passed!")
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
