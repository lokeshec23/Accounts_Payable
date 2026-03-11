# agents/extraction_agent.py
import os
import json
import pandas as pd
from datetime import datetime
from typing import Dict, Any, List, TypedDict, Optional
from dotenv import load_dotenv
from azure.ai.documentintelligence.aio import DocumentIntelligenceClient
from azure.ai.documentintelligence.models import AnalyzeResult, AnalyzeDocumentRequest
from azure.core.credentials import AzureKeyCredential
from langchain_openai import AzureChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

load_dotenv()

class InvoiceState(TypedDict):
    file_path: str
    raw_azure_response: Optional[Dict[str, Any]]
    llm_prompt: Optional[str]
    llm_raw_response: Optional[str]
    extracted_data: Dict[str, Any]
    enhanced_data: Dict[str, Any]
    validated_data: Dict[str, Any]
    final_output: Dict[str, Any]
    errors: List[str]
    processing_steps: List[str]

class InvoiceExtractionAgent:
    def __init__(self):
        self.doc_intel_client, self.llm = self.initialize_clients()

    def initialize_clients(self):
        try:
            doc_intel_client = DocumentIntelligenceClient(
                endpoint=os.getenv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT"),
                credential=AzureKeyCredential(os.getenv("AZURE_DOCUMENT_INTELLIGENCE_KEY"))
            )

            llm = AzureChatOpenAI(
                azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT"),
                api_key=os.getenv("AZURE_OPENAI_API_KEY"),
                api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-01"),
                azure_deployment=os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME"),
                temperature=0.1,
                max_tokens=4000
            )

            print("Azure clients initialized successfully")
            return doc_intel_client, llm

        except Exception as e:
            print(f"Failed to initialize Azure clients: {e}")
            raise

    async def extract_with_azure_doc_intel(self, state: InvoiceState) -> InvoiceState:
        try:
            import time
            start_time = time.time()
            state["processing_steps"].append("Azure Document Intelligence Extraction Started")
            file_path = state["file_path"]

            print(f"Processing file: {file_path}")

            with open(file_path, "rb") as document:
                poller = await self.doc_intel_client.begin_analyze_document(
                    "prebuilt-invoice",
                    AnalyzeDocumentRequest(bytes_source=document.read())
                )
                result: AnalyzeResult = await poller.result()
            
            duration = time.time() - start_time
            print(f"Azure Document Intelligence Extraction took {duration:.2f}s")

            raw_response = self._serialize_azure_response(result)
            state["raw_azure_response"] = raw_response

            extracted_data = self._parse_azure_response_advanced(result)
            state["extracted_data"] = extracted_data

            state["processing_steps"].append("Azure Document Intelligence Extraction Completed")
            print(f"Azure fields captured: {list(extracted_data.keys())}")

            return state

        except Exception as e:
            error_msg = f"Azure Document Intelligence extraction failed: {str(e)}"
            print(error_msg)
            state["errors"].append(error_msg)
            state["processing_steps"].append(error_msg)
            return state

    def _serialize_azure_response(self, result: AnalyzeResult) -> Dict[str, Any]:
        try:
            serialized: Dict[str, Any] = {
                "api_version": getattr(result, 'api_version', None),
                "model_id": getattr(result, 'model_id', None),
                "content": getattr(result, 'content', '')[:4000] + "..." if getattr(result, 'content', '') else '',
            }

            if hasattr(result, 'documents') and result.documents:
                documents_data = []

                for doc in result.documents:
                    doc_data: Dict[str, Any] = {
                        "doc_type": getattr(doc, 'doc_type', None),
                        "confidence": getattr(doc, 'confidence', None),
                        "fields": {}
                    }

                    if hasattr(doc, 'fields') and doc.fields:
                        for field_name, field_value in doc.fields.items():

                            # ✅ bounding regions
                            bounding_regions = []
                            if hasattr(field_value, 'bounding_regions') and field_value.bounding_regions:
                                for region in field_value.bounding_regions:
                                    polygon_points: List[float] = []
                                    if hasattr(region, 'polygon') and region.polygon:
                                        try:
                                            if region.polygon and hasattr(region.polygon[0], 'x'):
                                                for point in region.polygon:
                                                    polygon_points.extend([
                                                        getattr(point, 'x', 0),
                                                        getattr(point, 'y', 0)
                                                    ])
                                            else:
                                                polygon_points = list(region.polygon)
                                        except Exception:
                                            polygon_points = []

                                    bounding_regions.append({
                                        "page_number": getattr(region, 'page_number', 1),
                                        "polygon": polygon_points if polygon_points else None
                                    })

                            # ✅ spans (MUST be here)
                            spans = None
                            if hasattr(field_value, "spans") and field_value.spans:
                                spans = [
                                    {"offset": s.offset, "length": s.length}
                                    for s in field_value.spans
                                ]

                            field_data = {
                                "content": getattr(field_value, 'content', None),
                                "confidence": getattr(field_value, 'confidence', None),
                                "value": getattr(field_value, 'value', None),
                                "bounding_regions": bounding_regions if bounding_regions else None,
                                "spans": spans
                            }

                            doc_data["fields"][field_name] = field_data

                    documents_data.append(doc_data)

                serialized["documents"] = documents_data

            return serialized

        except Exception as e:
            print(f"Error serializing Azure response: {e}")
            return {"error": f"Failed to serialize response: {str(e)}"}

    def _parse_azure_response_advanced(self, result: AnalyzeResult) -> Dict[str, Any]:
        import time
        parse_start = time.time()
        extracted_data: Dict[str, Any] = {}

        if not result.documents:
            print("No documents found in Azure response")
            return extracted_data

        invoice_doc = result.documents[0]
        fields = invoice_doc.fields if hasattr(invoice_doc, 'fields') else {}

        print(f"Azure found {len(fields)} raw fields")

        azure_field_names = [
            "VendorName", "VendorAddress", "VendorTaxId", "VendorPhoneNumber",
            "CustomerName", "CustomerAddress", "CustomerAddressRecipient",
            "BillingAddress", "BillingAddressRecipient",
            "ShippingAddress", "ShippingAddressRecipient",
            "CustomerTaxId", "CustomerId",
            "InvoiceId", "InvoiceDate", "DueDate", "PurchaseOrder", "PaymentTerm",
            "SubTotal", "TotalTax", "InvoiceTotal", "AmountDue", "PreviousUnpaidBalance",
            "AmountPaid",
            "ServiceStartDate", "ServiceEndDate",
        ]

        for az_name in azure_field_names:
            value_data = self._extract_field_value_with_bounding(fields, az_name)
            if value_data is None:
                continue
            extracted_data[az_name] = value_data

        items_data = self._extract_azure_items_working(fields)
        if items_data:
            extracted_data["Items"] = items_data
            print(f"Azure extracted {len(items_data.get('value', []))} line items")
        else:
            print("No line items could be extracted from Azure DI")

        print(f"Parsing Azure response took {time.time() - parse_start:.2f}s")
        return extracted_data

    def _extract_azure_items_working(self, fields) -> Optional[Dict[str, Any]]:
        try:
            items_field = fields.get("Items")
            if items_field is None:
                print("No 'Items' field found in Azure response")
                return None

            if not hasattr(items_field, 'value_array') or not items_field.value_array:
                print("Azure Items field has no value_array")
                return None

            bounding_regions = self._extract_bounding_regions(items_field)
            confidence = getattr(items_field, 'confidence', None)

            line_items = []
            for idx, item in enumerate(items_field.value_array, 1):
                line_item = self._extract_single_line_item_working(item, idx)
                if line_item:
                    line_items.append(line_item)

            if not line_items:
                print("No valid line items could be extracted from value_array")
                return None

            print(f"Successfully extracted {len(line_items)} line items from Azure DI")
            return {
                "source": "azure",
                "confidence": confidence,
                "bounding_regions": bounding_regions,
                "value": line_items
            }

        except Exception as e:
            print(f"Failed to extract Azure items: {e}")
            return None

    def _extract_spans(self, field_obj) -> Optional[List[Dict[str, int]]]:
        if hasattr(field_obj, "spans") and field_obj.spans:
            return [
                {
                    "offset": span.offset,
                    "length": span.length
                }
            for span in field_obj.spans
        ]
        return None

    def _extract_single_line_item_working(self, item, item_number: int) -> Optional[Dict[str, Any]]:
        try:
            if not hasattr(item, 'value_object') or not item.value_object:
                return None

            line_item = {}
            item_fields = item.value_object

            field_mapping = {
                "Amount": "amount",
                "Date": "date",
                "Description": "description",
                "Quantity": "quantity",
                "ProductCode": "product_code",
                "Tax": "tax",
                "TaxRate": "tax_rate",
                "Unit": "unit",
                "UnitPrice": "unit_price"
            }

            for azure_field, normalized_field in field_mapping.items():
                if azure_field in item_fields:
                    field_data = self._extract_line_item_field_working(item_fields[azure_field])
                    if field_data:
                        line_item[normalized_field] = field_data

            # Filter out line items with empty/missing description
            # desc_val = line_item.get("description", {}).get("value")
            # if not desc_val or str(desc_val).strip() == "":
            #     return None

            line_item["item_number"] = {
                "value": item_number,
                "source": "system",
                "confidence": None,
                "bounding_regions": None
            }

            if hasattr(item, 'bounding_regions') and item.bounding_regions:
                line_item["bounding_regions"] = [
                    {
                        "page_number": region.page_number,
                        "polygon": getattr(region, 'polygon', [])
                    }
                    for region in item.bounding_regions
                ]

            return line_item if line_item else None

        except Exception as e:
            print(f"Failed to extract line item {item_number}: {e}")
            return None

    def _extract_line_item_field_working(self, field) -> Optional[Dict[str, Any]]:
        try:
            bounding_regions = self._extract_bounding_regions(field)

            value = None
            if hasattr(field, 'value_currency') and field.value_currency:
                value = field.value_currency.amount
            elif hasattr(field, 'value_number') and field.value_number is not None:
                value = field.value_number
            elif hasattr(field, 'value_date') and field.value_date:
                value = str(field.value_date)
            elif hasattr(field, 'value_string') and field.value_string:
                value = field.value_string
            elif hasattr(field, 'content') and field.content:
                value = field.content

            confidence = getattr(field, 'confidence', None)
            spans = self._extract_spans(field)

            return {
                "value": value,
                "source": "azure",
                "confidence": confidence,
                "bounding_regions": bounding_regions,
                "spans": spans
            }

        except Exception as e:
            print(f"Failed to extract line item field: {e}")
            return None

    def _extract_bounding_regions(self, field_obj) -> List[Dict[str, Any]]:
        bounding_regions = []
        if hasattr(field_obj, 'bounding_regions') and field_obj.bounding_regions:
            for region in field_obj.bounding_regions:
                polygon_points = []
                if hasattr(region, 'polygon') and region.polygon:
                    try:
                        if region.polygon and hasattr(region.polygon[0], 'x'):
                            for point in region.polygon:
                                polygon_points.extend([getattr(point, 'x', 0), getattr(point, 'y', 0)])
                        else:
                            polygon_points = list(region.polygon)
                    except Exception:
                        polygon_points = []

                bounding_regions.append({
                    "page_number": getattr(region, 'page_number', 1),
                    "polygon": polygon_points if polygon_points else None
                })
        return bounding_regions

    def _extract_field_value_with_bounding(self, fields, field_name: str) -> Optional[Dict[str, Any]]:
        if not fields or field_name not in fields:
            return None

        field_obj = fields[field_name]

        bounding_regions = self._extract_bounding_regions(field_obj)

        value = None
        if hasattr(field_obj, 'content') and field_obj.content:
            value = field_obj.content.strip()
        
        if value is None:
            if hasattr(field_obj, 'value_currency') and field_obj.value_currency:
                value = field_obj.value_currency.amount
            elif hasattr(field_obj, 'value_number') and field_obj.value_number is not None:
                value = field_obj.value_number
            elif hasattr(field_obj, 'value_date') and field_obj.value_date:
                value = str(field_obj.value_date)
            elif hasattr(field_obj, 'value_string') and field_obj.value_string:
                value = field_obj.value_string
            elif hasattr(field_obj, 'value') and isinstance(field_obj.value, list):
                # Handle list of values (like Payments)
                values = []
                for item in field_obj.value:
                    if hasattr(item, 'value_currency') and item.value_currency:
                        values.append(str(item.value_currency.amount))
                    elif hasattr(item, 'value_number') and item.value_number is not None:
                        values.append(str(item.value_number))
                    elif hasattr(item, 'content') and item.content:
                        values.append(item.content)
                value = ", ".join(values) if values else None

        spans = self._extract_spans(field_obj)

        confidence = getattr(field_obj, 'confidence', None)

        return {
            "value": value,
            "source": "azure",
            "confidence": confidence,
            "bounding_regions": bounding_regions if bounding_regions else None,
            "spans": spans if spans else None
        }

    async def enhance_with_llm(self, state: InvoiceState) -> InvoiceState:
        try:
            import time
            start_time = time.time()
            state["processing_steps"].append("LLM Enhancement Started")

            azure_data = state["extracted_data"]
            raw_content = state["raw_azure_response"].get("content", "") if state["raw_azure_response"] else ""

            prompt = self._create_header_enhancement_prompt(azure_data, raw_content)
            state["llm_prompt"] = prompt
            
            enhanced_headers, raw_llm_response = await self._call_llm_for_enhancement(prompt)
            state["llm_raw_response"] = raw_llm_response

            merged = self._merge_azure_and_llm(azure_data, enhanced_headers)

            merged = self._normalize_dates(merged)

            if "Items" in azure_data:
                merged["Items"] = azure_data["Items"]
                item_count = len(azure_data["Items"].get("value", []))
                print(f"Using {item_count} Azure-extracted line items")

            state["enhanced_data"] = merged
            duration = time.time() - start_time
            print(f"LLM Enhancement took {duration:.2f}s")
            state["processing_steps"].append("LLM Enhancement Completed")
            return state

        except Exception as e:
            error_msg = f"LLM enhancement failed: {str(e)}"
            print(error_msg)
            state["errors"].append(error_msg)
            state["processing_steps"].append(error_msg)
            return state

    def _create_header_enhancement_prompt(self, azure_data: Dict, raw_content: str) -> str:
        azure_values: Dict[str, Any] = {}
        for field_name, field_data in azure_data.items():
            if field_name == "Items":
                continue
            if isinstance(field_data, dict) and "value" in field_data:
                azure_values[field_name] = field_data["value"]

        user_prompt = f"""
You are an expert invoice data extraction specialist.
You will receive Azure prebuilt-invoice fields (header/amount fields) and raw text.

CRITICAL: DO NOT extract or modify line items. They are handled separately by Azure Document Intelligence.

IMPORTANT:
1. Use the structured Azure fields as the PRIMARY evidence.
2. Use the raw text only to FILL missing fields or to NORMALIZE formats.
3. If a field is not found, use null.
4. Standardize date formats to YYYY-MM-DD.
5. Convert all amounts to plain numbers (no currency symbols; remove commas).
6. Be very careful with invoice numbers, dates, and amounts.
7. DO NOT invent or output any line_items array.
8. Return ONLY valid JSON, no markdown, no comments.

STRUCTURED AZURE FIELDS (headers/amounts, no Items):
{json.dumps(azure_values, indent=2, ensure_ascii=False)}

RAW INVOICE CONTEXT (partial):
{raw_content[:2500]}

Extract and return ALL available information in this EXACT JSON format:

{{
    "vendor_info": {{
        "name": "string or null",
        "address": "string or null",
        "country": "string or null",
        "tax_id": "string or null",
        "contact_email": "string or null",
        "phone": "string or null",
        "bank_name": "string or null",
        "bank_account_number": "string or null",
        "bank_details": "string or null",
        "contact_person": "string or null",
        "website": "string or null"
    }},
    "client_info": {{
        "name": "string or null",
        "billing_address": "string or null",
        "shipping_address": "string or null",
        "phone": "string or null",
        "email": "string or null",
        "tax_id": "string or null",
        "contact_person": "string or null"
    }},
    "invoice_details": {{
        "invoice_number": "string or null",
        "invoice_date": "YYYY-MM-DD or null",
        "due_date": "YYYY-MM-DD or null",
        "currency": "string or null",
        "type": "string or null",
        "po_number": "string or null",
        "payment_terms": "string or null",
        "payment_method": "string or null",
        "cost_center": "string or null"
    }},
    "service_period": {{
        "start_date": "YYYY-MM-DD or null",
        "end_date": "YYYY-MM-DD or null"
    }},
    "amounts": {{
        "subtotal": number or null,
        "shipping_handling_fees": number or null,
        "surcharges": number or null,
        "total_tax_amount": number or null,
        "tax_type_breakdown": "string or null",
        "CGST": number or null,
        "SGST": number or null,
        "IGST": number or null,
        "withholding_tax": number or null,
        "total_invoice_amount": number or null,
        "amount_paid": number or null,
        "amount_due": number or null,
        "previous_unpaid_balance": number or null
    }},
    "additional_info": {{
        "notes_terms": "string or null",
        "qr_code_irn": "string or null",
        "company_registration_number": "string or null"
    }}
}}

Return ONLY the JSON object. No explanations, no markdown formatting, just pure JSON.
"""
        return user_prompt

    async def _call_llm_for_enhancement(self, prompt: str) -> tuple[Dict[str, Any], str]:
        try:
            messages = [
                SystemMessage(content="You are an expert invoice data extraction specialist. Extract header fields only - DO NOT extract line items. Return ONLY valid JSON."),
                HumanMessage(content=prompt)
            ]

            response = await self.llm.ainvoke(messages)
            response_text = response.content.strip()

            filtered_text = response_text
            if filtered_text.startswith("```json"):
                filtered_text = filtered_text[7:]
            if filtered_text.endswith("```"):
                filtered_text = filtered_text[:-3]
            filtered_text = filtered_text.strip()

            enhanced_data = json.loads(filtered_text)
            return enhanced_data, response_text

        except json.JSONDecodeError as e:
            print(f"Failed to parse LLM response as JSON: {e}")
            return self._create_fallback_structure(), response_text if 'response_text' in locals() else ""
        except Exception as e:
            print(f"LLM call failed: {e}")
            return self._create_fallback_structure(), response_text if 'response_text' in locals() else ""

    def _create_fallback_structure(self) -> Dict[str, Any]:
        return {
            "vendor_info": {},
            "client_info": {},
            "invoice_details": {},
            "service_period": {},
            "amounts": {},
            "additional_info": {}
        }

    def _get_azure_field_for_section_field(self, section: str, field: str) -> Optional[str]:
        mapping = {
            "vendor_info": {
                "name": "VendorName",
                "address": "VendorAddress", 
                "tax_id": "VendorTaxId",
                "phone": "VendorPhoneNumber",
                "country": None,
                "contact_email": None,
                "bank_name": None,
                "bank_account_number": None,
                "bank_details": None,
                "contact_person": None,
                "website": None,
            },
            "client_info": {
                "name": "CustomerName",
                "billing_address": "BillingAddress",
                "shipping_address": "ShippingAddress", 
                "tax_id": "CustomerTaxId",
                "phone": None,
                "email": None,
                "contact_person": None,
            },
            "invoice_details": {
                "invoice_number": "InvoiceId",
                "invoice_date": "InvoiceDate", 
                "due_date": "DueDate",
                "po_number": "PurchaseOrder",
                "payment_terms": "PaymentTerm",
                "currency": None,
                "type": None,
                "payment_method": None,
                "cost_center": None,
            },
            "service_period": {
                "start_date": "ServiceStartDate",
                "end_date": "ServiceEndDate",
            },
            "amounts": {
                "subtotal": "SubTotal",
                "total_tax_amount": "TotalTax",
                "total_invoice_amount": "InvoiceTotal",
                "amount_due": "AmountDue",
                "previous_unpaid_balance": "PreviousUnpaidBalance",
                "shipping_handling_fees": None,
                "surcharges": None,
                "tax_type_breakdown": None,
                "CGST": None,
                "SGST": None,
                "IGST": None,
                "withholding_tax": None,
                "amount_paid": "AmountPaid",
            },
            "additional_info": {
                "notes_terms": None,
                "qr_code_irn": None,
                "company_registration_number": None,
            }
        }
        return mapping.get(section, {}).get(field)
    
    def _merge_azure_and_llm(self, azure_data: Dict[str, Any], enhanced_headers: Dict[str, Any]) -> Dict[str, Any]:
        final: Dict[str, Any] = {}

        def merge_section(section: str):
            section_plain = enhanced_headers.get(section, {}) or {}
            final[section] = {}

            for field, llm_value in section_plain.items():
                az_field_name = self._get_azure_field_for_section_field(section, field)
                azure_entry = azure_data.get(az_field_name) if az_field_name else None
                azure_value = azure_entry.get("value") if azure_entry else None
                
                has_azure_value = azure_value not in [None, "", []]
                
                if has_azure_value:
                    final[section][field] = {
                        "value": azure_value,
                        "source": "azure",
                        "confidence": azure_entry.get("confidence"),
                        "bounding_regions": azure_entry.get("bounding_regions"),
                        "spans": azure_entry.get("spans")
                    }
                else:
                    final[section][field] = {
                        "value": llm_value,
                        "source": "llm", 
                        "confidence": None,
                        "bounding_regions": None
                    }

        merge_section("vendor_info")
        merge_section("client_info") 
        merge_section("invoice_details")
        merge_section("service_period")
        merge_section("amounts")
        merge_section("additional_info")
        
        return final

    def _normalize_dates(self, data: Dict[str, Any]) -> Dict[str, Any]:
        import re
        from datetime import datetime

        is_india = False

        currency = data.get("invoice_details", {}).get("currency", {}).get("value")
        if currency and "INR" in str(currency).upper():
            is_india = True

        address = data.get("vendor_info", {}).get("address", {}).get("value")
        if address:
            addr_upper = str(address).upper()
            india_keywords = ["INDIA", "CHENNAI", "TAMIL NADU", "MAHARASHTRA", "DELHI", "KARNATAKA", "BENGALURU"]
            if any(kw in addr_upper for kw in india_keywords):
                is_india = True

        tax_id = data.get("vendor_info", {}).get("tax_id", {}).get("value")
        if tax_id and "GST" in str(tax_id).upper():
            is_india = True

        date_fields = [
            ("invoice_details", "invoice_date"),
            ("invoice_details", "due_date"),
            ("service_period", "start_date"),
            ("service_period", "end_date")
        ]

        for section, field in date_fields:
            field_data = data.get(section, {}).get(field)
            if not field_data:
                continue
            date_val = field_data.get("value")
            if not date_val:
                continue

            date_str = str(date_val).strip()

            if re.match(r'^\d{4}-\d{2}-\d{2}$', date_str):
                continue

            # Standard formats: DD-MM-YY or MM/DD/YYYY etc.
            m = re.match(r'^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$', date_str)
            parsed_date = None

            if m:
                part1, part2, part3 = m.groups()
                year = int(part3)
                if year < 100:
                    year += 2000

                p1 = int(part1)
                p2 = int(part2)

                if is_india:
                    day, month = p1, p2
                else:
                    month, day = p1, p2

                if month > 12 and day <= 12:
                    month, day = day, month

                try:
                    parsed_date = datetime(year, month, day).strftime('%Y-%m-%d')
                except ValueError:
                    pass
            else:
                try:
                    from dateutil import parser
                    parsed_date = parser.parse(date_str).strftime('%Y-%m-%d')
                except Exception:
                    pass

            if parsed_date:
                field_data["value"] = parsed_date

        return data

    def validate_data(self, state: InvoiceState) -> InvoiceState:
        try:
            import time
            v_start = time.time()
            state["processing_steps"].append("Data Validation Started")

            enhanced_data = state["enhanced_data"]
            validated_data = enhanced_data.copy()

            validation_results = self._perform_validation(enhanced_data)

            validated_data["validation_results"] = validation_results
            state["validated_data"] = validated_data

            state["processing_steps"].append("Data Validation Completed")
            print(f"Data validation completed in {time.time() - v_start:.2f}s")

            return state

        except Exception as e:
            error_msg = f"Data validation failed: {str(e)}"
            print(error_msg)
            state["errors"].append(error_msg)
            state["processing_steps"].append(error_msg)
            return state

    def _perform_validation(self, data: Dict[str, Any]) -> Dict[str, Any]:
        validation_results = {
            "passed": [],
            "warnings": [],
            "errors": [],
            "missing_critical_fields": []
        }

        critical_fields = [
            ("invoice_details", "invoice_number"),
            ("invoice_details", "invoice_date"),
            ("amounts", "total_invoice_amount"),
            ("vendor_info", "name"),
            ("client_info", "name")
        ]

        for section, field in critical_fields:
            field_data = data.get(section, {}).get(field, {})
            if not field_data or not field_data.get("value"):
                validation_results["missing_critical_fields"].append(f"{section}.{field}")

        date_fields = [
            ("invoice_details", "invoice_date"),
            ("invoice_details", "due_date"),
            ("service_period", "start_date"),
            ("service_period", "end_date")
        ]

        for section, field in date_fields:
            field_data = data.get(section, {}).get(field, {})
            date_value = field_data.get("value") if field_data else None
            if date_value:
                if not self._is_valid_date(date_value):
                    validation_results["warnings"].append(f"Invalid date format for {section}.{field}: {date_value}")

        amount_fields = [
            ("amounts", "total_invoice_amount"),
            ("amounts", "amount_due"),
            ("amounts", "subtotal"),
            ("amounts", "previous_unpaid_balance"),
            ("amounts", "CGST"),
            ("amounts", "SGST"),
            ("amounts", "IGST")
        ]

        for section, field in amount_fields:
            field_data = data.get(section, {}).get(field, {})
            amount_value = field_data.get("value") if field_data else None
            if amount_value is not None:
                try:
                    float(amount_value)
                except (ValueError, TypeError):
                    validation_results["warnings"].append(f"Invalid amount for {section}.{field}: {amount_value}")

        if "Items" in data:
            items_data = data["Items"]
            if items_data.get("value"):
                item_count = len(items_data["value"])
                items_source = items_data.get("source", "unknown")
                validation_results["passed"].append(f"Found {item_count} line items from {items_source}")

                for i, item in enumerate(items_data["value"]):
                    if not item.get("description") or not item.get("description", {}).get("value"):
                        validation_results["warnings"].append(f"Line item {i+1} missing description")
                    if not item.get("amount") or not item.get("amount", {}).get("value"):
                        validation_results["warnings"].append(f"Line item {i+1} missing amount")

        if not validation_results["missing_critical_fields"] and not validation_results["errors"]:
            validation_results["passed"].append("All critical validations passed")

        return validation_results

    def _is_valid_date(self, date_str: str) -> bool:
        try:
            datetime.strptime(date_str, '%Y-%m-%d')
            return True
        except ValueError:
            return False

    def generate_final_output(self, state: InvoiceState) -> InvoiceState:
        try:
            import time
            out_start = time.time()
            state["processing_steps"].append("Final Output Generation Started")

            validated_data = state["validated_data"]

            azure_fields_count = self._count_fields_by_source(validated_data, "azure")
            llm_fields_count = self._count_fields_by_source(validated_data, "llm")

            item_count = 0
            items_source = "none"
            if "Items" in validated_data and validated_data["Items"].get("value"):
                item_count = len(validated_data["Items"]["value"])
                items_source = validated_data["Items"].get("source", "unknown")

            final_output: Dict[str, Any] = {
                "extraction_timestamp": datetime.now().isoformat(),
                "source_file": state["file_path"],
                "processing_steps": state["processing_steps"],
                "extracted_data": validated_data,
                "metadata": {
                    "extraction_method": "Agentic_AI_With_Azure_Doc_Intelligence_LLM",
                    "confidence_score": self._calculate_confidence(validated_data),
                    "processing_time": datetime.now().isoformat(),
                    "errors_encountered": len(state["errors"]),
                    "successful_steps": len([step for step in state["processing_steps"] if "Completed" in step]),
                    "azure_fields_count": azure_fields_count,
                    "llm_fields_count": llm_fields_count,
                    "total_fields": azure_fields_count + llm_fields_count,
                    "line_items_count": item_count,
                    "line_items_source": items_source
                }
            }

            if state["raw_azure_response"] and "documents" in state["raw_azure_response"]:
                final_output["azure_raw_data"] = state["raw_azure_response"]["documents"]
            
            # Include new raw data in final output
            final_output["llm_prompt"] = state.get("llm_prompt")
            final_output["llm_raw_response"] = state.get("llm_raw_response")
            final_output["raw_azure_full"] = state.get("raw_azure_response")

            if state["errors"]:
                final_output["errors"] = state["errors"]

            state["final_output"] = final_output
            state["processing_steps"].append("Final Output Generation Completed")
            print(f"Final output generated successfully in {time.time() - out_start:.2f}s")
            return state

        except Exception as e:
            error_msg = f"Final output generation failed: {str(e)}"
            print(error_msg)
            state["errors"].append(error_msg)
            state["processing_steps"].append(error_msg)
            return state

    def _count_fields_by_source(self, data: Dict[str, Any], source: str) -> int:
        count = 0

        def count_recursive(obj):
            nonlocal count
            if isinstance(obj, dict):
                if "source" in obj and obj["source"] == source and obj.get("value") is not None:
                    count += 1
                for value in obj.values():
                    count_recursive(value)
            elif isinstance(obj, list):
                for item in obj:
                    count_recursive(item)

        count_recursive(data)
        return count

    def _calculate_confidence(self, data: Dict[str, Any]) -> str:
        total_fields = 0
        populated_fields = 0
        azure_fields = 0

        def analyze_fields(obj):
            nonlocal total_fields, populated_fields, azure_fields
            if isinstance(obj, dict):
                if "value" in obj and "source" in obj:
                    total_fields += 1
                    if obj["value"] not in [None, "", [], {}]:
                        populated_fields += 1
                        if obj["source"] == "azure":
                            azure_fields += 1
                for value in obj.values():
                    analyze_fields(value)
            elif isinstance(obj, list):
                for item in obj:
                    analyze_fields(item)

        analyze_fields(data)

        if total_fields == 0:
            return "low"

        completeness = populated_fields / total_fields
        azure_ratio = azure_fields / populated_fields if populated_fields > 0 else 0

        if completeness > 0.8 and azure_ratio > 0.6:
            return "high"
        elif completeness > 0.5 and azure_ratio > 0.3:
            return "medium"
        else:
            return "low"