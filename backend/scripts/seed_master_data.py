import sys
import os
import asyncio

# Add the 'backend' directory to the Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database.database import SessionLocal
from app.database.init_db import seed_api_master_data

async def run_seed():
    print("\n" + "="*60)
    print("STARTING MASTER DATA SEED")
    print("="*60)
    
    db = SessionLocal()
    try:
        await seed_api_master_data(db)
        print("✓ Master data seed completed successfully.")
    except Exception as e:
        print(f"✗ Error during master data seed: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()
        
    print("="*60 + "\n")

if __name__ == "__main__":
    asyncio.run(run_seed())
