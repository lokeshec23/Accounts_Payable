// src/components/GenericInputFields.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Tabs,
    Collapse,
    Input,
    InputNumber,
    Select,
    AutoComplete,
    DatePicker,
    Table,
    Button,
    Checkbox,
    message,
    Space,
    Tag,
    Typography
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
    const skipNextVendorLookup = React.useRef(false);

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

    // Line Grouping state
    const [lineGrouping, setLineGrouping] = useState('No');
    const [originalLineItems, setOriginalLineItems] = useState([]);

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

    // Duplicate Invoice State
    const [isDuplicateError, setIsDuplicateError] = useState(false);
    const [initialDuplicateNumber, setInitialDuplicateNumber] = useState(null);

    const invoiceDisplayId = originalData?.extracted_data?.invoice_details?.invoice_number?.value ||
        originalData?.extracted_data?.invoice_details?.invoice_id?.value ||
        originalData?.invoiceId;

    const getCurrencySymbol = () => {
        return '$';
    };

    // ---------- Duplicate Check Logic ----------
    useEffect(() => {
        // Check if backend flagged this as a duplicate
        const duplicateInfo = originalData?.duplicate_info || data?.duplicate_info;
        if (duplicateInfo?.is_duplicate) {
            setIsDuplicateError(true);
            // Capture the number that caused duplication
            const currentInvNum =
                extractValue(data?.extracted_data?.invoice_details?.invoice_number) ||
                extractValue(originalData?.extracted_data?.invoice_details?.invoice_number) ||
                originalData?.invoice_number ||
                '';
            setInitialDuplicateNumber(String(currentInvNum));
        }
    }, [originalData, data]);

    useEffect(() => {
        // Real-time duplicate check with debounce
        const checkDuplicate = async () => {
            const currentVendorId = extractValue(formData['Vendor ID']);
            const currentInvoiceNum = extractValue(formData['Invoice Number']);

            if (!currentVendorId || !currentInvoiceNum) {
                // detailed check not possible if missing fields
                return;
            }

            try {
                const result = await invoiceService.checkDuplicate({
                    vendor_id: currentVendorId,
                    invoice_number: currentInvoiceNum,
                    current_invoice_id: invoiceId
                });

                if (result.is_duplicate) {
                    setIsDuplicateError(true);
                    message.destroy(); // Clear old messages to avoid stack
                    message.warning({
                        content: result.message,
                        key: 'duplicate_warning',
                        duration: 5
                    });
                } else {
                    // Only clear the error if it was a duplicate error. 
                    // If we want to be safe, we just set it to false.
                    setIsDuplicateError(false);
                }
            } catch (error) {
                console.error("Duplicate check failed:", error);
            }
        };

        const timer = setTimeout(() => {
            checkDuplicate();
        }, 800);

        return () => clearTimeout(timer);
    }, [formData['Vendor ID'], formData['Invoice Number'], invoiceId]);

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

        // Check multiple locations for vendor_id:
        const savedVendorId =
            data?.vendor_id ||
            extractValue(data?.extracted_data?.vendor_info?.vendor_id) ||
            originalData?.vendor_id ||
            extractValue(originalData?.extracted_data?.vendor_info?.vendor_id) ||
            '';

        console.log("DEBUG: Vendor ID Resolution:", {
            dataVendorId: data?.vendor_id,
            extracted: data?.extracted_data?.vendor_info?.vendor_id,
            original: originalData?.vendor_id,
            final: savedVendorId
        });

        setVendorId(savedVendorId);

        // Prioritize official vendor name from master (at root level)
        const initialFormData = {
            ...extractionData,
            'Vendor ID': savedVendorId, // Initialize directly in formData
            LineItems: items
        };

        // Map nested LLM-extracted tax fields to root formData keys
        if (extractionData?.amounts) {
            console.log("DEBUG: extractionData.amounts:", extractionData.amounts);
            if (extractionData.amounts.CGST) initialFormData['CGST'] = extractionData.amounts.CGST;
            if (extractionData.amounts.SGST) initialFormData['SGST'] = extractionData.amounts.SGST;
            if (extractionData.amounts.IGST) initialFormData['IGST'] = extractionData.amounts.IGST;
            // Map Total Tax Amount if available (often 'tax' or 'total_tax' in extraction)
            if (extractionData.amounts.tax) initialFormData['Total Tax Amount'] = extractionData.amounts.tax;
            else if (extractionData.amounts.total_tax) initialFormData['Total Tax Amount'] = extractionData.amounts.total_tax;
            else if (extractionData.amounts.total_tax_amount) initialFormData['Total Tax Amount'] = extractionData.amounts.total_tax_amount;
        }

        // Helper to parse breakdown string if individual fields are missing
        const breakdownField = 'Tax Type Breakdown (VAT/GST/PST/IGST etc.)';
        const breakdownValue = extractValue(initialFormData[breakdownField]);

        if (breakdownValue && typeof breakdownValue === 'string') {
            const pattern = /(CGST|SGST|IGST)[\s:]*([\d,.]+)/gi;
            let match;
            while ((match = pattern.exec(breakdownValue)) !== null) {
                const type = match[1].toUpperCase();
                const Amount = match[2];
                if (!initialFormData[type] || !initialFormData[type].value) {
                    initialFormData[type] = {
                        value: parseFloat(Amount.replace(/,/g, '')),
                        source: 'parsed_breakdown'
                    };
                }
            }
        }

        if (data?.vendor_name) {
            initialFormData['Vendor Name'] = { value: data.vendor_name };
        }

        setFormData(initialFormData);
        setLineItems(items);
        setOriginalLineItems(items); // Store original items for grouping/ungrouping

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
                        item: '',
                        original_index: index
                    };
                })
            );
        }



        // Initialize memo from originalData or data
        const savedMemo =
            extractValue(data?.extracted_data?.additional_info?.memo) ||
            extractValue(originalData?.extracted_data?.additional_info?.memo) ||
            '';

        setMemo(savedMemo);
        setExchangeRate(originalData?.exchange_rate || null);

    }, [data, extractionData, originalData]);

    // Reverse Lookup: When Vendor ID changes (e.g. manual entry), update Name and Terms
    useEffect(() => {
        // extractValue handles the object wrapper, returns string or number
        const rawId = extractValue(formData['Vendor ID']);
        // Normalize input: trim, stringify
        const currentId = String(rawId || '').trim();

        console.log("DEBUG: Vendor ID changed to:", currentId, "(Raw type:", typeof rawId, ")");

        if (!currentId) return;

        if (!vendorMasterData || vendorMasterData.length === 0) {
            console.log("DEBUG: Exiting Vendor ID Lookup - Vendor Master Data empty or undefined");
            return;
        }

        // DEBUG: Sample IDs from master data to see what we are matching against
        const sampleIds = vendorMasterData.slice(0, 5).map(v => v['Vendor ID'] || v['VendorID'] || v['vendor_id'] || v['VENDOR_ID']);
        console.log("DEBUG: Sample Master IDs:", sampleIds);

        // Find match in master data with relaxed comparison
        const match = vendorMasterData.find(v => {
            const vId = v['Vendor ID'] || v['VendorID'] || v['vendor_id'] || v['VENDOR_ID'];
            if (!vId) return false;

            const sVid = String(vId).trim();

            // 1. Direct match
            if (sVid === currentId) return true;

            // 2. Handle "123.0" vs "123" (Excel number artifact)
            if (sVid.replace(/\.0+$/, '') === currentId.replace(/\.0+$/, '')) return true;

            return false;
        });

        if (match) {
            console.log("DEBUG: Vendor ID Match Found:", match);

            // 1. Update Vendor Name if different
            const officialName = match['Vendor Name'] || match['VendorName'] || match['Name'] || match['VENDOR_NAME'];
            const currentName = String(extractValue(formData['Vendor Name']) || '').trim();

            if (officialName && String(officialName).trim() !== currentName) {
                console.log(`DEBUG: Updating Vendor Name from '${currentName}' to '${officialName}'`);
                // Force update name
                handleInputChange('Vendor Name', officialName);
            } else {
                console.log("DEBUG: Vendor Name already matches or is empty in master.");
            }

            // 2. Update Payment Terms if empty
            // Reuse robust lookup logic
            const ptKey = Object.keys(match).find(k => {
                const normK = k.toLowerCase().replace(/[\s_\\\-]/g, '');
                return normK === 'paymentterms' ||
                    normK === 'terms' ||
                    normK === 'termsofpayment' ||
                    normK === 'creditterms' ||
                    normK === 'payterms' ||
                    normK === 'pmtterms';
            });
            const paymentTerms = ptKey ? match[ptKey] : null;
            const currentTerms = extractValue(formData['Payment Terms']);
            const isCurrentEmpty = !currentTerms || String(currentTerms).trim() === '';

            if (paymentTerms && isCurrentEmpty) {
                console.log("DEBUG: Auto-populating Payment Terms from ID Match:", paymentTerms);
                handleInputChange('Payment Terms', paymentTerms);
            }
        } else {
            console.log("DEBUG: No match found for Vendor ID:", currentId);
        }
    }, [formData['Vendor ID'], vendorMasterData]); // Dependency on the raw value in formData

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
    const normalizeVendor = (name) => {
        if (!name) return "";
        let text = String(name).toLowerCase();
        // Replace multiplication sign with x
        text = text.replace(/×/g, "x");
        // Remove common suffixes with word boundaries
        text = text.replace(/\b(pvt|private|ltd|limited|inc|llp|corp|corporation|llc|plc|gmbh|co|ag)\b/g, "");
        // Remove non-alpha-numeric characters (keep spaces)
        text = text.replace(/[^a-z0-9 ]/g, " ");
        // Collapse multiple spaces
        text = text.replace(/\s+/g, " ").trim();
        return text;
    };

    const normalizeAddress = (address) => {
        if (!address) return "";
        let text = String(address).toLowerCase();

        // Synchronized with backend abbreviations
        const abbreviations = {
            'st': 'street',
            'rd': 'road',
            'ln': 'lane',
            'ave': 'avenue',
            'blvd': 'boulevard',
            'dr': 'drive',
            'ct': 'court',
            'pl': 'place',
            'sq': 'square',
            'ste': 'suite',
            'apt': 'apartment',
            'no': 'number',
            'p.o. box': 'pobox',
            'po box': 'pobox',
            'hwy': 'highway',
            'pkwy': 'parkway'
        };

        // Regex for word boundaries
        Object.keys(abbreviations).forEach(abbrev => {
            const regex = new RegExp(`\\b${abbrev.replace('.', '\\.')}\\b`, 'g');
            text = text.replace(regex, abbreviations[abbrev]);
        });

        // Remove all non-alphanumeric (keep numbers and letters)
        text = text.replace(/[^a-z0-9 ]/g, " ");
        // Collapse multiple spaces
        text = text.replace(/\s+/g, " ").trim();
        return text;
    };

    // ---------- Vendor Logic & Due Date Calculation ----------
    const initialSearchDone = React.useRef(false);

    useEffect(() => {
        const vendorName = extractValue(formData['Vendor Name']);
        const vendorAddress = extractValue(formData['Vendor Address']) ||
            extractValue(formData.vendor_info?.address) ||
            extractValue(extractionData.vendor_info?.address) ||
            extractValue(extractionData.vendor_address) ||
            extractValue(data?.vendor_address);

        if (vendorName) console.log("DEBUG: Checking Vendor Name Match for:", vendorName);
        if (vendorAddress) console.log("DEBUG: Checking Vendor Address Match for:", vendorAddress);
        else console.warn("DEBUG: No Vendor Address found in current data.");

        if ((vendorName || vendorAddress) && vendorMasterData.length > 0) {
            const normalizedNameInput = vendorName ? normalizeVendor(vendorName) : "";
            const normalizedAddrInput = vendorAddress ? normalizeAddress(vendorAddress) : "";

            // Helper to apply match to form
            const applyMatch = (match) => {
                // Auto-populate Vendor ID if available and not set
                const matchedId = match['Vendor ID'] || match['VendorID'] || match['vendor_id'] || match['VENDOR_ID'];

                const currentFormId = extractValue(formData['Vendor ID']);
                // Robust comparison (handle numbers vs strings)
                if (!skipNextVendorLookup.current) {
                    if (
                        matchedId &&
                        String(matchedId).trim() !== String(currentFormId || '').trim()
                    ) {
                        console.log("DEBUG: Auto-setting Vendor ID:", matchedId);
                        setVendorId(matchedId);
                        handleInputChange('Vendor ID', matchedId);
                    }
                } else {
                    console.log("DEBUG: Skipping Vendor ID auto-fill (user selected Vendor Name)");
                    skipNextVendorLookup.current = false; // reset after one skip
                }

                // Auto-correct Vendor Name if needed
                const officialName = match['Vendor Name'] || match['VendorName'] || match['Name'] || match['VENDOR_NAME'];
                const currentName = String(vendorName || '').trim();

                // If official name is different (ignoring case/spaces for comparison, or just trust master)
                if (officialName && (normalizeVendor(officialName) !== normalizeVendor(currentName) || officialName !== currentName)) {
                    console.log(`DEBUG: Auto-correcting Vendor Name from '${currentName}' to '${officialName}'`);
                    handleInputChange('Vendor Name', officialName);
                }

                // Use unified vendor change handler for all other updates
                handleVendorChange(match);
            };

            // 1. Exact Address Match (Local) - HIGHEST PRIORITY
            let bestLocalMatch = null;
            if (normalizedAddrInput) {
                bestLocalMatch = vendorMasterData.find(v => {
                    let masterAddr = v['Vendor Address'] || v['VendorAddress'] || v['Address'] || v['VENDOR_ADDRESS'];

                    if (!masterAddr) {
                        // Construct from parts
                        const parts = [
                            v['ADDRESS_LINE1'] || v['Address1'],
                            v['ADDRESS_LINE2'] || v['Address2'],
                            v['ADDRESS_LINE3'] || v['Address3'],
                            v['CITY'] || v['City'],
                            v['STATE_OR_TERITTORY'] || v['STATE'] || v['State'],
                            v['ZIP_OR_POSTAL_CODE'] || v['ZIP'] || v['PostalCode'] || v['ZipCode'],
                            v['COUNTRY'] || v['Country']
                        ];
                        masterAddr = parts.filter(p => p).map(p => String(p).trim()).join(" ").trim();
                    }

                    const normalizedMaster = masterAddr ? normalizeAddress(masterAddr) : "";

                    // console.debug(`DEBUG: Comparing Addr: '${normalizedAddrInput}' vs Master: '${normalizedMaster}'`);
                    return normalizedMaster === normalizedAddrInput;
                });
                if (bestLocalMatch) console.log("DEBUG: Exact Address Match Found (Local)!", bestLocalMatch);
                else if (normalizedAddrInput) console.log("DEBUG: No Exact Address Match Found (Local) for:", normalizedAddrInput);
            }

            // 2. Exact Name Match (Local) - Second Priority
            if (!bestLocalMatch && normalizedNameInput) {
                bestLocalMatch = vendorMasterData.find(v => {
                    const masterName = v['Vendor Name'] || v['VendorName'] || v['Name'] || v['VENDOR_NAME'];
                    return masterName && normalizeVendor(masterName) === normalizedNameInput;
                });
                if (bestLocalMatch) console.log("DEBUG: Exact Name Match Found (Local)!", bestLocalMatch);
            }

            if (bestLocalMatch) {
                applyMatch(bestLocalMatch);
            } else {
                // 3. API Search (Fallback) - RUN ONCE ONLY
                if (!initialSearchDone.current) {
                    console.log("DEBUG: No local exact match, attempting AI search (One-time)...");
                    initialSearchDone.current = true;

                    const searchAsync = async () => {
                        try {
                            // Search using both name and address
                            const result = await masterDataService.searchVendor(vendorName, vendorAddress);
                            if (result && result.match) {
                                console.log(`DEBUG: AI Match Found (${result.method}):`, result.match, "Score:", result.score);
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
            }

        } else {
            setSelectedVendorDetails(null);
        }
    }, [
        formData['Vendor Name'],
        formData.vendor_info?.address,
        extractionData.vendor_info?.address,
        vendorMasterData
    ]);

    const extractNetDays = (terms) => {
        if (!terms) return null;

        const text = String(terms).toLowerCase();

        // Handle "due on receipt"
        if (text.includes('receipt')) return 0;

        // Match numbers like: Net 30, 30 days, 30
        const match = text.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : null;
    };

    const getVendorPaymentTerms = (vendor) => {
        if (!vendor) return null;

        const key = Object.keys(vendor).find(k => {
            const norm = k.toLowerCase().replace(/[\s_\\\-]/g, '');
            return (
                norm === 'paymentterms' ||
                norm === 'termsofpayment' ||
                norm === 'creditterms' ||
                norm === 'payterms'
            );
        });

        return key ? vendor[key] : null;
    };

    // ---------- Line Item Grouping Logic ----------
    const aggregateLineItems = (items) => {
        if (!items || items.length === 0) return [];

        const first = items[0];
        let totalQuantity = 0;
        let totalUnitPrice = 0;
        let totalNetAmount = 0;
        let totalTaxAmount = 0;
        let totalDiscount = 0;

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
    };

    const applyLineGrouping = (groupingSetting) => {
        console.log('DEBUG: Applying line grouping:', groupingSetting);

        if (groupingSetting === 'Yes') {
            // Aggregate all line items into one
            if (originalLineItems.length > 0) {
                const aggregated = aggregateLineItems(originalLineItems);
                console.log('DEBUG: Aggregated line item:', aggregated);
                setLineItems([aggregated]);
            }
        } else {
            // Restore original line items
            console.log('DEBUG: Restoring original line items, count:', originalLineItems.length);
            setLineItems([...originalLineItems]);
        }
    };

    // ---------- Comprehensive Vendor Change Handler ----------
    const handleVendorChange = (vendorDetails) => {
        if (!vendorDetails) return;

        console.log('DEBUG: handleVendorChange called with vendor:', vendorDetails);

        // 1. Update selected vendor details
        setSelectedVendorDetails(vendorDetails);

        // 2. Extract and apply Payment Terms
        const ptKey = Object.keys(vendorDetails).find(k => {
            const normK = k.toLowerCase().replace(/[\s_\\-]/g, '');
            return normK === 'paymentterms' || normK === 'terms' || normK === 'termsofpayment';
        });
        if (ptKey && vendorDetails[ptKey]) {
            console.log('DEBUG: Applying Payment Terms:', vendorDetails[ptKey]);
            handleInputChange('Payment Terms', vendorDetails[ptKey]);
        }

        // 3. Extract and apply Line Grouping
        const grouping = vendorDetails['Line Grouping'] ||
            vendorDetails['LineGrouping'] ||
            vendorDetails['line_grouping'] ||
            vendorDetails['LINE_GROUPING'] || 'No';
        console.log('DEBUG: Line Grouping setting:', grouping);
        setLineGrouping(grouping);
        applyLineGrouping(grouping);

        // 4. GST and TDS are already handled by selectedVendorDetails display
        // 5. Trigger workflow refresh
        setWorkflowRefreshTrigger(prev => prev + 1);
    };


    useEffect(() => {
        const invoiceDateStr = extractValue(formData['Invoice Date']);
        if (!invoiceDateStr) return;

        const invoiceDate = dayjs(invoiceDateStr);
        if (!invoiceDate.isValid()) return;

        const extractedTerms = extractValue(formData['Payment Terms']);
        let days = extractNetDays(extractedTerms);

        // Fallback to Vendor Master if terms are invalid
        if (days === null && selectedVendorDetails) {
            const vendorTerms = getVendorPaymentTerms(selectedVendorDetails);
            days = extractNetDays(vendorTerms);

            // Auto-fill payment terms from vendor if missing/invalid
            if (vendorTerms && (!extractedTerms || days !== null)) {
                handleInputChange('Payment Terms', vendorTerms);
            }
        }

        // Still invalid → do nothing
        if (days === null) return;

        const newDueDate = invoiceDate
            .add(days, 'day')
            .format('YYYY-MM-DD');

        const currentDueDate = extractValue(formData['Due Date']);

        if (currentDueDate !== newDueDate) {
            handleInputChange('Due Date', newDueDate);
        }
    }, [
        formData['Invoice Date'],
        formData['Payment Terms'],
        selectedVendorDetails
    ]);

    // ---------- TDS Calculation Update Total ----------
    useEffect(() => {
        if (readOnly) return;

        // 1. Calculate Subtotal from lineItems
        const calculatedSubtotal = lineItems.reduce((sum, item) => {
            const val = parseCurrencyValue(
                extractValue(item.NetAmount) ||
                extractValue(item.amount) ||
                extractValue(item.net_amount) ||
                item.amount ||
                item.net_amount
            );
            return sum + val;
        }, 0);

        // 2. Calculate Total Tax
        // Header Taxes
        const headerTax =
            parseCurrencyValue(extractValue(formData['CGST'])) +
            parseCurrencyValue(extractValue(formData['SGST'])) +
            parseCurrencyValue(extractValue(formData['IGST']));

        // Line Item Taxes
        const lineItemTax = lineItems.reduce((sum, item) => {
            const val = parseCurrencyValue(
                extractValue(item.TaxAmount) ||
                extractValue(item.tax_amount)
            );
            return sum + val;
        }, 0);

        // Heuristic: If "Total Tax Amount" is populated in header, use it. Else sum components.
        const fieldTotalTax = parseCurrencyValue(extractValue(formData['Total Tax Amount']));
        const totalTax = fieldTotalTax > 0 ? fieldTotalTax : (headerTax + lineItemTax);

        // 3. TDS Calculation (only if vendor matched and applicable)
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
                'TDS Applicability',
                'TDS Applicable',
                'Withholding Tax Applicable'
            ]);

            const isTDSApplicable = tdsApplicabilityVal?.toString().toLowerCase().trim() === 'yes';

            if (isTDSApplicable) {
                const tdsRateVal = findVal(selectedVendorDetails, [
                    'TDS Percentage',
                    'Percentage',
                    'Rate',
                    'TDS Rate',
                    'Withholding Rate'
                ]) || '0';

                const tdsRate = parseFloat(tdsRateVal.toString().replace('%', '')) || 0;
                tdsAmount = parseFloat((calculatedSubtotal * tdsRate).toFixed(2));
            }
        }

        // 4. Final Totals
        // Formula: Invoice Total = Subtotal + Tax (Gross)
        const invoiceTotal = parseFloat((calculatedSubtotal + totalTax).toFixed(2));
        // Formula: Payable = Gross - TDS
        const payableAmount = parseFloat((invoiceTotal - tdsAmount).toFixed(2));

        // Update Form Data if different (avoid loop)
        const currentTotal = parseCurrencyValue(extractValue(formData['Total Invoice Amount']));
        const currentPayable = parseCurrencyValue(extractValue(formData['Total Amount Payable']));

        let hasUpdates = false;
        const updates = {};

        if (Math.abs(currentTotal - invoiceTotal) > 0.005) {
            updates['Total Invoice Amount'] = { value: invoiceTotal };
            hasUpdates = true;
        }

        if (Math.abs(currentPayable - payableAmount) > 0.005) {
            updates['Total Amount Payable'] = { value: payableAmount };
            updates['Amount Due'] = { value: payableAmount };
            hasUpdates = true;
        }

        if (hasUpdates) {
            console.log(`DEBUG: Updating Totals - Invoice: ${invoiceTotal}, Payable: ${payableAmount}, TDS: ${tdsAmount}`);
            setFormData((prev) => ({
                ...prev,
                ...updates
            }));
        }

    }, [
        lineItems,
        selectedVendorDetails,
        formData['CGST'],
        formData['SGST'],
        formData['IGST'],
        formData['Total Tax Amount'],
        readOnly
    ]);


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

        setCodingLineItems((prevCoding) => {
            const newCoding = [];
            let currentSNo = 1;

            // 1. Separate 'Base' items from previously generated/synced 'System' items
            // This prevents duplicate generation loops when syncing back to extraction Items
            const pureBaseItemsWithIndex = lineItems
                .map((item, idx) => ({ item, idx }))
                .filter(({ item }) => {
                    const desc = (extractValue(item.Description) || item.description || '').toString();
                    return !desc.startsWith('GST for item') && !desc.startsWith('TDS Deduction');
                });

            pureBaseItemsWithIndex.forEach(({ item, idx }) => {
                // Find existing base item in Coding tab to preserve user edits (GL code, etc.)
                const existingBase = prevCoding.find(pc =>
                    pc.original_index === idx &&
                    !pc.description?.startsWith('GST for item')
                );

                const extractedUnitPrice = extractValue(item.UnitPrice);
                const extractedNetAmount = extractValue(item.NetAmount);

                const unitPrice = parseCurrencyValue(
                    extractedUnitPrice || extractValue(item.unit_price) || item.unit_price
                );
                const netAmount = parseCurrencyValue(
                    extractedNetAmount ||
                    extractValue(item.amount) ||
                    extractValue(item.net_amount) ||
                    item.amount ||
                    item.net_amount
                );

                const baseLine = {
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
                };
                newCoding.push(baseLine);
            });

            // --- Single Aggregated GST Line Logic ---
            // --- Single Aggregated GST Line Logic ---
            const formTaxValue = parseCurrencyValue(extractValue(formData['Total Tax Amount']));

            // Calculate total tax from all extracted items
            const calculatedTotalTax = pureBaseItemsWithIndex.reduce((sum, { item }) => {
                const t = parseCurrencyValue(
                    extractValue(item.TaxAmount) ||
                    extractValue(item.tax_amount) ||
                    item.TaxAmount ||
                    item.tax_amount
                );
                return sum + t;
            }, 0) +
                parseCurrencyValue(extractValue(formData['CGST'])) +
                parseCurrencyValue(extractValue(formData['SGST'])) +
                parseCurrencyValue(extractValue(formData['IGST']));

            const finalGstValue = formTaxValue || calculatedTotalTax;

            const gstDesc = 'Total GST';
            const existingGST = prevCoding.find(pc => pc.description === gstDesc);

            const isEligible = selectedVendorDetails?.['GST / Use Tax Eligibility Configuration']?.toString().trim() === 'Eligible';

            // For ineligible, inherit from the first base line, or keep existing edit
            let gstGL = existingGST?.gl_code || '';
            if (!gstGL) {
                gstGL = isEligible ? 'GST_INPUT' : (newCoding[0]?.gl_code || '');
            } else if (!isEligible && newCoding.length > 0 && existingGST.gl_code === newCoding[0].gl_code) {
                // specific check: if it was auto-inherited, update it if the parent changed? 
                // Simpler: if ineligible and no manual override, sync with first line
                gstGL = newCoding[0]?.gl_code || '';
            }

            newCoding.push({
                s_no: currentSNo++,
                description: gstDesc,
                line_type: 'Tax',
                quantity: 1,
                unit_price: finalGstValue,
                net_amount: finalGstValue,

                gl_code: gstGL,
                lob: newCoding[0]?.lob || '',
                department: newCoding[0]?.department || '',
                customer: newCoding[0]?.customer || '',
                item: newCoding[0]?.item || '',
                original_index: -2 // Special index for global GST
            });

            // --- TDS Line Logic ---
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
                'TDS Applicability',
                'TDS Applicable',
                'Withholding Tax Applicable'
            ]);

            const isTDSApplicable = tdsApplicabilityVal?.toString().toLowerCase().trim() === 'yes';

            if (isTDSApplicable) {
                const tdsRateVal = findTDSValue([
                    'TDS Percentage',
                    'Percentage',
                    'Rate',
                    'TDS Rate',
                    'Withholding Rate'
                ]) || '0';

                let tdsRate = parseFloat(tdsRateVal.toString().replace('%', '')) || 0;
                // Heuristic: If rate is > 1, assume it's a percentage (e.g. 10 -> 0.1, 1 -> 0.01)
                // If it is <= 1, assume it's a decimal (e.g. 0.1 -> 10%, 0.01 -> 1%)
                if (tdsRate > 1) {
                    tdsRate = tdsRate / 100;
                }

                // Subtotal calculation (only base expense lines)
                const subtotal = newCoding.reduce((sum, line) => {
                    // Exclude GST lines (both individual and aggregated)
                    const isGst = line.description?.startsWith('GST for item') || line.description === 'Total GST';
                    return isGst ? sum : sum + line.net_amount;
                }, 0);

                // User instruction: TDS Rate is decimal. Round to 2 decimals.
                // tdsRate is now likely 0.01 for 1%
                const tdsAmount = parseFloat((subtotal * tdsRate).toFixed(2));

                if (tdsAmount > 0) {
                    const tdsDesc = `TDS Deduction (${tdsRate})`; // Rate is decimal, maybe show as percentage? Let's keep raw or format? 
                    // Actually rate is likely 0.01. User might prefer "1%". 
                    // But simpler to just show what we have or standardized description.
                    // Let's stick to simple "TDS Deduction" for now or just rate.
                    // Better: `TDS Deduction`

                    const existingTDS = prevCoding.find(pc =>
                        pc.description?.startsWith('TDS Deduction') ||
                        pc.original_index === -1
                    );

                    newCoding.push({
                        s_no: currentSNo++,
                        description: `TDS Deduction`,
                        line_type: 'Liability',
                        quantity: 1,
                        unit_price: -tdsAmount,
                        net_amount: -tdsAmount,
                        gl_code: existingTDS?.gl_code || 'TDS_PAYABLE',
                        lob: '',
                        department: '',
                        customer: '',
                        item: '',
                        original_index: -1
                    });
                }
            }

            return newCoding;
        });
    }, [lineItems, selectedVendorDetails, formData]);

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
        // Find if it's a generated line (GST/TDS) or base line
        const codingItem = codingLineItems[index];

        if (codingItem && codingItem.original_index !== undefined && codingItem.original_index >= 0) {
            // If it's a base line, deleting it removes the entire extracted line and its derivatives
            // If it's a GST line, we should probably warn or just delete the parent? 
            // Better: If user deletes a GST line in coding, they might just want it gone.
            // But our useEffect will put it back if lineItems.TaxAmount > 0.
            // So we should probably update lineItems to remove tax.

            const isGst = codingItem.description?.startsWith('GST for item');
            if (isGst) {
                // Remove tax from original line
                const updatedLines = [...lineItems];
                updatedLines[codingItem.original_index].TaxAmount = { value: 0 };
                setLineItems(updatedLines);
            } else {
                // Remove the entire line
                setLineItems((prev) => prev.filter((_, i) => i !== codingItem.original_index));
            }
        } else {
            // Global adjustment like TDS or manual line not linked to extraction
            setCodingLineItems((prev) => prev.filter((_, i) => i !== index));
        }
    };

    const handleHeaderCodingChange = (value) => setHeaderCoding(value);

    const handleCodingLineItemChange = (index, field, value) => {
        const updated = [...codingLineItems];
        const item = updated[index];
        item[field] = value;
        setCodingLineItems(updated);

        // Sync back to lineItems if it's a base field being edited in Coding tab
        if (item.original_index !== undefined && item.original_index >= 0 && !item.description?.startsWith('GST for item')) {
            const map = {
                'net_amount': 'NetAmount',
                'description': 'Description',
                'quantity': 'Quantity',
                'unit_price': 'UnitPrice'
            };
            const lineField = map[field];
            if (lineField) {
                const updatedLineItems = [...lineItems];
                const targetLine = updatedLineItems[item.original_index];
                if (targetLine) {
                    targetLine[lineField] = { ...targetLine[lineField], value };
                    setLineItems(updatedLineItems);
                }
            }
        }
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
            // FIX: If grouping is enabled, we must save the ORIGINAL items to preserve data.
            // If grouping is disabled, we save the current (potentially edited) lineItems.
            const itemsToSave = (lineGrouping === 'Yes' && originalLineItems?.length > 0)
                ? originalLineItems
                : lineItems;

            if (Array.isArray(itemsToSave)) {
                if (!updatedExtractedData.Items) {
                    updatedExtractedData.Items = { value: [] };
                }

                const originalItems = updatedExtractedData.Items.value || [];

                updatedExtractedData.Items.value = itemsToSave.map((item, index) => {
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
                exchange_rate: exchangeRate,
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



    // ---------- Optimization Handlers ----------

    // Debounce utility
    const debounce = (func, wait) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    };

    const handleVendorIdSearch = (searchText) => {
        if (!searchText || !vendorMasterData) {
            setVendorIdOptions([]);
            return;
        }

        const matches = [];
        const seen = new Set();

        for (const v of vendorMasterData) {
            if (matches.length >= 50) break;

            const id = v['Vendor ID'] || v['VendorID'] || v['vendor_id'] || v['VENDOR_ID'];
            const name = v['Vendor Name'] || v['VendorName'] || v['Name'] || v['VENDOR_NAME'];

            if (id && name) {
                const display = `${id} - ${name}`;

                if (
                    display.toUpperCase().includes(searchText.toUpperCase())
                    // && !seen.has(id) // USER REQUEST: Allow duplicates
                ) {
                    seen.add(id);
                    matches.push({
                        value: String(id),          // what fills the input
                        label: display,             // what shows in dropdown
                        vendor: v
                    });
                }
            }
        }

        setVendorIdOptions(matches);
    };


    const handleVendorNameSearch = (searchText) => {
        if (!searchText || !vendorMasterData) {
            setVendorNameOptions([]);
            return;
        }

        const matches = [];
        const seen = new Set();

        for (const v of vendorMasterData) {
            if (matches.length >= 50) break;

            const id = v['Vendor ID'] || v['VendorID'] || v['vendor_id'] || v['VENDOR_ID'];
            const name = v['Vendor Name'] || v['VendorName'] || v['Name'] || v['VENDOR_NAME'];

            if (id && name) {
                const display = `${id} - ${name}`;

                if (
                    display.toUpperCase().includes(searchText.toUpperCase())
                ) {
                    // seen.add(name); // Removed uniqueness check
                    matches.push({
                        value: `${name}::${id}`,    // UNIQUE value to separate duplicates
                        label: display,             // VendorID - VendorName in dropdown
                        vendor: v
                    });
                }
            }
        }

        setVendorNameOptions(matches);
    };

    // Create debounced versions
    const debouncedVendorIdSearch = React.useMemo(
        () => debounce(handleVendorIdSearch, 300),
        [vendorMasterData] // Re-create if master data changes
    );

    const debouncedVendorNameSearch = React.useMemo(
        () => debounce(handleVendorNameSearch, 300),
        [vendorMasterData] // Re-create if master data changes
    );


    // ---------- UI helpers ----------
    const renderFieldInput = (field, value) => {
        const stringValue = extractValue(value);

        if (
            (field.toLowerCase().includes('amount') ||
                field.toLowerCase().includes('price') ||
                field.toLowerCase().includes('total') ||
                field.toLowerCase().includes('subtotal') ||
                field.toLowerCase().includes('tax') ||
                field.toLowerCase().includes('fees') ||
                field.toLowerCase().includes('surcharges')) &&
            !field.toLowerCase().includes('id') &&
            !field.toLowerCase().includes('tin')
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
                        prefix="$"
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
                        prefix="$"
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
                        prefix="$"
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
                        prefix="$"
                        disabled={readOnly}
                    />
                </div>
            )
        },
        {
            title: 'Tax Amt',
            dataIndex: 'TaxAmount',
            key: 'TaxAmount',
            width: 100,
            render: (val, record, index) => (
                <div
                    onMouseEnter={() => setHoveredKey && setHoveredKey(`LineItem_${index}_TaxAmount`)}
                    onMouseLeave={() => setHoveredKey && setHoveredKey(null)}
                >
                    <InputNumber
                        style={{ width: '100%', ...disabledStyle }}
                        value={parseCurrencyValue(extractValue(val))}
                        onChange={(value) =>
                            handleLineItemChange(index, 'TaxAmount', value)
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

    // ---------- Helper Components ----------
    const renderFieldGroup = (title, fields) => {
        return (
            <Panel header={title} key={title}>
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px'
                    }}
                >
                    {fields.map((field) => (
                        <React.Fragment key={field}>
                            <div
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
                            {field === 'Invoice Currency' && extractValue(formData['Invoice Currency']) !== 'USD' && (
                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '350px 1fr',
                                        gap: '16px',
                                        alignItems: 'center',
                                        marginTop: '4px'
                                    }}
                                >
                                    <div style={{ fontWeight: 500 }}>Exchange Rate:</div>
                                    <div>
                                        <InputNumber
                                            style={{ width: '100%', ...disabledStyle }}
                                            value={exchangeRate}
                                            onChange={(val) => setExchangeRate(val)}
                                            placeholder="Enter exchange rate"
                                            disabled={disableInputs}
                                        />
                                    </div>
                                </div>
                            )}
                        </React.Fragment>
                    ))}
                </div>
            </Panel>
        );
    };

    // Helper for Vendor Master Details Panel
    const renderVendorMasterDetailsPanel = () => (
        <Panel header="Vendor Master Details" key="vendor_details">
            <div style={{ padding: '10px 0' }}>
                {selectedVendorDetails ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {[
                            { label: 'GST Eligibility', key: 'GST / Use Tax Eligibility Configuration', altKeys: ['GST Eligibility', 'GST Status'] },
                            { label: 'TDS Applicability', key: 'TDS/Withhold Tax Applicability Configuration', altKeys: ['TDS Applicable', 'TDS Status'] },
                            { label: 'TDS Rate', key: 'TDS Percentage', altKeys: ['TDS Rate', 'Rate', 'Percentage'] },
                            { label: 'TDS Section', key: 'TDS Section Code and Description', altKeys: ['TDS Section', 'Section'] },
                            { label: 'Line Grouping', key: 'Line Grouping', altKeys: ['Line Grouping', 'LineGrouping', 'Grouping'] },
                        ].map(({ label, key, altKeys }) => {
                            const findVal = () => {
                                if (selectedVendorDetails[key]) return selectedVendorDetails[key];
                                for (const k of altKeys) {
                                    if (selectedVendorDetails[k]) return selectedVendorDetails[k];
                                    const match = Object.keys(selectedVendorDetails).find(vk => vk.toLowerCase() === k.toLowerCase());
                                    if (match) return selectedVendorDetails[match];
                                }
                                return null;
                            };
                            const val = findVal();
                            return (
                                <div key={label} style={{
                                    display: 'grid',
                                    gridTemplateColumns: '350px 1fr',
                                    gap: '16px',
                                    alignItems: 'center'
                                }}>
                                    <div style={{ fontWeight: 500 }}>{label}:</div>
                                    <div>
                                        <Input
                                            value={val || ''}
                                            placeholder="N/A"
                                            disabled
                                            style={{ width: '100%', ...disabledStyle }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div style={{ color: '#8c8c8c', fontStyle: 'italic' }}>
                        No vendor selected or master data not available.
                    </div>
                )}
            </div>
        </Panel>
    );

    // ---------- Quick View ----------
    const quickViewTab = (
        <div style={{ padding: '20px' }}>
            <Collapse defaultActiveKey={['header', 'vendor_details', 'lineitems']}>
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
                            gridTemplateColumns: '350px 1fr',
                            gap: '16px',
                            alignItems: 'center'
                        }}>
                            <div style={{ fontWeight: 500 }}>Vendor ID:</div>
                            <AutoComplete
                                value={vendorId}
                                onChange={(val) => {
                                    setVendorId(val);
                                    handleInputChange('Vendor ID', val);
                                }}
                                onSearch={debouncedVendorIdSearch}
                                onSelect={(val, option) => {
                                    if (option.vendor) {
                                        skipNextVendorLookup.current = true;
                                        const vName = option.vendor['Vendor Name'] || option.vendor['VendorName'] || option.vendor['Name'] || option.vendor['VENDOR_NAME'];
                                        if (vName) {
                                            handleInputChange('Vendor Name', vName);
                                        }
                                        handleVendorChange(option.vendor);
                                    }
                                }}
                                options={vendorIdOptions}
                                disabled={disableInputs}
                                style={disabledStyle}
                            />
                        </div>

                        {/* Vendor Name */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '350px 1fr',
                            gap: '16px',
                            alignItems: 'center'
                        }}>
                            <div style={{ fontWeight: 500 }}>Vendor Name:</div>
                            <AutoComplete
                                value={extractValue(formData['Vendor Name'])}
                                onChange={(val) => {
                                    const realName = val && val.includes('::') ? val.split('::')[0] : val;
                                    handleInputChange('Vendor Name', realName);
                                }}
                                onSearch={debouncedVendorNameSearch}
                                onSelect={(val, option) => {
                                    skipNextVendorLookup.current = true;
                                    const realName = val && val.includes('::') ? val.split('::')[0] : val;
                                    handleInputChange('Vendor Name', realName);
                                    if (option.vendor) {
                                        const vId = option.vendor['Vendor ID'] || option.vendor['VendorID'] || option.vendor['vendor_id'] || option.vendor['VENDOR_ID'];
                                        setVendorId(vId);
                                        handleInputChange('Vendor ID', vId);
                                        handleVendorChange(option.vendor);
                                    }
                                }}
                                options={vendorNameOptions}
                                disabled={disableInputs}
                                style={{ width: '100%', ...disabledStyle }}
                            />
                        </div>

                        {/* Invoice Number */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '350px 1fr',
                            gap: '16px',
                            alignItems: 'center'
                        }}>
                            <div style={{ fontWeight: 500 }}>Invoice Number:</div>
                            <div>
                                {renderFieldInput('Invoice Number', formData['Invoice Number'])}
                                {isDuplicateError && (
                                    <div style={{ color: '#ff4d4f', fontSize: '12px', marginTop: '4px' }}>
                                        Duplicate Invoice Number. Please change it to proceed.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Invoice Date */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '350px 1fr',
                            gap: '16px',
                            alignItems: 'center'
                        }}>
                            <div style={{ fontWeight: 500 }}>Invoice Date:</div>
                            <div>{renderFieldInput('Invoice Date', formData['Invoice Date'])}</div>
                        </div>

                        {/* Due Date */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '350px 1fr',
                            gap: '16px',
                            alignItems: 'center'
                        }}>
                            <div style={{ fontWeight: 500 }}>Due Date:</div>
                            <div>{renderFieldInput('Due Date', formData['Due Date'])}</div>
                        </div>

                        {/* Payment Terms */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '350px 1fr',
                            gap: '16px',
                            alignItems: 'center',
                        }}>
                            <div style={{ fontWeight: 500 }}>Payment Terms:</div>
                            <div>{renderFieldInput('Payment Terms', formData['Payment Terms'])}</div>
                        </div>

                        {/* Invoice Currency */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '350px 1fr',
                            gap: '16px',
                            alignItems: 'center'
                        }}>
                            <div style={{ fontWeight: 500 }}>Invoice Currency:</div>
                            <div>{renderFieldInput('Invoice Currency', formData['Invoice Currency'])}</div>
                        </div>

                        {/* Total Invoice Amount */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '350px 1fr',
                            gap: '16px',
                            alignItems: 'center'
                        }}>
                            <div style={{ fontWeight: 500 }}>Total Invoice Amount:</div>
                            <div>{renderFieldInput('Total Invoice Amount', formData['Total Invoice Amount'])}</div>
                        </div>

                        {/* Total Amount Payable */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '350px 1fr',
                            gap: '16px',
                            alignItems: 'center'
                        }}>
                            <div style={{ fontWeight: 500 }}>Total Amount Payable:</div>
                            <div>{renderFieldInput('Total Amount Payable', formData['Total Amount Payable'])}</div>
                        </div>

                        {/* Memo */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '350px 1fr',
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
                    </div>
                </Panel>

                {/* 2. Vendor Master Details */}
                {renderVendorMasterDetailsPanel()}

                {/* 3. Line Items */}
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
                        dataSource={(() => {
                            const data = [];
                            lineItems.forEach((item, index) => {
                                data.push({ ...item, key: `item_${index}` });
                            });

                            // --- Single Aggregated GST Row for Quick View ---
                            const formTaxValue = parseCurrencyValue(extractValue(formData['Total Tax Amount']));

                            const totalTaxAmount = lineItems.reduce((sum, item) => {
                                const t = parseCurrencyValue(
                                    extractValue(item.TaxAmount) ||
                                    extractValue(item.tax_amount) ||
                                    item.TaxAmount ||
                                    item.tax_amount
                                );
                                return sum + t;
                            }, 0) +
                                parseCurrencyValue(extractValue(formData['CGST'])) +
                                parseCurrencyValue(extractValue(formData['SGST'])) +
                                parseCurrencyValue(extractValue(formData['IGST']));

                            const finalTaxToDisplay = formTaxValue || totalTaxAmount;

                            data.push({
                                key: 'gst_total',
                                Description: { value: 'Total GST' },
                                Quantity: { value: 1 },
                                UnitPrice: { value: finalTaxToDisplay },
                                NetAmount: { value: finalTaxToDisplay },
                                TaxAmount: { value: 0 },
                                Discount: { value: 0 },
                                isSystemRow: true
                            });

                            // Dynamic TDS Row for Quick View Display
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
                                'TDS Applicability',
                                'TDS Applicable',
                                'Withholding Tax Applicable'
                            ]);

                            if (tdsApplicabilityVal?.toString().toLowerCase().trim() === 'yes') {
                                const tdsRateVal = findTDSValue([
                                    'TDS Percentage',
                                    'Percentage',
                                    'Rate',
                                    'TDS Rate',
                                    'Withholding Rate'
                                ]) || '0';
                                let tdsRate = parseFloat(tdsRateVal.toString().replace('%', '')) || 0;
                                if (tdsRate > 1) tdsRate = tdsRate / 100;

                                const subtotal = lineItems.reduce((sum, item) => {
                                    const net = parseCurrencyValue(
                                        extractValue(item.NetAmount) ||
                                        extractValue(item.amount) ||
                                        extractValue(item.net_amount) ||
                                        item.amount ||
                                        item.net_amount
                                    );
                                    return sum + net;
                                }, 0);

                                const tdsAmount = parseFloat((subtotal * tdsRate).toFixed(2));

                                if (tdsAmount > 0) {
                                    data.push({
                                        key: 'TDS_PREVIEW',
                                        Description: { value: `TDS Deduction` },
                                        Quantity: { value: 1 },
                                        UnitPrice: { value: -tdsAmount },
                                        NetAmount: { value: -tdsAmount },
                                        TaxAmount: { value: 0 },
                                        Discount: { value: 0 },
                                        isSystemRow: true
                                    });
                                }
                            }
                            return data;
                        })()}
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

                    <div style={{
                        marginTop: '20px',
                        padding: '16px',
                        background: '#f0f2f5',
                        borderRadius: '6px',
                        display: 'flex',
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                        borderTop: '1px solid #d9d9d9'
                    }}>
                        <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: '14px', color: '#595959', marginRight: '12px' }}>Total Amount Payable:</span>
                            <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#1890ff' }}>
                                {getCurrencySymbol()} {parseCurrencyValue(extractValue(formData['Total Amount Payable'])).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>
                </Panel>
                {/* Taxes Section (if needed below, fitting user request order) */}
                {renderFieldGroup('Taxes', [
                    'CGST',
                    'SGST',
                    'IGST',
                ])}
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
                    // console.log("originalData 👉", originalData);
                    // console.log("gl_summary 👉", originalData?.gl_summary);


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

            <div style={{
                marginTop: '20px',
                padding: '16px',
                background: 'white',
                borderRadius: '6px',
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                borderTop: '1px solid #d9d9d9'
            }}>
                <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '14px', color: '#595959', marginRight: '12px' }}>Total Amount Payable:</span>
                    <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#1890ff' }}>
                        {getCurrencySymbol()} {parseCurrencyValue(extractValue(formData['Total Amount Payable'])).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                </div>
            </div>
        </div>
    );



    const allFieldsTab = (
        <div style={{ padding: '10px 20px' }}>
            <Collapse defaultActiveKey={['Invoice Header', 'vendor_details', 'Line Items']}>
                {/* 1. Invoice Header (Reordered to Top) */}
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

                {/* 2. Vendor Master Details (New Selection) */}
                {renderVendorMasterDetailsPanel()}

                {/* 3. Line Items */}
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
                        dataSource={(() => {
                            const data = [];
                            lineItems.forEach((item, index) => {
                                data.push({ ...item, key: `item_${index}` });
                            });
                            // --- Single Aggregated GST Row for Quick View ---
                            const formTaxValue = parseCurrencyValue(extractValue(formData['Total Tax Amount']));

                            const totalTaxAmount = lineItems.reduce((sum, item) => {
                                const t = parseCurrencyValue(
                                    extractValue(item.TaxAmount) ||
                                    extractValue(item.tax_amount) ||
                                    item.TaxAmount ||
                                    item.tax_amount
                                );
                                return sum + t;
                            }, 0) +
                                parseCurrencyValue(extractValue(formData['CGST'])) +
                                parseCurrencyValue(extractValue(formData['SGST'])) +
                                parseCurrencyValue(extractValue(formData['IGST']));

                            const finalTaxToDisplay = formTaxValue || totalTaxAmount;

                            data.push({
                                key: 'gst_total',
                                Description: { value: 'Total GST' },
                                Quantity: { value: 1 },
                                UnitPrice: { value: finalTaxToDisplay },
                                NetAmount: { value: finalTaxToDisplay },
                                TaxAmount: { value: 0 },
                                Discount: { value: 0 },
                                isSystemRow: true
                            });

                            // Dynamic TDS Row for Quick View Display
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
                                'TDS Applicability',
                                'TDS Applicable',
                                'Withholding Tax Applicable'
                            ]);

                            if (tdsApplicabilityVal?.toString().toLowerCase().trim() === 'yes') {
                                const tdsRateVal = findTDSValue([
                                    'TDS Percentage',
                                    'Percentage',
                                    'Rate',
                                    'TDS Rate',
                                    'Withholding Rate'
                                ]) || '0';
                                let tdsRate = parseFloat(tdsRateVal.toString().replace('%', '')) || 0;
                                if (tdsRate > 1) tdsRate = tdsRate / 100;

                                const subtotal = lineItems.reduce((sum, item) => {
                                    const net = parseCurrencyValue(
                                        extractValue(item.NetAmount) ||
                                        extractValue(item.amount) ||
                                        extractValue(item.net_amount) ||
                                        item.amount ||
                                        item.net_amount
                                    );
                                    return sum + net;
                                }, 0);

                                const tdsAmount = parseFloat((subtotal * tdsRate).toFixed(2));

                                if (tdsAmount > 0) {
                                    data.push({
                                        key: 'TDS_PREVIEW',
                                        Description: { value: `TDS Deduction` },
                                        Quantity: { value: 1 },
                                        UnitPrice: { value: -tdsAmount },
                                        NetAmount: { value: -tdsAmount },
                                        TaxAmount: { value: 0 },
                                        Discount: { value: 0 },
                                        isSystemRow: true
                                    });
                                }
                            }
                            return data;
                        })()}
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

                {/* 4. Extracted Vendor & Buyer Info (Moved down/Optional) */}
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

                {renderFieldGroup('Taxes', [
                    'Total Tax Amount',
                    'Tax Type Breakdown (VAT/GST/PST/IGST etc.)',
                    'CGST',
                    'SGST',
                    'IGST',
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
            <Collapse defaultActiveKey={['vendor_details', 'header', 'lineitems']}>
                {renderVendorMasterDetailsPanel()}
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
                                        onChange={(value) =>
                                            handleCodingLineItemChange(index, 'unit_price', value)
                                        }
                                        style={{ width: '100%', ...disabledStyle }}
                                        min={0}
                                        precision={2}
                                        prefix="$"
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
                                        onChange={(value) =>
                                            handleCodingLineItemChange(index, 'net_amount', value)
                                        }
                                        style={{ width: '100%', ...disabledStyle }}
                                        min={0}
                                        precision={2}
                                        prefix="$"
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
                    previewVendorId={extractValue(formData['Vendor ID'])}
                    previewVendorName={extractValue(formData['Vendor Name'])}
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

    const currentExpectedApprover = assignedApprovers[cycleApprovalsCount]?.toLowerCase();
    const myEmail = currentUser?.email?.toLowerCase();

    // Check if current user is an active delegate for the expected approver
    const isActiveDelegateForCurrentTurn = currentExpectedApprover &&
        workflowData?.delegations?.[currentExpectedApprover]?.some(
            delegateEmail => delegateEmail.toLowerCase() === myEmail
        );

    const isMyTurn = !isSequential || (currentExpectedApprover === myEmail) || isActiveDelegateForCurrentTurn;

    // Disable buttons ONLY based on status_history, NOT main status:
    // 1. Current user has already acted (EXCEPT if they are acting as a delegate for a new level), OR
    // 2. Someone has rejected/reworked (stops the process)
    // 3. User is restricted (Performed Processed or Coding)
    // 4. Sequential check: Only assigned approver at current level can act

    // Relax currentUserHasActed if it's my turn (primary or delegate)
    const effectiveAlreadyActed = currentUserHasActed && !isMyTurn;

    const approveDisabled = effectiveAlreadyActed || isRestrictedUser || !isMyTurn;
    const rejectDisabled = effectiveAlreadyActed || isRestrictedUser || !isMyTurn;
    const reworkDisabled = effectiveAlreadyActed || isRestrictedUser || !isMyTurn;


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
                            disabled={disableInputs || isDuplicateError}
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
