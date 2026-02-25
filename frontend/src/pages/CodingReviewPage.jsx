import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Table, Input, InputNumber, Select, message, Collapse, Spin, Checkbox, Tabs } from 'antd';
const { Panel } = Collapse;
import { ArrowLeftOutlined, SendOutlined, DeleteOutlined, SaveOutlined, RollbackOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import { read, utils } from 'xlsx';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
dayjs.extend(customParseFormat);
import PdfViewerWithHighlight from '../components/PdfViewerWithHighlight';
import { FormSkeleton } from '../components/SkeletonLoader';
import WorkflowTab from '../components/WorkflowTab';
import AuditTrail from '../components/AuditTrail';
import QuickViewTab from '../components/QuickViewTab';
import AllFieldsTab from '../components/AllFieldsTab';
import { schemaMap } from '../config/schemaMap';
import { invoiceService, codingService, masterDataService, approvalService, workflowService, currencyService } from '../services/api';

const CodingReviewPage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const invoiceData = location.state?.invoice;

    // Parse extracted_data if it's a string
    const rawExtractedData = React.useMemo(() => {
        if (!invoiceData?.extracted_data) return {};
        if (typeof invoiceData.extracted_data === 'string') {
            try {
                return JSON.parse(invoiceData.extracted_data);
            } catch (e) {
                console.error("Failed to parse extracted_data:", e);
                return {};
            }
        }
        return invoiceData.extracted_data;
    }, [invoiceData]);

    const [currencySymbol, setCurrencySymbol] = useState('$');

    // Check if invoice is approved - make it read-only
    const isApproved = invoiceData?.status === 'approved';
    const isRejected = invoiceData?.status === 'rejected';
    const isWaitingApproval = invoiceData?.status === 'waiting_approval';
    // We can assume userRole is set by the effect hook below, but we need it for the initial render logic if possible or use the state 
    // Since userRole is state, we can use it directly in the render.



    const formatCurrencyOnce = (value) => {
        if (value === null || value === undefined || value === '') return '';

        const symbol = getCurrencySymbol();

        // Convert to string
        let str = String(value).trim();

        // Dynamic stripping of any known currency symbols from the backend list
        // Plus common fallbacks
        const allSymbols = [...new Set([
            ...currencies.map(c => c.symbol),
            '$', '₹', '€', '£', '¥'
        ])].filter(Boolean);

        const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const symbolPattern = new RegExp(`[${allSymbols.map(escapeRegex).join('')}]`, 'g');

        str = str.replace(symbolPattern, '').trim();

        return `${symbol} ${str}`;
    };


    // Resizable state
    const [leftWidth, setLeftWidth] = useState(() => {
        const saved = localStorage.getItem('codingReviewSplitWidth');
        return saved ? parseFloat(saved) : 45;
    });
    const [isDragging, setIsDragging] = useState(false);
    const leftWidthRef = useRef(leftWidth);

    useEffect(() => {
        leftWidthRef.current = leftWidth;
    }, [leftWidth]);

    const [hoveredKey, setHoveredKey] = useState(null);
    const [headerCoding, setHeaderCoding] = useState('');
    const [codingLineItems, setCodingLineItems] = useState([]);
    const [saving, setSaving] = useState(false);
    const [pdfUrl, setPdfUrl] = useState(null);
    const [loadingPdf, setLoadingPdf] = useState(false);

    // Master Data Options
    const [glOptions, setGlOptions] = useState([]);
    const [lobOptions, setLobOptions] = useState([]);
    const [deptOptions, setDeptOptions] = useState([]);
    const [customerOptions, setCustomerOptions] = useState([]);
    const [itemOptions, setItemOptions] = useState([]);
    const [currencies, setCurrencies] = useState([]);
    const [loadingMasterData, setLoadingMasterData] = useState(false);

    // Track selected rows for "apply to all" feature
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);

    const [userRole, setUserRole] = useState('');

    // Combined disable logic
    const disableEditing = isApproved || isRejected || userRole === 'approver' || userRole === 'admin' || (isWaitingApproval && userRole === 'coder');

    // Trigger workflow refresh
    const [workflowRefreshTrigger, setWorkflowRefreshTrigger] = useState(0);
    const [completedApproversCount, setCompletedApproversCount] = useState(0);

    const getCurrencySymbol = () => {
        return '$';
    };


    const disabledStyle = {
        color: 'black',
        backgroundColor: 'white',
        opacity: 1
    };

    // Helper functions for QuickView and AllFields tabs
    const extractValue = (fieldValue) => {
        if (fieldValue === null || fieldValue === undefined) return '';
        if (typeof fieldValue === 'object' && fieldValue !== null && 'value' in fieldValue) {
            return fieldValue.value ?? '';
        }
        return fieldValue;
    };

    const parseCurrencyValue = (value) => {
        if (!value) return 0;
        const cleanValue = String(value).replace(/[$,\s]/g, '');
        const parsed = parseFloat(cleanValue);
        return isNaN(parsed) ? 0 : parsed;
    };

    const formatDate = (dateVal) => {
        if (!dateVal) return '';
        const raw = extractValue(dateVal);
        if (!raw) return '';

        // Attempt to parse with common formats
        const formats = ['YYYY-MM-DD', 'DD-MM-YYYY', 'MM/DD/YYYY', 'D-M-YYYY', 'YYYY/MM/DD', 'DD MMM YYYY', 'MM-DD-YYYY'];
        const d = dayjs(raw, formats);

        if (d.isValid()) {
            return d.format('MM-DD-YYYY');
        }
        return raw; // Fallback to raw if unparseable
    };

    const renderFieldInput = (field, value) => {
        const stringValue = extractValue(value);
        return (
            <Input
                value={stringValue}
                disabled
                style={disabledStyle}
            />
        );
    };

    // Prepare formData for tabs
    const formData = React.useMemo(() => {
        const extracted = invoiceData?.rawData?.extracted_data || {};
        return {
            // Vendor Information
            'Vendor ID': invoiceData?.vendorId || extracted?.vendor_info?.vendor_id?.value || '',
            'Vendor Name': invoiceData?.vendor_name || invoiceData?.vendorName || extractValueNested(extracted?.vendor_info?.name) || '',
            'Vendor Address': extracted?.vendor_info?.address?.value || '',
            'Vendor Country': extracted?.vendor_info?.country?.value || '',
            'Vendor Tax ID (VAT/GST/TIN/W9, etc.)': extracted?.vendor_info?.tax_id?.value || '',
            'Vendor Contact Email': extracted?.vendor_info?.email?.value || '',
            'Vendor Phone': extracted?.vendor_info?.phone?.value || '',
            'Vendor Bank Name': extracted?.vendor_info?.bank_name?.value || '',
            'Vendor Bank Account Number': extracted?.vendor_info?.bank_account?.value || '',
            'Vendor Bank Details (Account/IBAN/SWIFT/Routing No)': extracted?.vendor_info?.bank_details?.value || '',
            'Vendor Contact Person': extracted?.vendor_info?.contact_person?.value || '',
            'Vendor Website (if applicable)': extracted?.vendor_info?.website?.value || '',

            // Invoice Details
            'Invoice Number': extracted?.invoice_details?.invoice_number?.value || '',
            'Invoice Date': formatDate(extracted?.invoice_details?.invoice_date?.value) || '',
            'Due Date': formatDate(extracted?.invoice_details?.due_date?.value) || '',
            'Payment Terms': extracted?.invoice_details?.payment_terms?.value || '',
            'Invoice Currency': extracted?.invoice_details?.currency?.value || 'USD',
            'Invoice Type': extracted?.invoice_details?.invoice_type?.value || '',
            'PO Number': extracted?.invoice_details?.po_number?.value || '',
            'Payment Method': extracted?.invoice_details?.payment_method?.value || '',
            'Cost Center / Project Code (if printed)': extracted?.invoice_details?.cost_center?.value || '',
            'Service period start': formatDate(extracted?.invoice_details?.service_period_start?.value) || '',
            'Service period end': formatDate(extracted?.invoice_details?.service_period_end?.value) || '',

            // Buyer Information
            'Client Name or Company Name': extracted?.client_info?.name?.value || '',
            'Billing Address': extracted?.client_info?.billing_address?.value || '',
            'Shipping Address (if different)': extracted?.client_info?.shipping_address?.value || '',
            'Phone Number': extracted?.client_info?.phone?.value || '',
            'Email Address (if applicable)': extracted?.client_info?.email?.value || '',
            'Client Tax ID (if applicable)': extracted?.client_info?.tax_id?.value || '',
            'Contact Person': extracted?.client_info?.contact_person?.value || '',

            // Amounts
            'Subtotal': extracted?.amounts?.subtotal?.value || '',
            'Total Tax Amount': extracted?.amounts?.total_tax_amount?.value || '',
            'CGST': extracted?.amounts?.CGST?.value || '',
            'SGST': extracted?.amounts?.SGST?.value || '',
            'IGST': extracted?.amounts?.IGST?.value || '',
            'GST': extracted?.amounts?.GST?.value || '',
            'Withholding Tax': extracted?.amounts?.withholding_tax?.value || '',
            'Tax Type Breakdown (VAT/GST/PST/IGST etc.)': extracted?.amounts?.tax_breakdown?.value || '',
            'Shipping / Handling / Fees': extracted?.amounts?.shipping_fees?.value || '',
            'Surcharges': extracted?.amounts?.surcharges?.value || '',
            'Total Invoice Amount': extracted?.amounts?.total_invoice_amount?.value || '',
            'Total Amount Payable': extracted?.amounts?.total_amount_payable?.value || '',
            'Amount Paid': extracted?.amounts?.amount_paid?.value || '',
            'Amount Due': extracted?.amounts?.amount_due?.value || '',

            // Compliance
            'Notes / Terms': extracted?.additional_info?.notes?.value || '',
            'QR Code / IRN / ZATCA ID (region-specific)': extracted?.additional_info?.qr_code?.value || '',
            'Company Registration Number': extracted?.additional_info?.registration_number?.value || '',
        };
    }, [invoiceData]);

    // Prepare line items for tabs
    const lineItemsForTabs = React.useMemo(() => {

        // If DB coding exists → use it
        if (codingLineItems && codingLineItems.length > 0) {
            return codingLineItems.map(item => ({
                Description: item.description,
                Quantity: item.quantity,
                UnitPrice: item.unit_price,
                NetAmount: item.net_amount,
                TaxAmount: 0,
                Discount: { value: 0 },
                ItemCode: { value: item.item || '' },
                UnitOfMeasure: { value: '' },
                TaxRate: { value: '' },
                GrossAmount: { value: item.net_amount }
            }));
        }

        // Fallback → OCR data
        const items = rawExtractedData?.Items?.value || rawExtractedData?.line_items || [];

        return items.map(item => ({
            Description: item.description || item.Description || '',
            Quantity: item.quantity || item.Quantity || 0,
            UnitPrice: item.unit_price || item.UnitPrice || 0,
            NetAmount: item.amount || item.NetAmount || 0,
            TaxAmount: item.tax_amount || item.TaxAmount || 0,
            Discount: { value: item.discount || 0 },
            ItemCode: { value: item.item_code || '' },
            UnitOfMeasure: { value: item.unit_of_measure || '' },
            TaxRate: { value: item.tax_rate || '' },
            GrossAmount: { value: item.gross_amount || 0 }
        }));

    }, [codingLineItems, rawExtractedData]);


    // Fetch vendor master details
    const [selectedVendorDetails, setSelectedVendorDetails] = React.useState(null);
    const [vendorMasterData, setVendorMasterData] = React.useState([]);

    React.useEffect(() => {
        const fetchVendorMaster = async () => {
            try {
                const files = await masterDataService.getFiles();
                // Broader tab name matching consistent with GenericInputFields.jsx
                const vendorFile = files.find(f =>
                    f.tab_name === 'Vendor_Master' || f.tab_name === 'Vendor Master' ||
                    f.tab_name === 'Vendors' || f.tab_name === 'Vendor'
                );

                if (vendorFile && vendorFile.sheets && vendorFile.sheets.length > 0) {
                    const collectionName = vendorFile.sheets[0].collection_name;
                    const vendors = await masterDataService.getSheetData(collectionName);
                    setVendorMasterData(vendors);

                    // Identify robust vendor ID
                    const extracted = rawExtractedData || {};
                    const vIdFromExtracted = typeof extracted?.vendor_info?.vendor_id === 'object'
                        ? extracted.vendor_info.vendor_id?.value
                        : extracted?.vendor_info?.vendor_id;

                    const effectiveVendorId = invoiceData?.vendor_id || invoiceData?.vendorId || vIdFromExtracted || formData['Vendor ID'];

                    if (effectiveVendorId && vendors) {
                        const matchedVendor = vendors.find(v => {
                            // Discover the correct ID key in master data case-insensitively
                            const vIdKey = Object.keys(v).find(k => {
                                const normK = k.toLowerCase().replace(/[\s_]/g, '');
                                return normK === 'vendorid';
                            });
                            const vId = vIdKey ? v[vIdKey] : (v['Vendor ID'] || v['VendorID'] || v['vendor_id'] || v['VENDOR_ID']);
                            return String(vId).trim() === String(effectiveVendorId).trim();
                        });
                        if (matchedVendor) {
                            setSelectedVendorDetails(matchedVendor);
                        }
                    }
                }
            } catch (error) {
                console.error('Error fetching vendor master data:', error);
            }
        };

        const extracted = rawExtractedData || {};
        const vIdFromExtracted = typeof extracted?.vendor_info?.vendor_id === 'object'
            ? extracted.vendor_info.vendor_id?.value
            : extracted?.vendor_info?.vendor_id;
        const effectiveVendorId = invoiceData?.vendor_id || invoiceData?.vendorId || vIdFromExtracted || formData['Vendor ID'];

        if (effectiveVendorId) {
            fetchVendorMaster();
        }
    }, [invoiceData?.vendor_id, invoiceData?.vendorId, rawExtractedData, formData['Vendor ID']]);

    // Line item columns for tabs (read-only version)
    const lineItemColumnsForTabs = React.useMemo(() => [
        { title: 'S.No', key: 'item_number', width: 50, render: (text, record, index) => index + 1 },
        {
            title: 'Description', dataIndex: 'Description', key: 'Description', width: 200,
            render: (val) => <Input.TextArea rows={2} value={extractValue(val)} disabled style={disabledStyle} />
        },
        {
            title: 'Qty', dataIndex: 'Quantity', key: 'Quantity', width: 80,
            render: (val) => <InputNumber style={{ width: '100%', ...disabledStyle }} value={extractValue(val)} disabled />
        },
        {
            title: 'Unit Price', dataIndex: 'UnitPrice', key: 'UnitPrice', width: 120,
            render: (val) => <InputNumber style={{ width: '100%', ...disabledStyle }} value={parseCurrencyValue(extractValue(val))} step={0.01} prefix="$" disabled />
        },
        {
            title: 'Discount', dataIndex: 'Discount', key: 'Discount', width: 120,
            render: (val) => <InputNumber style={{ width: '100%', ...disabledStyle }} value={parseCurrencyValue(extractValue(val))} step={0.01} prefix="$" disabled />
        },
        {
            title: 'Net Amount', dataIndex: 'NetAmount', key: 'NetAmount', width: 120,
            render: (val) => <InputNumber style={{ width: '100%', ...disabledStyle }} value={parseCurrencyValue(extractValue(val))} step={0.01} prefix="$" disabled />
        },
        {
            title: 'Tax Amt', dataIndex: 'TaxAmount', key: 'TaxAmount', width: 100,
            render: (val) => <InputNumber style={{ width: '100%', ...disabledStyle }} value={parseCurrencyValue(extractValue(val))} step={0.01} disabled />
        }
    ], [disabledStyle]);

    useEffect(() => {
        setCurrencySymbol('$');
    }, [invoiceData, currencies]);


    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            try {
                const user = JSON.parse(storedUser);
                setUserRole(user.role || '');
            } catch (e) {
                setUserRole('');
            }
        }
    }, []);

    // Fetch PDF blob
    useEffect(() => {
        const fetchPdf = async () => {
            if (!invoiceData?.id) return;

            try {
                setLoadingPdf(true);
                const blobUrl = await invoiceService.getPdfBlob(invoiceData.id);
                setPdfUrl(blobUrl);
            } catch (error) {
                console.error('Error fetching PDF:', error);
                const fallbackUrl = invoiceData.fileUrl || invoiceData.rawData?.file_url || invoiceService.getPdfUrl(invoiceData.id);
                setPdfUrl(fallbackUrl);
            } finally {
                setLoadingPdf(false);
            }
        };

        fetchPdf();

        return () => {
            if (pdfUrl && pdfUrl.startsWith('blob:')) {
                URL.revokeObjectURL(pdfUrl);
            }
        };
    }, [invoiceData?.id]);

    // ⭐⭐⭐ UPDATED MASTER DATA BLOCK ⭐⭐⭐
    useEffect(() => {
        const fetchMasterData = async () => {
            try {
                setLoadingMasterData(true);

                const files = await masterDataService.getFiles();
                const findCollection = (tabName, keyword) => {
                    const f = files.find(item => item.tab_name === tabName);
                    if (f && f.sheets && f.sheets.length > 0) {
                        if (keyword) {
                            const sheet = f.sheets.find(s =>
                                s.name.toLowerCase().includes(keyword.toLowerCase())
                            );
                            if (sheet) return sheet.collection_name;
                        }
                        return f.sheets[0].collection_name;
                    }
                    return `master_data_${tabName}`;
                };


                const getFieldLoose = (obj, searchFields) => {
                    if (!obj) return null;
                    const keys = Object.keys(obj);
                    for (const field of searchFields) {
                        if (obj[field] !== undefined && obj[field] !== null) return obj[field];
                        const foundKey = keys.find(k =>
                            k.toLowerCase().replace(/[^a-z0-9]/g, '') === field.toLowerCase().replace(/[^a-z0-9]/g, '')
                        );
                        if (foundKey && obj[foundKey] !== undefined && obj[foundKey] !== null) return obj[foundKey];
                    }
                    return null;
                };

                // Helper to fetch & format from a specific collection
                const loadCollection = async (collectionName, formatter) => {
                    try {
                        const rows = await masterDataService.getSheetData(collectionName);
                        if (!rows || rows.length === 0) return [];
                        return rows.map((row, i) => {
                            const val = formatter(row);
                            return {
                                value: val,
                                label: val,
                                key: `${collectionName}_${i}`
                            };
                        }).filter(opt => opt.value);
                    } catch (e) {
                        return [];
                    }
                };

                const [
                    gl,
                    lob,
                    dept,
                    cust,
                    item,
                    currData
                ] = await Promise.all([
                    // Look in their specific tabs instead of hardcoding "Line_Items"
                    loadCollection(findCollection("GL"), row => {
                        const acc = getFieldLoose(row, ["account_number", "Account number", "Code", "GL Code", "AccountNumber", "GLCode"]);
                        const title = getFieldLoose(row, ["title", "Title", "Name", "Description", "GLName", "AccountName"]);
                        return acc && title ? `${acc} - ${title}` : (acc || title || "");
                    }),
                    loadCollection(findCollection("LOB"), row => {
                        const id = getFieldLoose(row, ["lob_id", "LOB ID", "LOBID", "LOB", "LineOfBusiness"]);
                        const name = getFieldLoose(row, ["name", "Name", "LOB Name", "LOBName", "Description"]);
                        return id && name ? `${id} - ${name}` : (id || name || "");
                    }),
                    loadCollection(findCollection("Department"), row => {
                        const id = getFieldLoose(row, ["department_id", "Department ID", "DeptID", "ID", "Dept", "DepartmentCode"]);
                        const name = getFieldLoose(row, ["department_name", "Department name", "Department Name", "DeptName", "Name"]);
                        return id && name ? `${id} - ${name}` : (id || name || "");
                    }),
                    loadCollection(findCollection("Customer"), row => {
                        const id = getFieldLoose(row, ["customer_id", "Customer ID", "CustomerID", "ID", "VENDOR_ID", "Vendor ID"]);
                        const name = getFieldLoose(row, ["customer_name", "Customer Name", "CustomerName", "Name", "VENDOR_NAME", "Vendor Name"]);
                        return id && name ? `${id} - ${name}` : (id || name || "");
                    }),
                    loadCollection(findCollection("Item"), row => {
                        const id = getFieldLoose(row, ["item_id", "Item ID", "ItemID", "ID", "ItemCode"]);
                        const name = getFieldLoose(row, ["name", "Item Name", "ItemName", "Description"]);
                        return id && name ? `${id} - ${name}` : (id || name || "");
                    }),
                    currencyService.getCurrencies()
                ]);




                // Fallback: If options are still empty, try the old logic briefly or just use what we have
                setGlOptions(gl);
                setLobOptions(lob);
                setDeptOptions(dept);
                setCustomerOptions(cust);
                setItemOptions(item);
                setCurrencies(currData);

            } catch (error) {
                console.error("Error fetching master data:", error);
                message.error("Failed to load master data options");
            } finally {
                setLoadingMasterData(false);
            }
        };

        fetchMasterData();
    }, []);

    // Extract line items
    useEffect(() => {
        if (invoiceData?.rawData?.extracted_data?.Items?.value) {
            const items = invoiceData.rawData.extracted_data.Items.value.map((item, index) => ({
                key: index,
                original_index: index,
                s_no: index + 1,
                description: item.description?.value || '',
                line_type: 'Expense',
                quantity: item.quantity?.value || 0,
                unit_price: item.unit_price?.value || 0,
                net_amount: item.amount?.value || 0,
                gl_code: '',
                lob: '',
                department: '',
                customer: '',
                item: ''
            }));
            setCodingLineItems(items);

            // Initialize all rows as selected by default
            setSelectedRowKeys(items.map((_, index) => index));
        }
    }, [invoiceData]);

    // Load existing coding data
    useEffect(() => {
        const loadCodingData = async () => {
            if (!invoiceData?.id) return;

            try {
                const response = await codingService.getCoding(invoiceData.id);
                console.log('DEBUG: codingService.getCoding response:', response);
                console.log('DEBUG: glOptions:', glOptions);
                if (response) {
                    setHeaderCoding(response.header_coding || '');
                    if (response.line_items && Array.isArray(response.line_items)) {
                        setCodingLineItems(response.line_items.map((item, index) => ({
                            ...item,
                            key: index,
                            s_no: item.s_no || index + 1,
                            original_index: item.original_index ?? -1
                        })));
                    }
                }
            } catch (error) {
                console.log('No existing coding data found', error);
            }
        };

        loadCodingData();
    }, [invoiceData?.id]);

    useEffect(() => {
        const loadApproverStatus = async () => {
            if (invoiceData?.id && invoiceData?.status === 'waiting_approval') {
                try {
                    const statusData = await workflowService.getApproverStatus(invoiceData.id);

                    // Calculate count based on current cycle only
                    // Find last reset time (reworked/rejected)
                    const history = invoiceData?.rawData?.status_history || [];
                    let lastResetTime = new Date(0);

                    history.forEach(entry => {
                        if (['reworked', 'rejected', 'waiting_coding'].includes(entry.status) && entry.timestamp) {
                            const entryTime = new Date(entry.timestamp);
                            if (entryTime > lastResetTime) {
                                lastResetTime = entryTime;
                            }
                        }
                    });

                    // Filter approvers that are after the last reset
                    const currentCycleApprovers = (statusData.approvers || []).filter(app => {
                        const appTime = new Date(app.timestamp);
                        return appTime > lastResetTime;
                    });

                    setCompletedApproversCount(currentCycleApprovers.length);
                } catch (error) {
                    console.error('Error fetching approver status:', error);
                }
            }
        };
        loadApproverStatus();
    }, [invoiceData?.id, invoiceData?.status]);

    const [highlightedRegions, setHighlightedRegions] = useState([]);

    useEffect(() => {
        if (!hoveredKey || !invoiceData) {
            setHighlightedRegions([]);
            return;
        }

        const data = invoiceData.extracted_data || invoiceData.rawData?.extracted_data;
        if (!data) return;

        let targetObj = null;

        if (hoveredKey.startsWith('LineItem_')) {
            const parts = hoveredKey.split('_');
            const index = parseInt(parts[1], 10);
            const field = parts[2]; // description, quantity, etc.

            if (data.Items?.value && data.Items.value[index]) {
                const item = data.Items.value[index];
                // Map UI field to API field
                const fieldMap = {
                    'description': 'description',
                    'quantity': 'quantity',
                    'unit_price': 'unit_price',
                    'net_amount': 'amount'
                };
                const apiField = fieldMap[field];
                if (apiField) {
                    targetObj = item[apiField];
                }
            }
        } else {
            // Header fields
            const map = {
                'vendor_id': data.vendor_info?.vendor_id,
                'vendor_name': data.vendor_info?.name,
                'invoice_id': data.invoice_details?.invoice_number,
                'total_amount': data.amounts?.total_invoice_amount,
                'amount_due': data.amounts?.amount_due,
                'due_date': data.invoice_details?.due_date
            };
            targetObj = map[hoveredKey];
        }

        if (targetObj && targetObj.bounding_regions) {
            setHighlightedRegions(targetObj.bounding_regions);
        } else {
            setHighlightedRegions([]);
        }
    }, [hoveredKey, invoiceData]);

    const handleHeaderCodingChange = (value) => {
        setHeaderCoding(value);
    };

    const handleCodingLineItemChange = (index, field, value) => {
        const newItems = [...codingLineItems];
        newItems[index][field] = value;

        // Auto-calculate Net Amount if Quantity or Unit Price changes
        if (field === 'quantity' || field === 'unit_price') {
            const qty = parseFloat(field === 'quantity' ? value : newItems[index].quantity) || 0;
            const price = parseFloat(field === 'unit_price' ? value : newItems[index].unit_price) || 0;
            newItems[index].net_amount = (qty * price).toFixed(2);
        }

        // If the row is selected (checked), apply the value to all other selected rows
        if (selectedRowKeys.includes(index) && ['gl_code', 'lob', 'department', 'customer', 'item'].includes(field)) {
            // Apply to all other selected rows (excluding the current one)
            selectedRowKeys.forEach(selectedIndex => {
                if (selectedIndex !== index && selectedIndex < newItems.length) {
                    newItems[selectedIndex][field] = value;
                }
            });
        }

        setCodingLineItems(newItems);
    };

    const handleAddLineItem = () => {
        const newItem = {
            key: codingLineItems.length,
            s_no: codingLineItems.length + 1,
            original_index: -1, // New item
            description: '',
            line_type: 'Expense',
            quantity: 1,
            unit_price: 0,
            net_amount: 0,
            gl_code: '',
            lob: '',
            department: '',
            customer: '',
            item: ''
        };
        setCodingLineItems([...codingLineItems, newItem]);
    };

    const handleDeleteLineItem = (index) => {
        const newItems = codingLineItems.filter((_, i) => i !== index);
        setCodingLineItems(newItems);

        // Update selectedRowKeys to remove the deleted index
        setSelectedRowKeys(prev => prev
            .filter(key => key !== index)
            .map(key => key > index ? key - 1 : key)
        );

        message.success('Line item deleted');
    };

    const handleRowSelection = (index) => {
        setSelectedRowKeys(prev => {
            if (prev.includes(index)) {
                // When DESELECTING a row: just remove from selection, DON'T clear values
                return prev.filter(key => key !== index);
            } else {
                // When SELECTING a row: add it to selection
                return [...prev, index];
            }
        });
    };

    const handleSelectAllRows = (checked) => {
        if (checked) {
            // Select all rows
            setSelectedRowKeys(codingLineItems.map((_, index) => index));
        } else {
            // Deselect all rows (but keep the values)
            setSelectedRowKeys([]);
        }
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            const cleanedLineItems = codingLineItems.map(({ key, ...item }) => ({
                s_no: parseInt(item.s_no) || 0,
                description: String(item.description || ''),
                line_type: String(item.line_type || 'Expense'),
                quantity: parseFloat(item.quantity) || 0,
                unit_price: parseFloat(item.unit_price) || 0,
                net_amount: parseFloat(item.net_amount) || 0,
                gl_code: String(item.gl_code || ''),
                lob: String(item.lob || ''),
                department: String(item.department || ''),
                customer: String(item.customer || ''),
                item: String(item.item || ''),
                original_index: item.original_index ?? -1
            }));

            await codingService.saveCoding({
                invoice_id: invoiceData.id,
                header_coding: headerCoding,
                line_items: cleanedLineItems,
                vendor_name: invoiceData?.vendorName || ''
            });

            message.success('Coding saved successfully!');
            setWorkflowRefreshTrigger(prev => prev + 1);
        } catch (error) {
            console.error('Error saving:', error);
            message.error('Failed to save coding');
        } finally {
            setSaving(false);
        }
    };

    const handleSendToApproval = async () => {
        try {
            setSaving(true);
            const cleanedLineItems = codingLineItems.map(({ key, ...item }) => ({
                s_no: parseInt(item.s_no) || 0,
                description: String(item.description || ''),
                line_type: String(item.line_type || 'Expense'),
                quantity: parseFloat(item.quantity) || 0,
                unit_price: parseFloat(item.unit_price) || 0,
                net_amount: parseFloat(item.net_amount) || 0,
                gl_code: String(item.gl_code || ''),
                lob: String(item.lob || ''),
                department: String(item.department || ''),
                customer: String(item.customer || ''),
                item: String(item.item || ''),
                original_index: item.original_index ?? -1
            }));

            // Save coding first - this ensures "Send for Approval" triggers a save
            await codingService.saveCoding({
                invoice_id: invoiceData.id,
                header_coding: headerCoding,
                line_items: cleanedLineItems,
                vendor_name: invoiceData?.vendorName || '',
            });

            // Send to approval using new approval service
            await approvalService.sendToApproval(invoiceData.id);

            message.success('Invoice sent to approval successfully!');
            navigate('/coding');
        } catch (error) {
            console.error('Error sending:', error);
            message.error('Failed to send to approval');
        } finally {
            setSaving(false);
        }
    };

    const handleRecall = async () => {
        try {
            setSaving(true);
            await invoiceService.recallInvoice(invoiceData.id);
            message.success('Invoice recalled successfully');
            // Optimistically update status
            navigate('/coding');
        } catch (error) {
            console.error('Error recalling invoice:', error);
            message.error('Failed to recall invoice');
        } finally {
            setSaving(false);
        }
    };


    // Import from Excel
    const handleImportExcel = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            const bstr = evt.target.result;
            const wb = read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data = utils.sheet_to_json(ws);

            if (!data || data.length === 0) {
                message.error('No data found in the uploaded file');
                return;
            }

            // Map imported data to line items
            // Expected headers: S.No, Description, Line Type, Quantity, Unit Price, Net Amount, GL Code, LOB, Department, Customer, Item
            // Flexible matching for headers
            const getVal = (row, keys) => {
                for (const k of keys) {
                    if (row[k] !== undefined) return row[k];
                }
                return '';
            };

            const startIdx = codingLineItems.length;

            const newItems = data.map((row, index) => {
                const qty = parseFloat(getVal(row, ['Quantity', 'quantity', 'Qty'])) || 0;
                const price = parseFloat(getVal(row, ['Unit Price', 'unit_price', 'Price'])) || 0;
                // Calculate net amount if not provided, or take provided
                let net = parseFloat(getVal(row, ['Net Amount', 'net_amount', 'Amount'])) || 0;
                if (net === 0 && qty !== 0 && price !== 0) {
                    net = qty * price;
                }

                return {
                    key: startIdx + index,
                    s_no: startIdx + index + 1,
                    original_index: -1,
                    description: String(getVal(row, ['Description', 'description']) || ''),
                    line_type: String(getVal(row, ['Line Type', 'line_type', 'Type']) || 'Expense'),
                    quantity: qty,
                    unit_price: price,
                    net_amount: parseFloat(net.toFixed(2)),
                    gl_code: String(getVal(row, ['GL Code', 'gl_code', 'GL']) || ''),
                    lob: String(getVal(row, ['LOB', 'lob']) || ''),
                    department: String(getVal(row, ['Department', 'department', 'Dept']) || ''),
                    customer: String(getVal(row, ['Customer', 'customer']) || ''),
                    item: String(getVal(row, ['Item', 'item']) || '')
                };
            });

            const combinedItems = [...codingLineItems, ...newItems];
            setCodingLineItems(combinedItems);

            // Select ONLY the new items
            setSelectedRowKeys(newItems.map(item => item.key));

            message.success(`Imported ${newItems.length} line items (appended)`);

            // Clear the input so same file can be selected again if needed
            e.target.value = '';
        };
        reader.readAsBinaryString(file);
    };

    const exportToExcel = () => {
        if (!codingLineItems || codingLineItems.length === 0) {
            message.warning('No line items to export');
            return;
        }

        // Define columns to export
        const headers = [
            'S.No', 'Description', 'Line Type', 'Quantity', 'Unit Price',
            'Net Amount', 'GL Code', 'LOB', 'Department', 'Customer', 'Item'
        ];

        // Map data to array of arrays
        const data = codingLineItems.map(item => [
            item.s_no,
            `"${item.description || ''}"`, // Quote descriptions to handle commas
            item.line_type,
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
        link.setAttribute('download', `coding_line_items_${invoiceData?.invoiceId || 'export'}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };


    // Dragging
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
            localStorage.setItem('codingReviewSplitWidth', leftWidthRef.current);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    // Table definitions
    const headerColumns = [
        {
            title: 'Vendor ID',
            dataIndex: 'vendor_id',
            key: 'vendor_id',
            width: '15%',
            render: (text) => (
                <Input value={text} disabled style={disabledStyle} />
            )
        },

        {
            title: 'Vendor Name',
            dataIndex: 'vendor_name',
            key: 'vendor_name',
            width: '15%',
            render: (text) => (
                <div
                    onMouseEnter={() => setHoveredKey('vendor_name')}
                    onMouseLeave={() => setHoveredKey(null)}
                    style={{ width: '100%' }}
                >
                    <Input value={text} disabled style={disabledStyle} />
                </div>
            )
        },
        {
            title: 'Invoice ID',
            dataIndex: 'invoice_id',
            key: 'invoice_id',
            width: '15%',
            render: (text) => (
                <div
                    onMouseEnter={() => setHoveredKey('invoice_id')}
                    onMouseLeave={() => setHoveredKey(null)}
                    style={{ width: '100%' }}
                >
                    <Input value={text} disabled style={disabledStyle} />
                </div>
            )
        },
        {
            title: 'Total Amount',
            dataIndex: 'total_amount',
            key: 'total_amount',
            width: '15%',
            render: (text) => (
                <div
                    onMouseEnter={() => setHoveredKey('total_amount')}
                    onMouseLeave={() => setHoveredKey(null)}
                    style={{ width: '100%' }}
                >
                    <Input
                        value={formatCurrencyOnce(text)}
                        disabled
                        style={disabledStyle}
                    />

                </div>
            )
        },
        {
            title: 'Amount Due',
            dataIndex: 'amount_due',
            key: 'amount_due',
            width: '15%',
            render: (text) => (
                <div
                    onMouseEnter={() => setHoveredKey('amount_due')}
                    onMouseLeave={() => setHoveredKey(null)}
                    style={{ width: '100%' }}
                >
                    <Input
                        value={formatCurrencyOnce(text)}
                        disabled
                        style={disabledStyle}
                    />
                </div>
            )
        },
        {
            title: 'Exch. Rate',
            dataIndex: 'exchange_rate',
            key: 'exchange_rate',
            width: '10%',
            render: (text) => (
                <Input value={text} disabled style={disabledStyle} />
            )
        },
        {
            title: 'Due Date',
            dataIndex: 'due_date',
            key: 'due_date',
            width: '15%',
            render: (text) => {
                const formatDate = (dateString) => {
                    if (!dateString) return '';
                    const date = new Date(dateString);
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    const year = date.getFullYear();
                    return `${month}-${day}-${year}`;
                };

                return (
                    <div
                        onMouseEnter={() => setHoveredKey('due_date')}
                        onMouseLeave={() => setHoveredKey(null)}
                        style={{ width: '100%' }}
                    >
                        <Input value={formatDate(text)} disabled style={disabledStyle} />
                    </div>
                );
            }
        },
        {
            title: 'Memo',
            dataIndex: 'memo',
            key: 'memo',
            width: '15%',
            render: (text) => (
                <Input value={text} disabled style={disabledStyle} />

            )
        }
    ];

    const headerDataSource = [
        {
            key: '1',
            vendor_id: invoiceData?.vendorId ||
                invoiceData?.rawData?.extracted_data?.vendor_info?.vendor_id?.value ||
                invoiceData?.rawData?.extracted_data?.vendor_info?.vendor_id ||
                '',
            vendor_name: invoiceData?.vendorName || '',
            invoice_id: invoiceData?.invoiceId || '',
            total_amount: invoiceData?.rawData?.extracted_data?.amounts?.total_invoice_amount?.value || '',
            amount_due: invoiceData?.rawData?.extracted_data?.amounts?.amount_due?.value || '',
            exchange_rate: invoiceData?.exchange_rate || invoiceData?.rawData?.exchange_rate || '',
            due_date: invoiceData?.rawData?.extracted_data?.invoice_details?.due_date?.value || '',
            memo: invoiceData?.rawData?.extracted_data?.additional_info?.memo?.value || '',
        }
    ];

    const lineItemColumns = [
        {
            title: (
                <Checkbox
                    checked={selectedRowKeys.length === codingLineItems.length && codingLineItems.length > 0}
                    indeterminate={selectedRowKeys.length > 0 && selectedRowKeys.length < codingLineItems.length}
                    onChange={(e) => handleSelectAllRows(e.target.checked)}
                />
            ),
            key: 'selection',
            width: '3%',
            render: (text, record, index) => (
                <Checkbox
                    checked={selectedRowKeys.includes(index)}
                    onChange={() => handleRowSelection(index)}
                />
            )
        },
        {
            title: 'S.No',
            dataIndex: 's_no',
            key: 's_no',
            width: '4%',
            render: (text, record, index) => index + 1
        },
        {
            title: 'Description',
            dataIndex: 'description',
            key: 'description',
            width: '12%',
            sorter: (a, b) => (a.description || '').localeCompare(b.description || ''),
            render: (text, record, index) => (
                <div
                    onMouseEnter={() => setHoveredKey(`LineItem_${index}_description`)}
                    onMouseLeave={() => setHoveredKey(null)}
                    style={{ width: '100%' }}
                >
                    <Input
                        value={text}
                        onChange={(e) => handleCodingLineItemChange(index, 'description', e.target.value)}
                        disabled={disableEditing}
                        placeholder="Description"
                        style={disableEditing ? disabledStyle : {}}
                    />
                </div>
            )
        },
        {
            title: 'Line Type',
            dataIndex: 'line_type',
            key: 'line_type',
            width: '8%',
            sorter: (a, b) => (a.line_type || '').localeCompare(b.line_type || ''),
            filters: [
                { text: 'Expense', value: 'Expense' },
                { text: 'Asset', value: 'Asset' },
                { text: 'Liability', value: 'Liability' },
            ],
            onFilter: (value, record) => record.line_type === value,
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
                    style={{ width: '100%', ...disabledStyle }}
                    disabled={disableEditing}
                />
            )
        },
        {
            title: 'Quantity',
            dataIndex: 'quantity',
            key: 'quantity',
            width: '6%',
            sorter: (a, b) => (parseFloat(a.quantity) || 0) - (parseFloat(b.quantity) || 0),
            render: (text, record, index) => (
                <div
                    onMouseEnter={() => setHoveredKey(`LineItem_${index}_quantity`)}
                    onMouseLeave={() => setHoveredKey(null)}
                    style={{ width: '100%', }}
                >
                    <InputNumber
                        value={codingLineItems[index]?.quantity ?? ''}
                        onChange={(value) => handleCodingLineItemChange(index, 'quantity', value)}
                        disabled={disableEditing}
                        style={disableEditing ? disabledStyle : {}}
                    />

                </div>
            )
        },
        {
            title: 'Unit Price',
            dataIndex: 'unit_price',
            key: 'unit_price',
            width: '8%',
            sorter: (a, b) => (parseFloat(a.unit_price) || 0) - (parseFloat(b.unit_price) || 0),
            render: (text, record, index) => (
                <div
                    onMouseEnter={() => setHoveredKey(`LineItem_${index}_unit_price`)}
                    onMouseLeave={() => setHoveredKey(null)}
                    style={{ width: '100%' }}
                >
                    <InputNumber
                        value={codingLineItems[index]?.unit_price ?? ''}
                        onChange={(value) => handleCodingLineItemChange(index, 'unit_price', value)}
                        disabled={disableEditing}
                        prefix="$"
                        style={disableEditing ? disabledStyle : { width: '100%' }}
                    />

                </div>
            )
        },
        {
            title: 'Net Amount',
            dataIndex: 'net_amount',
            key: 'net_amount',
            width: '8%',
            sorter: (a, b) => (parseFloat(a.net_amount) || 0) - (parseFloat(b.net_amount) || 0),
            render: (text, record, index) => (
                <div
                    onMouseEnter={() => setHoveredKey(`LineItem_${index}_net_amount`)}
                    onMouseLeave={() => setHoveredKey(null)}
                    style={{ width: '100%' }}
                >
                    <InputNumber
                        value={codingLineItems[index]?.net_amount ?? ''}
                        onChange={(value) => handleCodingLineItemChange(index, 'net_amount', value)}
                        disabled={disableEditing}
                        prefix="$"
                        style={disableEditing ? disabledStyle : { width: '100%' }}
                    />

                </div>
            )
        },
        {
            title: 'GL Code',
            dataIndex: 'gl_code',
            key: 'gl_code',
            width: '12%',
            sorter: (a, b) => (a.gl_code || '').localeCompare(b.gl_code || ''),
            filterSearch: true,
            filters: [...new Set(codingLineItems.map(item => item.gl_code).filter(Boolean))].map(code => ({ text: code, value: code })),
            onFilter: (value, record) => record.gl_code === value,
            render: (text, record, index) => (
                <Select
                    value={codingLineItems[index]?.gl_code || undefined}
                    placeholder="Select GL Code"
                    onChange={(value) =>
                        handleCodingLineItemChange(index, 'gl_code', value)
                    }
                    options={glOptions}
                    showSearch
                    filterOption={(input, option) =>
                        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    loading={loadingMasterData}
                    style={{ width: '100%', ...disabledStyle }}
                    dropdownMatchSelectWidth={false}
                    disabled={disableEditing}
                />
            )
        },
        {
            title: 'LOB',
            dataIndex: 'lob',
            key: 'lob',
            width: '10%',
            sorter: (a, b) => (a.lob || '').localeCompare(b.lob || ''),
            filterSearch: true,
            filters: [...new Set(codingLineItems.map(item => item.lob).filter(Boolean))].map(lob => ({ text: lob, value: lob })),
            onFilter: (value, record) => record.lob === value,
            render: (text, record, index) => (
                <Select
                    value={codingLineItems[index]?.lob || undefined}
                    placeholder="Select LOB"
                    onChange={(value) =>
                        handleCodingLineItemChange(index, 'lob', value)
                    }
                    options={lobOptions}
                    showSearch
                    filterOption={(input, option) =>
                        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    loading={loadingMasterData}
                    style={{ width: '100%', ...disabledStyle }}
                    dropdownMatchSelectWidth={false}
                    disabled={disableEditing}
                />
            )
        },
        {
            title: 'Department',
            dataIndex: 'department',
            key: 'department',
            width: '10%',
            sorter: (a, b) => (a.department || '').localeCompare(b.department || ''),
            filterSearch: true,
            filters: [...new Set(codingLineItems.map(item => item.department).filter(Boolean))].map(dept => ({ text: dept, value: dept })),
            onFilter: (value, record) => record.department === value,
            render: (text, record, index) => (
                <Select
                    value={codingLineItems[index]?.department || undefined}
                    placeholder="Select Department"
                    onChange={(value) =>
                        handleCodingLineItemChange(index, 'department', value)
                    }
                    options={deptOptions}
                    showSearch
                    filterOption={(input, option) =>
                        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    loading={loadingMasterData}
                    style={{ width: '100%', ...disabledStyle }}
                    dropdownMatchSelectWidth={false}
                    disabled={disableEditing}
                />
            )
        },
        {
            title: 'Customer',
            dataIndex: 'customer',
            key: 'customer',
            width: '10%',
            sorter: (a, b) => (a.customer || '').localeCompare(b.customer || ''),
            filterSearch: true,
            filters: [...new Set(codingLineItems.map(item => item.customer).filter(Boolean))].map(cust => ({ text: cust, value: cust })),
            onFilter: (value, record) => record.customer === value,
            render: (text, record, index) => (
                <Select
                    value={codingLineItems[index]?.customer || undefined}
                    placeholder="Select Customer"
                    onChange={(value) =>
                        handleCodingLineItemChange(index, 'customer', value)
                    }
                    options={customerOptions}
                    showSearch
                    filterOption={(input, option) =>
                        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    loading={loadingMasterData}
                    style={{ width: '100%', ...disabledStyle }}
                    dropdownMatchSelectWidth={false}
                    disabled={disableEditing}
                />
            )
        },
        {
            title: 'Item',
            dataIndex: 'item',
            key: 'item',
            width: '10%',
            sorter: (a, b) => (a.item || '').localeCompare(b.item || ''),
            filterSearch: true,
            filters: [...new Set(codingLineItems.map(item => item.item).filter(Boolean))].map(itm => ({ text: itm, value: itm })),
            onFilter: (value, record) => record.item === value,
            render: (text, record, index) => (
                <Select
                    value={codingLineItems[index]?.item || undefined}
                    placeholder="Select Item"
                    onChange={(value) =>
                        handleCodingLineItemChange(index, 'item', value)
                    }
                    options={itemOptions}
                    showSearch
                    filterOption={(input, option) =>
                        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    loading={loadingMasterData}
                    style={{ width: '100%', ...disabledStyle }}
                    dropdownMatchSelectWidth={false}
                    disabled={disableEditing}
                />
            )
        },
        {
            title: 'Actions',
            key: 'actions',
            width: '5%',
            render: (_, record, index) => (
                <Button
                    type="link"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleDeleteLineItem(index)}
                />
            )
        }
    ];

    if (!invoiceData) {
        return (
            <div style={{ padding: '24px' }}>
                <p>No invoice data found. Please go back and select an invoice.</p>
                <Button onClick={() => navigate('/coding')}>Back to Coding</Button>
            </div>
        );
    }

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
                    flex: `0 0 ${leftWidth}%`,
                    borderRight: '1px solid #e8e8e8',
                    overflow: 'hidden',
                    background: '#f5f5f5',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <PdfViewerWithHighlight
                        file={pdfUrl}
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

                {/* RIGHT SIDE CONTENT */}
                <div style={{
                    flex: 1,
                    overflow: 'auto',
                    background: 'white',
                    padding: '20px'
                }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '20px',
                        paddingBottom: '16px',
                        borderBottom: '1px solid #f0f0f0'
                    }}>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <Button
                                icon={<ArrowLeftOutlined />}
                                onClick={() => navigate('/coding')}
                            >
                                Back to Coding
                            </Button>
                            <Button
                                icon={<ArrowLeftOutlined />}
                                onClick={() => navigate('/dashboard', { state: { activeTab: 'invoices' } })}
                            >
                                Back to Invoice
                            </Button>
                        </div>




                        <div style={{ display: 'flex', gap: '10px' }}>
                            {!disableEditing && (
                                <Button
                                    type="primary"
                                    icon={<SaveOutlined />}
                                    onClick={handleSave}
                                    loading={saving}
                                    disabled={disableEditing}
                                >
                                    Save
                                </Button>
                            )}
                            {invoiceData?.status === 'waiting_approval' &&
                                !isApproved &&
                                !isRejected &&
                                userRole !== 'approver' &&
                                userRole !== 'admin' &&
                                completedApproversCount === 0 && (
                                    <Button
                                        type="primary"
                                        icon={<RollbackOutlined />}
                                        onClick={handleRecall}
                                        loading={saving}
                                    >
                                        Recall
                                    </Button>
                                )}
                            {!disableEditing && (
                                <Button
                                    type="primary"
                                    icon={<SendOutlined />}
                                    onClick={handleSendToApproval}
                                    loading={saving}
                                    disabled={disableEditing}
                                >
                                    Send to Approval
                                </Button>
                            )}
                        </div>
                    </div>

                    <Tabs
                        defaultActiveKey="coding"
                        items={[
                            {
                                key: 'quick_view',
                                label: 'Quick View',
                                children: (
                                    <QuickViewTab
                                        formData={formData}
                                        lineItems={lineItemsForTabs}
                                        vendorId={formData['Vendor ID']}
                                        vendorIdOptions={[]}
                                        vendorNameOptions={[]}
                                        memo={formData['Notes / Terms']}
                                        selectedVendorDetails={selectedVendorDetails}
                                        isDuplicateError={false}
                                        disableInputs={true}
                                        disabledStyle={disabledStyle}
                                        getCurrencySymbol={getCurrencySymbol}
                                        extractValue={extractValue}
                                        parseCurrencyValue={parseCurrencyValue}
                                        renderFieldInput={renderFieldInput}
                                        handleInputChange={() => { }}
                                        handleLineItemChange={() => { }}
                                        handleAddLineItem={() => { }}
                                        setVendorId={() => { }}
                                        setMemo={() => { }}
                                        debouncedVendorIdSearch={() => { }}
                                        debouncedVendorNameSearch={() => { }}
                                        handleVendorChange={() => { }}
                                        skipNextVendorLookup={{ current: false }}
                                        exportToExcel={() => { }}
                                        lineItemColumns={lineItemColumnsForTabs}
                                        readOnly={true}
                                        isCodingData={!!(codingLineItems && codingLineItems.length > 0)}
                                    />
                                )
                            },
                            {
                                key: 'all_fields',
                                label: 'All Fields',
                                children: (
                                    <AllFieldsTab
                                        formData={formData}
                                        lineItems={lineItemsForTabs}
                                        selectedVendorDetails={selectedVendorDetails}
                                        disableInputs={true}
                                        disabledStyle={disabledStyle}
                                        getCurrencySymbol={getCurrencySymbol}
                                        extractValue={extractValue}
                                        parseCurrencyValue={parseCurrencyValue}
                                        renderFieldInput={renderFieldInput}
                                        handleAddLineItem={() => { }}
                                        exportToExcel={() => { }}
                                        lineItemColumns={lineItemColumnsForTabs}
                                        readOnly={true}
                                        schema={schemaMap.invoice}
                                        isCodingData={!!(codingLineItems && codingLineItems.length > 0)}
                                    />
                                )
                            },
                            {
                                key: 'coding',
                                label: 'Coding Fields',
                                children: loadingMasterData ? <FormSkeleton /> : (
                                    <Collapse defaultActiveKey={['header', 'lineitems']}>
                                        <Panel header="Header Coding" key="header">
                                            <Table
                                                columns={headerColumns}
                                                dataSource={headerDataSource}
                                                pagination={false}
                                                size="small"
                                                bordered
                                            />
                                        </Panel>

                                        <Panel
                                            header={
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        width: '100%',
                                                    }}
                                                >
                                                    {/* LEFT: Title */}
                                                    <span style={{ fontWeight: 500 }}>Line Items</span>

                                                    {/* RIGHT: Buttons grouped */}
                                                    <div
                                                        style={{
                                                            display: 'flex',
                                                            gap: '8px',
                                                            alignItems: 'center',
                                                        }}
                                                    >
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

                                                        <Button
                                                            icon={<UploadOutlined />}
                                                            size="small"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                document.getElementById('import-excel-input').click();
                                                            }}
                                                            disabled={disableEditing}
                                                        >
                                                            Import from Excel
                                                        </Button>

                                                        <input
                                                            type="file"
                                                            id="import-excel-input"
                                                            accept=".xlsx, .xls, .csv"
                                                            style={{ display: 'none' }}
                                                            onChange={handleImportExcel}
                                                        />
                                                    </div>
                                                </div>
                                            }
                                            key="lineitems"
                                        >

                                            <Table
                                                columns={lineItemColumns}
                                                dataSource={codingLineItems.map((item, index) => ({ ...item, key: index }))}
                                                pagination={false}
                                                scroll={{ x: 'max-content' }}
                                                size="small"
                                            />
                                            {!disableEditing && (
                                                <Button
                                                    type="dashed"
                                                    onClick={handleAddLineItem}
                                                    style={{ width: '100%', marginTop: '8px' }}
                                                    icon={<SendOutlined rotate={-90} />} // Or any plus icon
                                                >
                                                    Add Line Item
                                                </Button>
                                            )}
                                        </Panel>
                                    </Collapse>
                                )
                            },
                            {
                                key: 'gl_summary',
                                label: 'GL Summary',
                                children: (
                                    <div style={{ padding: '20px', background: '#f9f9f9', borderRadius: '8px', border: '1px solid #e8e8e8', marginTop: '10px' }}>
                                        <h3 style={{ marginBottom: '16px', borderBottom: '2px solid #1890ff', paddingBottom: '8px', color: '#001529' }}>GL Distribution Summary</h3>

                                        {(() => {
                                            // Use Total Amount from Header Coding (invoiceData)
                                            // Matches the 'total_amount' field in headerDataSource
                                            const headerTotalAmountRaw = invoiceData?.rawData?.extracted_data?.amounts?.total_amount_payable?.value;
                                            // Robust parsing: convert to string, remove currency symbols and commas, then parse
                                            const cleanedTotalAmount = String(headerTotalAmountRaw || '0').replace(/[^0-9.-]+/g, '');
                                            const headerTotalAmount = parseFloat(cleanedTotalAmount) || 0;

                                            // Try persisted summary from backend first for the breakdown
                                            const persistedSummary = invoiceData?.gl_summary;
                                            let summaryElements = null;

                                            if (persistedSummary && persistedSummary.length > 0) {
                                                summaryElements = persistedSummary.map((item) => (
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
                                                            {getCurrencySymbol()} {parseFloat(item.total_amount).toFixed(2)}
                                                        </span>
                                                    </div>
                                                ));
                                            } else {
                                                // Fallback to calculation from current state (just for the breakdown parts)
                                                const summary = {};

                                                codingLineItems.forEach(item => {
                                                    if (item.gl_code) {
                                                        summary[item.gl_code] = (summary[item.gl_code] || 0) + (parseFloat(item.net_amount) || 0);
                                                    }
                                                });

                                                const summaryEntries = Object.entries(summary);

                                                if (summaryEntries.length === 0) {
                                                    summaryElements = <p style={{ fontStyle: 'italic', color: '#8c8c8c' }}>No GL codes assigned to line items yet.</p>;
                                                } else {
                                                    summaryElements = summaryEntries.map(([glCode, total]) => (
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
                                                                {getCurrencySymbol()} {total.toFixed(2)}
                                                            </span>
                                                        </div>
                                                    ));
                                                }
                                            }

                                            return (
                                                <>
                                                    <div style={{
                                                        padding: '15px 20px',
                                                        background: 'linear-gradient(135deg, #3ba5d8 0%, #2b8fc4 100%)',
                                                        borderRadius: '8px',
                                                        marginBottom: '20px',
                                                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center'
                                                    }}>
                                                        <span style={{ fontSize: '18px', fontWeight: '700', color: 'white' }}>Total Amount Payable:</span>
                                                        <span style={{ fontSize: '24px', fontWeight: 'bold', color: 'white' }}>
                                                            {getCurrencySymbol()} {headerTotalAmount.toFixed(2)}
                                                        </span>
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                        {summaryElements}
                                                    </div>
                                                </>
                                            );
                                        })()}
                                    </div>

                                )
                            },
                            {
                                key: 'workflow',
                                label: 'Workflow',
                                children: <WorkflowTab invoiceId={invoiceData?.id} refreshTrigger={workflowRefreshTrigger} />
                            },
                            {
                                key: 'audit',
                                label: 'Audit Trail',
                                children: <AuditTrail invoiceId={invoiceData?.id} />
                            }
                        ]}
                    />
                </div>
            </div>
        </div >
    );
};

export default CodingReviewPage;


