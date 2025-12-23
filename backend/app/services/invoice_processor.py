import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, Any
from fastapi import UploadFile, HTTPException

# Fix the imports to use your app structure
from app.agents.extraction_agent import InvoiceExtractionAgent
from app.orchestrator.orchestrator import InvoiceOrchestrator

class InvoiceProcessor:
    def __init__(self):
        self.upload_dir = Path("uploads")
        self.output_dir = Path("output")
        self.upload_dir.mkdir(exist_ok=True)
        self.output_dir.mkdir(exist_ok=True)
        self.orchestrator = InvoiceOrchestrator()

    async def save_uploaded_file(self, file: UploadFile) -> Dict[str, str]:
        """Save uploaded file and return file info"""
        if not file.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail="Only PDF files are allowed")

        file_id = str(uuid.uuid4())
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{file_id}_{timestamp}_{file.filename}"
        file_path = self.upload_dir / filename

        contents = await file.read()
        with open(file_path, "wb") as f:
            f.write(contents)

        return {
            "file_id": file_id,
            "filename": filename,
            "file_path": str(file_path),
            "original_filename": file.filename
        }

    async def process_invoice_extraction(self, file_path: str) -> Dict[str, Any]:
        """Process invoice using your existing extraction pipeline"""
        try:
            result = await self.orchestrator.process_invoice(
                file_path, 
                output_dir=str(self.output_dir)
            )
            return result
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Extraction failed: {str(e)}")

    def cleanup_file(self, file_path: str):
        """Clean up uploaded file after processing"""
        try:
            path = Path(file_path)
            if path.exists():
                path.unlink()
        except Exception as e:
            print(f"Warning: Could not cleanup file {file_path}: {e}")