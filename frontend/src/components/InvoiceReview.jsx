import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Button, Spin } from 'antd';
import { FormSkeleton, QuickViewSkeleton } from './SkeletonLoader';
import { ArrowLeftOutlined, SaveOutlined, SendOutlined } from '@ant-design/icons';
import GenericInputFields from './GenericInputFields';
import { schemaMap } from '../config/schemaMap';
import PdfViewerWithHighlight from './PdfViewerWithHighlight';
import PdfViewer from './Pdfviewer';
import { useGlobalSettings } from '../context/GlobalSettingsContext';
import { currencyService } from '../services/api';
import { Select, Space, Typography, Tabs } from 'antd';
import AuditTrail from './AuditTrail';

const { Text } = Typography;

const InvoiceReview = ({ file, onBack, invoiceData, readOnly = false }) => {

    const [numPages, setNumPages] = useState(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [hoveredKey, setHoveredKey] = useState(null);
    const [formattedData, setFormattedData] = useState(null);
    const { settings } = useGlobalSettings();
    const [userRole, setUserRole] = useState(null);
    const [currencies, setCurrencies] = useState([]);

    const computedReadOnly = useMemo(() => {
        if (readOnly) return true;
        if (!settings || !settings.navigation || !userRole) {
            console.log("DEBUG: readOnly fallback to true", { settings: !!settings, nav: !!settings?.navigation, userRole });
            return true;
        }

        try {
            const codingRoles = settings.navigation.find(n => n.path === '/coding')?.roles || [];
            const invoiceRoles = settings.navigation.find(n => n.path === '/invoice')?.roles || [];

            const canEdit = codingRoles.includes(userRole) ||
                invoiceRoles.includes(userRole) ||
                codingRoles.includes('all') ||
                invoiceRoles.includes('all');

            console.log("DEBUG: computedReadOnly result", { canEdit, userRole });
            return !canEdit;
        } catch (err) {
            console.error("Error computing readOnly status", err);
            return true;
        }
    }, [readOnly, settings, userRole]);

    // Resizable state
    const [leftWidth, setLeftWidth] = useState(() => {
        const saved = sessionStorage.getItem('invoiceReviewSplitWidth');
        return saved ? parseFloat(saved) : 45;
    });
    const [isDragging, setIsDragging] = useState(false);
    const leftWidthRef = useRef(leftWidth);
    const [isDuplicate, setIsDuplicate] = useState(false);
    const [isVendorMasterLoading, setIsVendorMasterLoading] = useState(false);

    useEffect(() => {
        const fetchCurrencies = async () => {
            try {
                const data = await currencyService.getCurrencies();
                setCurrencies(data);
            } catch (err) {
                console.error("Failed to fetch currencies", err);
            }
        };
        fetchCurrencies();
    }, []);

    const handleCurrencyChange = (value) => {
        // No global sessionStorage side effects
        console.log("Currency changed to:", value);
    };

    useEffect(() => {
        const storedUser = sessionStorage.getItem('user');
        if (storedUser) {
            try {
                const user = JSON.parse(storedUser);
                setUserRole(user.role || '');
            } catch (e) {
                setUserRole('');
            }
        }
    }, []);

    useEffect(() => {
        leftWidthRef.current = leftWidth;
    }, [leftWidth]);

    useEffect(() => {
        if (invoiceData && invoiceData.extracted_data) {
            console.log("DEBUG: InvoiceReview invoiceData received", { id: invoiceData.id });
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
            // MAP TOTAL AMOUNTS
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
                extraction_json['Total Amount Payable'] = extractNestedValue(extractedData.amounts.total_amount_payable) || extraction_json['Amount Due'];
            }

            // ------------------------------
            // ADDITIONAL INFO
            // ------------------------------
            if (extractedData.additional_info) {
                extraction_json['Notes / Terms'] = extractNestedValue(extractedData.additional_info.notes_terms);
                extraction_json['QR Code / IRN / ZATCA ID (region-specific)'] = extractNestedValue(extractedData.additional_info.qr_code_irn);
                extraction_json['Company Registration Number'] = extractNestedValue(extractedData.additional_info.company_registration_number);
            }

            // ------------------------------
            // LINE ITEMS
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

            // ------------------------------
            // ORIGINAL LINE ITEMS (Restoration Source)
            // ------------------------------
            const originalItems = [];
            if (invoiceData.original_items && Array.isArray(invoiceData.original_items)) {
                invoiceData.original_items.forEach(item => {
                    originalItems.push({
                        Description: { value: extractNestedValue(item.description) },
                        ItemCode: { value: extractNestedValue(item.product_code || item.item_code) },
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

            console.log("DEBUG: Setting formattedData", { itemsCount: items.length });
            setFormattedData({
                doc_type: 'invoice',
                extraction_json,
                items,
                original_line_items: originalItems,
                original_data: extractedData,
                vendor_name: invoiceData.vendor_name,
                vendor_id: invoiceData.vendor_id
            });
        }
    }, [invoiceData]);

    const [highlightedRegions, setHighlightedRegions] = useState([]);

    useEffect(() => {
        if (!hoveredKey || !invoiceData?.extracted_data) {
            setHighlightedRegions([]);
            return;
        }

        const data = invoiceData.extracted_data;
        let targetObj = null;

        // Handle Line Items
        if (hoveredKey.startsWith('LineItem_')) {
            const parts = hoveredKey.split('_');
            const index = parseInt(parts[1], 10);
            const field = parts[2]; // Description, ItemCode, etc.

            if (data.Items?.value && data.Items.value[index]) {
                const item = data.Items.value[index];
                // Map UI field names to API field names
                const fieldMap = {
                    'Description': 'description',
                    'ItemCode': 'item_code',
                    'Quantity': 'quantity',
                    'UnitOfMeasure': 'unit_of_measure',
                    'UnitPrice': 'unit_price',
                    'Discount': 'discount',
                    'NetAmount': 'amount',
                    'TaxRate': 'tax_rate',
                    'TaxAmount': 'tax_amount',
                    'GrossAmount': 'gross_amount'
                };
                const apiField = fieldMap[field] || field.toLowerCase();
                targetObj = item[apiField];
            }
        } else {
            // Handle Top Level Fields
            // We need to search for the object that corresponds to the label (hoveredKey)
            // Since we don't have a direct map, we can reconstruct the lookup or search.
            // For simplicity/robustness, let's define the map here matching the extraction logic.

            const findField = (label) => {
                const map = {
                    // Vendor
                    'Vendor Name': data.vendor_info?.name,
                    'Vendor Address': data.vendor_info?.address,
                    'Vendor Country': data.vendor_info?.country,
                    'Vendor Tax ID (VAT/GST/TIN/W9, etc.)': data.vendor_info?.tax_id,
                    'Vendor Contact Email': data.vendor_info?.contact_email,
                    'Vendor Phone': data.vendor_info?.phone,
                    'Vendor Bank Name': data.vendor_info?.bank_name,
                    'Vendor Bank Account Number': data.vendor_info?.bank_account_number,
                    'Vendor Bank Details (Account/IBAN/SWIFT/Routing No)': data.vendor_info?.bank_details,
                    'Vendor Contact Person': data.vendor_info?.contact_person,
                    'Vendor Website (if applicable)': data.vendor_info?.website,

                    // Client
                    'Client Name or Company Name': data.client_info?.name,
                    'Billing Address': data.client_info?.billing_address,
                    'Shipping Address (if different)': data.client_info?.shipping_address,
                    'Phone Number': data.client_info?.phone,
                    'Email Address (if applicable)': data.client_info?.email,
                    'Client Tax ID (if applicable)': data.client_info?.tax_id,
                    'Contact Person': data.client_info?.contact_person,

                    // Invoice Details
                    'Invoice Number': data.invoice_details?.invoice_number,
                    'Invoice Date': data.invoice_details?.invoice_date,
                    'Due Date': data.invoice_details?.due_date,
                    'Invoice Currency': data.invoice_details?.currency,
                    'Invoice Type': data.invoice_details?.type,
                    'PO Number': data.invoice_details?.po_number,
                    'Payment Terms': data.invoice_details?.payment_terms,
                    'Payment Method': data.invoice_details?.payment_method,
                    'Cost Center / Project Code (if printed)': data.invoice_details?.cost_center,

                    // Service Period
                    'Service period start': data.service_period?.start_date,
                    'Service period end': data.service_period?.end_date,

                    // Amounts
                    'Subtotal': data.amounts?.subtotal,
                    'Shipping / Handling / Fees': data.amounts?.shipping_handling_fees,
                    'Surcharges': data.amounts?.surcharges,
                    'Total Tax Amount': data.amounts?.total_tax_amount,
                    'Tax Type Breakdown (VAT/GST/PST/IGST etc.)': data.amounts?.tax_type_breakdown,
                    'Withholding Tax': data.amounts?.withholding_tax,
                    'Total Invoice Amount': data.amounts?.total_invoice_amount,
                    'Amount Paid': data.amounts?.amount_paid,
                    'Amount Due': data.amounts?.amount_due,

                    // Additional Info
                    'Notes / Terms': data.additional_info?.notes_terms,
                    'QR Code / IRN / ZATCA ID (region-specific)': data.additional_info?.qr_code_irn,
                    'Company Registration Number': data.additional_info?.company_registration_number
                };
                return map[label];
            };

            targetObj = findField(hoveredKey);
        }

        if (targetObj && targetObj.bounding_regions) {
            setHighlightedRegions(targetObj.bounding_regions);
        } else {
            setHighlightedRegions([]);
        }

    }, [hoveredKey, invoiceData]);

    // Handle dragging
    const handleMouseDown = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isDragging) return;
            const newLeftWidth = (e.clientX / window.innerWidth) * 100;
            if (newLeftWidth > 10 && newLeftWidth < 90) {
                setLeftWidth(newLeftWidth);
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            sessionStorage.setItem('invoiceReviewSplitWidth', leftWidthRef.current);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);


    const genericInputRef = useRef(null);

    const handleSave = () => genericInputRef.current?.handleSave();
    const handleSendForCoding = () => genericInputRef.current?.handleSendForCoding();


    return (
        <div
            style={{
                display: 'flex',
                height: 'calc(100vh - 10vh)',
                width: '100%',
                background: 'white'
            }}
        >
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                {/* LEFT SIDE PDF VIEWER */}
                <div
                    style={{
                        flex: `0 0 ${leftWidth}%`,
                        borderRight: '1px solid #e8e8e8',
                        overflow: 'hidden',
                        background: '#f5f5f5',
                        display: 'flex',
                        flexDirection: 'column'
                    }}
                >
                    <PdfViewerWithHighlight
                        file={file}
                        highlightedRegions={highlightedRegions}
                    />
                </div>

                {/* RESIZER */}
                <div
                    onMouseDown={handleMouseDown}
                    style={{
                        width: '5px',
                        cursor: 'col-resize',
                        background: isDragging ? '#1890ff' : '#ddd',
                        transition: 'background 0.2s',
                        zIndex: 10
                    }}
                />

                {/* RIGHT SIDE FORM */}
                <div
                    style={{
                        flex: 1,
                        overflow: 'hidden', // Changed from 'auto' to ensure children can handle overflow
                        background: 'white',
                        padding: '20px',
                        display: 'flex',
                        flexDirection: 'column'
                    }}
                >
                    {/* Header Row */}
                    <div style={{
                        marginBottom: '16px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexShrink: 0
                    }}>
                        <Button
                            icon={<ArrowLeftOutlined />}
                            onClick={onBack}
                        >
                            Back to Invoice
                        </Button>

                        {/* Action Buttons */}
                        {formattedData && !computedReadOnly && (
                            <Space>
                                <Button
                                    type="primary"
                                    icon={<SaveOutlined />}
                                    onClick={handleSave}
                                    loading={genericInputRef.current?.saving}
                                    disabled={genericInputRef.current?.disableInputs}
                                >
                                    Save
                                </Button>
                                <Button
                                    type="primary"
                                    icon={<SendOutlined />}
                                    onClick={handleSendForCoding}
                                    loading={genericInputRef.current?.saving}
                                    disabled={isDuplicate}
                                >
                                    Send for Coding
                                </Button>
                            </Space>
                        )}
                    </div>

                    {/* Content Area */}
                    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
                        {isVendorMasterLoading && (
                            <div style={{
                                position: 'absolute',
                                top: 0, left: 0, right: 0, bottom: 0,
                                zIndex: 100,
                                zIndex: 100,
                                background: '#fff',
                                padding: '20px'
                            }}>
                                <QuickViewSkeleton />
                            </div>
                        )}
                        {formattedData && (
                            <GenericInputFields
                                ref={genericInputRef}
                                data={formattedData}
                                schema={schemaMap.invoice}
                                setHoveredKey={setHoveredKey}
                                invoiceId={invoiceData?.id}
                                originalData={invoiceData}
                                currencies={currencies}
                                onDuplicateChange={setIsDuplicate}
                                onVendorLoadingChange={setIsVendorMasterLoading}
                                readOnly={computedReadOnly}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InvoiceReview;

