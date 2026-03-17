// src/components/GenericInputFields.jsx
import React, { useEffect, useState, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Tabs,
    Input,
    InputNumber,
    Select,
    DatePicker,
    Button,
    message,
    Space,
    Tag,
    Table,
    Collapse
} from 'antd';
import {
    SaveOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    RollbackOutlined,
    SendOutlined,
    DeleteOutlined,
    SyncOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
dayjs.extend(customParseFormat);

import { invoiceService, codingService, workflowService, masterDataService } from '../services/api';
import { authService } from '../services/auth';
import WorkflowTab from './WorkflowTab';
import AuditTrail from './AuditTrail';
import QuickViewTab from './QuickViewTab';
import AllFieldsTab from './AllFieldsTab';
import CodingTab from './CodingTab';
import GLSummaryTab from './GLSummaryTab';

const { TextArea } = Input;
const { Panel } = Collapse;
const PRESERVED_PAYTERMS = [
    'net 7', 'net 10', 'net 15', 'net 27', 'net 30', 'net 45', 'net 60', 'net 90',
    'due upon receipt', 'due on receipt', 'immediate', 'upon receipt'
];

const GenericInputFields = forwardRef(({
    data,
    schema,
    setHoveredKey,
    invoiceId,
    originalData,
    currencies = [],
    onCurrencyChange,
    readOnly = false,
    onDuplicateChange,
    onVendorLoadingChange,
    onRefresh
}, ref) => {
    // Expose methods and state to parent
    useImperativeHandle(ref, () => ({
        handleSave,
        handleSendForCoding,
        saving,
        isDuplicateError,
        disableInputs
    }));

    // ==================== CURRENT USER & ROLE ====================
    const currentUser = authService.getCurrentUser?.();
    const isCoder = currentUser?.role === 'coder';
    const initialStatus = originalData?.status || 'waiting_approval';

    const navigate = useNavigate();
    const extractionData = data?.extraction_json || {};
    const lineItemsFromData = data?.items || data?.LineItems || [];

    console.log("DEBUG: GenericInputFields initialization", { extractionDataKeys: Object.keys(extractionData), lineItemsCount: lineItemsFromData.length });

    // ==================== STATE MANAGEMENT ====================
    const [formData, setFormData] = useState({
        ...extractionData,
        LineItems: lineItemsFromData
    });
    const [lineItems, setLineItems] = useState(lineItemsFromData);
    const skipNextVendorLookup = useRef(false);
    const initialDuplicateCheckDone = useRef(false);

    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState(readOnly ? '3' : '1');

    // Vendor Master Data state
    const [vendorMasterData, setVendorMasterData] = useState([]);
    const [selectedVendorDetails, setSelectedVendorDetails] = useState(null);
    const [vendorId, setVendorId] = useState('');
    const [vendorIdOptions, setVendorIdOptions] = useState([]);
    const [vendorNameOptions, setVendorNameOptions] = useState([]);
    const [memo, setMemo] = useState('');
    const [exchangeRate, setExchangeRate] = useState(null);
    const [isVendorLoading, setIsVendorLoading] = useState(false);

    // Line Grouping state
    const [lineGrouping, setLineGrouping] = useState('No');
    const [originalLineItems, setOriginalLineItems] = useState([]);
    const originalLineItemsRef = useRef([]);

    // Status & validation info
    const [invoiceStatus, setInvoiceStatus] = useState(initialStatus);
    const [validationInfo, setValidationInfo] = useState(
        originalData?.validation_results || {}
    );

    useEffect(() => {
        if (originalData?.status) {
            console.log("DEBUG: GenericInputFields syncing status with originalData", {
                current: invoiceStatus,
                new: originalData.status
            });
            setInvoiceStatus(originalData.status);
        }
        if (originalData?.validation_results) {
            setValidationInfo(originalData.validation_results);
        }
    }, [originalData]);

    // Coding tab
    const [headerCoding, setHeaderCoding] = useState('');
    const [codingLineItems, setCodingLineItems] = useState([]);
    const [workflowData, setWorkflowData] = useState(null);

    // Approver comment
    const [approverComment, setApproverComment] = useState('');
    const [workflowRefreshTrigger, setWorkflowRefreshTrigger] = useState(0);
    const [reposting, setReposting] = useState(false);

    // Duplicate Invoice State
    const [isDuplicateError, setIsDuplicateError] = useState(false);
    const [initialDuplicateNumber, setInitialDuplicateNumber] = useState(null);

    const invoiceDisplayId = originalData?.extracted_data?.invoice_details?.invoice_number?.value ||
        originalData?.extracted_data?.invoice_details?.invoice_id?.value ||
        originalData?.invoiceId;

    // ==================== REFS FOR DEBOUNCING & PREVENTING LOOPS ====================
    const lastDuplicateCheck = useRef({ vendorId: '', invoiceNumber: '' });
    const isCalculating = useRef(false);
    const lastCalculatedValues = useRef({ total: 0, payable: 0 });
    const renderCount = useRef(0);
    const lastFormUpdate = useRef({});
    const initialLoadDoneRef = useRef(false);
    const duplicateReadyRef = useRef(false);

    // ==================== DERIVED STATE ====================
    const terminalStatuses = ['approved', 'rejected', 'sage_posted'];
    const isTerminalStatus = terminalStatuses.includes(invoiceStatus);
    const normalizedRole = (currentUser?.role || '').toLowerCase();
    const isCoderRole = normalizedRole === 'coder';
    const isAdminRole = normalizedRole === 'admin';
    const isCoderWaiting = (invoiceStatus === 'waiting_approval' && isCoderRole);
    const disableInputs = readOnly || isTerminalStatus || (isCoderWaiting && !isAdminRole);

    // Memoize disabled style
    const disabledStyle = useMemo(() =>
        disableInputs
            ? {
                color: 'var(--color-text-primary, #000000)',
                backgroundColor: 'var(--bg-content, #ffffff)',
                cursor: 'default',
                borderColor: 'var(--color-border, #d9d9d9)',
                opacity: 0.8
            }
            : {}
        , [disableInputs]);

    // ==================== MEMOIZED HELPER FUNCTIONS ====================
    const getLineKey = (item) => {
        const desc = (extractValue(item.Description) || '').trim();
        const qty = extractValue(item.Quantity) || 0;
        const amt = extractValue(item.NetAmount) || extractValue(item.amount) || 0;
        return `${desc}__${qty}__${amt}`;
    };

    const getCurrencySymbol = useCallback(() => {
        return '$';
    }, []);

    const parseCurrencyValue = useCallback((value) => {
        if (value === null || value === undefined) return 0;
        let stringValue = String(value).trim();

        // Handle bracketed negative numbers: (100.00) -> -100.00
        let isNegative = false;
        if (stringValue.startsWith('(') && stringValue.endsWith(')')) {
            isNegative = true;
            stringValue = stringValue.substring(1, stringValue.length - 1);
        } else if (stringValue.startsWith('-')) {
            isNegative = true;
            stringValue = stringValue.substring(1);
        }

        const cleanValue = stringValue.replace(/[$,\s]/g, '');
        const parsed = parseFloat(cleanValue);
        if (isNaN(parsed)) return 0;
        return isNegative ? -parsed : parsed;
    }, []);

    const parseStoredDate = useCallback((dateStr, currency = '') => {
        if (!dateStr) return null;

        let formats = [
            'YYYY-MM-DD',
            'DD.MM.YYYY',
            'DD/MM/YYYY',
            'DD-MMM-YYYY',
            'MM-DD-YYYY',
            'MM/DD/YYYY',
            'MM.DD.YYYY',
            'YYYY/MM/DD'
        ];

        if (String(currency).toUpperCase() === 'INR') {
            formats = [
                'DD-MM-YYYY',
                'DD.MM.YYYY',
                'DD/MM/YYYY',
                'YYYY-MM-DD',
                'MM-DD-YYYY',
                'MM.DD.YYYY'
            ];
        }

        const d = dayjs(dateStr, formats, true);
        if (d.isValid()) return d;
        const fallback = dayjs(dateStr);
        return fallback.isValid() ? fallback : null;
    }, []);

    const extractValue = useCallback((fieldValue) => {
        if (fieldValue === null || fieldValue === undefined) return '';
        if (
            typeof fieldValue === 'object' &&
            fieldValue !== null &&
            'value' in fieldValue
        ) {
            return fieldValue.value ?? '';
        }
        return fieldValue;
    }, []);

    const normalizeVendor = useCallback((name) => {
        if (!name) return "";
        let text = String(name).toLowerCase();
        text = text.replace(/×/g, "x");
        text = text.replace(/\b(pvt|private|ltd|limited|inc|llp|corp|corporation|llc|plc|gmbh|co|ag)\b/g, "");
        text = text.replace(/[^a-z0-9 ]/g, " ");
        text = text.replace(/\s+/g, " ").trim();
        return text;
    }, []);

    const normalizeAddress = useCallback((address) => {
        if (!address) return "";
        let text = String(address).toLowerCase();

        const abbreviations = {
            'st': 'street', 'rd': 'road', 'ln': 'lane', 'ave': 'avenue',
            'blvd': 'boulevard', 'dr': 'drive', 'ct': 'court', 'pl': 'place',
            'sq': 'square', 'ste': 'suite', 'apt': 'apartment', 'no': 'number',
            'p.o. box': 'pobox', 'po box': 'pobox', 'hwy': 'highway', 'pkwy': 'parkway'
        };

        Object.keys(abbreviations).forEach(abbrev => {
            const regex = new RegExp(`\\b${abbrev.replace('.', '\\.')}\\b`, 'g');
            text = text.replace(regex, abbreviations[abbrev]);
        });

        text = text.replace(/[^a-z0-9 ]/g, " ");
        text = text.replace(/\s+/g, " ").trim();
        return text;
    }, []);

    const extractNetDays = useCallback((terms) => {
        if (!terms) return null;
        const text = String(terms).toLowerCase();
        if (text.includes('receipt')) return 0;
        const match = text.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : null;
    }, []);

    const getVendorPaymentTerms = useCallback((vendor) => {
        if (!vendor) return null;
        const key = Object.keys(vendor).find(k => {
            const norm = k.toLowerCase().replace(/[\s_\\\-]/g, '');
            return (
                norm === 'paymentterms' || norm === 'terms' ||
                norm === 'termsofpayment' || norm === 'creditterms' ||
                norm === 'payterms' || norm === 'pmtterms'
            );
        });
        return key ? vendor[key] : null;
    }, []);

    // ==================== EVENT HANDLERS ====================
    const handleInputChange = useCallback((field, value) => {
        setFormData((prev) => {
            const oldValue = prev[field];
            const newValue =
                typeof oldValue === 'object' && oldValue !== null && 'value' in oldValue
                    ? { ...oldValue, value }
                    : value;

            // Track last update to prevent loops
            lastFormUpdate.current[field] = value;

            return { ...prev, [field]: newValue };
        });
    }, []);

    const handleLineItemChange = useCallback((index, field, value) => {
        setLineItems((prev) => {
            const updatedItems = [...prev];
            updatedItems[index][field] = { value };
            return updatedItems;
        });
    }, []);

    const handleAddLineItem = useCallback(() => {
        const newItem = {
            Description: { value: '' }, ItemCode: { value: '' },
            Quantity: { value: '' }, UnitOfMeasure: { value: '' },
            UnitPrice: { value: '' }, Discount: { value: '' },
            NetAmount: { value: '' }, TaxRate: { value: '' },
            TaxAmount: { value: '' }, GrossAmount: { value: '' }
        };
        setLineItems((prev) => [...prev, newItem]);
    }, []);

    const removeLineItem = useCallback((index) => {
        setLineItems((prev) => prev.filter((_, i) => i !== index));
    }, []);

    const handleDeleteLineItem = useCallback((index) => {
        const codingItem = codingLineItems[index];
        if (codingItem && codingItem.original_index !== undefined && codingItem.original_index >= 0) {
            const isGst = codingItem.description?.startsWith('GST for item');
            if (isGst) {
                setLineItems((prev) => {
                    const updatedLines = [...prev];
                    updatedLines[codingItem.original_index].TaxAmount = { value: 0 };
                    return updatedLines;
                });
            } else {
                setLineItems((prev) => prev.filter((_, i) => i !== codingItem.original_index));
            }
        } else {
            setCodingLineItems((prev) => prev.filter((_, i) => i !== index));
        }
    }, [codingLineItems]);

    const handleHeaderCodingChange = useCallback((value) => {
        setHeaderCoding(value);
    }, []);

    const handleCodingLineItemChange = useCallback((index, field, value) => {
        setCodingLineItems((prev) => {
            const updated = [...prev];
            const item = updated[index];
            item[field] = value;

            if (item.original_index !== undefined && item.original_index >= 0 && !item.description?.startsWith('GST for item')) {
                const map = {
                    'net_amount': 'NetAmount', 'description': 'Description',
                    'quantity': 'Quantity', 'unit_price': 'UnitPrice'
                };
                const lineField = map[field];
                if (lineField) {
                    setLineItems((prevLines) => {
                        const updatedLineItems = [...prevLines];
                        const targetLine = updatedLineItems[item.original_index];
                        if (targetLine) {
                            targetLine[lineField] = { ...targetLine[lineField], value };
                        }
                        return updatedLineItems;
                    });
                }
            }
            return updated;
        });
    }, []);

    // ==================== VENDOR SEARCH HANDLERS ====================
    const debounce = useCallback((func, wait) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    }, []);

    const handleVendorIdSearch = useCallback((searchText) => {
        if (!searchText || !vendorMasterData) {
            setVendorIdOptions([]);
            return;
        }
        const matches = [];
        for (const v of vendorMasterData) {
            if (matches.length >= 50) break;
            const id = v['Vendor ID'] || v['VendorID'] || v['vendor_id'] || v['VENDOR_ID'];
            const name = v['vendor_name'] || v['VendorName'] || v['Name'] || v['VENDOR_NAME'];
            if (id && name) {
                const display = `${id} - ${name}`;
                if (display.toUpperCase().includes(searchText.toUpperCase())) {
                    matches.push({ value: String(id), label: display, vendor: v });
                }
            }
        }
        setVendorIdOptions(matches);
    }, [vendorMasterData]);

    const handleVendorNameSearch = useCallback((searchText) => {
        if (!searchText || !vendorMasterData) {
            setVendorNameOptions([]);
            return;
        }
        const matches = [];
        for (const v of vendorMasterData) {
            if (matches.length >= 50) break;
            const id = v['Vendor ID'] || v['VendorID'] || v['vendor_id'] || v['VENDOR_ID'];
            const name = v['vendor_name'] || v['VendorName'] || v['Name'] || v['VENDOR_NAME'];
            if (id && name) {
                const display = `${id} - ${name}`;
                if (display.toUpperCase().includes(searchText.toUpperCase())) {
                    matches.push({ value: `${name}::${id}`, label: display, vendor: v });
                }
            }
        }
        setVendorNameOptions(matches);
    }, [vendorMasterData]);

    const debouncedVendorIdSearch = useMemo(
        () => debounce(handleVendorIdSearch, 300),
        [debounce, handleVendorIdSearch]
    );

    const debouncedVendorNameSearch = useMemo(
        () => debounce(handleVendorNameSearch, 300),
        [debounce, handleVendorNameSearch]
    );

    // ==================== VENDOR CHANGE HANDLER ====================
    const aggregateLineItems = useCallback((items) => {
        if (!items || items.length === 0) return [];
        const first = items[0];
        let totalQuantity = 0, totalUnitPrice = 0, totalNetAmount = 0, totalTaxAmount = 0, totalDiscount = 0;
        items.forEach(item => {
            totalQuantity += parseCurrencyValue(extractValue(item.Quantity));
            totalUnitPrice += parseCurrencyValue(extractValue(item.UnitPrice));
            totalNetAmount += parseCurrencyValue(extractValue(item.NetAmount));
            totalTaxAmount += parseCurrencyValue(extractValue(item.TaxAmount));
            totalDiscount += parseCurrencyValue(extractValue(item.Discount));
        });
        return {
            Description: { value: extractValue(first.Description) || 'Aggregated Items', source: 'aggregation' },
            Quantity: { value: totalQuantity, source: 'aggregation' },
            UnitPrice: { value: totalUnitPrice, source: 'aggregation' },
            NetAmount: { value: totalNetAmount, source: 'aggregation' },
            TaxAmount: { value: totalTaxAmount, source: 'aggregation' },
            Discount: { value: totalDiscount, source: 'aggregation' },
            ItemCode: first.ItemCode || { value: '' },
            UnitOfMeasure: first.UnitOfMeasure || { value: '' },
            TaxRate: first.TaxRate || { value: '' },
            GrossAmount: { value: totalNetAmount + totalTaxAmount, source: 'aggregation' }
        };
    }, [parseCurrencyValue, extractValue]);

    const applyLineGrouping = useCallback((groupingSetting) => {
        if (groupingSetting === 'Yes') {
            const itemsToGroup = originalLineItemsRef.current.length > 0 ? originalLineItemsRef.current : originalLineItems;
            if (itemsToGroup.length > 0) {
                const aggregated = aggregateLineItems(itemsToGroup);
                setLineItems([aggregated]);
            }
        } else {
            const itemsToRestore = originalLineItemsRef.current.length > 0 ? originalLineItemsRef.current : originalLineItems;
            setLineItems([...itemsToRestore]);
        }
    }, [originalLineItems, aggregateLineItems]);

    const handleVendorChange = useCallback((vendorDetails) => {
        if (!vendorDetails) return;
        setSelectedVendorDetails(vendorDetails);

        const vId = vendorDetails['Vendor ID'] || vendorDetails['VendorID'] ||
            vendorDetails['vendor_id'] || vendorDetails['VENDOR_ID'];
        if (vId) {
            setVendorId(vId);
        }

        const currentTerms = extractValue(formData['Payment Terms']);
        const isPreserved = currentTerms && PRESERVED_PAYTERMS.includes(String(currentTerms).toLowerCase().trim());

        const paymentTerms = getVendorPaymentTerms(vendorDetails);

        if (paymentTerms && !readOnly && !isPreserved) {
            handleInputChange('Payment Terms', paymentTerms);
        }

        const grouping = vendorDetails['Line Grouping'] || vendorDetails['LineGrouping'] ||
            vendorDetails['line_grouping'] || vendorDetails['LINE_GROUPING'] || 'No';
        setLineGrouping(grouping);

        if (!readOnly) {
            applyLineGrouping(grouping);
        }

        // Fetch suggestions for new vendor
        if (vId && !readOnly && invoiceId) {
            console.log(`[GenericInputFields] Fetching suggestions for invoice ${invoiceId} vendor ${vId}`);
            codingService.getSuggestions(invoiceId, vId).then(suggestions => {
                console.log("[GenericInputFields] Received suggestions:", suggestions);
                if (suggestions && suggestions.length > 0) {
                    setCodingLineItems(prev => {
                        const updated = [...prev];
                        suggestions.forEach((sugg, idx) => {
                            if (updated[idx] && updated[idx].original_index >= 0) {
                                console.log(`[GenericInputFields] Updating Item ${idx + 1}:`, sugg);
                                updated[idx] = {
                                    ...updated[idx],
                                    gl_code: sugg.gl_code || updated[idx].gl_code || '',
                                    lob: sugg.lob || updated[idx].lob || '',
                                    department: sugg.department || updated[idx].department || '',
                                    customer: sugg.customer || updated[idx].customer || '',
                                    item: sugg.item || updated[idx].item || ''
                                };
                            }
                        });
                        return updated;
                    });
                }
            }).catch(err => console.error("Failed to fetch suggestions:", err));
        }

        let masterAddr = vendorDetails['Vendor Address'] || vendorDetails['VendorAddress'] ||
            vendorDetails['Address'] || vendorDetails['VENDOR_ADDRESS'];
        if (!masterAddr) {
            const parts = [
                vendorDetails['ADDRESS_LINE1'] || vendorDetails['Address1'],
                vendorDetails['ADDRESS_LINE2'] || vendorDetails['Address2'],
                vendorDetails['ADDRESS_LINE3'] || vendorDetails['Address3'],
                vendorDetails['CITY'] || vendorDetails['City'],
                vendorDetails['STATE_OR_TERITTORY'] || vendorDetails['STATE'] || vendorDetails['State'],
                vendorDetails['ZIP_OR_POSTAL_CODE'] || vendorDetails['ZIP'] ||
                vendorDetails['PostalCode'] || vendorDetails['ZipCode'],
                vendorDetails['COUNTRY'] || vendorDetails['Country']
            ];
            masterAddr = parts.filter(p => p).map(p => String(p).trim()).join(" ").trim();
        }
        if (masterAddr && !readOnly) {
            handleInputChange('Vendor Address', masterAddr);
        }

        setWorkflowRefreshTrigger(prev => prev + 1);
    }, [getVendorPaymentTerms, readOnly, handleInputChange, applyLineGrouping, invoiceId]);

    // ==================== EXPORT FUNCTION ====================
    const exportToExcel = useCallback(() => {
        if (!codingLineItems || codingLineItems.length === 0) {
            message.warning('No line items to export');
            return;
        }
        const headers = ['S.No', 'Description', 'Line Type', 'Quantity', 'Unit Price',
            'Net Amount', 'GL Code', 'LOB', 'Department', 'Customer', 'Item'];
        const data = codingLineItems.map((item, index) => [
            index + 1, `"${item.description || ''}"`, item.line_type || 'Expense',
            item.quantity, item.unit_price, item.net_amount,
            item.gl_code, item.lob, item.department, item.customer, item.item
        ]);
        const csvContent = [headers.join(','), ...data.map(row => row.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `invoice_line_items_${invoiceDisplayId || 'export'}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }, [codingLineItems, invoiceDisplayId]);

    // ==================== RENDER FIELD INPUT ====================
    const renderFieldInput = useCallback((field, value) => {
        const stringValue = extractValue(value);

        if ((field.toLowerCase().includes('amount') || field.toLowerCase().includes('price') ||
            field.toLowerCase().includes('total') || field.toLowerCase().includes('subtotal') ||
            (field.toLowerCase().includes('tax') && !field.toLowerCase().includes('breakdown')) ||
            field.toLowerCase().includes('fees') || field.toLowerCase().includes('surcharges')) &&
            !field.toLowerCase().includes('id') && !field.toLowerCase().includes('tin')) {
            const cleanValue = stringValue?.toString().replace(/[^\d.-]/g, '');
            const numValue = parseFloat(cleanValue);
            const isAlwaysEditable = field === 'Total Invoice Amount' || field === 'Total Amount Payable';
            return (
                <div onMouseEnter={() => setHoveredKey && setHoveredKey(field)}
                    onMouseLeave={() => setHoveredKey && setHoveredKey(null)} style={{ width: '100%' }}>
                    <InputNumber style={{ width: '100%', ...(isAlwaysEditable ? {} : disabledStyle) }}
                        value={isNaN(numValue) ? null : numValue}
                        onChange={(val) => handleInputChange(field, val)}
                        step={0.01} prefix="$" disabled={isAlwaysEditable ? false : disableInputs} />
                </div>
            );
        }

        if (field.includes('Date') || field.includes('period')) {
            return (
                <div onMouseEnter={() => setHoveredKey && setHoveredKey(field)}
                    onMouseLeave={() => setHoveredKey && setHoveredKey(null)} style={{ width: '100%' }}>
                    <DatePicker style={{ width: '100%', ...disabledStyle }}
                        value={stringValue ? parseStoredDate(stringValue, extractValue(formData['Invoice Currency'])) : null}
                        onChange={(date, dateString) => handleInputChange(field, dateString)}
                        format="MM-DD-YYYY" disabled={disableInputs} />
                </div>
            );
        }

        if (field.includes('Currency')) {
            const currentOptions = currencies.length > 0
                ? currencies.map(c => {
                    const symbol = (c.code === 'INR' && c.symbol === '?') ? '₹' : c.symbol;
                    return { value: c.code, label: `${symbol} ${c.code}` };
                })
                : [{ value: 'USD', label: '$ USD' }, { value: 'INR', label: '₹ INR' }];
            return (
                <Select style={{ width: '100%', ...disabledStyle }} value={stringValue}
                    onChange={(val) => { handleInputChange(field, val); if (onCurrencyChange) onCurrencyChange(val); }}
                    options={currentOptions} disabled={disableInputs} />
            );
        }

        if (field.includes('Notes')) {
            return (
                <div onMouseEnter={() => setHoveredKey && setHoveredKey(field)}
                    onMouseLeave={() => setHoveredKey && setHoveredKey(null)} style={{ width: '100%' }}>
                    <TextArea rows={3} value={stringValue}
                        onChange={(e) => handleInputChange(field, e.target.value)}
                        disabled={disableInputs} style={disabledStyle} />
                </div>
            );
        }

        return (
            <div onMouseEnter={() => setHoveredKey && setHoveredKey(field)}
                onMouseLeave={() => setHoveredKey && setHoveredKey(null)} style={{ width: '100%' }}>
                <Input value={stringValue} onChange={(e) => handleInputChange(field, e.target.value)}
                    disabled={disableInputs} style={disabledStyle} />
            </div>
        );
    }, [extractValue, disabledStyle, handleInputChange, disableInputs, setHoveredKey,
        parseStoredDate, formData, currencies, onCurrencyChange]);

    // ==================== LINE ITEM COLUMNS ====================
    const lineItemColumns = useMemo(() => [
        { title: 'S.No', key: 'item_number', width: 50, render: (text, record, index) => index + 1 },
        {
            title: 'Description', dataIndex: 'Description', key: 'Description', width: 200,
            render: (val, record, index) => (
                <div onMouseEnter={() => setHoveredKey && setHoveredKey(`LineItem_${index}_Description`)}
                    onMouseLeave={() => setHoveredKey && setHoveredKey(null)}>
                    <Input.TextArea rows={2} value={extractValue(val)}
                        onChange={(e) => handleLineItemChange(index, 'Description', e.target.value)}
                        disabled={disableInputs} style={disabledStyle} />
                </div>
            )
        },
        {
            title: 'Qty', dataIndex: 'Quantity', key: 'Quantity', width: 80,
            render: (val, record, index) => (
                <div onMouseEnter={() => setHoveredKey && setHoveredKey(`LineItem_${index}_Quantity`)}
                    onMouseLeave={() => setHoveredKey && setHoveredKey(null)}>
                    <InputNumber style={{ width: '100%', ...disabledStyle }} value={extractValue(val)}
                        onChange={(value) => handleLineItemChange(index, 'Quantity', value)}
                        disabled={disableInputs} />
                </div>
            )
        },
        {
            title: 'Unit Price', dataIndex: 'UnitPrice', key: 'UnitPrice', width: 120,
            render: (val, record, index) => (
                <div onMouseEnter={() => setHoveredKey && setHoveredKey(`LineItem_${index}_UnitPrice`)}
                    onMouseLeave={() => setHoveredKey && setHoveredKey(null)}>
                    <InputNumber style={{ width: '100%', ...disabledStyle }}
                        value={parseCurrencyValue(extractValue(val))}
                        onChange={(value) => handleLineItemChange(index, 'UnitPrice', value)}
                        step={0.01} prefix="$" disabled={readOnly} />
                </div>
            )
        },
        {
            title: 'Discount', dataIndex: 'Discount', key: 'Discount', width: 120,
            render: (val, record, index) => (
                <div onMouseEnter={() => setHoveredKey && setHoveredKey(`LineItem_${index}_Discount`)}
                    onMouseLeave={() => setHoveredKey && setHoveredKey(null)}>
                    <InputNumber style={{ width: '100%', ...disabledStyle }}
                        value={parseCurrencyValue(extractValue(val))}
                        onChange={(value) => handleLineItemChange(index, 'Discount', value)}
                        step={0.01} prefix="$" disabled={readOnly} />
                </div>
            )
        },
        {
            title: 'Net Amount', dataIndex: 'NetAmount', key: 'NetAmount', width: 120,
            render: (val, record, index) => (
                <div onMouseEnter={() => setHoveredKey && setHoveredKey(`LineItem_${index}_NetAmount`)}
                    onMouseLeave={() => setHoveredKey && setHoveredKey(null)}>
                    <InputNumber style={{ width: '100%', ...disabledStyle }}
                        value={parseCurrencyValue(extractValue(val))}
                        onChange={(value) => handleLineItemChange(index, 'NetAmount', value)}
                        step={0.01} prefix="$" disabled={readOnly} />
                </div>
            )
        },
        {
            title: 'Tax Amt', dataIndex: 'TaxAmount', key: 'TaxAmount', width: 100,
            render: (val, record, index) => (
                <div onMouseEnter={() => setHoveredKey && setHoveredKey(`LineItem_${index}_TaxAmount`)}
                    onMouseLeave={() => setHoveredKey && setHoveredKey(null)}>
                    <InputNumber style={{ width: '100%', ...disabledStyle }}
                        value={parseCurrencyValue(extractValue(val))}
                        onChange={(value) => handleLineItemChange(index, 'TaxAmount', value)}
                        step={0.01} disabled={readOnly} />
                </div>
            )
        },
        {
            title: 'Action',
            key: 'action',
            width: 70,
            render: (text, record, index) => {
                if (record.isSystemRow || readOnly || disableInputs) return null;
                return (
                    <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => removeLineItem(index)}
                        size="small"
                    />
                );
            }
        }
    ], [disableInputs, disabledStyle, extractValue, handleLineItemChange, setHoveredKey,
        parseCurrencyValue, readOnly, removeLineItem]);

    // ==================== SAVE FUNCTIONS ====================
    const saveInvoiceData = useCallback(async () => {
        if (!invoiceId) {
            message.error('No invoice ID provided');
            return;
        }

        try {
            setSaving(true);
            const updatedExtractedData = JSON.parse(JSON.stringify(originalData?.extracted_data || {}));

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

            // Vendor Info
            if (formData['Vendor Name'] !== undefined)
                safeUpdate(updatedExtractedData, 'vendor_info.name', extractValue(formData['Vendor Name']));
            if (formData['Vendor Address'] !== undefined)
                safeUpdate(updatedExtractedData, 'vendor_info.address', extractValue(formData['Vendor Address']));
            safeUpdate(updatedExtractedData, 'vendor_info.vendor_id', vendorId);

            // Invoice Details
            const invoiceFields = [
                ['Invoice Number', 'invoice_details.invoice_number'],
                ['Invoice Date', 'invoice_details.invoice_date'],
                ['Due Date', 'invoice_details.due_date'],
                ['Invoice Currency', 'invoice_details.currency'],
                ['Payment Terms', 'invoice_details.payment_terms']
            ];
            invoiceFields.forEach(([label, path]) => {
                if (formData[label] !== undefined) {
                    safeUpdate(updatedExtractedData, path, extractValue(formData[label]));
                }
            });

            // Amounts
            const amountFields = [
                ['Total Tax Amount', 'amounts.total_tax_amount'],
                ['CGST', 'amounts.CGST'], ['SGST', 'amounts.SGST'],
                ['IGST', 'amounts.IGST'], ['GST', 'amounts.GST'],
                ['Total Invoice Amount', 'amounts.total_invoice_amount'],
                ['Total Amount Payable', 'amounts.total_amount_payable'],
                ['Amount Paid', 'amounts.amount_paid']
            ];
            amountFields.forEach(([label, path]) => {
                if (formData[label] !== undefined) {
                    safeUpdate(updatedExtractedData, path, extractValue(formData[label]));
                }
            });

            safeUpdate(updatedExtractedData, 'additional_info.memo', memo);

            // Line Items
            const itemsToSave = (lineGrouping === 'Yes' && originalLineItems?.length > 0)
                ? originalLineItems : lineItems;

            if (Array.isArray(itemsToSave)) {
                if (!updatedExtractedData.Items) updatedExtractedData.Items = { value: [] };
                const originalItems = updatedExtractedData.Items.value || [];
                updatedExtractedData.Items.value = itemsToSave.map((item, index) => {
                    const originalItem = originalItems[index] || {};
                    return {
                        description: { ...(originalItem.description || {}), value: extractValue(item.Description) },
                        quantity: { ...(originalItem.quantity || {}), value: extractValue(item.Quantity) },
                        unit_price: { ...(originalItem.unit_price || {}), value: extractValue(item.UnitPrice) },
                        amount: { ...(originalItem.amount || {}), value: extractValue(item.NetAmount) },
                        tax_amount: { ...(originalItem.tax_amount || {}), value: extractValue(item.TaxAmount) }
                    };
                });
            }

            await invoiceService.updateInvoice(invoiceId, {
                exchange_rate: exchangeRate,
                extracted_data: updatedExtractedData,
                vendor_id: vendorId,
                vendor_name: extractValue(formData['Vendor Name'])
            });

            message.success('Invoice updated successfully!');
        } catch (error) {
            console.error('Error saving invoice:', error);
            message.error(error.response?.data?.detail || 'Failed to save invoice. Please try again.');
        } finally {
            setSaving(false);
        }
    }, [invoiceId, originalData, formData, vendorId, memo, lineGrouping,
        originalLineItems, lineItems, exchangeRate, extractValue]);

    const handleSaveCoding = useCallback(async (silent = false) => {
        if (!invoiceId) {
            if (!silent) message.error('No invoice ID provided');
            return;
        }
        try {
            setSaving(true);
            await codingService.saveCoding({
                invoice_id: invoiceId,
                header_coding: headerCoding,
                line_items: codingLineItems
            });
            if (!silent) message.success('Coding data saved successfully!');
        } catch (error) {
            console.error('Error saving coding data:', error);
            if (!silent) message.error(error.response?.data?.detail || 'Failed to save coding data.');
            throw error;
        } finally {
            setSaving(false);
        }
    }, [invoiceId, headerCoding, codingLineItems]);

    const handleSave = useCallback(async () => {
        if (isDuplicateError) {
            message.error("Cannot save: Duplicate invoice detected.");
            return;
        }
        if (!invoiceId) {
            message.error('No invoice ID provided');
            return;
        }
        try {
            await handleSaveCoding(true);
            await saveInvoiceData();
        } catch (e) {
            // Error handled in sub-functions
        }
    }, [isDuplicateError, invoiceId, handleSaveCoding, saveInvoiceData]);

    const handleSendForCoding = useCallback(async () => {
        if (!invoiceId) {
            message.error('No invoice ID provided');
            return;
        }
        try {
            setSaving(true);
            await saveInvoiceData();
            await codingService.saveCoding({
                invoice_id: invoiceId,
                header_coding: headerCoding,
                line_items: codingLineItems
            });
            await invoiceService.updateInvoice(invoiceId, { status: 'waiting_coding' });
            message.success('Invoice sent for coding successfully!');
            navigate('/coding');
        } catch (error) {
            console.error('Error sending for coding:', error);
            message.error('Failed to send for coding');
        } finally {
            setSaving(false);
        }
    }, [invoiceId, saveInvoiceData, headerCoding, codingLineItems, navigate]);

    const updateStatus = useCallback(async (newStatus) => {
        if (isDuplicateError) {
            message.error(`Cannot ${newStatus}: Duplicate invoice detected.`);
            return null;
        }
        if (!invoiceId) {
            message.error('No invoice ID provided');
            return null;
        }
        try {
            setSaving(true);
            const response = await invoiceService.updateInvoiceStatus(invoiceId, newStatus, approverComment);
            message.success(`Invoice ${newStatus} successfully!`);

            // Show Sage posting toast only for approvals
            if (newStatus === 'approved') {
                const sageStatus = response?.sage_post_status;
                if (sageStatus === 'success') {
                    message.success('AP Bill posted to Sage successfully!', 5);
                } else if (sageStatus === 'failure' || sageStatus === 'error') {
                    message.warning('Invoice approved, but AP Bill posting to Sage failed. Please check the audit trail for details.', 8);
                }
            }
            return response;
        } catch (error) {
            console.error('Error updating status:', error);
            message.error(error.response?.data?.detail || `Failed to ${newStatus} invoice.`);
            return null;
        } finally {
            setSaving(false);
        }
    }, [isDuplicateError, invoiceId, approverComment]);

    const handleApprove = useCallback(async () => {
        await updateStatus('approved');
        navigate("/approvals");
    }, [updateStatus, navigate]);

    const handleReject = useCallback(async () => {
        await updateStatus('rejected');
        navigate("/approvals");
    }, [updateStatus, navigate]);

    const handleRework = useCallback(async () => {
        await updateStatus('reworked');
        navigate("/approvals");
    }, [updateStatus, navigate]);

    const handleRepostToSage = useCallback(async () => {
        if (!invoiceId) return;
        try {
            setReposting(true);
            message.loading({ content: 'Reposting to Sage...', key: 'repost' });
            const result = await invoiceService.repostSage(invoiceId);
            if (result.success) {
                message.success({ content: 'Successfully reposted to Sage', key: 'repost' });
                // Proactively update local state for immediate feedback
                setInvoiceStatus('sage_posted');
                if (onRefresh) onRefresh();
            } else {
                message.error({ content: `Failed to repost to Sage: ${result.error}`, key: 'repost', duration: 5 });
            }
        } catch (error) {
            console.error('Error reposting to Sage:', error);
            message.error({ content: 'Failed to trigger repost. Please try again.', key: 'repost' });
        } finally {
            setReposting(false);
        }
    }, [invoiceId]);

    // ==================== STATUS HELPERS ====================
    const currentUsername = currentUser?.username || currentUser?.email || '';
    const statusHistory = originalData?.status_history || [];

    const lastReworkIndex = useMemo(() => {
        return [...statusHistory].map((s, i) => ({ s, i })).reverse()
            .find(x => x.s.status === 'reworked')?.i ?? -1;
    }, [statusHistory]);

    const currentCycleHistory = useMemo(() => {
        return lastReworkIndex >= 0 ? statusHistory.slice(lastReworkIndex + 1) : statusHistory;
    }, [statusHistory, lastReworkIndex]);

    const currentUserHasActed = useMemo(() => {
        return currentCycleHistory.some(entry =>
            entry.user === currentUsername &&
            (entry.status === 'approved' || entry.status === 'rejected' || entry.status === 'reworked')
        );
    }, [currentCycleHistory, currentUsername]);

    const restrictedUsers = useMemo(() => {
        const users = new Set();
        if (workflowData?.steps) {
            workflowData.steps.forEach(step => {
                if (step.step_type === 'processed' || step.step_type === 'coding') {
                    users.add(step.user);
                }
            });
        }
        statusHistory.forEach(entry => {
            if (entry.status === 'processed') users.add(entry.user);
        });
        return users;
    }, [workflowData, statusHistory]);

    const isRestrictedUser = restrictedUsers.has(currentUsername);

    const cycleApprovalsCount = useMemo(() => {
        return currentCycleHistory.filter(h => h.status === 'approved').length;
    }, [currentCycleHistory]);

    const assignedApprovers = workflowData?.assigned_approvers || [];
    const isSequential = assignedApprovers.length > 0;
    const currentExpectedApprover = assignedApprovers[cycleApprovalsCount]?.toLowerCase();
    const myEmail = currentUser?.email?.toLowerCase();

    const isActiveDelegateForCurrentTurn = useMemo(() => {
        return currentExpectedApprover &&
            workflowData?.delegations?.[currentExpectedApprover]?.some(
                delegateEmail => delegateEmail.toLowerCase() === myEmail
            );
    }, [currentExpectedApprover, workflowData, myEmail]);

    const isMyTurn = !isSequential || (currentExpectedApprover === myEmail) || isActiveDelegateForCurrentTurn;

    const approveDisabled = currentUserHasActed || isRestrictedUser || !isMyTurn;
    const rejectDisabled = currentUserHasActed || isRestrictedUser || !isMyTurn;
    const reworkDisabled = currentUserHasActed || isRestrictedUser || !isMyTurn;

    const renderStatusTag = useCallback(() => {
        let color = 'default', label = invoiceStatus;
        switch (invoiceStatus) {
            case 'processed': color = 'cyan'; label = 'Processed'; break;
            case 'waiting_coding': color = 'orange'; label = 'Coding'; break;
            case 'waiting_approval': color = 'gold'; label = 'Waiting for Approval'; break;
            case 'approved': color = 'green'; label = 'Approved'; break;
            case 'rejected': color = 'red'; label = 'Rejected'; break;
            case 'reworked': color = 'purple'; label = 'Reworked'; break;
            case 'sage_posted': color = 'geekblue'; label = 'Posted to Sage'; break;
            case 'sage_post_failed': color = 'volcano'; label = 'Failed to Post to Sage'; break;
            default: color = 'default';
        }
        return <Tag color={color}>{label}</Tag>;
    }, [invoiceStatus]);

    const isWaitingApproval = invoiceStatus === 'waiting_approval';

    // ==================== DUPLICATE CHECK - FIXED ====================
    // Track previous values to avoid unnecessary calls
    const prevVendorIdRef = useRef('');
    const prevInvoiceNumberRef = useRef('');
    const codingByLineKeyRef = useRef({});

    useEffect(() => {
        codingLineItems.forEach(line => {
            if (line.original_index >= 0) {
                const item = lineItems[line.original_index];
                if (!item) return;

                const key = getLineKey(item);

                if (
                    line.gl_code ||
                    line.lob ||
                    line.department ||
                    line.customer ||
                    line.item
                ) {
                    codingByLineKeyRef.current[key] = {
                        gl_code: line.gl_code,
                        lob: line.lob,
                        department: line.department,
                        customer: line.customer,
                        item: line.item
                    };
                }
            }
        });
    }, [codingLineItems, lineItems]);


    useEffect(() => {
        const vendor = extractValue(formData['Vendor ID']);
        const invoice = extractValue(formData['Invoice Number']);

        if (!vendor || !invoice) return;

        // prevent same-value loop
        if (
            vendor === prevVendorIdRef.current &&
            invoice === prevInvoiceNumberRef.current
        ) return;

        const isInitial = prevVendorIdRef.current === '' && prevInvoiceNumberRef.current === '';

        // Clear immediately to enable button while checking new value
        if (!isInitial) {
            setIsDuplicateError(false);
            if (onDuplicateChange) onDuplicateChange(false);
            message.destroy('duplicate_warning');
        }

        prevVendorIdRef.current = vendor;
        prevInvoiceNumberRef.current = invoice;

        const runCheck = async () => {
            try {
                const result = await invoiceService.checkDuplicate({
                    vendor_id: vendor,
                    invoice_number: invoice,
                    current_invoice_id: invoiceId
                });

                const isDup = !!result?.is_duplicate;
                setIsDuplicateError(isDup);
                if (onDuplicateChange) onDuplicateChange(isDup);

                if (isDup) {
                    message.warning({
                        key: 'duplicate_warning',
                        content: result.message || 'Duplicate invoice detected',
                        duration: 10
                    });
                } else {
                    message.destroy('duplicate_warning');
                }
            } catch (err) {
                console.error('Duplicate check failed', err);
            }
        };

        if (isInitial) {
            runCheck();
            return;
        }

        const timer = setTimeout(runCheck, 400); // Faster debounce
        return () => clearTimeout(timer);
    }, [
        formData['Vendor ID'],
        formData['Invoice Number'],
        invoiceId,
        extractValue,
        onDuplicateChange
    ]);

    // ==================== INITIAL LOAD ====================
    useEffect(() => {
        const items = data?.items || data?.LineItems || [];
        const savedVendorId = data?.vendor_id ||
            extractValue(data?.extracted_data?.vendor_info?.vendor_id) ||
            originalData?.vendor_id ||
            extractValue(originalData?.extracted_data?.vendor_info?.vendor_id) || '';

        setVendorId(savedVendorId);

        const initialFormData = { ...extractionData, 'Vendor ID': savedVendorId, LineItems: items };

        if (extractionData?.amounts) {
            if (extractionData.amounts.CGST) initialFormData['CGST'] = extractionData.amounts.CGST;
            if (extractionData.amounts.SGST) initialFormData['SGST'] = extractionData.amounts.SGST;
            if (extractionData.amounts.IGST) initialFormData['IGST'] = extractionData.amounts.IGST;
            if (extractionData.amounts.GST) initialFormData['GST'] = extractionData.amounts.GST;
            if (extractionData.amounts.tax) initialFormData['Total Tax Amount'] = extractionData.amounts.tax;
        }

        if (data?.vendor_name) {
            initialFormData['Vendor Name'] = { value: data.vendor_name };
        }

        setFormData(initialFormData);
        setLineItems(items);

        const detailedItems = data?.original_line_items && data.original_line_items.length > 0
            ? data.original_line_items : items;

        setOriginalLineItems(detailedItems);
        originalLineItemsRef.current = detailedItems;
        setInvoiceStatus(originalData?.status || 'waiting_approval');
        setValidationInfo(originalData?.validation_results || {});

        if (items.length) {
            setCodingLineItems(items.map((item, index) => {
                const unitPrice = parseCurrencyValue(extractValue(item.UnitPrice) || extractValue(item.unit_price));
                const netAmount = parseCurrencyValue(extractValue(item.NetAmount) ||
                    extractValue(item.amount) || extractValue(item.net_amount));
                return {
                    s_no: index + 1,
                    description: extractValue(item.Description) || '',
                    line_type: 'Expense',
                    quantity: parseFloat(extractValue(item.Quantity)) || 0,
                    unit_price: unitPrice,
                    net_amount: netAmount,
                    gl_code: '', lob: '', department: '', customer: '', item: '',
                    original_index: index
                };
            }));
        }

        const savedMemo = extractValue(data?.extracted_data?.additional_info?.memo) ||
            extractValue(originalData?.extracted_data?.additional_info?.memo) || '';
        setMemo(savedMemo);
        setExchangeRate(originalData?.exchange_rate || null);

        // IMMEDIATE VENDOR DETAILS POPULATION
        const existingDetails = data?.vendor_details || originalData?.vendor_details;
        if (existingDetails) {
            setSelectedVendorDetails(existingDetails);
            const grouping = existingDetails['Line Grouping'] || existingDetails['LineGrouping'] ||
                existingDetails['line_grouping'] || existingDetails['LINE_GROUPING'] || 'No';
            setLineGrouping(grouping);
            skipNextVendorLookup.current = true;
            initialSearchDone.current = true;
        }

        // Initialize last duplicate check values
        const initialVendorId = extractValue(initialFormData['Vendor ID']);
        const initialInvoiceNum = extractValue(initialFormData['Invoice Number']);
        lastDuplicateCheck.current = {
            vendorId: initialVendorId,
            invoiceNumber: initialInvoiceNum
        };
    }, [data, extractionData, originalData, extractValue, parseCurrencyValue]);

    // ==================== VENDOR LOOKUPS - FIXED ====================
    useEffect(() => {
        const rawId = extractValue(formData['Vendor ID']);
        const currentId = String(rawId || '').trim();
        if (skipNextVendorLookup.current || !currentId || !vendorMasterData?.length) return;

        const match = vendorMasterData.find(v => {
            const vId = v['Vendor ID'] || v['VendorID'] || v['vendor_id'] || v['VENDOR_ID'];
            if (!vId) return false;
            const sVid = String(vId).trim();
            return sVid === currentId || sVid.replace(/\.0+$/, '') === currentId.replace(/\.0+$/, '');
        });

        if (match) {
            const officialName = match['Vendor Name'] || match['VendorName'] ||
                match['Name'] || match['VENDOR_NAME'];
            const currentName = String(extractValue(formData['Vendor Name']) || '').trim();
            if (officialName && !readOnly && (normalizeVendor(officialName) !== normalizeVendor(currentName) || !currentName)) {
                handleInputChange('Vendor Name', officialName);
            }
            handleVendorChange(match);
        }
    }, [formData['Vendor ID'], vendorMasterData, readOnly, extractValue, normalizeVendor,
        handleInputChange, handleVendorChange]);

    // Separate effect for vendor name lookup
    useEffect(() => {
        const vendorName = extractValue(formData['Vendor Name']);
        const vendorAddress = extractValue(formData['Vendor Address']) ||
            extractValue(formData.vendor_info?.address) ||
            extractValue(extractionData.vendor_info?.address);

        if ((vendorName || vendorAddress) && vendorMasterData.length > 0) {
            const normalizedNameInput = vendorName ? normalizeVendor(vendorName) : "";
            const normalizedAddrInput = vendorAddress ? normalizeAddress(vendorAddress) : "";

            const applyMatch = (match, matchType = 'unknown') => {
                const matchedId = match['Vendor ID'] || match['VendorID'] ||
                    match['vendor_id'] || match['VENDOR_ID'];
                const currentFormId = extractValue(formData['Vendor ID']);

                if (!skipNextVendorLookup.current) {
                    if (matchedId && !currentFormId && !readOnly) {
                        setVendorId(matchedId);
                        handleInputChange('Vendor ID', matchedId);
                    }
                    if (!currentFormId || String(matchedId).trim() === String(currentFormId).trim()) {
                        handleVendorChange(match);
                    }
                } else {
                    skipNextVendorLookup.current = false;
                }
            };

            let bestLocalMatch = null;
            if (normalizedAddrInput) {
                bestLocalMatch = vendorMasterData.find(v => {
                    let masterAddr = v['Vendor Address'] || v['VendorAddress'] ||
                        v['Address'] || v['VENDOR_ADDRESS'];
                    if (!masterAddr) {
                        const parts = [v['ADDRESS_LINE1'], v['CITY'], v['STATE'], v['ZIP'], v['COUNTRY']];
                        masterAddr = parts.filter(p => p).map(p => String(p).trim()).join(" ").trim();
                    }
                    return masterAddr && normalizeAddress(masterAddr) === normalizedAddrInput;
                });
            }

            if (!bestLocalMatch && normalizedNameInput) {
                bestLocalMatch = vendorMasterData.find(v => {
                    const masterName = v['Vendor Name'] || v['VendorName'] ||
                        v['Name'] || v['VENDOR_NAME'];
                    return masterName && normalizeVendor(masterName) === normalizedNameInput;
                });
            }

            if (bestLocalMatch) {
                applyMatch(bestLocalMatch, normalizedAddrInput ? 'address' : 'name');
            } else if (!initialSearchDone.current) {
                initialSearchDone.current = true;
                const searchAsync = async () => {
                    try {
                        const result = await masterDataService.searchVendor(vendorName, vendorAddress);
                        if (result?.match) {
                            applyMatch(result.match, result.method);
                        } else {
                            setSelectedVendorDetails(null);
                        }
                    } catch (err) {
                        console.error("Error searching vendor:", err);
                        setSelectedVendorDetails(null);
                    }
                };
                searchAsync();
            }
        } else {
            setSelectedVendorDetails(null);
        }
    }, [formData['Vendor Name'], formData['Vendor Address'], extractionData, data, vendorMasterData, extractValue,
        normalizeVendor, normalizeAddress, readOnly, handleInputChange, handleVendorChange]);

    const initialSearchDone = useRef(false);

    useEffect(() => {
        const loadVendorMaster = async () => {
            try {
                setIsVendorLoading(true);
                if (onVendorLoadingChange) onVendorLoadingChange(true);
                const files = await masterDataService.getFiles();
                const vendorMasterFile = files.find(f =>
                    f.tab_name === 'Vendor_Master' || f.tab_name === 'Vendor Master' ||
                    f.tab_name === 'Vendors' || f.tab_name === 'Vendor'
                );
                if (vendorMasterFile?.sheets?.length > 0) {
                    const collectionName = vendorMasterFile.sheets[0].collection_name;
                    const rows = await masterDataService.getSheetData(collectionName);
                    setVendorMasterData(rows);
                }
            } catch (error) {
                console.error("Failed to load Vendor Master data", error);
            } finally {
                setIsVendorLoading(false);
                if (onVendorLoadingChange) onVendorLoadingChange(false);
            }
        };
        loadVendorMaster();
    }, [onVendorLoadingChange]);


    const renderFieldGroup = useCallback((groupName, fields) => {
        const filteredFields = fields.filter(field =>
            formData[field] !== undefined ||
            (Array.isArray(schema) && schema.some(s => s.label === field))
        );

        if (filteredFields.length === 0) return null;

        return (
            <Panel header={groupName} key={groupName}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '10px 0' }}>
                    {filteredFields.map(field => {
                        const fieldSchema = Array.isArray(schema)
                            ? schema.find(s => s.label === field)
                            : null;
                        const label = fieldSchema?.display_name || field;
                        const value = formData[field];

                        return (
                            <div key={field} style={{
                                display: 'grid',
                                gridTemplateColumns: '350px 1fr',
                                gap: '16px',
                                alignItems: 'center'
                            }}>
                                <div style={{ fontWeight: 500 }}>{label}:</div>
                                <div>
                                    {renderFieldInput(field, value)}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Panel>
        );
    }, [formData, schema, renderFieldInput]);

    // ==================== DUE DATE CALCULATION - FIXED ====================
    // Extract specific values to minimize effect triggers
    const invoiceDateValue = useMemo(() => extractValue(formData['Invoice Date']), [formData, extractValue]);
    const paymentTermsValue = useMemo(() => extractValue(formData['Payment Terms']), [formData, extractValue]);
    const currencyValue = useMemo(() => extractValue(formData['Invoice Currency']), [formData, extractValue]);

    useEffect(() => {
        if (readOnly || !invoiceDateValue) return;

        // Skip recalculation if Due Date was originally extracted from the invoice
        const extractedDueDate =
            extractValue(extractionData?.['Due Date']) ||
            extractValue(originalData?.extracted_data?.invoice_details?.due_date) ||
            extractValue(data?.extracted_data?.invoice_details?.due_date) ||
            extractValue(originalData?.extracted_data?.due_date) ||
            extractValue(data?.extracted_data?.due_date);

        if (extractedDueDate) {
            console.log(`[GenericInputFields] Skipping due date recalculation as it was extracted: ${extractedDueDate}`);
            return;
        }

        const invoiceDate = parseStoredDate(invoiceDateValue, currencyValue);
        if (!invoiceDate || !invoiceDate.isValid()) return;

        const extractedTerms = paymentTermsValue;
        let days = extractNetDays(extractedTerms);

        if (days === null && selectedVendorDetails) {
            const currentTerms = extractValue(formData['Payment Terms']);
            const isPreserved = currentTerms && PRESERVED_PAYTERMS.includes(String(currentTerms).toLowerCase().trim());

            if (!isPreserved) {
                const vendorTerms = getVendorPaymentTerms(selectedVendorDetails);
                days = extractNetDays(vendorTerms);
                if (vendorTerms && (!extractedTerms || days !== null)) {
                    handleInputChange('Payment Terms', vendorTerms);
                }
            }
        }

        if (days === null) return;

        const newDueDate = invoiceDate.add(days, 'day').format('YYYY-MM-DD');
        const currentDueDate = extractValue(formData['Due Date']);

        if (currentDueDate !== newDueDate) {
            handleInputChange('Due Date', newDueDate);
        }
    }, [invoiceDateValue, paymentTermsValue, currencyValue, selectedVendorDetails,
        readOnly, extractValue, parseStoredDate, extractNetDays, getVendorPaymentTerms,
        handleInputChange, data, originalData, extractionData]);

    // ==================== TDS CALCULATION & TOTALS - FIXED ====================
    // Calculate totals using useMemo instead of useEffect
    const { invoiceTotal, payableAmount, tdsAmount, isAmountMismatch, calculationDetails } = useMemo(() => {
        if (readOnly) {
            return {
                invoiceTotal: 0,
                payableAmount: 0,
                tdsAmount: 0,
                isAmountMismatch: false,
                calculationDetails: {
                    lineItemsTotal: 0,
                    totalTax: 0,
                    extractedSubtotal: 0,
                    amountPaid: 0,
                    shipping: 0,
                    surcharges: 0,
                    calc1: 0,
                    calc2: 0,
                    calc3: 0,
                    currentTotal: 0,
                    baseTotalUsed: 0,
                    baseTotalSource: "N/A",
                    tdsAmount: 0
                }
            };
        }

        const calculatedSubtotal = lineItems.reduce((sum, item) => {
            const val = parseCurrencyValue(extractValue(item.NetAmount) ||
                extractValue(item.amount) || extractValue(item.net_amount));
            return sum + val;
        }, 0);

        const headerTax = parseCurrencyValue(extractValue(formData['CGST'])) +
            parseCurrencyValue(extractValue(formData['SGST'])) +
            parseCurrencyValue(extractValue(formData['IGST'])) +
            parseCurrencyValue(extractValue(formData['GST']));

        const lineItemTax = lineItems.reduce((sum, item) => {
            const val = parseCurrencyValue(extractValue(item.TaxAmount) ||
                extractValue(item.tax_amount));
            return sum + val;
        }, 0);

        const fieldTotalTax = parseCurrencyValue(extractValue(formData['Total Tax Amount']));
        const totalTax = fieldTotalTax > 0 ? fieldTotalTax : (headerTax + lineItemTax);

        let tdsAmount = 0;
        if (selectedVendorDetails) {
            const findVal = (obj, keys) => {
                if (!obj) return null;
                const matchKey = Object.keys(obj).find(k => {
                    const normK = k.toLowerCase().replace(/[\s_\\\-]/g, '');
                    return keys.some(target => normK === target.toLowerCase().replace(/[\s_\\\-]/g, ''));
                });
                return matchKey ? obj[matchKey] : null;
            };

            const tdsApplicabilityVal = findVal(selectedVendorDetails, [
                'TDS/Withhold Tax Applicability Configuration',
                'TDS Applicability', 'TDS Applicable', 'Withholding Tax Applicable'
            ]);

            const isTDSApplicable = tdsApplicabilityVal?.toString().toLowerCase().trim() === 'yes';

            if (isTDSApplicable) {
                const tdsRateVal = findVal(selectedVendorDetails, [
                    'TDS Percentage', 'Percentage', 'Rate', 'TDS Rate', 'Withholding Rate'
                ]) || '0';
                const tdsRate = parseFloat(tdsRateVal.toString().replace('%', '')) || 0;
                tdsAmount = parseFloat((calculatedSubtotal * tdsRate).toFixed(2));
            }
        }

        const invoiceTotal_calc1 = parseFloat((calculatedSubtotal + totalTax).toFixed(2));

        const extractedSubtotal = parseCurrencyValue(extractValue(formData['Subtotal']));
        const invoiceTotal_calc2 = parseFloat((extractedSubtotal + totalTax).toFixed(2));

        const amountPaid = parseCurrencyValue(extractValue(formData['Amount Paid']));
        const shipping = parseCurrencyValue(extractValue(formData['Shipping / Handling / Fees']));
        const surcharges = parseCurrencyValue(extractValue(formData['Surcharges']));

        const invoiceTotal_calc3 = parseFloat((calculatedSubtotal + totalTax - amountPaid + shipping + surcharges).toFixed(2));

        const currentTotal = parseCurrencyValue(extractValue(formData['Total Invoice Amount']));

        // Identify which heuristic matches (if any)
        const calculations = [
            { value: invoiceTotal_calc1, name: "Heuristic 1: Line Items + Tax" },
            { value: invoiceTotal_calc2, name: "Heuristic 2: Subtotal + Tax" },
            { value: invoiceTotal_calc3, name: "Heuristic 3: Total Reconciliation" }
        ];

        const match = calculations.find(c => Math.abs(currentTotal - c.value) < 0.01);
        const baseTotalForPayable = match ? match.value : invoiceTotal_calc1;
        const baseTotalSource = match ? match.name : "Default Calculation (Heuristic 1)";

        const isMismatch = match === undefined;

        const payableAmount = parseFloat((baseTotalForPayable - tdsAmount).toFixed(2));

        return {
            invoiceTotal: invoiceTotal_calc1, // Default calculated total for display/update
            payableAmount,
            tdsAmount,
            isAmountMismatch: isMismatch && currentTotal > 0,
            calculationDetails: {
                lineItemsTotal: calculatedSubtotal,
                totalTax: totalTax,
                extractedSubtotal: extractedSubtotal,
                amountPaid: amountPaid,
                shipping: shipping,
                surcharges: surcharges,
                calc1: invoiceTotal_calc1,
                calc2: invoiceTotal_calc2,
                calc3: invoiceTotal_calc3,
                currentTotal: currentTotal,
                baseTotalUsed: baseTotalForPayable,
                baseTotalSource: baseTotalSource,
                tdsAmount: tdsAmount
            }
        };
    }, [lineItems, selectedVendorDetails, formData, readOnly, extractValue, parseCurrencyValue]);

    // Update form data only when calculated values differ
    useEffect(() => {
        if (readOnly || isCalculating.current) return;

        const currentTotal = parseCurrencyValue(extractValue(formData['Total Invoice Amount']));
        const currentPayable = parseCurrencyValue(extractValue(formData['Total Amount Payable']));

        // Just store extracted value (do not update formData)
        lastCalculatedValues.current.total = currentTotal;

        let hasUpdates = false;
        const updates = {};

        // Only handle Total Amount Payable
        if (
            (currentPayable === 0 && payableAmount > 0) ||
            (currentPayable !== payableAmount && currentPayable === lastCalculatedValues.current.payable)
        ) {
            updates['Total Amount Payable'] = { value: payableAmount };
            updates['Amount Due'] = { value: payableAmount };
            lastCalculatedValues.current.payable = payableAmount;
            hasUpdates = true;
        } else if (currentPayable === payableAmount) {
            lastCalculatedValues.current.payable = payableAmount;
        }

        if (hasUpdates) {
            setFormData((prev) => ({ ...prev, ...updates }));
        }

    }, [payableAmount, readOnly, formData, extractValue, parseCurrencyValue]);





    // useEffect(() => {
    //     if (readOnly || isCalculating.current) return;

    //     const currentTotal = parseCurrencyValue(extractValue(formData['Total Invoice Amount']));
    //     const currentPayable = parseCurrencyValue(extractValue(formData['Total Amount Payable']));

    //     let hasUpdates = false;
    //     const updates = {};

    //     // Smart Update for Total Invoice Amount
    //     // Update if currently 0 OR if current value matches our last calculated value (meaning no manual edit)
    //     if ((currentTotal === 0 && invoiceTotal > 0) ||
    //         (currentTotal !== invoiceTotal && currentTotal === lastCalculatedValues.current.total)) {
    //         updates['Total Invoice Amount'] = { value: invoiceTotal };
    //         lastCalculatedValues.current.total = invoiceTotal;
    //         hasUpdates = true;
    //     } else if (currentTotal === invoiceTotal) {
    //         // Even if we don't update formData, keep our record in sync
    //         lastCalculatedValues.current.total = invoiceTotal;
    //     }

    //     // Smart Update for Total Amount Payable
    //     if ((currentPayable === 0 && payableAmount > 0) ||
    //         (currentPayable !== payableAmount && currentPayable === lastCalculatedValues.current.payable)) {
    //         updates['Total Amount Payable'] = { value: payableAmount };
    //         updates['Amount Due'] = { value: payableAmount };
    //         lastCalculatedValues.current.payable = payableAmount;
    //         hasUpdates = true;
    //     } else if (currentPayable === payableAmount) {
    //         lastCalculatedValues.current.payable = payableAmount;
    //     }

    //     if (hasUpdates) {
    //         setFormData((prev) => ({ ...prev, ...updates }));
    //     }
    // }, [invoiceTotal, payableAmount, readOnly, formData, extractValue, parseCurrencyValue]);

    // ==================== LOAD SAVED CODING ====================
    useEffect(() => {
        const loadData = async () => {
            if (!invoiceId) return;
            try {
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
                                    item: savedItem.item || item.item
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

    // ==================== SYNC CODING ITEMS WITH LINE ITEMS - FIXED ====================
    useEffect(() => {
        if (!lineItems?.length) return;

        setCodingLineItems((prevCoding) => {
            // Only update if there's a significant change
            const currentLineItemsCount = lineItems.length;
            const prevLineItemsCount = prevCoding.filter(pc =>
                pc.original_index >= 0 && !pc.description?.startsWith('GST for item')
            ).length;

            // REMOVED BAIL-OUT: Always re-evaluate to ensure TDS/GST updates apply
            // if (
            //     currentLineItemsCount === prevLineItemsCount &&
            //     prevCoding.some(c => c.original_index < 0)
            // ) {
            //     return prevCoding;
            // }

            const newCoding = [];
            let currentSNo = 1;

            const pureBaseItemsWithIndex = lineItems
                .map((item, idx) => ({ item, idx }))
                .filter(({ item }) => {
                    const desc = (extractValue(item.Description) || item.description || '').toString().trim();
                    return !desc.startsWith('GST for item');
                });


            pureBaseItemsWithIndex.forEach(({ item, idx }) => {
                const lineKey = getLineKey(item);

                const preserved = codingByLineKeyRef.current[lineKey];

                const existingBase =
                    prevCoding.find(pc => pc.original_index === idx) ||
                    preserved;

                const unitPrice = parseCurrencyValue(extractValue(item.UnitPrice) ||
                    extractValue(item.unit_price));
                const netAmount = parseCurrencyValue(extractValue(item.NetAmount) ||
                    extractValue(item.amount) || extractValue(item.net_amount));

                newCoding.push({
                    s_no: currentSNo++,
                    description: extractValue(item.Description) || item.description || '',
                    line_type: existingBase?.line_type || 'Expense',
                    quantity: parseFloat(extractValue(item.Quantity) || item.quantity) || 0,
                    unit_price: unitPrice,
                    net_amount: netAmount,
                    gl_code: existingBase?.gl_code || '',
                    lob: existingBase?.lob || '',
                    department: existingBase?.department || '',
                    customer: existingBase?.customer || '',
                    item: existingBase?.item || '',
                    original_index: idx
                });
            });

            const formTaxValue = parseCurrencyValue(extractValue(formData['Total Tax Amount']));
            const calculatedTotalTax = pureBaseItemsWithIndex.reduce((sum, { item }) => {
                const t = parseCurrencyValue(extractValue(item.TaxAmount) ||
                    extractValue(item.tax_amount));
                return sum + t;
            }, 0) + parseCurrencyValue(extractValue(formData['CGST'])) +
                parseCurrencyValue(extractValue(formData['SGST'])) +
                parseCurrencyValue(extractValue(formData['IGST'])) +
                parseCurrencyValue(extractValue(formData['GST']));

            const finalGstValue = (formTaxValue !== undefined && formTaxValue !== null && formTaxValue !== '')
                ? formTaxValue : calculatedTotalTax

            const gstAmount = finalGstValue;

            if (readOnly) return prevCoding;

            const gstEligibilityRaw =
                selectedVendorDetails?.['GST / Use Tax Eligibility Configuration']
                    ?.toString()
                    .trim();

            const isEligible = ['Eligible', 'yes', 'y'].includes(gstEligibilityRaw);

            if (gstAmount > 0) {
                newCoding.push({
                    s_no: currentSNo++,
                    description: isEligible ? 'Total GST' : 'Total GST (Ineligible)',
                    line_type: isEligible ? 'Tax' : 'Expense',
                    quantity: 1,
                    unit_price: gstAmount,
                    net_amount: gstAmount,
                    gl_code: isEligible ? 'GST_INPUT' : (newCoding[0]?.gl_code || ''),
                    lob: newCoding[0]?.lob || '',
                    department: newCoding[0]?.department || '',
                    customer: newCoding[0]?.customer || '',
                    item: newCoding[0]?.item || '',
                    original_index: -2
                });
            }

            const findTDSValue = (keys) => {
                if (!selectedVendorDetails) return null;
                const matchKey = Object.keys(selectedVendorDetails).find(k => {
                    const normK = k.toLowerCase().replace(/[\s_\\\-]/g, '');
                    return keys.some(target => normK === target.toLowerCase().replace(/[\s_\\\-]/g, ''));
                });
                return matchKey ? selectedVendorDetails[matchKey] : null;
            };

            const tdsApplicabilityVal = findTDSValue([
                'TDS/Withhold Tax Applicability Configuration',
                'TDS Applicability', 'TDS Applicable', 'Withholding Tax Applicable'
            ]);

            if (tdsApplicabilityVal?.toString().toLowerCase().trim() === 'yes') {
                const tdsRateVal = findTDSValue([
                    'TDS Percentage', 'Percentage', 'Rate', 'TDS Rate', 'Withholding Rate'
                ]) || '0';

                let tdsRate = parseFloat(tdsRateVal.toString().replace('%', '')) || 0;
                if (tdsRate > 1) tdsRate = tdsRate / 100;

                const subtotal = newCoding
                    .filter(l => l.original_index >= 0)
                    .reduce((sum, l) => sum + l.net_amount, 0);

                const tdsAmount = parseFloat((subtotal * tdsRate).toFixed(2));

                if (tdsAmount > 0) {
                    newCoding.push({
                        s_no: currentSNo++,
                        description: 'TDS Deduction',
                        line_type: 'Liability',
                        quantity: 1,
                        unit_price: -tdsAmount,
                        net_amount: -tdsAmount,
                        gl_code: 'TDS_PAYABLE',
                        lob: newCoding[0]?.lob || '',
                        department: newCoding[0]?.department || '',
                        customer: newCoding[0]?.customer || '',
                        item: newCoding[0]?.item || '',
                        original_index: -1
                    });
                }
            }

            return newCoding;
        });
    }, [lineItems, selectedVendorDetails, formData, readOnly, extractValue,
        parseCurrencyValue, codingLineItems.length]);

    // ==================== RENDER TAB CONTENT ====================
    const renderTabContent = useCallback(() => {
        const commonProps = {
            formData, lineItems, selectedVendorDetails, disableInputs,
            disabledStyle, getCurrencySymbol, extractValue, parseCurrencyValue,
            renderFieldInput, handleInputChange, handleLineItemChange,
            handleAddLineItem, exportToExcel, lineItemColumns, readOnly,
            isAmountMismatch, calculationDetails, schema
        };

        switch (activeTab) {
            case '1':
                console.log("DEBUG: Rendering QuickViewTab case 1");
                return <QuickViewTab {...commonProps} vendorId={vendorId}
                    vendorIdOptions={vendorIdOptions} vendorNameOptions={vendorNameOptions}
                    memo={memo} isDuplicateError={isDuplicateError} setVendorId={setVendorId}
                    setMemo={setMemo} debouncedVendorIdSearch={debouncedVendorIdSearch}
                    debouncedVendorNameSearch={debouncedVendorNameSearch}
                    handleVendorChange={handleVendorChange} skipNextVendorLookup={skipNextVendorLookup}
                    exchangeRate={exchangeRate} setExchangeRate={setExchangeRate} />;
            case '2':
                console.log("DEBUG: Rendering AllFieldsTab case 2", { hasSchema: !!schema, activeTab });
                return <AllFieldsTab {...commonProps} schema={schema?.flatFields || schema} />;
            case '3':
                return <CodingTab formData={formData} codingLineItems={codingLineItems}
                    headerCoding={headerCoding} disableInputs={disableInputs}
                    disabledStyle={disabledStyle} getCurrencySymbol={getCurrencySymbol}
                    extractValue={extractValue} parseCurrencyValue={parseCurrencyValue}
                    handleHeaderCodingChange={handleHeaderCodingChange}
                    handleCodingLineItemChange={handleCodingLineItemChange}
                    handleDeleteLineItem={handleDeleteLineItem} exportToExcel={exportToExcel} />;
            case 'gl_summary':
                return <GLSummaryTab originalData={originalData} codingLineItems={codingLineItems}
                    formData={formData} getCurrencySymbol={getCurrencySymbol}
                    extractValue={extractValue} parseCurrencyValue={parseCurrencyValue} />;
            case '4':
                return <WorkflowTab invoiceId={invoiceId} invoiceDisplayId={invoiceDisplayId}
                    refreshTrigger={workflowRefreshTrigger}
                    previewVendorId={extractValue(formData['Vendor ID'])}
                    previewVendorName={extractValue(formData['Vendor Name'])}
                />;
            case '5':
                return <AuditTrail invoiceId={invoiceId} />;
            default:
                return <QuickViewTab {...commonProps} vendorId={vendorId}
                    vendorIdOptions={vendorIdOptions} vendorNameOptions={vendorNameOptions}
                    memo={memo} isDuplicateError={isDuplicateError} setVendorId={setVendorId}
                    setMemo={setMemo} debouncedVendorIdSearch={debouncedVendorIdSearch}
                    debouncedVendorNameSearch={debouncedVendorNameSearch}
                    handleVendorChange={handleVendorChange} skipNextVendorLookup={skipNextVendorLookup}
                    exchangeRate={exchangeRate} setExchangeRate={setExchangeRate} />;
        }
    }, [activeTab, formData, lineItems, vendorId, vendorIdOptions, vendorNameOptions, memo,
        selectedVendorDetails, isDuplicateError, disableInputs, disabledStyle, getCurrencySymbol,
        extractValue, parseCurrencyValue, renderFieldInput, handleInputChange, handleLineItemChange,
        handleAddLineItem, exportToExcel, lineItemColumns, readOnly, isAmountMismatch, calculationDetails, codingLineItems, headerCoding,
        handleHeaderCodingChange, handleCodingLineItemChange, handleDeleteLineItem, originalData,
        invoiceId, invoiceDisplayId, workflowRefreshTrigger, exchangeRate, setVendorId, setMemo,
        debouncedVendorIdSearch, debouncedVendorNameSearch, handleVendorChange, setExchangeRate]);

    // ==================== DEBUG RENDER COUNT ====================
    useEffect(() => {
        renderCount.current += 1;
        if (renderCount.current > 100) {
            console.warn(`Component rendered ${renderCount.current} times. May indicate infinite loop.`);
        }
    });

    // ==================== RENDER ====================
    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{
                position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'var(--bg-content, #fff)',
                borderBottom: '1px solid var(--border-color, #f0f0f0)', padding: '8px 20px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', gap: '16px' }}>
                    <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                        <Tabs activeKey={activeTab} onChange={setActiveTab} style={{ margin: 0 }}
                            items={[
                                { key: '1', label: 'Quick View' },
                                { key: '2', label: 'All Fields' },
                                ...(readOnly ? [{ key: '3', label: 'Coding' }] : []),
                                { key: 'gl_summary', label: 'GL Summary' },
                                { key: '4', label: 'Workflow' },
                                { key: '5', label: 'Audit Trail' }
                            ]}
                        />
                    </div>

                    {renderStatusTag && (
                        invoiceStatus === "approved" || 
                        invoiceStatus === "rejected" || 
                        invoiceStatus === "sage_posted" || 
                        invoiceStatus === "sage_post_failed"
                    ) && (
                        <div style={{ flexShrink: 0 }}>{renderStatusTag()}</div>
                    )}

                    {invoiceStatus === 'waiting_approval' && (
                        <Space style={{ flexShrink: 0 }}>
                            <Button type="primary" icon={<CheckCircleOutlined />}
                                style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
                                onClick={handleApprove} disabled={approveDisabled || saving}
                                loading={saving}>
                                Approve
                            </Button>
                            <Button type="primary" icon={<CloseCircleOutlined />} danger
                                onClick={handleReject} disabled={rejectDisabled || saving}
                                loading={saving}>
                                Reject
                            </Button>
                            <Button type="primary" icon={<RollbackOutlined />}
                                style={{ backgroundColor: '#faad14', borderColor: '#faad14' }}
                                onClick={handleRework} disabled={reworkDisabled || saving}
                                loading={saving}>
                                Rework
                            </Button>
                        </Space>
                    )}

                    {(invoiceStatus === 'approved' || invoiceStatus === 'sage_post_failed') && (
                        <Space style={{ flexShrink: 0 }}>
                            <Button
                                type="primary"
                                icon={<SyncOutlined />}
                                onClick={handleRepostToSage}
                                loading={reposting}
                            >
                                Repost to Sage
                            </Button>
                        </Space>
                    )}
                </div>

                {isWaitingApproval && (
                    <div style={{ marginBottom: '8px' }}>
                        <TextArea rows={2} placeholder="Add a comment about this approval decision (optional)..."
                            value={approverComment} onChange={(e) => setApproverComment(e.target.value)}
                            maxLength={500} showCount style={{ width: '100%' }} />
                    </div>
                )}

                {(invoiceStatus === "approved" || invoiceStatus === "rejected") && validationInfo?.approver_comment && (
                    <div style={{
                        padding: '10px 16px', backgroundColor: 'var(--bg-main-layout, #f6f8fa)', borderLeft: '3px solid #1890ff',
                        borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        gap: '16px', marginBottom: '8px'
                    }}>
                        <div style={{ fontSize: '13px', color: '#595959', fontStyle: 'italic', flex: 1 }}>
                            "{validationInfo.approver_comment}"
                        </div>
                        {validationInfo?.approver_name && validationInfo?.approval_timestamp && (
                            <div style={{ fontSize: '11px', color: '#8c8c8c', whiteSpace: 'nowrap' }}>
                                <strong>{validationInfo.approver_name}</strong> • {new Date(
                                    validationInfo.approval_timestamp
                                ).toLocaleString()}
                            </div>
                        )}
                    </div>
                )}

                {/* Action buttons removed - now in InvoiceReview header */}



            </div>

            <div style={{ flex: 1, overflow: 'auto' }}>{renderTabContent()}</div>
        </div>
    );
});

export default GenericInputFields;