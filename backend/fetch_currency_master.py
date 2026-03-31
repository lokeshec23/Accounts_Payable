import httpx
import asyncio
import os
import json
from dotenv import load_dotenv

load_dotenv()

#Toggle RAW printing
PRINT_RAW = True   # Set False in production


# -------------------------------
#HELPER FUNCTION
# -------------------------------
def extract_key(value):
    """Safely extract 'key' from dict or return string"""
    if isinstance(value, dict):
        return value.get("key")
    return value


# -------------------------------
# MAIN FUNCTION
# -------------------------------
async def fetch_exchange_rates():
    base_url = os.getenv("SAGE_BASE_URL")
    token_url = os.getenv("SAGE_TOKEN_URL")
    client_id = os.getenv("SAGE_CLIENT_ID")
    client_secret = os.getenv("SAGE_CLIENT_SECRET")
    username = os.getenv("SAGE_USERNAME")

    async with httpx.AsyncClient(timeout=60.0) as client:
        # -------------------------------
        # AUTHENTICATION
        # -------------------------------
        print("\n Authenticating...")

        auth_payload = {
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
            "username": username
        }

        auth_resp = await client.post(token_url, json=auth_payload)
        auth_resp.raise_for_status()

        token = auth_resp.json().get("access_token")
        if not token:
            raise Exception("Failed to get access token")

        print("Auth success")

        # Extract location ID
        location_id = "201"
        if "|" in username:
            location_id = username.split("|")[-1].strip()

        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "locationid": location_id
        }

        # -------------------------------
        # STEP 1: GET ALL KEYS with Query API
        # -------------------------------
        print("\n Fetching exchange rate line keys via Query API...")
        
        all_keys_data = []
        page_size = 1000
        query_url = f"{base_url}/services/core/query"
        query_body = {
            "object": "company-config/exchange-rate-line",
            "fields": ["key", "exchangeRate.key"],
            "start": 1,
            "size": page_size
        }

        # Initial call
        list_resp = await client.post(query_url, json=query_body, headers=headers)
        list_resp.raise_for_status()
        
        res_json = list_resp.json()
        batch = res_json.get("ia::result", [])
        meta = res_json.get("ia::meta", {})
        total_count = meta.get("totalCount", 0)
        
        all_keys_data.extend(batch)
        
        if total_count > page_size:
            for start in range(page_size + 1, total_count + 1, page_size):
                print(f" Fetching start {start}...")
                query_body["start"] = start
                r = await client.post(query_url, json=query_body, headers=headers)
                if r.is_success:
                    batch_raw = r.json().get("ia::result", [])
                    if batch_raw:
                        all_keys_data.extend(batch_raw)

        keys = [item.get("key") for item in all_keys_data if item.get("key")]
        print(f" Found {len(keys)} exchange rate line records (Total Count: {total_count})")

        # -------------------------------
        # STEP 2: FETCH DETAILS (Concurrent)
        # -------------------------------
        exchange_rate_cache = {}
        all_records = []
        semaphore = asyncio.Semaphore(15)

        async def process_key(key):
            async with semaphore:
                try:
                    # Fetch exchange-rate-line
                    detail_url = f"{base_url}/objects/company-config/exchange-rate-line/{key}"
                    detail_resp = await client.get(detail_url, headers=headers)
                    detail_resp.raise_for_status()

                    raw_detail = detail_resp.json()
                    record = raw_detail.get("ia::result", {})

                    if not record:
                        return

                    # Extract exchangeRate key
                    exchange_rate_field = record.get("exchangeRate")
                    if isinstance(exchange_rate_field, dict):
                        exchange_rate_key = exchange_rate_field.get("key")
                    else:
                        exchange_rate_key = exchange_rate_field

                    if not exchange_rate_key:
                        return

                    # CACHE CHECK / PARENT FETCH
                    if exchange_rate_key in exchange_rate_cache:
                        from_currency, to_currency = exchange_rate_cache[exchange_rate_key]
                    else:
                        rate_url = f"{base_url}/objects/company-config/exchange-rate/{exchange_rate_key}"
                        rate_resp = await client.get(rate_url, headers=headers)
                        rate_resp.raise_for_status()
                        rate_data = rate_resp.json().get("ia::result", {})

                        from_currency = extract_key(rate_data.get("fromCurrency"))
                        to_currency = extract_key(rate_data.get("toCurrency"))
                        exchange_rate_cache[exchange_rate_key] = (from_currency, to_currency)

                    if not from_currency or not to_currency:
                        return

                    rate = record.get("rate")
                    date = record.get("effectiveStartDate")

                    all_records.append({
                        "from_currency": from_currency,
                        "to_currency": to_currency,
                        "rate": rate,
                        "date": date
                    })
                    print(f" Synced: {from_currency} → {to_currency} | Rate: {rate} | Date: {date}")

                except Exception as e:
                    print(f" Failed for key {key}: {repr(e)}")

        print(f"\n Processing {len(keys)} records concurrently...")
        await asyncio.gather(*[process_key(k) for k in keys])

        # -------------------------------
        # SORT RESULTS
        # -------------------------------
        all_records.sort(key=lambda x: x["date"] or "", reverse=True)

        print(f"\n Total valid records: {len(all_records)}")

        return all_records


# -------------------------------
#  RUN SCRIPT
# -------------------------------
if __name__ == "__main__":
    data = asyncio.run(fetch_exchange_rates())

    print("\n Sample Data:")
    for d in data[:5]:
        print(d)