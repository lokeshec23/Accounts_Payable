import sys
import os
from pathlib import Path
import asyncio
import requests

# Test the /api/users/ endpoint with admin credentials

def test_admin_endpoint():
    # First, login as admin
    login_url = "http://localhost:8004/api/auth/login"
    login_data = {
        "email": "admin@example.com",
        "password": "admin123"
    }
    
    print("Logging in as admin...")
    login_response = requests.post(login_url, json=login_data)
    
    if login_response.status_code != 200:
        print(f"Login failed: {login_response.status_code}")
        print(f"Response: {login_response.text}")
        return
    
    token_data = login_response.json()
    print(f"Login successful!")
    print(f"Token: {token_data.get('access_token')[:50]}...")
    print(f"Role in token response: {token_data.get('role')}")
    
    # Now try to get users
    users_url = "http://localhost:8004/api/users/"
    headers = {
        "Authorization": f"Bearer {token_data['access_token']}"
    }
    
    print("\nFetching users...")
    users_response = requests.get(users_url, headers=headers)
    
    print(f"Status code: {users_response.status_code}")
    
    if users_response.status_code == 200:
        users = users_response.json()
        print(f"Success! Found {len(users)} users:")
        for user in users:
            print(f"  - {user.get('username')}: {user.get('role')} ({user.get('status')})")
    else:
        print(f"Failed: {users_response.status_code}")
        print(f"Response: {users_response.text}")

if __name__ == "__main__":
    test_admin_endpoint()
