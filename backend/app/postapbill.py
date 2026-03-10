import requests
import json
import base64
import uuid


# --------------------------------------------------
# CONFIG
# --------------------------------------------------

BASE_URL = "https://api.intacct.com/ia/api/v1"
TOKEN_URL = f"{BASE_URL}/oauth2/token"

CLIENT_ID = "3f83ee41b095ea8e5659.app.sage.com"
CLIENT_SECRET = "e49424e23f3df286f49e1f052e897ea944e3dce1"
USERNAME = "Apex@consolidatedanalytics-sandbox|201"

LOCATION_ID = "201"

PDF_FILES = [
    "gurucabs.pdf",
    "centrilogic_inv.pdf",
    "invoice_5027_approval.pdf"
]

# --------------------------------------------------
# 1. GET ACCESS TOKEN
# --------------------------------------------------

token_payload = {
    "grant_type": "client_credentials",
    "client_id": CLIENT_ID,
    "client_secret": CLIENT_SECRET,
    "username": USERNAME
}

headers = {
    "Content-Type": "application/json",
    "Accept": "application/json"
}

token_response = requests.post(TOKEN_URL, json=token_payload, headers=headers)
token_response.raise_for_status()

access_token = token_response.json()["access_token"]

print("✅ Access Token Received")

auth_headers = {
    "Authorization": f"Bearer {access_token}",
    "Content-Type": "application/json",
    "Accept": "application/json",
    "locationid": LOCATION_ID
}

# --------------------------------------------------
# 2. CREATE ATTACHMENT RECORD
# --------------------------------------------------

create_attachment_url = f"{BASE_URL}/objects/company-config/attachment"
attachment_id = f"invoice_{uuid.uuid4().hex[:8]}"

attachment_payload = {
    "id": attachment_id,
    "name": "apex_api_test_invoice",
    "folder": {
        "key": "55"
    }
}

response = requests.post(create_attachment_url, json=attachment_payload, headers=auth_headers)
#response.raise_for_status()
if not response.ok:
    print(response.status_code)
    print(response.text)
    exit()

attachment_key = response.json()["ia::result"]["key"]
attachment_id = response.json()["ia::result"]["id"]

print("✅ Attachment Created")
print("Attachment Key:", attachment_key)

# --------------------------------------------------
# 3. CONVERT FILES TO BASE64
# --------------------------------------------------

files_payload = []

for file_path in PDF_FILES:

    with open(file_path, "rb") as f:
        encoded = base64.b64encode(f.read()).decode("utf-8")

    files_payload.append({
        "name": file_path,
        "data": encoded
    })

# --------------------------------------------------
# 4. UPDATE ATTACHMENT WITH FILES
# --------------------------------------------------

update_attachment_url = f"{BASE_URL}/objects/company-config/attachment/{attachment_key}"

update_payload = {
    "files": files_payload
}

response = requests.patch(update_attachment_url, json=update_payload, headers=auth_headers)
response.raise_for_status()

print("✅ Files uploaded to attachment")

# --------------------------------------------------
# 5. CREATE AP BILL
# --------------------------------------------------

create_bill_url = f"{BASE_URL}/objects/accounts-payable/bill"

bill_payload = {
    "billNumber": "29445_APEX_18",
    "vendor": {
        "id": "V-28946"
    },
    "referenceNumber": "29445",
    "description": "Invoice Id: 29445 - spur global ventures",
    "createdDate": "2025-09-01",
    "postingDate": "2026-03-05",
    "dueDate": "2026-04-01",

    "attachment": {
        "id": attachment_id
    },

    "lines": [
        {
            "glAccount": {
                "id": "50010"
            },

            "txnAmount": "1218",

            "dimensions": {
                "location": {"id": "201"},
                "department": {"id": "D301"},
                "vendor": {"id": "V-28946"},
                "item": {"id": "VA1016"},
                "class": {"id": "42"}
            },

            "memo": "Guru Cabs invoice apex test api"
        }
    ]
}

response = requests.post(create_bill_url, json=bill_payload, headers=auth_headers)

if response.ok:
    print("✅ AP Bill Created Successfully")
    print(json.dumps(response.json(), indent=2))
else:
    print("❌ Failed to create bill")
    print(response.text)