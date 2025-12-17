
import os
import datetime

file_path = r"c:\Users\LDNA40063\Accounts_Payable\backend\app\routes\coding.py"

# The code that was missing
code_chunk = r"""

@router.get("/{invoice_id}", response_model=CodingResponse)
async def get_coding(
    invoice_id: str,
    current_user: UserResponse = Depends(get_current_user),
    entity: str = Depends(get_current_entity)
):
    db = get_database()

    invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if invoice.get("entity") != entity:
        raise HTTPException(status_code=403, detail="Access denied")

    coding = db.coding.find_one({"invoice_id": invoice_id})

    if not coding:
        print(f"DEBUG: No existing coding found for invoice {invoice_id}")
        vendor_name = get_vendor_name(invoice)
        extracted_data = invoice.get("extracted_data", {})
        # Handle case where Items might be direct list or value dict
        items_val = extracted_data.get("Items", {})
        
        items = []
        if isinstance(items_val, dict):
             items = items_val.get("value", [])
        elif isinstance(items_val, list):
             items = items_val
        
        print(f"DEBUG: Extracted vendor_name: '{vendor_name}'")
        print(f"DEBUG: Extracted items count: {len(items)}")

        if vendor_name and items:
            print("DEBUG: Calling get_coding_suggestions...")
            suggestions = get_coding_suggestions(db, vendor_name, items)
            if suggestions:
                print(f"DEBUG: Suggestions found: {len(suggestions)}")
                
                # Check if we should auto-save these suggestions
                items_with_gl_codes = [item for item in suggestions if item.gl_code]
                
                if items_with_gl_codes:
                    print(f"💾 AUTO-SAVING coding to database ({len(items_with_gl_codes)} items with GL codes)...")
                    
                    # Create coding document
                    coding_dict = {
                        "invoice_id": invoice_id,
                        "header_coding": "", # Default for auto-coding?
                        "line_items": [item.dict() for item in suggestions],
                        "created_at": datetime.utcnow(),
                        "updated_at": None,
                        "status": "auto-coded" 
                    }
                    
                    # Insert into DB
                    result = db.coding.insert_one(coding_dict)
                    
                    # Create workflow step
                    db.workflow_steps.insert_one({
                        "invoice_id": invoice_id,
                        "step_name": "Coding (Auto)",
                        "step_type": WorkflowStepType.CODING,
                        "user": "System (Auto-Coder)",
                        "status": WorkflowStepStatus.COMPLETED,
                        "timestamp": datetime.utcnow(),
                        "entity": entity
                    })
                    
                    created = db.coding.find_one({"_id": result.inserted_id})
                    created["id"] = str(created["_id"])
                    return CodingResponse(**created)
                
                else:
                    print("DEBUG: Returning suggestions (not saving yet)")
                    return CodingResponse(
                        id="suggested",
                        invoice_id=invoice_id,
                        created_at=datetime.utcnow(),
                        line_items=suggestions
                    )
            else:
                print("DEBUG: No suggestions returned")
        else:
             print("DEBUG: Skipping auto-coding (missing vendor or items)")

        raise HTTPException(status_code=404, detail="Coding data not found")

    print("DEBUG: Returning existing coding")
    coding["id"] = str(coding["_id"])
    return CodingResponse(**coding)
"""

print(f"Appending to {file_path}...")
try:
    with open(file_path, "a", encoding="utf-8") as f:
        f.write(code_chunk)
    print("SUCCESS: Code appended.")
except Exception as e:
    print(f"ERROR: {e}")
