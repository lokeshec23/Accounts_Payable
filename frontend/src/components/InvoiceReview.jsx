import React, { useState, useEffect } from 'react';
import PdfViewer from './Pdfviewer';
import GenericInputFields from './GenericInputFields';
import { schemaMap } from '../config/schemaMap';

const InvoiceReview = ({ file, onBack, invoiceData }) => {
    console.log('InvoiceReview received invoiceData:', invoiceData);
    console.log('Extracted ID attempt 1 (_id.$oid):', invoiceData?._id?.$oid);
    console.log('Extracted ID attempt 2 (_id):', invoiceData?._id);
    console.log('Extracted ID attempt 3 (id):', invoiceData?.id);

    const [numPages, setNumPages] = useState(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [hoveredKey, setHoveredKey] = useState(null);
    const [formattedData, setFormattedData] = useState(null);

    useEffect(() => {
        if (invoiceData && invoiceData.extracted_data) {
            const extractedData = invoiceData.extracted_data;

            const extraction_json = {};

            const extractNestedValue = (obj, defaultValue = '') => {
                if (!obj) return defaultValue;
                if (typeof obj === 'object' && obj.value !== undefined) {
                    return obj.value === null ? defaultValue : obj.value;
                }
                return obj || defaultValue;
            };

            // ------------------------------
            // MAP VENDOR INFORMATION
            // ------------------------------
            if (extractedData.vendor_info) {
                extraction_json['Vendor Name'] = extractNestedValue(extractedData.vendor_info.name);
                extraction_json['Vendor Address'] = extractNestedValue(extractedData.vendor_info.address);
                extraction_json['Vendor Country'] = extractNestedValue(extractedData.vendor_info.country);
                extraction_json['Vendor Tax ID (VAT/GST/TIN/W9, etc.)'] = extractNestedValue(extractedData.vendor_info.tax_id);
                extraction_json['Vendor Contact Email'] = extractNestedValue(extractedData.vendor_info.contact_email);
                extraction_json['Vendor Phone'] = extractNestedValue(extractedData.vendor_info.phone);
                extraction_json['Vendor Bank Name'] = extractNestedValue(extractedData.vendor_info.bank_name);
                extraction_json['Vendor Bank Account Number'] = extractNestedValue(extractedData.vendor_info.bank_account_number);
                extraction_json['Vendor Bank Details (Account/IBAN/SWIFT/Routing No)'] = extractNestedValue(extractedData.vendor_info.bank_details);
                extraction_json['Vendor Contact Person'] = extractNestedValue(extractedData.vendor_info.contact_person);
                extraction_json['Vendor Website (if applicable)'] = extractNestedValue(extractedData.vendor_info.website);
            }

            // ------------------------------
            // MAP CLIENT INFORMATION
            // ------------------------------
            if (extractedData.client_info) {
                extraction_json['Client Name or Company Name'] = extractNestedValue(extractedData.client_info.name);
                extraction_json['Billing Address'] = extractNestedValue(extractedData.client_info.billing_address);
                extraction_json['Shipping Address (if different)'] = extractNestedValue(extractedData.client_info.shipping_address);
                extraction_json['Phone Number'] = extractNestedValue(extractedData.client_info.phone);
                extraction_json['Email Address (if applicable)'] = extractNestedValue(extractedData.client_info.email);
                extraction_json['Client Tax ID (if applicable)'] = extractNestedValue(extractedData.client_info.tax_id);
                extraction_json['Contact Person'] = extractNestedValue(extractedData.client_info.contact_person);
            }

            // ------------------------------
            // MAP INVOICE DETAILS
            // ------------------------------
            if (extractedData.invoice_details) {
                extraction_json['Invoice Number'] = extractNestedValue(extractedData.invoice_details.invoice_number);
                extraction_json['Invoice Date'] = extractNestedValue(extractedData.invoice_details.invoice_date);
                extraction_json['Due Date'] = extractNestedValue(extractedData.invoice_details.due_date);
                extraction_json['Invoice Currency'] = extractNestedValue(extractedData.invoice_details.currency);
                extraction_json['Invoice Type'] = extractNestedValue(extractedData.invoice_details.type);
                extraction_json['PO Number'] = extractNestedValue(extractedData.invoice_details.po_number);
                extraction_json['Payment Terms'] = extractNestedValue(extractedData.invoice_details.payment_terms);
                extraction_json['Payment Method'] = extractNestedValue(extractedData.invoice_details.payment_method);
                extraction_json['Cost Center / Project Code (if printed)'] = extractNestedValue(extractedData.invoice_details.cost_center);
            }

            // ------------------------------
            // MAP SERVICE PERIOD
            // ------------------------------
            if (extractedData.service_period) {
                extraction_json['Service period start'] = extractNestedValue(extractedData.service_period.start_date);
                extraction_json['Service period end'] = extractNestedValue(extractedData.service_period.end_date);
            }

            // ------------------------------
            // MAP AMOUNTS / TOTALS
            // ------------------------------
            if (extractedData.amounts) {
                extraction_json['Subtotal'] = extractNestedValue(extractedData.amounts.subtotal);
                extraction_json['Shipping / Handling / Fees'] = extractNestedValue(extractedData.amounts.shipping_handling_fees);
                extraction_json['Surcharges'] = extractNestedValue(extractedData.amounts.surcharges);
                extraction_json['Total Tax Amount'] = extractNestedValue(extractedData.amounts.total_tax_amount);
                extraction_json['Tax Type Breakdown (VAT/GST/PST/IGST etc.)'] = extractNestedValue(extractedData.amounts.tax_type_breakdown);
                extraction_json['Withholding Tax'] = extractNestedValue(extractedData.amounts.withholding_tax);
                extraction_json['Total Invoice Amount'] = extractNestedValue(extractedData.amounts.total_invoice_amount);
                extraction_json['Amount Paid'] = extractNestedValue(extractedData.amounts.amount_paid);
                extraction_json['Amount Due'] = extractNestedValue(extractedData.amounts.amount_due);
            }

            // ------------------------------
            // MAP ADDITIONAL INFO
            // ------------------------------
            if (extractedData.additional_info) {
                extraction_json['Notes / Terms'] = extractNestedValue(extractedData.additional_info.notes_terms);
                extraction_json['QR Code / IRN / ZATCA ID (region-specific)'] = extractNestedValue(extractedData.additional_info.qr_code_irn);
                extraction_json['Company Registration Number'] = extractNestedValue(extractedData.additional_info.company_registration_number);
            }

            // ------------------------------
            // MAP LINE ITEMS
            // ------------------------------
            const items = [];
            if (extractedData.Items?.value && Array.isArray(extractedData.Items.value)) {
                extractedData.Items.value.forEach(item => {
                    items.push({
                        Description: { value: extractNestedValue(item.description) },
                        ItemCode: { value: extractNestedValue(item.item_code) },
                        Quantity: { value: extractNestedValue(item.quantity) },
                        UnitOfMeasure: { value: extractNestedValue(item.unit_of_measure) },
                        UnitPrice: { value: extractNestedValue(item.unit_price) },
                        Discount: { value: extractNestedValue(item.discount) },
                        NetAmount: { value: extractNestedValue(item.amount) },
                        TaxRate: { value: extractNestedValue(item.tax_rate) },
                        TaxAmount: { value: extractNestedValue(item.tax_amount) },
                        GrossAmount: { value: extractNestedValue(item.gross_amount) }
                    });
                });
            }

            setFormattedData({
                doc_type: 'invoice',
                extraction_json,
                items,
                original_data: extractedData
            });
        }
    }, [invoiceData]);

    return (
        <div style={{
            display: 'flex',
            height: 'calc(100vh - 10vh)',
            width: '100%',
            background: 'white'
        }}>

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                {/* LEFT SIDE PDF VIEWER */}
                <div style={{
                    flex: 1,
                    borderRight: '1px solid #e8e8e8',
                    overflow: 'hidden',
                    background: '#f5f5f5',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <PdfViewer
                        file={file}
                        numPages={numPages}
                        setNumPages={setNumPages}
                        pageNumber={pageNumber}
                        setPageNumber={setPageNumber}
                        data={formattedData}
                        hoveredKey={hoveredKey}
                    />
                </div>

                {/* RIGHT SIDE: INPUT FIELDS */}
                <div style={{
                    flex: 1,
                    overflow: 'auto',
                    background: 'white'
                }}>
                    {formattedData && (
                        <GenericInputFields
                            data={formattedData}
                            schema={schemaMap.invoice}
                            setHoveredKey={setHoveredKey}
                            invoiceId={invoiceData?.id}
                            originalData={invoiceData}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

export default InvoiceReview;
