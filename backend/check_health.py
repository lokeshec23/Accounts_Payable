import requests
import sys

try:
    response = requests.get("http://localhost:8014/")
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.json()}")
    if response.status_code == 200:
        print("Health check passed!")
        sys.exit(0)
    else:
        print("Health check failed!")
        sys.exit(1)
except Exception as e:
    print(f"Health check failed with error: {e}")
    sys.exit(1)
