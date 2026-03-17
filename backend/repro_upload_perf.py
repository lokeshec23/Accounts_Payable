import pandas as pd
import numpy as np
import io
import time
from sqlalchemy import create_engine, Boolean, String
from sqlalchemy.orm import sessionmaker
import sys
import os

# Mocking the parts of the app we need
sys.path.append(os.getcwd())
from app.routes.master_data import normalize_column
from app.models.db_models import VendorMaster
from app.database.database import engine, SessionLocal

def benchmark_upload(file_path, tab_name):
    print(f"Starting benchmark for {tab_name} with {file_path}")
    
    start_time = time.time()
    
    # 1. Read file
    if file_path.endswith('.csv'):
        df = pd.read_csv(file_path)
    else:
        df = pd.read_excel(file_path)
    
    read_time = time.time() - start_time
    print(f"Read file in {read_time:.2f} seconds")
    
    # 2. Preparation (The logic we optimized)
    prep_start = time.time()
    
    model = VendorMaster
    model_cols = [c.name for c in model.__table__.columns if c.name not in ['id', 'created_at', 'updated_at']]
    
    df.columns = [normalize_column(c) for c in df.columns]
    existing_cols = [c for c in df.columns if c in model_cols]
    df = df[existing_cols].copy()
    
    for m_col in existing_cols:
        col_info = model.__table__.columns.get(m_col)
        if col_info is None: continue
            
        if isinstance(col_info.type, Boolean):
            bool_map = {
                "yes": True, "true": True, "1": True, "y": True, "t": True, "eligible": True,
                "no": False, "false": False, "0": False, "n": False, "f": False, "ineligible": False
            }
            def convert_to_bool(val):
                if pd.isna(val) or val is None: return None
                if isinstance(val, (bool, np.bool_)): return bool(val)
                if isinstance(val, (int, float, np.integer, np.floating)): return bool(val)
                if isinstance(val, str): return bool_map.get(val.strip().lower(), None)
                return None
            df[m_col] = df[m_col].apply(convert_to_bool)
        
        elif isinstance(col_info.type, String):
            def convert_to_str(val):
                if pd.isna(val) or val is None: return None
                if isinstance(val, float) and val.is_integer(): return str(int(val))
                return str(val)
            df[m_col] = df[m_col].apply(convert_to_str)

    if tab_name in ["Vendor_Master", "vendor_master", "Vendor"]:
        defaults = {
            "gst_eligibility": False,
            "tds_applicability": False,
            "workflow_applicable": True,
            "line_grouping": False
        }
        for col, val in defaults.items():
            if col in model_cols:
                if col not in df.columns: df[col] = val
                else: df[col] = df[col].fillna(val)

    df = df.replace({np.nan: None})
    records_to_insert = df.to_dict('records')
    
    prep_time = time.time() - prep_start
    print(f"Prepared {len(records_to_insert)} records in {prep_time:.2f} seconds")
    
    # 3. DB Insert
    db_start = time.time()
    db = SessionLocal()
    try:
        # We won't actually delete data in the benchmark to be safe, 
        # or we could use a transaction and rollback
        # db.query(model).delete() 
        
        CHUNK_SIZE = 2000
        for i in range(0, len(records_to_insert), CHUNK_SIZE):
            chunk = records_to_insert[i : i + CHUNK_SIZE]
            db.bulk_insert_mappings(model, chunk)
            db.flush()
        
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
    finally:
        db.close()
        
    db_time = time.time() - db_start
    print(f"Inserted into DB in {db_time:.2f} seconds")
    
    total_time = time.time() - start_time
    print(f"Total time: {total_time:.2f} seconds")

if __name__ == "__main__":
    benchmark_upload("large_vendor_master.xlsx", "Vendor_Master")
