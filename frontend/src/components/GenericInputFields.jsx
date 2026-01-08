// src/components/GenericInputFields.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Tabs,
    Collapse,
    Input,
    InputNumber,
    Select,
    DatePicker,
    Table,
    Button,
    Checkbox,
    message,
    Space,
    Tag
} from 'antd';
import {
    PlusOutlined,
    DeleteOutlined,
    SaveOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    RollbackOutlined,
    SendOutlined,
    DownloadOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { invoiceService, codingService, workflowService, masterDataService } from '../services/api';
import { authService } from '../services/auth';
import WorkflowTab from './WorkflowTab';

const { Panel } = Collapse;
const { TextArea } = Input;

const GenericInputFields = ({
    data,
    schema,
    setHoveredKey,
    invoiceId,
    originalData,
    currencies = [],
    onCurrencyChange,
    readOnly = false
}) => {
    // Current User & Role
    const currentUser = authService.getCurrentUser?.();
    const isCoder = currentUser?.role === 'coder';
    const initialStatus = originalData?.status || 'waiting_approval';

    const navigate = useNavigate();
    const extractionData = data?.extraction_json || {};
    const lineItemsFromData = data?.items || data?.LineItems || [];

    const [formData, setFormData] = useState({
        ...extractionData,
        LineItems: lineItemsFromData
    });
    const [lineItems, setLineItems] = useState(lineItemsFromData);

    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState(readOnly ? '3' : '1');

    // Vendor Master Data state
    const [vendorMasterData, setVendorMasterData] = useState([]);
    const [selectedVendorDetails, setSelectedVendorDetails] = useState(null);
    const [vendorId, setVendorId] = useState('');
    const [memo, setMemo] = useState('');

    // Status & validation info
    const [invoiceStatus, setInvoiceStatus] = useState(initialStatus);
    const [validationInfo, setValidationInfo] = useState(
        originalData?.validation_results || {}
    );

    // Derived disable state
    const isCoderWaiting = (invoiceStatus === 'waiting_approval' && isCoder);
    const isAdmin = currentUser?.role === 'admin';
    const disableInputs = readOnly || isCoderWaiting || isAdmin;

    // Coding tab
    const [headerCoding, setHeaderCoding] = useState('');
    const [codingLineItems, setCodingLineItems] = useState([]);
    const [workflowData, setWorkflowData] = useState(null);

    // Approver comment
    const [approverComment, setApproverComment] = useState('');
    const [workflowRefreshTrigger, setWorkflowRefreshTrigger] = useState(0);

    const invoiceDisplayId = originalData?.extracted_data?.invoice_details?.invoice_number?.value ||
        originalData?.extracted_data?.invoice_details?.invoice_id?.value ||
        originalData?.invoiceId;

    const getCurrencySymbol = () => {
        const val = extractValue(formData['Invoice Currency']) || 'USD';

        // Robust matching against code OR name
        const match = currencies.find(c =>
            c.code?.toUpperCase() === val?.toUpperCase() ||
            c.name?.toLowerCase() === val?.toLowerCase()
        );

        if (match) return match.symbol;

        // Fallbacks
        const search = val?.toString().toLowerCase() || '';
        if (search.includes('inr') || search.includes('rupee')) return '₹';
        if (search.includes('euro') || search.includes('eur')) return '€';

        return '$';
    };

    // ---------- helpers ----------
    const parseCurrencyValue = (value) => {
        if (!value) return 0;
        const cleanValue = String(value).replace(/[$,\s]/g, '');
        const parsed = parseFloat(cleanValue);
        return isNaN(parsed) ? 0 : parsed;
    };

    const extractValue = (fieldValue) => {
        if (fieldValue === null || fieldValue === undefined) return '';
        if (
            typeof fieldValue === 'object' &&
            fieldValue !== null &&
            'value' in fieldValue
        ) {
            return fieldValue.value ?? '';
        }
        return fieldValue;
    };

    const disabledStyle = disableInputs
        ? {
            color: '#000000',
            backgroundColor: '#ffffff',
            cursor: 'default',
            borderColor: '#d9d9d9',
            opacity: 1
        }
        : {};

    // ---------- initial load ----------
    useEffect(() => {
        const items = data?.items || data?.LineItems || [];

        // Prioritize official vendor name from master (at root level)
        const initialFormData = {
            ...extractionData,
            LineItems: items
        };

        if (data?.vendor_name) {
            initialFormData['Vendor Name'] = { value: data.vendor_name };
        }

        setFormData(initialFormData);
        setLineItems(items);

        setInvoiceStatus(originalData?.status || 'waiting_approval');
        setValidationInfo(originalData?.validation_results || {});

        if (items.length) {
            setCodingLineItems(
                items.map((item, index) => {
                    const extractedUnitPrice = extractValue(item.UnitPrice);
                    const extractedNetAmount = extractValue(item.NetAmount);

                    const unitPrice = parseCurrencyValue(
                        extractedUnitPrice || extractValue(item.unit_price)
                    );
                    const netAmount = parseCurrencyValue(
                        extractedNetAmount ||
                        extractValue(item.amount) ||
                        extractValue(item.net_amount)
                    );

                    return {
                        s_no: index + 1,
                        description: extractValue(item.Description) || '',
                        line_type: 'Expense',
                        quantity: parseFloat(extractValue(item.Quantity)) || 0,
                        unit_price: unitPrice,
                        net_amount: netAmount,
                        gl_code: '',
                        lob: '',
                        department: '',
                        customer: '',
                        item: ''
                    };
                })
            );
        }

        // Initialize new fields from data
        setVendorId(extractValue(data?.extracted_data?.vendor_info?.vendor_id) || '');
        setMemo(extractValue(data?.extracted_data?.additional_info?.memo) || '');

    }, [data, extractionData, originalData]);

    // ---------- Load Vendor Master Data ----------
    useEffect(() => {
        const loadVendorMaster = async () => {
            try {
                // 1. Get file metadata to find Vendor_Master collection
                const files = await masterDataService.getFiles();
                console.log("DEBUG: All Master Files:", files);

                // Try multiple common names
                const vendorMasterFile = files.find(f =>
                    f.tab_name === 'Vendor_Master' ||
                    f.tab_name === 'Vendor Master' ||
                    f.tab_name === 'Vendors' ||
                    f.tab_name === 'Vendor'
                );

                if (vendorMasterFile && vendorMasterFile.sheets && vendorMasterFile.sheets.length > 0) {
                    console.log("DEBUG: Found Master File:", vendorMasterFile.tab_name);
                    const collectionName = vendorMasterFile.sheets[0].collection_name;
                    // 2. Fetch the data
                    const rows = await masterDataService.getSheetData(collectionName);
                    console.log("DEBUG: Loaded rows:", rows.length);
                    if (rows.length > 0) console.log("DEBUG: Keys:", Object.keys(rows[0]));
                    setVendorMasterData(rows);
                } else {
                    console.warn("DEBUG: No Vendor Master file found");
                }
            } catch (error) {
                console.error("Failed to load Vendor Master data", error);
            }
        };
        loadVendorMaster();
    }, []);

    // ---------- Vendor Logic & Due Date Calculation ----------
    // Normalization helper (matches backend logic)
    const normalizeVendor = (name) => {
        if (!name) return "";
        let text = String(name).toLowerCase();
        // Replace multiplication sign with x
        text = text.replace(/×/g, "x");
        // Remove common suffixes
        text = text.replace(/\b(pvt|private|ltd|limited|inc|llp|corp|corporation)\b/g, "");
        // Remove non-alpha-numeric characters (keep spaces)
        text = text.replace(/[^a-z0-9 ]/g, " ");
        // Collapse multiple spaces
        text = text.replace(/\s+/g, " ").trim();
        return text;
    };

    // ---------- Vendor Logic & Due Date Calculation ----------
    useEffect(() => {
        const vendorName = extractValue(formData['Vendor Name']);

        if (vendorName) console.log("DEBUG: Checking Vendor Name:", vendorName);

        if (vendorName && vendorMasterData.length > 0) {
            const normalizedInput = normalizeVendor(vendorName);
            console.log("DEBUG: Normalized Input:", normalizedInput);

            // Helper to apply match to form
            const applyMatch = (match) => {
                setSelectedVendorDetails(match);

                // Auto-populate Vendor ID if available and not set
                const matchedId = match['Vendor ID'] || match['VendorID'] || match['vendor_id'] || match['VENDOR_ID'];

                if (matchedId && !vendorId) {
                    console.log("DEBUG: Setting Vendor ID:", matchedId);
                    setVendorId(matchedId);
                }

                // Auto-correct Vendor Name if needed
                const officialName = match['Vendor Name'] || match['VendorName'] || match['Name'] || match['VENDOR_NAME'];
                if (officialName && officialName !== vendorName) {
                    console.log("DEBUG: Auto-correcting Vendor Name to:", officialName);
                    // Update form data with official name
                    handleInputChange('Vendor Name', officialName);
                }

                // Auto-populate Payment Terms if available and not set
                if (match['Payment Terms'] && !extractValue(formData['Payment Terms'])) {
                    handleInputChange('Payment Terms', match['Payment Terms']);
                }
            };

            // 1. Exact/Normalized Match (Local)
            const exactMatch = vendorMasterData.find(v => {
                const masterName = v['Vendor Name'] || v['VendorName'] || v['Name'];
                const normalizedMaster = normalizeVendor(masterName);
                if (normalizedMaster === normalizedInput) {
                    console.log("DEBUG: Exact Match Found!", v);
                    return true;
                }
                return false;
            });

            if (exactMatch) {
                applyMatch(exactMatch);
            } else {
                // 2. API Embedding Search (Fallback)
                console.log("DEBUG: No exact match, attempting AI embedding search...");
                const searchAsync = async () => {
                    try {
                        const result = await masterDataService.searchVendor(vendorName);
                        if (result && result.match) {
                            console.log("DEBUG: AI Match Found:", result.match, "Score:", result.score);
                            applyMatch(result.match);
                        } else {
                            console.log("DEBUG: No AI match found.");
                            setSelectedVendorDetails(null);
                        }
                    } catch (err) {
                        console.error("DEBUG: Error searching vendor:", err);
                        setSelectedVendorDetails(null);
                    }
                };
                searchAsync();
            }

        } else {
            setSelectedVendorDetails(null);
        }
    }, [formData['Vendor Name'], vendorMasterData, vendorId]);

    useEffect(() => {
        const calculateDueDate = () => {
            const invoiceDateStr = extractValue(formData['Invoice Date']);
            const paymentTermsStr = extractValue(formData['Payment Terms']);

            if (!invoiceDateStr || !paymentTermsStr) return;

            // Avoid overriding if user manually set it? 
            // Requirement says "Logic Updates: Calculate Due Date..." 
            // We'll update it if it's different, or perhaps only if not set? 
            // Let's update it reactively but maybe be careful. 
            // Actually, usually users want auto-calc.

            const invoiceDate = dayjs(invoiceDateStr);
            if (!invoiceDate.isValid()) return;

            // Parsing "Net 30", "30 Days", "30", etc.
            const match = String(paymentTermsStr).match(/(\d+)/);
            if (match) {
                const days = parseInt(match[0], 10);
                const newDueDate = invoiceDate.add(days, 'day').format('YYYY-MM-DD');

                const currentDueDate = extractValue(formData['Due Date']);
                if (currentDueDate !== newDueDate) {
                    handleInputChange('Due Date', newDueDate);
                }
            }
        };
        calculateDueDate();
    }, [formData['Invoice Date'], formData['Payment Terms']]);

    // ---------- load saved coding ----------
    useEffect(() => {
        const loadData = async () => {
            if (!invoiceId) return;
            try {
                // Load coding data
                const codingData = await codingService.getCoding(invoiceId);
                if (codingData) {
                    setHeaderCoding(codingData.header_coding || '');
                    if (codingData.line_items?.length) {
                        setCodingLineItems((prevItems) =>
                            prevItems.map((item, index) => {
                                const savedItem = codingData.line_items[index];
                                if (!savedItem) return item;
                                return {
                                    ...item,
                                    line_type: savedItem.line_type || item.line_type,
                                    gl_code: savedItem.gl_code || item.gl_code,
                                    lob: savedItem.lob || item.lob,
                                    department: savedItem.department || item.department,
                                    customer: savedItem.customer || item.customer,
                                    item: savedItem.item || item.item,
                                    unit_price: savedItem.unit_price || item.unit_price,
                                    net_amount: savedItem.net_amount || item.net_amount
                                };
                            })
                        );
                    }
                }
            } catch (error) {
                if (error.response?.status !== 404) {
                    console.error('Error loading coding data:', error);
                }
            }
        };

        const loadWorkflow = async () => {
            if (!invoiceId) return;
            try {
                const history = await workflowService.getWorkflowHistory(invoiceId);
                setWorkflowData(history);
            } catch (err) {
                console.error("Failed to fetch workflow history", err);
            }
        };

        loadData();
        loadWorkflow();
    }, [invoiceId]);

    // ---------- keep coding items in sync with invoice line items ----------
    useEffect(() => {
        if (!lineItems?.length) return;

        setCodingLineItems((prevCoding) =>
            lineItems.map((item, index) => {
                const existing = prevCoding[index] || {};
                const extractedUnitPrice = extractValue(item.UnitPrice);
                const extractedNetAmount = extractValue(item.NetAmount);

                const unitPrice = parseCurrencyValue(
                    extractedUnitPrice || extractValue(item.unit_price)
                );
                const netAmount = parseCurrencyValue(
                    extractedNetAmount ||
                    extractValue(item.amount) ||
                    extractValue(item.net_amount)
                );

                return {
                    s_no: index + 1,
                    description: extractValue(item.Description) || '',
                    line_type: existing.line_type || 'Expense',
                    quantity: parseFloat(extractValue(item.Quantity)) || 0,
                    unit_price: unitPrice,
                    net_amount: netAmount,
                    gl_code: existing.gl_code || '',
                    lob: existing.lob || '',
                    department: existing.department || '',
                    customer: existing.customer || '',
                    item: existing.item || ''
                };
            })
        );
    }, [lineItems]);

    // ---------- generic handlers ----------
    const handleInputChange = (field, value) => {
        const oldValue = formData[field];
        const newValue =
            typeof oldValue === 'object' && oldValue !== null && 'value' in oldValue
                ? { ...oldValue, value }
                : value;

        setFormData((prev) => ({
            ...prev,
            [field]: newValue
        }));
    };

    const handleLineItemChange = (index, field, value) => {
        const updatedItems = [...lineItems];
        updatedItems[index][field] = { value };
        setLineItems(updatedItems);
    };

    const handleAddLineItem = () => {
        const newItem = {
            Description: { value: '' },
            ItemCode: { value: '' },
            Quantity: { value: '' },
            UnitOfMeasure: { value: '' },
            UnitPrice: { value: '' },
            Discount: { value: '' },
            NetAmount: { value: '' },
            TaxRate: { value: '' },
            TaxAmount: { value: '' },
            GrossAmount: { value: '' }
        };
        setLineItems([...lineItems, newItem]);
    };

    const handleDeleteLineItem = (index) => {
        setLineItems((prev) => prev.filter((_, i) => i !== index));
        setCodingLineItems((prev) => prev.filter((_, i) => i !== index));
    };

    const handleHeaderCodingChange = (value) => setHeaderCoding(value);

    const handleCodingLineItemChange = (index, field, value) => {
        const updated = [...codingLineItems];
        updated[index][field] = value;
        setCodingLineItems(updated);
    };

    const exportToExcel = () => {
        if (!codingLineItems || codingLineItems.length === 0) {
            message.warning('No line items to export');
            return;
        }

        // Define columns to export - matching the coding columns logic
        const headers = [
            'S.No', 'Description', 'Line Type', 'Quantity', 'Unit Price',
            'Net Amount', 'GL Code', 'LOB', 'Department', 'Customer', 'Item'
        ];

        // Map data to array of arrays
        const data = codingLineItems.map((item, index) => [
            index + 1,
            `"${item.description || ''}"`,
            item.line_type || 'Expense',
            item.quantity,
            item.unit_price,
            item.net_amount,
            item.gl_code,
            item.lob,
            item.department,
            item.customer,
            item.item
        ]);

        // Create CSV content
        const csvContent = [
            headers.join(','),
            ...data.map(row => row.join(','))
        ].join('\n');

        // Create blob and trigger download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `invoice_line_items_${invoiceDisplayId || 'export'}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // ---------- save invoice data (extracted_data) ----------
    const saveInvoiceData = async () => {
        if (!invoiceId) {
            message.error('No invoice ID provided');
            return;
        }

        try {
            setSaving(true);

            const updatedExtractedData = JSON.parse(
                JSON.stringify(originalData?.extracted_data || {})
            );

            const safeUpdate = (obj, path, newValue) => {
                const keys = path.split('.');
                let current = obj;
                for (let i = 0; i < keys.length - 1; i++) {
                    if (!current[keys[i]]) current[keys[i]] = {};
                    current = current[keys[i]];
                }
                const lastKey = keys[keys.length - 1];
                if (!current[lastKey]) current[lastKey] = {};
                if (typeof current[lastKey] === 'object' && current[lastKey] !== null) {
                    current[lastKey].value = newValue;
                } else {
                    current[lastKey] = { value: newValue };
                }
            };

            // -------- Vendor Info --------
            if (formData['Vendor Name'] !== undefined)
                safeUpdate(
                    updatedExtractedData,
                    'vendor_info.name',
                    extractValue(formData['Vendor Name'])
                );
            if (formData['Vendor Address'] !== undefined)
                safeUpdate(
                    updatedExtractedData,
                    'vendor_info.address',
                    extractValue(formData['Vendor Address'])
                );
            if (formData['Vendor Country'] !== undefined)
                safeUpdate(
                    updatedExtractedData,
                    'vendor_info.country',
                    extractValue(formData['Vendor Country'])
                );
            if (formData['Vendor Tax ID (VAT/GST/TIN/W9, etc.)'] !== undefined)
                safeUpdate(
                    updatedExtractedData,
                    'vendor_info.tax_id',
                    extractValue(formData['Vendor Tax ID (VAT/GST/TIN/W9, etc.)'])
                );
            if (formData['Vendor Contact Email'] !== undefined)
                safeUpdate(
                    updatedExtractedData,
                    'vendor_info.contact_email',
                    extractValue(formData['Vendor Contact Email'])
                );
            if (formData['Vendor Phone'] !== undefined)
                safeUpdate(
                    updatedExtractedData,
                    'vendor_info.phone',
                    extractValue(formData['Vendor Phone'])
                );
            if (formData['Vendor Bank Name'] !== undefined)
                safeUpdate(
                    updatedExtractedData,
                    'vendor_info.bank_name',
                    extractValue(formData['Vendor Bank Name'])
                );
            if (formData['Vendor Bank Account Number'] !== undefined)
                safeUpdate(
                    updatedExtractedData,
                    'vendor_info.bank_account_number',
                    extractValue(formData['Vendor Bank Account Number'])
                );
            if (
                formData['Vendor Bank Details (Account/IBAN/SWIFT/Routing No)'] !==
                undefined
            )
                safeUpdate(
                    updatedExtractedData,
                    'vendor_info.bank_details',
                    extractValue(
                        formData['Vendor Bank Details (Account/IBAN/SWIFT/Routing No)']
                    )
                );
            if (formData['Vendor Contact Person'] !== undefined)
                safeUpdate(
                    updatedExtractedData,
                    'vendor_info.contact_person',
                    extractValue(formData['Vendor Contact Person'])
                );
            if (formData['Vendor Website (if applicable)'] !== undefined)
                safeUpdate(
                    updatedExtractedData,
                    'vendor_info.website',
                    extractValue(formData['Vendor Website (if applicable)'])
                );
            // Save Vendor ID
            safeUpdate(
                updatedExtractedData,
                'vendor_info.vendor_id',
                vendorId
            );

            // -------- Client Info --------
            const clientFields = [
                ['Client Name or Company Name', 'client_info.name'],
                ['Billing Address', 'client_info.billing_address'],
                ['Shipping Address (if different)', 'client_info.shipping_address'],
                ['Phone Number', 'client_info.phone'],
                ['Email Address (if applicable)', 'client_info.email'],
                ['Client Tax ID (if applicable)', 'client_info.tax_id'],
                ['Contact Person', 'client_info.contact_person']
            ];
            clientFields.forEach(([label, path]) => {
                if (formData[label] !== undefined) {
                    safeUpdate(updatedExtractedData, path, extractValue(formData[label]));
                }
            });

            // -------- Invoice Details --------
            const invoiceFields = [
                ['Invoice Number', 'invoice_details.invoice_number'],
                ['Invoice Date', 'invoice_details.invoice_date'],
                ['Due Date', 'invoice_details.due_date'],
                ['Invoice Currency', 'invoice_details.currency'],
                ['Invoice Type', 'invoice_details.type'],
                ['PO Number', 'invoice_details.po_number'],
                ['Payment Terms', 'invoice_details.payment_terms'],
                ['Payment Method', 'invoice_details.payment_method'],
                [
                    'Cost Center / Project Code (if printed)',
                    'invoice_details.cost_center'
                ],
                ['Service period start', 'service_period.start_date'],
                ['Service period end', 'service_period.end_date']
            ];
            invoiceFields.forEach(([label, path]) => {
                if (formData[label] !== undefined) {
                    safeUpdate(updatedExtractedData, path, extractValue(formData[label]));
                }
            });

            // -------- Amounts --------
            const amountFields = [
                ['Subtotal', 'amounts.subtotal'],
                ['Shipping / Handling / Fees', 'amounts.shipping_handling_fees'],
                ['Surcharges', 'amounts.surcharges'],
                ['Total Tax Amount', 'amounts.total_tax_amount'],
                [
                    'Tax Type Breakdown (VAT/GST/PST/IGST etc.)',
                    'amounts.tax_type_breakdown'
                ],
                ['Withholding Tax', 'amounts.withholding_tax'],
                ['Total Invoice Amount', 'amounts.total_invoice_amount'],
                ['Amount Paid', 'amounts.amount_paid'],
                ['Amount Due', 'amounts.amount_due']
            ];
            amountFields.forEach(([label, path]) => {
                if (formData[label] !== undefined) {
                    safeUpdate(updatedExtractedData, path, extractValue(formData[label]));
                }
            });

            // -------- Additional Info --------
            const additionalFields = [
                ['Notes / Terms', 'additional_info.notes_terms'],
                [
                    'QR Code / IRN / ZATCA ID (region-specific)',
                    'additional_info.qr_code_irn'
                ],
                [
                    'Company Registration Number',
                    'additional_info.company_registration_number'
                ]
            ];
            // Save Memo
            safeUpdate(
                updatedExtractedData,
                'additional_info.memo',
                memo
            );
            additionalFields.forEach(([label, path]) => {
                if (formData[label] !== undefined) {
                    safeUpdate(updatedExtractedData, path, extractValue(formData[label]));
                }
            });

            // -------- Line Items --------
            if (Array.isArray(lineItems)) {
                if (!updatedExtractedData.Items) {
                    updatedExtractedData.Items = { value: [] };
                }

                const originalItems = updatedExtractedData.Items.value || [];

                updatedExtractedData.Items.value = lineItems.map((item, index) => {
                    const originalItem = originalItems[index] || {};
                    return {
                        description: {
                            ...(originalItem.description || {}),
                            value: extractValue(item.Description)
                        },
                        item_code: {
                            ...(originalItem.item_code || {}),
                            value: extractValue(item.ItemCode)
                        },
                        quantity: {
                            ...(originalItem.quantity || {}),
                            value: extractValue(item.Quantity)
                        },
                        unit_of_measure: {
                            ...(originalItem.unit_of_measure || {}),
                            value: extractValue(item.UnitOfMeasure)
                        },
                        unit_price: {
                            ...(originalItem.unit_price || {}),
                            value: extractValue(item.UnitPrice)
                        },
                        discount: {
                            ...(originalItem.discount || {}),
                            value: extractValue(item.Discount)
                        },
                        amount: {
                            ...(originalItem.amount || {}),
                            value: extractValue(item.NetAmount)
                        },
                        tax_rate: {
                            ...(originalItem.tax_rate || {}),
                            value: extractValue(item.TaxRate)
                        },
                        tax_amount: {
                            ...(originalItem.tax_amount || {}),
                            value: extractValue(item.TaxAmount)
                        },
                        gross_amount: {
                            ...(originalItem.gross_amount || {}),
                            value: extractValue(item.GrossAmount)
                        }
                    };
                });
            }

            await invoiceService.updateInvoice(invoiceId, {
                extracted_data: updatedExtractedData
            });

            message.success('Invoice updated successfully!');
        } catch (error) {
            console.error('Error saving invoice:', error);
            message.error(
                error.response?.data?.detail || 'Failed to save invoice. Please try again.'
            );
        } finally {
            setSaving(false);
        }
    };

    // ---------- status update (approve / reject / rework / send for approval) ----------
    const updateStatus = async (newStatus) => {
        if (!invoiceId) {
            message.error('No invoice ID provided');
            return;
        }

        try {
            setSaving(true);

            // Call the backend API with status and comment
            await invoiceService.updateInvoiceStatus(invoiceId, newStatus, approverComment);

            message.success(`Invoice ${newStatus} successfully!`);
        } catch (error) {
            console.error('Error updating status:', error);
            message.error(
                error.response?.data?.detail ||
                `Failed to ${newStatus} invoice. Please try again.`
            );
        } finally {
            setSaving(false);
        }
    };

    const handleApprove = () => {
        updateStatus('approved');
        navigate("/approvals");
    };
    const handleReject = () => {
        updateStatus('rejected');
        navigate("/approvals");
    };
    const handleRework = () => {
        updateStatus('reworked');
        navigate("/approvals");
    };

    // const handleSendForApproval = async () => {
    //     message.success("Invoice sent for approval");

    //     // Redirect to Approvals Page
    //     navigate("/approvals");
    // };


    // ---------- coding save ----------
    // ---------- coding save ----------
    const handleSaveCoding = async (silent = false) => {
        if (!invoiceId) {
            if (!silent) message.error('No invoice ID provided');
            return;
        }

        try {
            setSaving(true);

            // Correct API call: pass single object
            await codingService.saveCoding({
                invoice_id: invoiceId,
                header_coding: headerCoding,
                line_items: codingLineItems
            });

            // Trigger actual status update to lock approver count (if needed, or just save)
            // await invoiceService.updateInvoiceStatus(invoiceId, 'waiting_approval'); // This seems wrong in saveCoding generic context, usually save is just save data.
            // checks context: handleSaveCoding was originally calling updateInvoiceStatus to waiting_approval?
            // Original line 596: await invoiceService.updateInvoiceStatus(invoiceId, 'waiting_approval');
            // This looks like it was "Send to Approval" logic disguised as Save Coding?
            // But the button says "Save Coding" (implicit in handleSave if activeTab=3).
            // AND the message said "Invoice sent for approval".
            // It seems handleSaveCoding in GenericInputFields was conflating saving with sending to approval!
            // I should make it JUST save coding.

            if (!silent) message.success('Coding data saved successfully!');
            // message.success("Invoice sent for approval"); // Removing this side effect from pure save

            // Redirect to Approvals Page // Removing redirect from pure save
            // navigate("/approvals");
        } catch (error) {
            console.error('Error saving coding data:', error);
            if (!silent) message.error(
                error.response?.data?.detail ||
                'Failed to save coding data. Please try again.'
            );
            throw error; // Re-throw to allow callers to handle failure
        } finally {
            setSaving(false);
        }
    };

    const handleSave = async () => {
        if (!invoiceId) {
            message.error('No invoice ID provided');
            return;
        }

        try {
            // Save both always to be safe? Or depending on tab?
            // User wants "Save should be triggered".
            await handleSaveCoding(true); // Save coding silently
            await saveInvoiceData(); // Save extracted data (Main save)
        } catch (e) {
            // Error handled in sub-functions
        }
    };

    const handleSendForCoding = async () => {
        if (!invoiceId) {
            message.error('No invoice ID provided');
            return;
        }

        try {
            setSaving(true);

            // 1. Save Invoice Extraction Data
            await saveInvoiceData();

            // 2. Save Coding Data (GL codes, etc.)
            // We need to construct the payload as expected by codingService
            await codingService.saveCoding({
                invoice_id: invoiceId,
                header_coding: headerCoding,
                line_items: codingLineItems
            });

            // 3. Update Status
            await invoiceService.updateInvoice(invoiceId, {
                status: 'waiting_coding'
            });

            message.success('Invoice sent for coding successfully!');
            navigate('/coding');
        } catch (error) {
            console.error('Error sending for coding:', error);
            message.error('Failed to send for coding');
        } finally {
            setSaving(false);
        }
    };



    // ---------- UI helpers ----------
    const renderFieldInput = (field, value) => {
        const stringValue = extractValue(value);

        if (
            field.includes('Amount') ||
            field.includes('Price') ||
            field.includes('Total')
        ) {
            const cleanValue = stringValue?.toString().replace(/[^\d.-]/g, '');
            const numValue = parseFloat(cleanValue);

            return (
                <div
                    onMouseEnter={() => setHoveredKey && setHoveredKey(field)}
                    onMouseLeave={() => setHoveredKey && setHoveredKey(null)}
                    style={{ width: '100%' }}
                >
                    <InputNumber
                        style={{ width: '100%', ...disabledStyle }}
                        value={isNaN(numValue) ? null : numValue}
                        onChange={(val) => handleInputChange(field, val)}
                        step={0.01}
                        formatter={(value) =>
                            value !== null && value !== undefined && value !== ''
                                ? `${getCurrencySymbol()} ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                                : ''
                        }
                        parser={(value) => {
                            const allSymbols = [...new Set([
                                ...currencies.map(c => c.symbol),
                                '$', '₹', '€', '£', '¥'
                            ])].filter(Boolean);
                            const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            const pattern = new RegExp(`[${allSymbols.map(escapeRegex).join('')}\\s,]*`, 'g');
                            return value.replace(pattern, '');
                        }}
                        disabled={readOnly}
                    />
                </div>
            );
        }

        if (field.includes('Date') || field.includes('period')) {
            return (
                <div
                    onMouseEnter={() => setHoveredKey && setHoveredKey(field)}
                    onMouseLeave={() => setHoveredKey && setHoveredKey(null)}
                    style={{ width: '100%' }}
                >
                    <DatePicker
                        style={{ width: '100%', ...disabledStyle }}
                        value={stringValue ? dayjs(stringValue) : null}
                        onChange={(date, dateString) => handleInputChange(field, dateString)}
                        format="YYYY-MM-DD"
                        disabled={disableInputs}
                    />
                </div>
            );
        }

        if (field.includes('Currency')) {
            const currentOptions = currencies.length > 0
                ? currencies.map(c => ({ value: c.code, label: `${c.symbol} ${c.code}` }))
                : [
                    { value: 'USD', label: '$ USD' },
                    { value: 'INR', label: '₹ INR' },
                ];

            return (
                <Select
                    style={{ width: '100%', ...disabledStyle }}
                    value={stringValue}
                    onChange={(val) => {
                        handleInputChange(field, val);
                        if (onCurrencyChange) onCurrencyChange(val);
                    }}
                    options={currentOptions}
                    disabled={disableInputs}
                />
            );
        }

        if (field.includes('Notes')) {
            return (
                <div
                    onMouseEnter={() => setHoveredKey && setHoveredKey(field)}
                    onMouseLeave={() => setHoveredKey && setHoveredKey(null)}
                    style={{ width: '100%' }}
                >
                    <TextArea
                        rows={3}
                        value={stringValue}
                        onChange={(e) => handleInputChange(field, e.target.value)}
                        disabled={disableInputs}
                        style={disabledStyle}
                    />
                </div>
            );
        }

        if (field.includes('Approval Required')) {
            return (
                <Checkbox
                    checked={stringValue === 'true' || stringValue === true}
                    onChange={(e) => handleInputChange(field, e.target.checked)}
                    disabled={disableInputs}
                >
                    {field}
                </Checkbox>
            );
        }

        return (
            <div
                onMouseEnter={() => setHoveredKey && setHoveredKey(field)}
                onMouseLeave={() => setHoveredKey && setHoveredKey(null)}
                style={{ width: '100%' }}
            >
                <Input
                    value={stringValue}
                    onChange={(e) => handleInputChange(field, e.target.value)}
                    disabled={disableInputs}
                    style={disabledStyle}
                />
            </div>
        );
    };

    // ---------- line item columns ----------
    const lineItemColumns = [
        {
            title: 'S.No',
            key: 'item_number',
            width: 50,
            render: (text, record, index) => index + 1
        },
        {
            title: 'Description',
            dataIndex: 'Description',
            key: 'Description',
            width: 200,
            render: (val, record, index) => (
                <div
                    onMouseEnter={() => setHoveredKey && setHoveredKey(`LineItem_${index}_Description`)}
                    onMouseLeave={() => setHoveredKey && setHoveredKey(null)}
                >
                    <Input.TextArea
                        rows={2}
                        value={extractValue(val)}
                        onChange={(e) =>
                            handleLineItemChange(index, 'Description', e.target.value)
                        }
                        disabled={disableInputs}
                        style={disabledStyle}
                    />
                </div>
            )
        },
        // {
        //     title: 'Item Code',
        //     dataIndex: 'ItemCode',
        //     key: 'ItemCode',
        //     width: 120,
        //     render: (val, record, index) => (
        //         <div
        //             onMouseEnter={() => setHoveredKey && setHoveredKey(`LineItem_${index}_ItemCode`)}
        //             onMouseLeave={() => setHoveredKey && setHoveredKey(null)}
        //         >
        //             <Input
        //                 value={extractValue(val)}
        //                 onChange={(e) =>
        //                     handleLineItemChange(index, 'ItemCode', e.target.value)
        //                 }
        //                 disabled={disableInputs}
        //                 style={disabledStyle}
        //             />
        //         </div>
        //     )
        // },
        {
            title: 'Qty',
            dataIndex: 'Quantity',
            key: 'Quantity',
            width: 80,
            render: (val, record, index) => (
                <div
                    onMouseEnter={() => setHoveredKey && setHoveredKey(`LineItem_${index}_Quantity`)}
                    onMouseLeave={() => setHoveredKey && setHoveredKey(null)}
                >
                    <InputNumber
                        style={{ width: '100%', ...disabledStyle }}
                        value={extractValue(val)}
                        onChange={(value) =>
                            handleLineItemChange(index, 'Quantity', value)
                        }
                        disabled={disableInputs}
                    />
                </div>
            )
        },
        // {
        //     title: 'Unit',
        //     dataIndex: 'UnitOfMeasure',
        //     key: 'UnitOfMeasure',
        //     width: 80,
        //     render: (val, record, index) => (
        //         <div
        //             onMouseEnter={() => setHoveredKey && setHoveredKey(`LineItem_${index}_UnitOfMeasure`)}
        //             onMouseLeave={() => setHoveredKey && setHoveredKey(null)}
        //         >
        //             <Input
        //                 value={extractValue(val)}
        //                 onChange={(e) =>
        //                     handleLineItemChange(index, 'UnitOfMeasure', e.target.value)
        //                 }
        //                 disabled={disableInputs}
        //                 style={disabledStyle}
        //             />
        //         </div>
        //     )
        // },
        {
            title: 'Unit Price',
            dataIndex: 'UnitPrice',
            key: 'UnitPrice',
            width: 120,
            render: (val, record, index) => (
                <div
                    onMouseEnter={() => setHoveredKey && setHoveredKey(`LineItem_${index}_UnitPrice`)}
                    onMouseLeave={() => setHoveredKey && setHoveredKey(null)}
                >
                    <InputNumber
                        style={{ width: '100%', ...disabledStyle }}
                        value={parseCurrencyValue(extractValue(val))}
                        onChange={(value) =>
                            handleLineItemChange(index, 'UnitPrice', value)
                        }
                        step={0.01}
                        formatter={(value) =>
                            value ? `${getCurrencySymbol()} ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''
                        }
                        parser={(value) => {
                            const allSymbols = [...new Set([
                                ...currencies.map(c => c.symbol),
                                '$', '₹', '€', '£', '¥'
                            ])].filter(Boolean);
                            const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            const pattern = new RegExp(`[${allSymbols.map(escapeRegex).join('')}\\s,]*`, 'g');
                            return value.replace(pattern, '');
                        }}
                        disabled={readOnly}
                    />
                </div>
            )
        },
        {
            title: 'Discount',
            dataIndex: 'Discount',
            key: 'Discount',
            width: 120,
            render: (val, record, index) => (
                <div
                    onMouseEnter={() => setHoveredKey && setHoveredKey(`LineItem_${index}_Discount`)}
                    onMouseLeave={() => setHoveredKey && setHoveredKey(null)}
                >
                    <InputNumber
                        style={{ width: '100%', ...disabledStyle }}
                        value={parseCurrencyValue(extractValue(val))}
                        onChange={(value) =>
                            handleLineItemChange(index, 'Discount', value)
                        }
                        step={0.01}
                        formatter={(value) =>
                            value ? `${getCurrencySymbol()} ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''
                        }
                        parser={(value) => {
                            const allSymbols = [...new Set([
                                ...currencies.map(c => c.symbol),
                                '$', '₹', '€', '£', '¥'
                            ])].filter(Boolean);
                            const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            const pattern = new RegExp(`[${allSymbols.map(escapeRegex).join('')}\\s,]*`, 'g');
                            return value.replace(pattern, '');
                        }}
                        disabled={readOnly}
                    />
                </div>
            )
        },
        {
            title: 'Net Amount',
            dataIndex: 'NetAmount',
            key: 'NetAmount',
            width: 120,
            render: (val, record, index) => (
                <div
                    onMouseEnter={() => setHoveredKey && setHoveredKey(`LineItem_${index}_NetAmount`)}
                    onMouseLeave={() => setHoveredKey && setHoveredKey(null)}
                >
                    <InputNumber
                        style={{ width: '100%', ...disabledStyle }}
                        value={parseCurrencyValue(extractValue(val))}
                        onChange={(value) =>
                            handleLineItemChange(index, 'NetAmount', value)
                        }
                        step={0.01}
                        formatter={(value) =>
                            value ? `${getCurrencySymbol()} ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''
                        }
                        parser={(value) => {
                            const allSymbols = [...new Set([
                                ...currencies.map(c => c.symbol),
                                '$', '₹', '€', '£', '¥'
                            ])].filter(Boolean);
                            const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                            const pattern = new RegExp(`[${allSymbols.map(escapeRegex).join('')}\\s,]*`, 'g');
                            return value.replace(pattern, '');
                        }}
                        disabled={readOnly}
                    />
                </div>
            )
        },
        {
            title: 'Action',
            key: 'action',
            width: 80,
            render: (_, record, index) => (
                <Button
                    type="link"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleDeleteLineItem(index)}
                    size="small"
                    disabled={disableInputs}
                >
                    Delete
                </Button>
            )
        }
    ];

    // ---------- Quick View ----------
    const quickViewTab = (
        <div style={{ padding: '20px' }}>
            <Collapse defaultActiveKey={['header', 'lineitems']}>
                <Panel header="Header" key="header">
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px'
                        }}
                    >


                        {/* Vendor ID */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '200px 1fr',
                            gap: '16px',
                            alignItems: 'center'
                        }}>
                            <div style={{ fontWeight: 500 }}>Vendor ID:</div>
                            <Input
                                value={vendorId}
                                onChange={(e) => setVendorId(e.target.value)}
                                disabled={disableInputs}
                                style={disabledStyle}
                            />
                        </div>

                        {/* Vendor Name */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '200px 1fr',
                            gap: '16px',
                            alignItems: 'center'
                        }}>
                            <div style={{ fontWeight: 500 }}>Vendor Name:</div>
                            <div>{renderFieldInput('Vendor Name', formData['Vendor Name'])}</div>
                        </div>

                        {/* Invoice Number */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '200px 1fr',
                            gap: '16px',
                            alignItems: 'center'
                        }}>
                            <div style={{ fontWeight: 500 }}>Invoice Number:</div>
                            <div>{renderFieldInput('Invoice Number', formData['Invoice Number'])}</div>
                        </div>

                        {/* Invoice Date */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '200px 1fr',
                            gap: '16px',
                            alignItems: 'center'
                        }}>
                            <div style={{ fontWeight: 500 }}>Invoice Date:</div>
                            <div>{renderFieldInput('Invoice Date', formData['Invoice Date'])}</div>
                        </div>

                        {/* Due Date */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '200px 1fr',
                            gap: '16px',
                            alignItems: 'center'
                        }}>
                            <div style={{ fontWeight: 500 }}>Due Date:</div>
                            <div>{renderFieldInput('Due Date', formData['Due Date'])}</div>
                        </div>

                        {/* Payment Terms */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '200px 1fr',
                            gap: '16px',
                            alignItems: 'center',
                        }}>
                            <div style={{ fontWeight: 500 }}>Payment Terms:</div>
                            <div>{renderFieldInput('Payment Terms', formData['Payment Terms'])}</div>
                        </div>

                        {/* Memo */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '200px 1fr',
                            gap: '16px',
                            alignItems: 'center'
                        }}>
                            <div style={{ fontWeight: 500 }}>Memo:</div>
                            <Input
                                value={memo}
                                onChange={(e) => setMemo(e.target.value)}
                                disabled={disableInputs}
                                style={disabledStyle}
                            />
                        </div>

                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '200px 1fr',
                                gap: '16px',
                                alignItems: 'center'
                            }}
                        >
                            <div style={{ fontWeight: 500 }}>Currency:</div>
                            <div>
                                {renderFieldInput('Invoice Currency', formData['Invoice Currency'])}
                            </div>
                        </div>

                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '200px 1fr',
                                gap: '16px',
                                alignItems: 'center'
                            }}
                        >
                            <div style={{ fontWeight: 500 }}>Total Amount:</div>
                            <div>
                                {renderFieldInput(
                                    'Total Invoice Amount',
                                    formData['Total Invoice Amount']
                                )}
                            </div>
                        </div>

                        {/* Vendor Details Section (Read-Only) */}
                        {selectedVendorDetails && (
                            <div style={{
                                marginTop: '16px',
                                padding: '12px',
                                background: '#f0f5ff',
                                borderRadius: '6px',
                                border: '1px solid #adc6ff'
                            }}>
                                <div style={{ fontWeight: 600, color: '#1d39c4', marginBottom: '8px' }}>
                                    Vendor Master Details
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', fontSize: '13px' }}>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                                        <span style={{ color: '#595959', minWidth: '120px' }}>GST / Use Tax:</span>
                                        <strong style={{ fontSize: '14px' }}>{selectedVendorDetails['GST / Use Tax Eligibility Configuration'] || 'N/A'}</strong>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                                        <span style={{ color: '#595959', minWidth: '120px' }}>TDS Applicability:</span>
                                        <strong style={{ fontSize: '14px' }}>{selectedVendorDetails['TDS/Withhold Tax Applicability Configuration'] || 'N/A'}</strong>
                                    </div>
                                    {selectedVendorDetails['TDS/Withhold Tax Applicability Configuration'] === 'Yes' && (
                                        <>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                                                <span style={{ color: '#595959', minWidth: '120px' }}>TDS %:</span>
                                                <strong style={{ fontSize: '14px' }}>{selectedVendorDetails['TDS Percentage'] || 'N/A'}</strong>
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                                                <span style={{ color: '#595959', minWidth: '120px' }}>TDS Section:</span>
                                                <strong style={{ fontSize: '14px' }}>{selectedVendorDetails['TDS Section Code and Description'] || 'N/A'}</strong>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </Panel>

                <Panel
                    header={
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Line Items</span>
                            <Button
                                icon={<DownloadOutlined />}
                                size="small"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    exportToExcel();
                                }}
                            >
                                Export to Excel
                            </Button>
                        </div>
                    }
                    key="lineitems"
                >
                    <Table
                        key={getCurrencySymbol()}
                        columns={lineItemColumns}
                        dataSource={lineItems.map((item, index) => ({
                            ...item,
                            key: index
                        }))}
                        pagination={false}
                        scroll={{ x: 'max-content' }}
                        size="small"
                    />
                    {!readOnly && (
                        <Button
                            type="dashed"
                            icon={<PlusOutlined />}
                            onClick={handleAddLineItem}
                            disabled={disableInputs}
                            style={{ marginTop: '16px', width: '100%' }}
                        >
                            Add Line Item
                        </Button>
                    )}
                </Panel>
            </Collapse>
        </div>
    );

    const glSummaryTab = (
        <div style={{ padding: '20px', background: '#f9f9f9', borderRadius: '8px', border: '1px solid #e8e8e8', marginTop: '10px' }}>
            <h3 style={{ marginBottom: '16px', borderBottom: '2px solid #1890ff', paddingBottom: '8px', color: '#001529' }}>GL Distribution Summary</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {(() => {
                    // Use persisted summary if available, otherwise calculate from current line items
                    const persistedSummary = originalData?.gl_summary;

                    if (persistedSummary && persistedSummary.length > 0) {
                        return persistedSummary.map((item) => (
                            <div key={item.gl_code} style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '10px 15px',
                                background: 'white',
                                borderRadius: '6px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                borderLeft: '4px solid #1890ff'
                            }}>
                                <span style={{ fontWeight: '600', fontSize: '15px' }}>{item.gl_code}</span>
                                <span style={{ fontWeight: 'bold', fontSize: '16px', color: '#1890ff' }}>
                                    {getCurrencySymbol()} {parseFloat(item.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        ));
                    }

                    // Fallback to calculation if not persisted yet
                    const summaryMap = {};
                    codingLineItems.forEach(item => {
                        if (item.gl_code) {
                            summaryMap[item.gl_code] = (summaryMap[item.gl_code] || 0) + (parseFloat(item.net_amount) || 0);
                        }
                    });

                    const summaryEntries = Object.entries(summaryMap);

                    if (summaryEntries.length === 0) {
                        return <p style={{ fontStyle: 'italic', color: '#8c8c8c' }}>No GL codes assigned to line items yet.</p>;
                    }

                    return summaryEntries.map(([glCode, total]) => (
                        <div key={glCode} style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '10px 15px',
                            background: 'white',
                            borderRadius: '6px',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                            borderLeft: '4px solid #1890ff'
                        }}>
                            <span style={{ fontWeight: '600', fontSize: '15px' }}>{glCode}</span>
                            <span style={{ fontWeight: 'bold', fontSize: '16px', color: '#1890ff' }}>
                                {getCurrencySymbol()} {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    ));
                })()}
            </div>
        </div>
    );

    // ---------- All Fields (optimized, still same content) ----------
    const renderFieldGroup = (title, fields) => (
        <Panel header={title} key={title}>
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                }}
            >
                {fields.map((field) => (
                    <div
                        key={field}
                        style={{
                            display: 'grid',
                            gridTemplateColumns: '350px 1fr',
                            gap: '16px',
                            alignItems: 'center'
                        }}
                    >
                        <div style={{ fontWeight: 500 }}>{field}:</div>
                        <div>{renderFieldInput(field, formData[field])}</div>
                    </div>
                ))}
            </div>
        </Panel>
    );

    const allFieldsTab = (
        <div style={{ padding: '10px 20px' }}>
            <Collapse defaultActiveKey={['Vendor', 'Buyer', 'Invoice Header']}>
                {renderFieldGroup('Vendor Level', [
                    'Vendor Name',
                    'Vendor Address',
                    'Vendor Country',
                    'Vendor Tax ID (VAT/GST/TIN/W9, etc.)',
                    'Vendor Contact Email',
                    'Vendor Phone',
                    'Vendor Bank Name',
                    'Vendor Bank Account Number',
                    'Vendor Bank Details (Account/IBAN/SWIFT/Routing No)',
                    'Vendor Contact Person',
                    'Vendor Website (if applicable)'
                ])}

                {renderFieldGroup('Buyer Information', [
                    'Client Name or Company Name',
                    'Billing Address',
                    'Shipping Address (if different)',
                    'Phone Number',
                    'Email Address (if applicable)',
                    'Client Tax ID (if applicable)',
                    'Contact Person'
                ])}

                {renderFieldGroup('Invoice Header', [
                    'Invoice Number',
                    'Invoice Date',
                    'Due Date',
                    'Invoice Currency',
                    'Invoice Type',
                    'PO Number',
                    'Payment Terms',
                    'Payment Method',
                    'Cost Center / Project Code (if printed)',
                    'Service period start',
                    'Service period end'
                ])}

                <Panel
                    header={
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Line Items</span>
                            <Button
                                icon={<DownloadOutlined />}
                                size="small"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    exportToExcel();
                                }}
                            >
                                Export to Excel
                            </Button>
                        </div>
                    }
                    key="Line Items"
                >

                    <Table
                        key={getCurrencySymbol()}
                        columns={lineItemColumns}
                        dataSource={lineItems.map((item, index) => ({
                            ...item,
                            key: index
                        }))}
                        pagination={false}
                        scroll={{ x: 'max-content' }}
                        size="small"
                    />
                    {!readOnly && (
                        <Button
                            type="dashed"
                            icon={<PlusOutlined />}
                            onClick={handleAddLineItem}
                            disabled={disableInputs}
                            style={{ marginTop: '16px', width: '100%' }}
                        >
                            Add Line Item
                        </Button>
                    )}
                </Panel>

                {renderFieldGroup('Taxes', [
                    'Total Tax Amount',
                    'Tax Type Breakdown (VAT/GST/PST/IGST etc.)',
                    'Withholding Tax'
                ])}

                {renderFieldGroup('Totals', [
                    'Subtotal',
                    'Shipping / Handling / Fees',
                    'Surcharges',
                    'Total Invoice Amount',
                    'Amount Paid',
                    'Amount Due'
                ])}

                {renderFieldGroup('Compliance', [
                    'Notes / Terms',
                    'QR Code / IRN / ZATCA ID (region-specific)',
                    'Company Registration Number'
                ])}

            </Collapse>

            {/* Send for Coding Button - Only show in non-readOnly mode */}
            {!readOnly && (
                <div style={{
                    marginTop: '24px',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    paddingRight: '20px'
                }}>
                    {/* <Button
                        type="primary"
                        icon={<SendOutlined />}
                        onClick={async () => {
                            try {
                                console.log('Invoice ID:', invoiceId);
                                console.log('Data:', data);

                                const idToUse = invoiceId || data?._id || data?.id;
                                console.log('ID to use:', idToUse);

                                if (idToUse) {
                                    await invoiceService.updateInvoiceStatus(idToUse, 'waiting_coding');
                                    message.success('Invoice sent for coding!');
                                    navigate('/coding');
                                } else {
                                    console.error('No invoice ID found');
                                    message.error('Invoice ID not found');
                                }
                            } catch (error) {
                                console.error('Error sending for coding:', error);
                                message.error('Failed to send for coding: ' + (error.message || 'Unknown error'));
                            }
                        }}
                        style={{ backgroundColor: '#1890ff' }}
                    >
                        Send for Coding
                    </Button> */}
                </div>
            )}
        </div>
    );

    // ---------- Coding Tab ----------
    const codingTab = (
        <div style={{ padding: '20px' }}>
            <Collapse defaultActiveKey={['header', 'lineitems']}>
                <Panel header="Header" key="header">
                    <Table
                        key={getCurrencySymbol()}
                        columns={[
                            {
                                title: 'Vendor Name',
                                dataIndex: 'vendorName',
                                key: 'vendorName',
                                width: '20%'
                            },
                            {
                                title: 'Invoice ID',
                                dataIndex: 'invoiceId',
                                key: 'invoiceId',
                                width: '15%'
                            },
                            {
                                title: 'Total Amount',
                                dataIndex: 'totalAmount',
                                key: 'totalAmount',
                                width: '15%',
                                render: (text) => (
                                    <span>
                                        {getCurrencySymbol()} {parseCurrencyValue(text).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                )
                            },
                            {
                                title: 'Due Date',
                                dataIndex: 'dueDate',
                                key: 'dueDate',
                                width: '15%'
                            },
                            {
                                title: 'Payment Terms',
                                dataIndex: 'paymentTerms',
                                key: 'paymentTerms',
                                width: '15%'
                            },
                            {
                                title: 'Header Coding',
                                dataIndex: 'headerCoding',
                                key: 'headerCoding',
                                width: '35%',
                                render: () => (
                                    <Input
                                        style={{ width: '100%', ...disabledStyle }}
                                        placeholder="Enter header coding"
                                        value={headerCoding}
                                        onChange={(e) => handleHeaderCodingChange(e.target.value)}
                                        disabled={disableInputs}
                                    />
                                )
                            }
                        ]}
                        dataSource={[
                            {
                                key: '1',
                                vendorName:
                                    formData['Vendor Name']?.value || formData['Vendor Name'] || '',
                                invoiceId:
                                    formData['Invoice Number']?.value ||
                                    formData['Invoice Number'] ||
                                    '',
                                totalAmount:
                                    formData['Total Invoice Amount']?.value ||
                                    formData['Total Invoice Amount'] ||
                                    '',
                                dueDate:
                                    formData['Due Date']?.value || formData['Due Date'] || '',
                                paymentTerms:
                                    formData['Payment Terms']?.value || formData['Payment Terms'] || '',
                                headerCoding: ''
                            }
                        ]}
                        pagination={false}
                        size="small"
                    />
                </Panel>

                <Panel
                    header={
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Line Items</span>
                            <Button
                                icon={<DownloadOutlined />}
                                size="small"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    exportToExcel();
                                }}
                            >
                                Export to Excel
                            </Button>
                        </div>
                    }
                    key="lineitems"
                >
                    <Table
                        key={getCurrencySymbol()}
                        columns={[
                            {
                                title: 'S.No',
                                dataIndex: 's_no',
                                key: 's_no',
                                width: '5%',
                                render: (text, record, index) => index + 1
                            },
                            {
                                title: 'Description',
                                dataIndex: 'description',
                                key: 'description',
                                width: '15%',
                                render: (text) => (
                                    <Input
                                        value={text}
                                        placeholder="Enter description"
                                        disabled={disableInputs}
                                        style={disabledStyle}
                                    />
                                )
                            },
                            {
                                title: 'Line Type',
                                dataIndex: 'line_type',
                                key: 'line_type',
                                width: '10%',
                                render: (text, record, index) => (
                                    <Select
                                        value={codingLineItems[index]?.line_type || 'Expense'}
                                        onChange={(value) =>
                                            handleCodingLineItemChange(index, 'line_type', value)
                                        }
                                        options={[
                                            { value: 'Expense', label: 'Expense' },
                                            { value: 'Asset', label: 'Asset' },
                                            { value: 'Liability', label: 'Liability' }
                                        ]}
                                        disabled={disableInputs}
                                        style={{ width: '100%', ...disabledStyle }}
                                    />
                                )
                            },
                            {
                                title: 'Quantity',
                                dataIndex: 'quantity',
                                key: 'quantity',
                                width: '8%',
                                render: (text, record, index) => (
                                    <InputNumber
                                        value={codingLineItems[index]?.quantity || 0}
                                        onChange={(value) =>
                                            handleCodingLineItemChange(index, 'quantity', value)
                                        }
                                        style={{ width: '100%', ...disabledStyle }}
                                        min={0}
                                        disabled={disableInputs}
                                    />
                                )
                            },
                            {
                                title: 'Unit Price',
                                dataIndex: 'unit_price',
                                key: 'unit_price',
                                width: '10%',
                                render: (text, record, index) => (
                                    <InputNumber
                                        value={codingLineItems[index]?.unit_price || 0}
                                        formatter={(value) =>
                                            value
                                                ? `${getCurrencySymbol()} ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                                                : ''
                                        }
                                        parser={(value) => value.replace(new RegExp(`[${getCurrencySymbol()}\\s,]*`, 'g'), '')}
                                        onChange={(value) =>
                                            handleCodingLineItemChange(index, 'unit_price', value)
                                        }
                                        style={{ width: '100%', ...disabledStyle }}
                                        min={0}
                                        precision={2}
                                        disabled={disableInputs}
                                    />
                                )
                            },
                            {
                                title: 'Net Amount',
                                dataIndex: 'net_amount',
                                key: 'net_amount',
                                width: '10%',
                                render: (text, record, index) => (
                                    <InputNumber
                                        value={codingLineItems[index]?.net_amount || 0}
                                        formatter={(value) =>
                                            value
                                                ? `${getCurrencySymbol()} ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                                                : ''
                                        }
                                        parser={(value) => value.replace(new RegExp(`[${getCurrencySymbol()}\\s,]*`, 'g'), '')}
                                        onChange={(value) =>
                                            handleCodingLineItemChange(index, 'net_amount', value)
                                        }
                                        style={{ width: '100%', ...disabledStyle }}
                                        min={0}
                                        precision={2}
                                        disabled={disableInputs}
                                    />
                                )
                            },
                            {
                                title: 'GL Code',
                                dataIndex: 'gl_code',
                                key: 'gl_code',
                                width: '10%',
                                render: (text, record, index) => (
                                    <Input
                                        value={codingLineItems[index]?.gl_code || ''}
                                        placeholder="GL Code"
                                        onChange={(e) =>
                                            handleCodingLineItemChange(index, 'gl_code', e.target.value)
                                        }
                                        disabled={disableInputs}
                                        style={disabledStyle}
                                    />
                                )
                            },
                            {
                                title: 'LOB',
                                dataIndex: 'lob',
                                key: 'lob',
                                width: '10%',
                                render: (text, record, index) => (
                                    <Input
                                        value={codingLineItems[index]?.lob || ''}
                                        placeholder="LOB"
                                        onChange={(e) => handleCodingLineItemChange(index, 'lob', e.target.value)}
                                        disabled={disableInputs}
                                        style={disabledStyle}
                                    />
                                )
                            },
                            {
                                title: 'Department',
                                dataIndex: 'department',
                                key: 'department',
                                width: '10%',
                                render: (text, record, index) => (
                                    <Input
                                        value={codingLineItems[index]?.department || ''}
                                        placeholder="Department"
                                        onChange={(e) => handleCodingLineItemChange(index, 'department', e.target.value)}
                                        disabled={disableInputs}
                                        style={disabledStyle}
                                    />
                                )
                            },
                            {
                                title: 'Customer',
                                dataIndex: 'customer',
                                key: 'customer',
                                width: '10%',
                                render: (text, record, index) => (
                                    <Input
                                        value={codingLineItems[index]?.customer || ''}
                                        placeholder="Customer"
                                        onChange={(e) => handleCodingLineItemChange(index, 'customer', e.target.value)}
                                        disabled={disableInputs}
                                        style={disabledStyle}
                                    />
                                )
                            },
                            {
                                title: 'Item',
                                dataIndex: 'item',
                                key: 'item',
                                width: 200,
                                minWidth: 200,
                                render: (text, record, index) => (
                                    <Input
                                        value={codingLineItems[index]?.item || ''}
                                        placeholder="Item"
                                        onChange={(e) => handleCodingLineItemChange(index, 'item', e.target.value)}
                                        disabled={disableInputs}
                                        style={disabledStyle}
                                    />
                                )
                            },
                            {
                                title: 'Action',
                                key: 'action',
                                width: '7%',
                                render: (text, record, index) => (
                                    <Button
                                        type="text"
                                        danger
                                        icon={<DeleteOutlined />}
                                        onClick={() => handleDeleteLineItem(index)}
                                        disabled={disableInputs}
                                    />
                                )
                            }
                        ]}
                        dataSource={codingLineItems.map((item, index) => ({
                            key: index,
                            ...item
                        }))}
                        pagination={false}
                        scroll={{ x: 'max-content' }}
                        size="small"
                    />
                </Panel>
            </Collapse>


        </div>
    );

    const renderTabContent = () => {
        switch (activeTab) {
            case '1':
                return quickViewTab;
            case '2':
                return allFieldsTab;
            case '3':
                return codingTab;
            case 'gl_summary':
                return glSummaryTab;
            case '4':
                return <WorkflowTab
                    invoiceId={invoiceId}
                    invoiceDisplayId={invoiceDisplayId}
                    refreshTrigger={workflowRefreshTrigger}
                />;
            default:
                return quickViewTab;
        }
    };

    // ---------- status helpers for buttons ----------
    // const currentUser = authService.getCurrentUser?.(); // Defined at top 
    // We already have currentUser from the top scope
    const currentUsername = currentUser?.username || currentUser?.email || '';

    // --- APPROVAL CYCLE FIX ---

    const statusHistory = originalData?.status_history || [];

    // 1️⃣ Find last rework index
    const lastReworkIndex = [...statusHistory]
        .map((s, i) => ({ s, i }))
        .reverse()
        .find(x => x.s.status === 'reworked')?.i ?? -1;

    // 2️⃣ Get only CURRENT approval cycle history
    const currentCycleHistory =
        lastReworkIndex >= 0
            ? statusHistory.slice(lastReworkIndex + 1)
            : statusHistory;

    // 3️⃣ Check if current user has already acted IN THIS CYCLE
    const currentUserHasActed = currentCycleHistory.some(
        entry =>
            entry.user === currentUsername &&
            (entry.status === 'approved' ||
                entry.status === 'rejected' ||
                entry.status === 'reworked')
    );

    // 4️⃣ Check rejection/rework ONLY in this cycle
    const hasRejectionOrRework = currentCycleHistory.some(
        entry => entry.status === 'rejected' || entry.status === 'reworked'
    );

    const isApproved = invoiceStatus === 'approved';
    const isRejected = invoiceStatus === 'rejected';
    const isWaitingApproval = invoiceStatus === 'waiting_approval';

    // Identify users restricted from approving (Processed or Coding)
    const restrictedUsers = new Set();
    if (workflowData?.steps) {
        workflowData.steps.forEach(step => {
            if (step.step_type === 'processed' || step.step_type === 'coding') {
                restrictedUsers.add(step.user);
            }
        });
    }

    // Fallback: Check status_history for 'processed' status
    statusHistory.forEach(entry => {
        if (entry.status === 'processed') {
            restrictedUsers.add(entry.user);
        }
    });

    const isRestrictedUser = restrictedUsers.has(currentUsername);

    // ✅ SEQUENTIAL TURN CALCULATION
    const cycleApprovalsCount = currentCycleHistory.filter(h => h.status === 'approved').length;
    const assignedApprovers = workflowData?.assigned_approvers || [];
    const isSequential = assignedApprovers.length > 0;
    const isMyTurn = !isSequential || (assignedApprovers[cycleApprovalsCount]?.toLowerCase() === currentUser?.email?.toLowerCase());

    // Disable buttons ONLY based on status_history, NOT main status:
    // 1. Current user has already acted, OR
    // 2. Someone has rejected/reworked (stops the process)
    // 3. User is restricted (Performed Processed or Coding)
    // 4. Sequential check: Only assigned approver at current level can act
    const approveDisabled = currentUserHasActed || isRestrictedUser || !isMyTurn;
    const rejectDisabled = currentUserHasActed || isRestrictedUser || !isMyTurn;
    const reworkDisabled = currentUserHasActed || isRestrictedUser || !isMyTurn;


    const renderStatusTag = () => {
        let color = 'default';
        let label = invoiceStatus;

        switch (invoiceStatus) {
            case 'processed':
                color = 'cyan';
                label = 'Processed';
                break;
            case 'waiting_coding':
                color = 'orange';
                label = 'Coding';
                break;
            case 'waiting_approval':
                color = 'gold';
                label = 'Waiting for Approval';
                break;
            case 'approved':
                color = 'green';
                label = 'Approved';
                break;
            case 'rejected':
                color = 'red';
                label = 'Rejected';
                break;
            case 'reworked':
                color = 'purple';
                label = 'Reworked';
                break;
            default:
                color = 'default';
        }

        return <Tag color={color}>{label}</Tag>;
    };


    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div
                style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                    backgroundColor: '#fff',
                    borderBottom: '1px solid #f0f0f0',
                    padding: '8px 20px'
                }}
            >
                {/* First Row: Tabs and Action Buttons in same row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <Tabs
                        activeKey={activeTab}
                        onChange={setActiveTab}
                        style={{ margin: 0, flex: 1 }}
                        items={[
                            { key: '1', label: 'Quick View' },
                            { key: '2', label: 'All Fields' },
                            ...(readOnly ? [{ key: '3', label: 'Coding' }] : []),
                            { key: 'gl_summary', label: 'GL Summary' },
                            { key: '4', label: 'Workflow' }
                        ]}
                    />

                    {/* Status Tag for approved/rejected */}
                    {(invoiceStatus === "approved" || invoiceStatus === "rejected") && (
                        <div style={{ marginLeft: '24px' }}>{renderStatusTag()}</div>
                    )}

                    {/* Action Buttons in same row */}
                    {readOnly && (invoiceStatus === 'waiting_approval') && (
                        <Space style={{ marginLeft: '24px' }}>
                            <Button
                                type="primary"
                                icon={<CheckCircleOutlined />}
                                style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
                                onClick={handleApprove}
                                disabled={approveDisabled}
                            >
                                Approve
                            </Button>
                            <Button
                                type="primary"
                                icon={<CloseCircleOutlined />}
                                danger
                                onClick={handleReject}
                                disabled={rejectDisabled}
                            >
                                Reject
                            </Button>
                            <Button
                                type="primary"
                                icon={<RollbackOutlined />}
                                style={{ backgroundColor: '#faad14', borderColor: '#faad14' }}
                                onClick={handleRework}
                                disabled={reworkDisabled}
                            >
                                Rework
                            </Button>
                        </Space>
                    )}
                </div>

                {/* Second Row: Comment Input for Approver */}
                {readOnly && isWaitingApproval && (
                    <div style={{ marginBottom: '8px' }}>
                        <TextArea
                            rows={2}
                            placeholder="Add a comment about this approval decision (optional)..."
                            value={approverComment}
                            onChange={(e) => setApproverComment(e.target.value)}
                            maxLength={500}
                            showCount
                            style={{ width: '100%' }}
                        />
                    </div>
                )}

                {/* Display Comment for approved/rejected */}
                {(invoiceStatus === "approved" || invoiceStatus === "rejected") && validationInfo?.approver_comment && (
                    <div style={{
                        padding: '10px 16px',
                        backgroundColor: '#f6f8fa',
                        borderLeft: '3px solid #1890ff',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px',
                        marginBottom: '8px'
                    }}>
                        <div style={{
                            fontSize: '13px',
                            color: '#595959',
                            fontStyle: 'italic',
                            flex: 1
                        }}>
                            "{validationInfo.approver_comment}"
                        </div>
                        {validationInfo?.approver_name && validationInfo?.approval_timestamp && (
                            <div style={{
                                fontSize: '11px',
                                color: '#8c8c8c',
                                whiteSpace: 'nowrap'
                            }}>
                                <strong>{validationInfo.approver_name}</strong> • {new Date(
                                    validationInfo.approval_timestamp
                                ).toLocaleString()}
                            </div>
                        )}
                    </div>
                )}

                {!readOnly && (
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                        <Button
                            type="primary"
                            icon={<SaveOutlined />}
                            onClick={handleSave}
                            loading={saving}
                            size="default"
                            disabled={disableInputs}
                        >
                            Save
                        </Button>
                        <Button
                            type="primary"
                            icon={<SendOutlined />}
                            onClick={handleSendForCoding}
                            loading={saving}
                            size="default"
                            disabled={disableInputs}
                        >
                            Send for Coding
                        </Button>
                    </div>
                )}




            </div>

            <div style={{ flex: 1, overflow: 'auto' }}>{renderTabContent()}</div>
        </div>
    );
};

export default GenericInputFields;
