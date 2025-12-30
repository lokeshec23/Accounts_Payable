import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Table, Input, InputNumber, Select, message, Collapse, Spin, Checkbox, Tabs } from 'antd';
const { Panel } = Collapse;
import { ArrowLeftOutlined, SendOutlined, DeleteOutlined, SaveOutlined, RollbackOutlined } from '@ant-design/icons';
import PdfViewerWithHighlight from '../components/PdfViewerWithHighlight';
import WorkflowTab from '../components/WorkflowTab';
import { invoiceService, codingService, masterDataService, approvalService, workflowService, currencyService } from '../services/api';

const CodingReviewPage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const invoiceData = location.state?.invoice;
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
        const raw =
            invoiceData?.currency ||
            invoiceData?.rawData?.extracted_data?.invoice_details?.currency?.value ||
            'USD';

        // Normalize value safely
        const val = typeof raw === 'string'
            ? raw
            : typeof raw === 'object' && raw !== null
                ? raw.value || raw.code || ''
                : '';

        const normalized = val.toString().trim().toUpperCase();

        const match = currencies.find(c =>
            c.code?.toUpperCase() === normalized ||
            c.name?.toUpperCase() === normalized
        );

        if (match) return match.symbol;

        // Fallbacks
        if (normalized.includes('INR') || normalized.includes('RUPEE')) return '₹';
        if (normalized.includes('EUR')) return '€';
        if (normalized.includes('GBP') || normalized.includes('POUND')) return '£';

        return '$';
    };


    const disabledStyle = {
        color: 'black',
        backgroundColor: 'white',
        opacity: 1
    };

    useEffect(() => {
        if (!invoiceData) return;

        const val =
            invoiceData?.currency ||
            invoiceData?.rawData?.extracted_data?.invoice_details?.currency?.value ||
            'USD';

        // Try to match symbol from loaded currencies
        const match = currencies.find(
            c =>
                c.code?.toUpperCase() === val?.toUpperCase() ||
                c.name?.toLowerCase() === val?.toLowerCase()
        );

        if (match) {
            setCurrencySymbol(match.symbol);
        } else {
            // IMMEDIATE Fallbacks if currencies aren't loaded yet
            const search = val.toLowerCase();
            if (search.includes('inr') || search.includes('rupee')) {
                setCurrencySymbol('₹');
            } else if (search.includes('eur')) {
                setCurrencySymbol('€');
            } else if (search.includes('gbp') || search.includes('pound')) {
                setCurrencySymbol('£');
            } else {
                setCurrencySymbol('$');
            }
        }
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

                // Only this file should be used
                const targetFile = files.find(
                    f => f.file_name?.trim() === "AP_CA Inc_Invoice_Codification"
                );

                if (!targetFile) {
                    message.error("Master file 'AP_CA Inc_Invoice_Codification' not found");
                    return;
                }

                const sheets = await masterDataService.getSheets(targetFile._id);

                // Helper to fetch & format
                const loadSheet = async (sheetName, formatter) => {
                    const sheet = sheets.find(s => s.sheet_name === sheetName);
                    if (!sheet) return [];
                    const rows = await masterDataService.getSheetData(sheet.collection_name);

                    return rows.map((row, i) => ({
                        value: formatter(row),
                        label: formatter(row),
                        key: i
                    }));
                };

                const [
                    gl,
                    lob,
                    dept,
                    cust,
                    item,
                    currData
                ] = await Promise.all([
                    loadSheet("GL", row => {
                        const acc = row["Account number"] || row["account_number"] || row["Code"];
                        const title = row["Title"] || row["Name"] || row["Description"];
                        return `${acc} - ${title}`;
                    }),
                    loadSheet("LOB", row => {
                        const id = row["LOB ID"];
                        const name = row["Name"];
                        return `${id} - ${name}`;
                    }),
                    loadSheet("Department", row => {
                        const id = row["Department ID"] || row["ID"];
                        const name = row["Department name"] || row["Department Name"] || row["Name"];
                        return `${id} - ${name}`;
                    }),
                    loadSheet("Customer_Master", row => {
                        const id = row["CUSTOMER_ID"] || row["Customer ID"];
                        const name = row["CUSTOMER_NAME"] || row["Customer Name"];
                        return `${id} - ${name}`;
                    }),
                    loadSheet("Item", row => {
                        const id = row["Item ID"];
                        const name = row["Name"];
                        return `${id} - ${name}`;
                    }),
                    currencyService.getCurrencies()
                ]);

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
    // ⭐⭐⭐ END UPDATED BLOCK ⭐⭐⭐

    // Extract line items
    useEffect(() => {
        if (invoiceData?.rawData?.extracted_data?.Items?.value) {
            const items = invoiceData.rawData.extracted_data.Items.value.map((item, index) => ({
                key: index,
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
                        setCodingLineItems(prev =>
                            prev.map((item, index) => ({
                                ...item,
                                ...response.line_items[index]
                            }))
                        );
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
                item: String(item.item || '')
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
                item: String(item.item || '')
            }));

            // Save coding first - this ensures "Send for Approval" triggers a save
            await codingService.saveCoding({
                invoice_id: invoiceData.id,
                header_coding: headerCoding,
                line_items: cleanedLineItems,
                vendor_name: invoiceData?.vendorName || ''
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
            console.log('Recall invoked for invoice:', invoiceData);
            setSaving(true);
            if (!invoiceData?.id) {
                throw new Error('Invoice ID missing');
            }
            // Backend now handles clearing validation_results automatically
            console.log('Updating status to waiting_coding...');
            const response = await invoiceService.updateInvoiceStatus(invoiceData.id, 'waiting_coding', 'Recalled by user');
            console.log('Recall response:', response);
            message.success('Invoice recalled successfully!');
            navigate('/coding');
        } catch (error) {
            console.error('Error recalling invoice:', error);
            message.error('Failed to recall invoice');
        } finally {
            setSaving(false);
        }
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
            title: 'Vendor Name',
            dataIndex: 'vendor_name',
            key: 'vendor_name',
            width: '18%',
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
            width: '18%',
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
            width: '18%',
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
            width: '18%',
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
            title: 'Due Date',
            dataIndex: 'due_date',
            key: 'due_date',
            width: '18%',
            render: (text) => (
                <div
                    onMouseEnter={() => setHoveredKey('due_date')}
                    onMouseLeave={() => setHoveredKey(null)}
                    style={{ width: '100%' }}
                >
                    <Input value={text} disabled style={disabledStyle} />
                </div>
            )
        },
        {
            title: 'Header Coding',
            dataIndex: 'header_coding',
            key: 'header_coding',
            width: '18%',
            render: () => (
                <Input
                    value={headerCoding}
                    onChange={(e) => handleHeaderCodingChange(e.target.value)}
                    placeholder="Enter header coding"
                    rows={1}
                    autoSize={{ minRows: 1, maxRows: 4 }}
                    style={{ ...disabledStyle, width: '100%' }}
                    disabled={isApproved || isRejected || userRole === 'approver' || disableEditing}
                />

            )
        }
    ];

    const headerDataSource = [
        {
            key: '1',
            vendor_name: invoiceData?.vendorName || '',
            invoice_id: invoiceData?.invoiceId || '',
            total_amount: invoiceData?.rawData?.extracted_data?.amounts?.total_invoice_amount?.value || '',
            amount_due: invoiceData?.rawData?.extracted_data?.amounts?.amount_due?.value || '',
            due_date: invoiceData?.rawData?.extracted_data?.invoice_details?.due_date?.value || '',
            header_coding: headerCoding
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
                    <Input value={text} disabled placeholder="Description" style={disabledStyle} />
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
                        readOnly
                        controls={false}
                        className="readonly-input-number"
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
                        formatter={(value) =>
                            value
                                ? `${getCurrencySymbol()} ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                                : ''
                        }
                        readOnly
                        controls={false}
                        className="readonly-input-number"
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
                        formatter={(value) =>
                            value
                                ? `${getCurrencySymbol()} ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                                : ''
                        }
                        readOnly
                        controls={false}
                        className="readonly-input-number"
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
                                key: 'coding',
                                label: 'Coding Fields',
                                children: (
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

                                        <Panel header="Line Items" key="lineitems">
                                            <Table
                                                columns={lineItemColumns}
                                                dataSource={codingLineItems.map((item, index) => ({ ...item, key: index }))}
                                                pagination={false}
                                                scroll={{ x: 'max-content' }}
                                                size="small"
                                            />
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
                                            const headerTotalAmountRaw = invoiceData?.rawData?.extracted_data?.amounts?.total_invoice_amount?.value;
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
                                                            {getCurrencySymbol()} {parseFloat(item.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                                                                {getCurrencySymbol()} {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </span>
                                                        </div>
                                                    ));
                                                }
                                            }

                                            return (
                                                <>
                                                    <div style={{
                                                        padding: '15px 20px',
                                                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                                        borderRadius: '8px',
                                                        marginBottom: '20px',
                                                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center'
                                                    }}>
                                                        <span style={{ fontSize: '18px', fontWeight: '700', color: 'white' }}>Total Amount:</span>
                                                        <span style={{ fontSize: '24px', fontWeight: 'bold', color: 'white' }}>
                                                            {getCurrencySymbol()} {headerTotalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                            }
                        ]}
                    />
                </div>
            </div>
        </div>
    );
};

export default CodingReviewPage;


