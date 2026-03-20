import os
import sys

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.database.database import engine
from sqlalchemy import text

def alter_tables():
    with engine.begin() as conn:
        print("Altering vendor_workflows...")
        try:
            conn.execute(text("ALTER TABLE vendor_workflows ADD mandatory_approver_4 VARCHAR(200) NULL;"))
            print("Added mandatory_approver_4 to vendor_workflows")
        except Exception as e:
            print(f"Failed to add mandatory_approver_4 to vendor_workflows: {e}")
            
        try:
            conn.execute(text("ALTER TABLE vendor_workflows ADD mandatory_approver_5 VARCHAR(200) NULL;"))
            print("Added mandatory_approver_5 to vendor_workflows")
        except Exception as e:
            print(f"Failed to add mandatory_approver_5 to vendor_workflows: {e}")
            
        try:
            conn.execute(text("ALTER TABLE vendor_workflows ADD is_threshold_enabled BIT DEFAULT 0;"))
            print("Added is_threshold_enabled to vendor_workflows")
        except Exception as e:
            print(f"Failed to add is_threshold_enabled to vendor_workflows: {e}")
            
        print("Altering codification_workflows...")
        try:
            conn.execute(text("ALTER TABLE codification_workflows ADD mandatory_approver_4 VARCHAR(200) NULL;"))
            print("Added mandatory_approver_4 to codification_workflows")
        except Exception as e:
            print(f"Failed to add mandatory_approver_4 to codification_workflows: {e}")
            
        try:
            conn.execute(text("ALTER TABLE codification_workflows ADD mandatory_approver_5 VARCHAR(200) NULL;"))
            print("Added mandatory_approver_5 to codification_workflows")
        except Exception as e:
            print(f"Failed to add mandatory_approver_5 to codification_workflows: {e}")
            
        try:
            conn.execute(text("ALTER TABLE codification_workflows ADD is_threshold_enabled BIT DEFAULT 0;"))
            print("Added is_threshold_enabled to codification_workflows")
        except Exception as e:
            print(f"Failed to add is_threshold_enabled to codification_workflows: {e}")

if __name__ == "__main__":
    alter_tables()
    print("Done database updates.")
