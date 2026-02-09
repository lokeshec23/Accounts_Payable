try:
    from app.database.database import SessionLocal
    from app.models.db_models import Invoice
    import json
    import sys

    print("DB Session initialized...")
    db = SessionLocal()
    try:
        print("Querying latest invoices...")
        invoices = db.query(Invoice).order_by(Invoice.id.desc()).limit(5).all()
        if not invoices:
            print("No invoices found in 'invoices' table.")
        for inv in invoices:
            print(f"\nInvoice ID: {inv.id} | Status: {inv.status}")
            print(f"Col Vendor ID: {inv.vendor_id}")
            print(f"Col Vendor Name: {inv.vendor_name}")
            
            if inv.extracted_data:
                try:
                    ext = json.loads(inv.extracted_data) if isinstance(inv.extracted_data, str) else inv.extracted_data
                    v_info = ext.get("vendor_info", {})
                    v_id_ext = v_info.get("vendor_id", {}).get("value")
                    v_name_ext = v_info.get("name", {}).get("value")
                    print(f"Extracted Vendor ID: {v_id_ext}")
                    print(f"Extracted Vendor Name: {v_name_ext}")
                except Exception as je:
                    print(f"JSON Parse Error: {je}")
            else:
                print("No extracted_data found.")

    except Exception as qe:
        print(f"Query Error: {qe}")
    finally:
        db.close()
except Exception as e:
    print(f"Fatal Error: {e}")
    import traceback
    traceback.print_exc()
