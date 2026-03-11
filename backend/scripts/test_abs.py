from reportlab.pdfgen import canvas
import os

file_path = r"c:\Users\ldna40063\Accounts_Payable\backend\output\test_absolute.pdf"
try:
    c = canvas.Canvas(file_path)
    c.drawString(100, 750, "Testing absolute path")
    c.save()
    print(f"SUCCESS: Created {file_path}")
except Exception as e:
    print(f"ERROR: {e}")
