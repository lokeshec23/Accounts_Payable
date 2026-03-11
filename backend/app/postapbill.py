import logging
import os
import base64
import uuid

import requests

logger = logging.getLogger("ai_app")

# --------------------------------------------------
# CONFIG
# --------------------------------------------------

BASE_URL = "https://api.intacct.com/ia/api/v1"
TOKEN_URL = f"{BASE_URL}/oauth2/token"

CLIENT_ID = "3f83ee41b095ea8e5659.app.sage.com"
CLIENT_SECRET = "e49424e23f3df286f49e1f052e897ea944e3dce1"
USERNAME = "Apex@consolidatedanalytics-sandbox|201"

LOCATION_ID = "201"
ATTACHMENT_FOLDER_KEY = "55"


# --------------------------------------------------
# PUBLIC ENTRY POINT
# --------------------------------------------------

def post_ap_bill(
    invoice, 
    pdf_path: str,
    gl_account: str = "50010",
    location: str = LOCATION_ID,
    dept: str = None,
    vendor_dim: str = None,
    item: str = None,
    class_lob: str = None
) -> dict:
    """
    Post an AP Bill to Sage Intacct after a final invoice approval.

    Args:
        invoice:  SQLAlchemy Invoice ORM object (fully approved).
        pdf_path: Absolute path to the generated approval PDF.
        gl_account: GL Account ID.
        location: Location ID.
        dept: Department ID.
        vendor_dim: Vendor ID for dimensions.
        item: Item ID.
        class_lob: Class (LOB) ID.

    Returns:
        dict with keys 'success' (bool) and 'data' (API response) or 'error'.
    """
    try:
        # ── 1. Authenticate ──────────────────────────────────────────────────
        access_token = _get_access_token()
        auth_headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "locationid": LOCATION_ID,
        }
        logger.info(f"[PostAPBill] Authenticated with Sage Intacct for invoice {invoice.id}")

        # ── 2. Create attachment record ──────────────────────────────────────
        attachment_key, attachment_id = _create_attachment(
            auth_headers,
            name=f"Invoice_{invoice.id}_{invoice.invoice_number or 'approval'}",
        )
        logger.info(f"[PostAPBill] Attachment created: key={attachment_key}, id={attachment_id}")

        # ── 3. Build PDF file list ───────────────────────────────────────────
        #  • The original invoice PDF (invoice.file_path)
        #  • The generated approval PDF (pdf_path)
        pdf_files = []
        if invoice.file_path and os.path.exists(invoice.file_path):
            pdf_files.append(invoice.file_path)
        else:
            logger.warning(
                f"[PostAPBill] Original invoice file not found at '{invoice.file_path}'; skipping."
            )
        if pdf_path and os.path.exists(pdf_path):
            pdf_files.append(pdf_path)
        else:
            logger.warning(
                f"[PostAPBill] Approval PDF not found at '{pdf_path}'; skipping."
            )

        # ── 4. Upload files to attachment ────────────────────────────────────
        if pdf_files:
            _upload_files(auth_headers, attachment_key, pdf_files)
            logger.info(f"[PostAPBill] Uploaded {len(pdf_files)} file(s) to attachment {attachment_key}")
        else:
            logger.warning("[PostAPBill] No PDF files to attach.")

        # ── 5. Create AP Bill ────────────────────────────────────────────────
        bill_response = _create_ap_bill(
            auth_headers, 
            invoice, 
            attachment_id,
            gl_account=gl_account,
            location=location,
            dept=dept,
            vendor_dim=vendor_dim,
            item=item,
            class_lob=class_lob
        )
        logger.info(f"[PostAPBill] AP Bill created successfully for invoice {invoice.id}")
        return {"success": True, "data": bill_response}

    except Exception as exc:
        logger.error(
            f"[PostAPBill] Failed to post AP Bill for invoice {invoice.id}: {exc}"
        )
        return {"success": False, "error": str(exc)}


# --------------------------------------------------
# PRIVATE HELPERS
# --------------------------------------------------

def _get_access_token() -> str:
    token_payload = {
        "grant_type": "client_credentials",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "username": USERNAME,
    }
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    resp = requests.post(TOKEN_URL, json=token_payload, headers=headers, timeout=30)
    resp.raise_for_status()
    return resp.json()["access_token"]


def _create_attachment(auth_headers: dict, name: str) -> tuple:
    """Create a Sage Intacct attachment record. Returns (key, id)."""
    attachment_id = f"ap_{uuid.uuid4().hex[:8]}"
    payload = {
        "id": attachment_id,
        "name": name,
        "folder": {"key": ATTACHMENT_FOLDER_KEY},
    }
    url = f"{BASE_URL}/objects/company-config/attachment"
    resp = requests.post(url, json=payload, headers=auth_headers, timeout=30)
    if not resp.ok:
        raise RuntimeError(
            f"Failed to create attachment: {resp.status_code} — {resp.text}"
        )
    result = resp.json()["ia::result"]
    return result["key"], result["id"]


def _upload_files(auth_headers: dict, attachment_key: str, file_paths: list) -> None:
    """Base64-encode and upload PDF files to an existing attachment."""
    files_payload = []
    for fp in file_paths:
        with open(fp, "rb") as f:
            encoded = base64.b64encode(f.read()).decode("utf-8")
        files_payload.append({"name": os.path.basename(fp), "data": encoded})

    url = f"{BASE_URL}/objects/company-config/attachment/{attachment_key}"
    resp = requests.patch(url, json={"files": files_payload}, headers=auth_headers, timeout=60)
    resp.raise_for_status()

