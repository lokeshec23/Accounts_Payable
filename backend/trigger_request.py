import requests
import time

try:
    response = requests.get("http://localhost:8014/api/master/entities")
    print(f"Status: {response.status_code}")
except Exception as e:
    print(f"Error: {e}")
