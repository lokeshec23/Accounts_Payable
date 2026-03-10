"""
Script to delete all __pycache__ directories inside the backend folder.
Usage: python del_pycache.py
"""

import os
import shutil

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))


def delete_pycache(root_dir):
    deleted = 0
    for dirpath, dirnames, _ in os.walk(root_dir):
        for dirname in dirnames:
            if dirname == "__pycache__":
                target = os.path.join(dirpath, dirname)
                try:
                    shutil.rmtree(target)
                    print(f"Deleted: {target}")
                    deleted += 1
                except Exception as e:
                    print(f"Failed: {target} ({e})")
    return deleted


if __name__ == "__main__":
    print(f"Scanning: {BACKEND_DIR}\n")
    count = delete_pycache(BACKEND_DIR)
    print(f"\nDone – removed {count} __pycache__ folder(s).")