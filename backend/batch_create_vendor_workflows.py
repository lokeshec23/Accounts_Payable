import sys
import os
from datetime import datetime
import pandas as pd

# Add project root to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database.database import SessionLocal
from app.models.db_models import VendorWorkflow, User as UserDB


def load_vendors_from_excel(file_path):
    """
    Reads vendor data from Excel and converts to workflows list
    """
    try:
        df = pd.read_excel(file_path)

        # Debug: show columns
        print("Excel Columns:", list(df.columns))

        required_columns = ["Vendor #", "Vendor Name", "Approved By"]

        for col in required_columns:
            if col not in df.columns:
                raise ValueError(f"Missing required column: {col}")

        workflows = []

        for _, row in df.iterrows():
            if pd.isna(row["Vendor #"]):
                continue

            workflows.append({
                "vendor_id": str(row["Vendor #"]).strip(),
                "vendor_name": str(row["Vendor Name"]).strip(),
                "approver_name": str(row["Approved By"]).strip()
            })

        return workflows

    except Exception as e:
        print(f"Error reading Excel: {str(e)}")
        return []


def batch_create_vendor_workflows(workflows_list, entity="DEFAULT"):
    """
    Creates or updates vendor workflow records
    """
    db = SessionLocal()

    try:
        created_count = 0
        updated_count = 0
        skipped_count = 0

        # Cache users
        users = db.query(UserDB).all()
        users_map = {
            u.username.strip(): u.email
            for u in users
        }

        print(f"Loaded {len(users_map)} users")

        # Optional fix for known mismatches
        # Example:
        # users_map["Barbara"] = users_map.get("Barbara Goodwin")

        for wf_data in workflows_list:
            vendor_id = wf_data["vendor_id"]
            vendor_name = wf_data["vendor_name"]
            approver_name = wf_data["approver_name"]

            approver_email = users_map.get(approver_name)

            if not approver_email:
                print(f"Skipping: {vendor_id} (Approver not found: {approver_name})")
                skipped_count += 1
                continue

            existing_wf = db.query(VendorWorkflow).filter(
                VendorWorkflow.vendor_id == vendor_id,
                VendorWorkflow.entity == entity
            ).first()

            if existing_wf:
                existing_wf.vendor_name = vendor_name
                existing_wf.mandatory_approver_1 = approver_email
                existing_wf.approver_count = 1

                updated_count += 1
                print(f"Updated: {vendor_id}")

            else:
                new_wf = VendorWorkflow(
                    entity=entity,
                    vendor_id=vendor_id,
                    vendor_name=vendor_name,
                    mandatory_approver_1=approver_email,
                    approver_count=1,
                    created_at=datetime.utcnow()
                )

                db.add(new_wf)
                created_count += 1
                print(f"Created: {vendor_id}")

        db.commit()

        print("\n========== SUMMARY ==========")
        print(f"Created : {created_count}")
        print(f"Updated : {updated_count}")
        print(f"Skipped : {skipped_count}")
        print("=============================")

    except Exception as e:
        db.rollback()
        print(f"Error during batch: {str(e)}")

    finally:
        db.close()


if __name__ == "__main__":
    ENTITY_NAME = "Consolidated Analytics, Inc."

    # Update this path
    # FILE_PATH = os.path.join(os.path.dirname(__file__), "vendors.xlsx")
    FILE_PATH = "C:\\Users\\ldna40067\\Downloads\\Apex Approver Wise Vendor List_03262026.xlsx"

    print("Loading vendor data from Excel...")
    vendors_workflows = load_vendors_from_excel(FILE_PATH)

    if not vendors_workflows:
        print("No data loaded. Exiting.")
        sys.exit(1)

    print(f"Processing {len(vendors_workflows)} vendors...")
    batch_create_vendor_workflows(vendors_workflows, ENTITY_NAME)

    print("Done.")