def _create_ap_bill(
    auth_headers: dict, 
    invoice, 
    attachment_id: str,
    gl_account: str,
    location: str,
    dept: str,
    vendor_dim: str,
    item: str,
    class_lob: str
) -> dict:
    """POST an AP Bill to Sage Intacct and return the API response JSON."""
    import json as _json
    from datetime import datetime, timedelta

    # --------------------------------------------------
    # Extract total amount
    # --------------------------------------------------
    total_amount = "0"

    # 1. Fetch exactly the same way as PDF generation
    try:
        from app.services.pdf_service import _extract_total
        extracted_str = invoice.extracted_data
        pdf_amt_str = _extract_total(extracted_str)

        if pdf_amt_str and pdf_amt_str != "—":
            clean_amt = str(pdf_amt_str).replace(",", "").replace("$", "").replace("€", "").replace("£", "").strip()
            import re
            match = re.search(r'-?\d+(\.\d+)?', clean_amt)
            if match:
                total_float = float(match.group())
                if total_float.is_integer():
                    total_amount = str(int(total_float))
                else:
                    total_amount = str(total_float)

    except Exception as e:
        logger.warning(f"[PostAPBill] Error getting total amount from PDF service logic: {e}")

    # --------------------------------------------------
    # Vendor and invoice details
    # --------------------------------------------------
    vendor_id = invoice.vendor_id or ""
    invoice_number = invoice.invoice_number or f"INV_{invoice.id}"
    description = f"Invoice Id: {invoice.id} - {invoice.vendor_name or vendor_id}"

    # --------------------------------------------------
    # Date calculation
    # --------------------------------------------------
    from dateutil.parser import parse
    
    current_date = datetime.utcnow()
    posting_date_str = current_date.strftime("%Y-%m-%d")
    
    base_date = invoice.uploaded_at if invoice.uploaded_at else current_date
    due_date = base_date + timedelta(days=30)
    
    try:
        ed = _json.loads(invoice.extracted_data) if isinstance(invoice.extracted_data, str) else (invoice.extracted_data or {})
        inv_details = ed.get("invoice_details", {})
        
        inv_date_str = inv_details.get("invoice_date", {}).get("value")
        due_date_str_ext = inv_details.get("due_date", {}).get("value")
        
        if inv_date_str:
            try:
                base_date = parse(str(inv_date_str), fuzzy=True)
            except Exception:
                pass
                
        if due_date_str_ext:
            try:
                due_date = parse(str(due_date_str_ext), fuzzy=True)
            except Exception:
                due_date = base_date + timedelta(days=30)
        else:
            due_date = base_date + timedelta(days=30)
            
    except Exception as e:
        logger.warning(f"[PostAPBill] Error parsing dates: {e}")

    base_date_str = base_date.strftime("%Y-%m-%d")
    due_date_str = due_date.strftime("%Y-%m-%d")

    # --------------------------------------------------
    # Normalize GL account
    # --------------------------------------------------
    gl_account_clean = str(gl_account).strip() if gl_account else ""

    if gl_account_clean.lower() in ["none", "null", ""]:
        gl_account_clean = "50010"
        
    if " - " in gl_account_clean:
        gl_account_clean = gl_account_clean.split(" - ", 1)[0].strip()

    # --------------------------------------------------
    # Dimensions
    # --------------------------------------------------
    # Helper to extract just the ID part if the string is formatted "ID - Description"
    def _extract_id(val: str) -> str:
        if not val:
            return ""
        val = str(val).strip()
        if " - " in val:
            return val.split(" - ", 1)[0].strip()
        # Fallback for "ID-Description" without spaces if needed
        return val

    dimensions = {
        "location": {"id": _extract_id(location)} if location else {"id": LOCATION_ID},
        "department": {"id": _extract_id(dept)} if dept else None,
        "vendor": {"id": str(vendor_dim)} if vendor_dim else None,
        "item": {"id": _extract_id(item)} if item else None,
        "class": {"id": _extract_id(class_lob)} if class_lob else None
    }
    
    # Remove empty dimension keys so Sage Intacct doesn't fail
    dimensions = {k: v for k, v in dimensions.items() if v is not None}
    
    print("----- DIMENSIONS -----")
    print(_json.dumps(dimensions, indent=2))

    # --------------------------------------------------
    # Bill payload
    # --------------------------------------------------
    bill_payload = {
        "billNumber": f"{invoice_number}-{invoice.id}",
        "vendor": {
            "id": str(vendor_id)
        },
        "referenceNumber": str(invoice_number),
        "description": description,
        "createdDate": base_date_str,
        "postingDate": posting_date_str,
        "dueDate": due_date_str,

        "attachment": {
            "id": str(attachment_id)
        },

        "lines": [
            {
                "glAccount": {
                    "id": gl_account_clean
                },

                "txnAmount": str(total_amount),

                "dimensions": dimensions,

                "memo": description
            }
        ]
    }

    # Debug log
    logger.info("SAGE BILL PAYLOAD:")
    logger.info(_json.dumps(bill_payload, indent=2))
    
    print("----- BILL PAYLOAD -----")
    print(_json.dumps(bill_payload, indent=2))

    # --------------------------------------------------
    # Call Sage API
    # --------------------------------------------------
    url = f"{BASE_URL}/objects/accounts-payable/bill"
    resp = requests.post(url, json=bill_payload, headers=auth_headers, timeout=30)

    if not resp.ok:
        error_msg = resp.text
        try:
            error_data = resp.json()
            error_details = error_data.get("ia::result", {}).get("ia::error", {}).get("details", [])
            messages = [d.get("message") for d in error_details if d.get("message")]
            if messages:
                error_msg = " | ".join(messages)
        except Exception:
            pass
            
        raise RuntimeError(
            f"Failed to create AP Bill: {resp.status_code} — {error_msg}"
        )

    return resp.json()