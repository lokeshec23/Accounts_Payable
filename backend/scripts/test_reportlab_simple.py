from reportlab.pdfgen import canvas
from pathlib import Path
import os

try:
    output_dir = Path("backend/output")
    output_dir.mkdir(parents=True, exist_ok=True)
    file_path = output_dir / "test_reportlab.pdf"
    
    c = canvas.Canvas(str(file_path))
    c.drawString(100, 750, "Hello, ReportLab is working!")
    c.save()
    
    if file_path.exists():
        print(f"SUCCESS: Created {file_path}")
        print(f"Absolute path: {file_path.resolve()}")
    else:
        print("FAILED: File does not exist after c.save()")
except Exception as e:
    print(f"ERROR: {e}")
