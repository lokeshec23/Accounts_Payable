import os
from typing import Dict, Any
from pathlib import Path
from app.agents.extraction_agent import InvoiceExtractionAgent, InvoiceState

class InvoiceOrchestrator:
    def __init__(self):
        self.extraction_agent = InvoiceExtractionAgent()

    def process_invoice(self, file_path: str, output_dir: str = "output") -> Dict[str, Any]:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Invoice file not found: {file_path}")

        os.makedirs(output_dir, exist_ok=True)

        print(f"Starting invoice processing: {file_path}")

        try:
            # Use the extraction agent directly
            initial_state: InvoiceState = InvoiceState(
                file_path=file_path,
                raw_azure_response=None,
                extracted_data={},
                enhanced_data={},
                validated_data={},
                final_output={},
                errors=[],
                processing_steps=[]
            )

            # Run extraction steps sequentially
            state = self.extraction_agent.extract_with_azure_doc_intel(initial_state)
            state = self.extraction_agent.enhance_with_llm(state)
            state = self.extraction_agent.validate_data(state)
            state = self.extraction_agent.generate_final_output(state)

            final_output = state["final_output"]

            print("Invoice processing completed successfully")
            return final_output

        except Exception as e:
            print(f"Invoice processing failed: {e}")
            raise

    def process_batch(self, input_folder: str, output_dir: str = "output", max_workers: int = 4):
        import glob
        from concurrent.futures import ThreadPoolExecutor, as_completed

        pdf_files = glob.glob(os.path.join(input_folder, "*.pdf"))

        if not pdf_files:
            print("No PDF files found in the input folder.")
            return []

        print(f"Starting batch processing for {len(pdf_files)} invoices")
        os.makedirs(output_dir, exist_ok=True)

        results = []
        errors = []

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_file = {
                executor.submit(self.process_invoice, pdf, output_dir): pdf
                for pdf in pdf_files
            }

            for future in as_completed(future_to_file):
                pdf_file = future_to_file[future]
                try:
                    result = future.result()
                    results.append(result)
                    print(f"Successfully processed: {pdf_file}")
                except Exception as e:
                    print(f"Error processing {pdf_file}: {str(e)}")
                    errors.append((pdf_file, str(e)))

        print("====== BATCH SUMMARY ======")
        print(f"Total invoices found: {len(pdf_files)}")
        print(f"Successfully processed: {len(results)}")
        print(f"Failed: {len(errors)}")

        if errors:
            print("Failed files:")
            for pdf, err in errors:
                print(f"  - {pdf}: {err}")

        return results