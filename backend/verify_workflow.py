
import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.database.database import SessionLocal
from app.models.db_models import Invoice, WorkflowStep, WorkflowStepTypeEnum
from sqlalchemy import desc

def verify_workflow_steps():
    db = SessionLocal()
    try:
        # Get the latest invoice that was sage posted
        latest_sage_posted = db.query(Invoice).filter(Invoice.status == "sage_posted").order_by(Invoice.id.desc()).first()
        if not latest_sage_posted:
            print("No sage_posted invoices found to verify.")
            return

        print(f"Checking Invoice ID: {latest_sage_posted.id}")
        
        steps = db.query(WorkflowStep).filter(WorkflowStep.invoice_id == latest_sage_posted.id).all()
        found_sage_step = False
        for step in steps:
            print(f"Step: {step.step_name}, Type: {step.step_type}, Status: {step.status}")
            if step.step_type == WorkflowStepTypeEnum.SAGE_POSTED:
                found_sage_step = True
        
        if found_sage_step:
            print("\nSUCCESS: 'Posted to Sage' workflow step found!")
        else:
            print("\nFAILURE: 'Posted to Sage' workflow step NOT found.")
            
    finally:
        db.close()

if __name__ == "__main__":
    verify_workflow_steps()
