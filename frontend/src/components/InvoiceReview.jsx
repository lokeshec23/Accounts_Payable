import React, { useState, useEffect } from 'react';
import PdfViewer from './Pdfviewer';
import GenericInputFields from './GenericInputFields';
import { Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { schemaMap } from '../config/schemaMap';

const InvoiceReview = ({ file, onBack, invoiceData }) => {
    const [numPages, setNumPages] = useState(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [hoveredKey, setHoveredKey] = useState(null);
    const [formattedData, setFormattedData] = useState(null);

    useEffect(() => {
        if (invoiceData && invoiceData.extracted_data) {
            // Transform backend data to the format expected by GenericInputFields
            const extractedData = invoiceData.extracted_data;

            // Create extraction_json from the extracted data
            const extraction_json = {};

            // Map vendor info
            if (extractedData.vendor_info) {
                if (extractedData.vendor_info.name) {
                    extraction_json['Vendor Name'] = extractedData.vendor_info.name;
                }
                if (extractedData.vendor_info.address) {
                    extraction_json['Vendor Address'] = extractedData.vendor_info.address;
                }
            }

            // Map client info
            if (extractedData.client_info) {
                if (extractedData.client_info.name) {
                    extraction_json['Client Name'] = extractedData.client_info.name;
                }
                if (extractedData.client_info.billing_address) {
                    extraction_json['Billing Address'] = extractedData.client_info.billing_address;
                }
                if (extractedData.client_info.shipping_address) {
                    extraction_json['Shipping Address'] = extractedData.client_info.shipping_address;
                }
            }

            // Map invoice details
            if (extractedData.invoice_details) {
                if (extractedData.invoice_details.invoice_number) {
                    extraction_json['Invoice Number'] = extractedData.invoice_details.invoice_number;
                }
                if (extractedData.invoice_details.invoice_date) {
                    extraction_json['Invoice Date'] = extractedData.invoice_details.invoice_date;
                }
                if (extractedData.invoice_details.due_date) {
                    extraction_json['Due Date'] = extractedData.invoice_details.due_date;
                }
            }

            // Map financial info from 'amounts' object (database uses 'amounts' not 'financial_info')
            if (extractedData.amounts) {
                // Always set these fields, even if null, so they appear in the form
                extraction_json['Total Amount'] = extractedData.amounts.total_invoice_amount || { value: null };
                extraction_json['Tax Amount'] = extractedData.amounts.total_tax_amount || { value: null };
                extraction_json['Subtotal'] = extractedData.amounts.subtotal || { value: null };
            }

            // Map line items from 'Items' object (database uses 'Items' with capital I)
            const items = [];
            if (extractedData.Items && extractedData.Items.value && Array.isArray(extractedData.Items.value)) {
                extractedData.Items.value.forEach(item => {
                    items.push({
                        Description: item.description || { value: '' },
                        Quantity: item.quantity || { value: '' },
                        UnitPrice: item.unit_price || { value: '' },
                        NetAmount: item.amount || { value: '' }  // Database uses 'amount' for net amount
                    });
                });
            }

            setFormattedData({
                doc_type: 'invoice',
                extraction_json: extraction_json,
                items: items
            });
        }
    }, [invoiceData]);

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            width: '100vw',
            position: 'fixed',
            top: 0,
            left: 0,
            background: 'white',
            zIndex: 1000
        }}>
            <div style={{
                padding: '15px 20px',
                borderBottom: '1px solid #e8e8e8',
                background: 'white',
                display: 'flex',
                alignItems: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
                <Button icon={<ArrowLeftOutlined />} onClick={onBack} size="large">
                    Back to Dashboard
                </Button>
            </div>
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* Left Side: PDF Viewer */}
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

                {/* Right Side: Input Fields */}
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
