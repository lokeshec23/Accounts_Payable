from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, status
from typing import List
from app.services.invoice_processor import InvoiceProcessor
from app.models.invoice import InvoiceCreate, InvoiceResponse, InvoiceStatus
from app.database.mongodb import get_database
from app.auth.jwt import get_current_user
from app.models.user import UserResponse
from datetime import datetime
import json

router = APIRouter()
invoice_processor = InvoiceProcessor()

@router.post("/upload", response_model=InvoiceResponse)
async def upload_invoice(
    file: UploadFile = File(...),
    current_user: UserResponse = Depends(get_current_user)
):
    """Upload and process invoice file"""
    db = get_database()
    
    try:
        # Save uploaded file
        file_info = await invoice_processor.save_uploaded_file(file)
        
        # Create invoice record in database
        invoice_data = InvoiceCreate(
            filename=file_info["filename"],
            original_filename=file_info["original_filename"],
            file_path=file_info["file_path"],
            uploaded_by=current_user.username,
            status=InvoiceStatus.WAITING_APPROVAL
        )
        
        # Insert into database
        invoice_dict = invoice_data.dict()
        invoice_dict["uploaded_at"] = datetime.utcnow()
        invoice_dict["extracted_data"] = {}
        invoice_dict["processing_steps"] = []
        
        result = db.invoices.insert_one(invoice_dict)
        invoice_id = str(result.inserted_id)
        
        try:
            # Process invoice extraction
            extraction_result = invoice_processor.process_invoice_extraction(
                file_info["file_path"]
            )
            
            # Update invoice with extraction results
            update_data = {
                "extracted_data": extraction_result.get("extracted_data", {}),
                "processing_steps": extraction_result.get("processing_steps", []),
                "validation_results": extraction_result.get("validation_results", {}),
                "confidence_score": extraction_result.get("metadata", {}).get("confidence_score", "low"),
                "processed_at": datetime.utcnow(),
                "status": InvoiceStatus.WAITING_APPROVAL
            }
            
            db.invoices.update_one(
                {"_id": result.inserted_id},
                {"$set": update_data}
            )
            
            # Cleanup uploaded file
            invoice_processor.cleanup_file(file_info["file_path"])
            
            # Return complete invoice data
            invoice_dict.update(update_data)
            invoice_dict["id"] = invoice_id
            
            return InvoiceResponse(**invoice_dict)
            
        except Exception as extraction_error:
            # Update invoice with error status
            db.invoices.update_one(
                {"_id": result.inserted_id},
                {"$set": {
                    "status": InvoiceStatus.REJECTED,
                    "processing_steps": [f"Extraction failed: {str(extraction_error)}"]
                }}
            )
            raise HTTPException(
                status_code=500,
                detail=f"Invoice processing failed: {str(extraction_error)}"
            )
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/", response_model=List[InvoiceResponse])
async def get_invoices(
    current_user: UserResponse = Depends(get_current_user),
    skip: int = 0,
    limit: int = 10,
    show_all: bool = True  # Default to True to show all invoices
):
    """Get invoices - all invoices if show_all=true, otherwise only current user's invoices"""
    db = get_database()
    
    # If show_all is True, get all invoices from all users
    # Otherwise, filter by current user's username
    if show_all:
        invoices = db.invoices.find().sort("uploaded_at", -1).skip(skip).limit(limit)
    else:
        invoices = db.invoices.find(
            {"uploaded_by": current_user.username}
        ).sort("uploaded_at", -1).skip(skip).limit(limit)
    
    invoice_list = []
    for invoice in invoices:
        invoice["id"] = str(invoice["_id"])
        invoice_list.append(InvoiceResponse(**invoice))
    
    return invoice_list

@router.get("/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Get specific invoice by ID"""
    db = get_database()
    
    from bson.objectid import ObjectId
    invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Allow viewing any invoice (removed ownership check for viewing)
    invoice["id"] = str(invoice["_id"])
    return InvoiceResponse(**invoice)

@router.put("/{invoice_id}/status")
async def update_invoice_status(
    invoice_id: str,
    status: InvoiceStatus,
    current_user: UserResponse = Depends(get_current_user)
):
    """Update invoice status"""
    db = get_database()
    
    from bson.objectid import ObjectId
    # Allow any user to update status (removed ownership check)
    result = db.invoices.update_one(
        {"_id": ObjectId(invoice_id)},
        {"$set": {"status": status}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    return {"message": "Invoice status updated successfully"}

@router.delete("/{invoice_id}")
async def delete_invoice(
    invoice_id: str,
    current_user: UserResponse = Depends(get_current_user)
):
    """Delete invoice by ID"""
    db = get_database()
    
    from bson.objectid import ObjectId
    
    # Check if invoice exists (removed ownership check for deletion)
    invoice = db.invoices.find_one({"_id": ObjectId(invoice_id)})
    
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Delete the invoice
    result = db.invoices.delete_one({"_id": ObjectId(invoice_id)})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    return {"message": "Invoice deleted successfully"}