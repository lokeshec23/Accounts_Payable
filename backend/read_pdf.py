try:
    import pdfplumber
    with pdfplumber.open(r"output\invoice_5027_approval.pdf") as pdf:
        for i, page in enumerate(pdf.pages):
            print(f"\n{'='*60}")
            print(f"PAGE {i+1}")
            print('='*60)
            print(page.extract_text() or "(no text extracted)")
except ImportError:
    # fallback to PyPDF2
    try:
        import PyPDF2
        with open(r"output\invoice_5027_approval.pdf", "rb") as f:
            reader = PyPDF2.PdfReader(f)
            for i, page in enumerate(reader.pages):
                print(f"\n{'='*60}")
                print(f"PAGE {i+1}")
                print('='*60)
                print(page.extract_text() or "(no text)")
    except ImportError:
        print("Neither pdfplumber nor PyPDF2 is installed.")
        print("Installing pdfplumber...")
        import subprocess
        subprocess.run(["pip", "install", "pdfplumber"], check=True)
        print("Run this script again after installation.")
