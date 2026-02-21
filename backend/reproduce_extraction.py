import asyncio
import os
import sys
import json
import logging
from datetime import datetime
from dotenv import load_dotenv

# Add the current directory to sys.path to allow imports from app
sys.path.append(os.getcwd())

load_dotenv()

# Configure logging to see what's happening
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("repro")

from app.agents.extraction_agent import InvoiceExtractionAgent, InvoiceState

async def run_reproduction():
    print("Starting reproducer...")
    agent = InvoiceExtractionAgent()
    
    # Use one of the files from the uploads directory
    test_file = "uploads/f1ca43ff-2f4a-4652-9986-59ca77fd7080_20260219_141526_fa769dfd-04bc-4f7d-a596-499a5838f22e_20260210_181426_Wonder yatching_Inv 1007_$1260_10.08.2025.pdf"
    
    if not os.path.exists(test_file):
        test_file = "backend/uploads/f1ca43ff-2f4a-4652-9986-59ca77fd7080_20260219_141526_fa769dfd-04bc-4f7d-a596-499a5838f22e_20260210_181426_Wonder yatching_Inv 1007_$1260_10.08.2025.pdf"
        if not os.path.exists(test_file):
            print(f"Error: Test file not found: {test_file}")
            return

    print(f"File found: {test_file}")
    
    state: InvoiceState = {
        "file_path": test_file,
        "raw_azure_response": None,
        "llm_prompt": None,
        "llm_raw_response": None,
        "extracted_data": {},
        "enhanced_data": {},
        "validated_data": {},
        "final_output": {},
        "errors": [],
        "processing_steps": []
    }
    
    print("Step 1: Extracting with Azure Document Intelligence...")
    try:
        state = await agent.extract_with_azure_doc_intel(state)
        print(f"Azure Extraction Done. Fields found: {list(state['extracted_data'].keys())}")
        if state['errors']:
            print(f"Azure Errors: {state['errors']}")
            return
    except Exception as e:
        print(f"Azure Exception: {e}")
        return

    print("Step 2: Enhancing with LLM...")
    try:
        state = await agent.enhance_with_llm(state)
        print("LLM Enhancement Done.")
        if state['errors']:
            print(f"LLM Errors: {state['errors']}")
            # Keep going to see what we got
    except Exception as e:
        print(f"LLM Exception: {e}")

    print("\n--- Final Extracted Data ---")
    print(json.dumps(state["enhanced_data"], indent=2))
    
    print("\nProcessing Steps:")
    for step in state["processing_steps"]:
        print(f"- {step}")

if __name__ == "__main__":
    asyncio.run(run_reproduction())
