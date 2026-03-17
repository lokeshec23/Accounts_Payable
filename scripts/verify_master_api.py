
import requests
import json

BASE_URL = "http://localhost:8014/api"
TOKEN = None # Need to get this or skip if local testing bypasses

def test_get_sheet_data(identifier):
    print(f"Testing get_sheet_data for {identifier}...")
    url = f"{BASE_URL}/master/sheet/{identifier}?skip=0&limit=5"
    response = requests.get(url)
    if response.status_code == 200:
        data = response.json()
        print(f"Success! Found {data['total']} rows.")
        if data['data']:
            print(f"First row: {json.dumps(data['data'][0], indent=2)}")
    else:
        print(f"Failed with status: {response.status_code}")
        print(response.text)

def test_add_row(identifier, row_data):
    print(f"Testing add_row for {identifier}...")
    url = f"{BASE_URL}/master/sheet/{identifier}/add"
    response = requests.post(url, json=row_data)
    if response.status_code == 200:
        print(f"Success! Row added.")
    else:
        print(f"Failed with status: {response.status_code}")
        print(response.text)

if __name__ == "__main__":
    # Test GL Master
    test_get_sheet_data("GL")
    
    # Test Add GL Row (with pretty names as frontend would send)
    gl_row = {
        "Account Number": "99999",
        "Title": "Test Account",
        "Require Department": "Yes",
        "Disallow Direct Posting": "No"
    }
    test_add_row("GL", gl_row)
    
    # Verify it was added and mapped correctly
    test_get_sheet_data("GL")
