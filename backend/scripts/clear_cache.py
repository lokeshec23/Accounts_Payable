import os
import shutil
from pathlib import Path

# Clear all __pycache__ directories
backend_dir = Path(__file__).resolve().parent.parent
print(f"Clearing cache in: {backend_dir}")

count = 0
for pycache_dir in backend_dir.rglob("__pycache__"):
    try:
        shutil.rmtree(pycache_dir)
        print(f"Removed: {pycache_dir}")
        count += 1
    except Exception as e:
        print(f"Error removing {pycache_dir}: {e}")

print(f"\nCleared {count} __pycache__ directories")
print("\nNow restart your backend server:")
print("  cd backend")
print("  python run.py")
