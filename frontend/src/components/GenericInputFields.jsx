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
    SendOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { invoiceService, codingService } from '../services/api';
import { authService } from '../services/auth';

const { Panel } = Collapse;
const { TextArea } = Input;

const GenericInputFields = ({
    data,
    schema,
    setHoveredKey,
    invoiceId,
    originalData,
    readOnly = false
}) => {
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

    // Status & validation info
    const [invoiceStatus, setInvoiceStatus] = useState(
        originalData?.status || 'waiting_approval'
    );
    const [validationInfo, setValidationInfo] = useState(
        originalData?.validation_results || {}
    );

    // Coding tab
    const [headerCoding, setHeaderCoding] = useState('');
    const [codingLineItems, setCodingLineItems] = useState([]);

    // Approver comment
    const [approverComment, setApproverComment] = useState('');

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

    const disabledStyle = readOnly
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

        setFormData({
            ...extractionData,
            LineItems: items
        });
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
    }, [data, extractionData, originalData]);

    // ---------- load saved coding ----------
    useEffect(() => {
        const loadCodingData = async () => {
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

        loadCodingData();
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

            const tokenUser = authService.getCurrentUser?.();
            const approverName =
                tokenUser?.username || tokenUser?.email || 'Unknown User';

            const updatedValidation = {
                ...(validationInfo || {}),
                approver_name: approverName,
                approval_timestamp: new Date().toISOString(),
                last_action: newStatus,
                approver_comment: approverComment || '' // Include the comment
            };

            await invoiceService.updateInvoice(invoiceId, {
                status: newStatus,
                validation_results: updatedValidation
            });

            setInvoiceStatus(newStatus);
            setValidationInfo(updatedValidation);
            setApproverComment(''); // Clear comment after submission
            message.success(`Invoice ${newStatus} successfully!`);
        } catch (error) {
            console.error('Error updating status:', error);
            message.error(
                error.response?.data?.detail ||
                'Failed to update invoice status. Please try again.'
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
    const handleSaveCoding = async () => {
        if (!invoiceId) {
            message.error('No invoice ID provided');
            return;
        }

        try {
            setSaving(true);

            await codingService.saveCoding(invoiceId, {
                header_coding: headerCoding,
                line_items: codingLineItems
            });

            message.success('Coding data saved successfully!');
            message.success("Invoice sent for approval");

            // Redirect to Approvals Page
            navigate("/approvals");
        } catch (error) {
            console.error('Error saving coding data:', error);
            message.error(
                error.response?.data?.detail ||
                'Failed to save coding data. Please try again.'
            );
        } finally {
            setSaving(false);
        }
    };

    const handleSave = async () => {
        if (!invoiceId) {
            message.error('No invoice ID provided');
            return;
        }

        if (activeTab === '3') {
            await handleSaveCoding();
        }
        await saveInvoiceData();
    };

    const handleSendForCoding = async () => {
        if (!invoiceId) {
            message.error('No invoice ID provided');
            return;
        }

        try {
            setSaving(true);
            // First save the data
            await saveInvoiceData();

            // Then update status
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
            field.includes('Total') ||
            field.includes('Tax')
        ) {
            const cleanValue = stringValue?.toString().replace(/[^\d.-]/g, '');
            const numValue = parseFloat(cleanValue);

            return (
                <InputNumber
                    style={{ width: '100%', ...disabledStyle }}
                    value={isNaN(numValue) ? null : numValue}
                    onChange={(val) => handleInputChange(field, val)}
                    step={0.01}
                    formatter={(value) =>
                        value !== null && value !== undefined && value !== ''
                            ? `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                            : ''
                    }
                    parser={(value) => value.replace(/\$\s?|(,*)/g, '')}
                    disabled={readOnly}
                />
            );
        }

        if (field.includes('Date') || field.includes('period')) {
            return (
                <DatePicker
                    style={{ width: '100%', ...disabledStyle }}
                    value={stringValue ? dayjs(stringValue) : null}
                    onChange={(date, dateString) => handleInputChange(field, dateString)}
                    format="YYYY-MM-DD"
                    disabled={readOnly}
                />
            );
        }

        if (field.includes('Currency')) {
            return (
                <Select
                    style={{ width: '100%', ...disabledStyle }}
                    value={stringValue}
                    onChange={(val) => handleInputChange(field, val)}
                    options={[
                        { value: 'USD', label: '$ USD' },
                        { value: 'INR', label: '₹ INR' },
                        { value: 'EUR', label: '€ EUR' }
                    ]}
                    disabled={readOnly}
                />
            );
        }

        if (field.includes('Notes') || field.includes('Terms')) {
            return (
                <TextArea
                    rows={3}
                    value={stringValue}
                    onChange={(e) => handleInputChange(field, e.target.value)}
                    disabled={readOnly}
                    style={disabledStyle}
                />
            );
        }

        if (field.includes('Approval Required')) {
            return (
                <Checkbox
                    checked={stringValue === 'true' || stringValue === true}
                    onChange={(e) => handleInputChange(field, e.target.checked)}
                    disabled={readOnly}
                >
                    {field}
                </Checkbox>
            );
        }

        return (
            <Input
                value={stringValue}
                onChange={(e) => handleInputChange(field, e.target.value)}
                disabled={readOnly}
                style={disabledStyle}
            />
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
                <Input.TextArea
                    rows={2}
                    value={extractValue(val)}
                    onChange={(e) =>
                        handleLineItemChange(index, 'Description', e.target.value)
                    }
                    disabled={readOnly}
                    style={disabledStyle}
                />
            )
        },
        {
            title: 'Item Code',
            dataIndex: 'ItemCode',
            key: 'ItemCode',
            width: 120,
            render: (val, record, index) => (
                <Input
                    value={extractValue(val)}
                    onChange={(e) =>
                        handleLineItemChange(index, 'ItemCode', e.target.value)
                    }
                    disabled={readOnly}
                    style={disabledStyle}
                />
            )
        },
        {
            title: 'Qty',
            dataIndex: 'Quantity',
            key: 'Quantity',
            width: 80,
            render: (val, record, index) => (
                <InputNumber
                    style={{ width: '100%', ...disabledStyle }}
                    value={extractValue(val)}
                    onChange={(value) =>
                        handleLineItemChange(index, 'Quantity', value)
                    }
                    disabled={readOnly}
                />
            )
        },
        {
            title: 'Unit',
            dataIndex: 'UnitOfMeasure',
            key: 'UnitOfMeasure',
            width: 80,
            render: (val, record, index) => (
                <Input
                    value={extractValue(val)}
                    onChange={(e) =>
                        handleLineItemChange(index, 'UnitOfMeasure', e.target.value)
                    }
                    disabled={readOnly}
                    style={disabledStyle}
                />
            )
        },
        {
            title: 'Unit Price',
            dataIndex: 'UnitPrice',
            key: 'UnitPrice',
            width: 120,
            render: (val, record, index) => (
                <InputNumber
                    style={{ width: '100%', ...disabledStyle }}
                    value={extractValue(val)}
                    onChange={(value) =>
                        handleLineItemChange(index, 'UnitPrice', value)
                    }
                    step={0.01}
                    formatter={(value) =>
                        value ? `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''
                    }
                    parser={(value) => value.replace(/\$\s?|(,*)/g, '')}
                    disabled={readOnly}
                />
            )
        },
        {
            title: 'Discount',
            dataIndex: 'Discount',
            key: 'Discount',
            width: 120,
            render: (val, record, index) => (
                <InputNumber
                    style={{ width: '100%', ...disabledStyle }}
                    value={extractValue(val)}
                    onChange={(value) =>
                        handleLineItemChange(index, 'Discount', value)
                    }
                    step={0.01}
                    formatter={(value) =>
                        value ? `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''
                    }
                    parser={(value) => value.replace(/\$\s?|(,*)/g, '')}
                    disabled={readOnly}
                />
            )
        },
        {
            title: 'Net Amount',
            dataIndex: 'NetAmount',
            key: 'NetAmount',
            width: 120,
            render: (val, record, index) => (
                <InputNumber
                    style={{ width: '100%', ...disabledStyle }}
                    value={extractValue(val)}
                    onChange={(value) =>
                        handleLineItemChange(index, 'NetAmount', value)
                    }
                    step={0.01}
                    formatter={(value) =>
                        value ? `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''
                    }
                    parser={(value) => value.replace(/\$\s?|(,*)/g, '')}
                    disabled={readOnly}
                />
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
                    disabled={readOnly}
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
                        {[
                            ['Vendor Name', 'Vendor Name'],
                            ['Invoice Number', 'Invoice Number'],
                            ['Invoice Date', 'Invoice Date'],
                            ['Due Date', 'Due Date'],
                            ['Amount Due', 'Amount Due'],
                            ['Payment Terms', 'Payment Terms']
                        ].map(([label, key]) => (
                            <div
                                key={key}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '200px 1fr',
                                    gap: '16px',
                                    alignItems: 'center'
                                }}
                            >
                                <div style={{ fontWeight: 500 }}>{label}:</div>
                                <div>{renderFieldInput(key, formData[key])}</div>
                            </div>
                        ))}

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
                                <Select
                                    style={{ width: '100%' }}
                                    defaultValue="USD"
                                    options={[
                                        { value: 'USD', label: '$ USD' },
                                        { value: 'INR', label: '₹ INR' }
                                    ]}

                                />
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
                    </div>
                </Panel>

                <Panel header="Line Items" key="lineitems">
                    <Table
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
                            style={{ marginTop: '16px', width: '100%' }}
                        >
                            Add Line Item
                        </Button>
                    )}
                </Panel>
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

                <Panel header="Line Items" key="Line Items">
                    <Table
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

                {renderFieldGroup('Approval Workflow', [
                    'Approval Workflow ID',
                    'Approval Required',
                    'Approver List / Roles:',
                    'Approval Status:',
                    'Approval Timestamps'
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
                                width: '15%'
                            },
                            {
                                title: 'Due Date',
                                dataIndex: 'dueDate',
                                key: 'dueDate',
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
                                        disabled={readOnly}
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
                                headerCoding: ''
                            }
                        ]}
                        pagination={false}
                        size="small"
                    />
                </Panel>

                <Panel header="Line Items" key="lineitems">
                    <Table
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
                                        disabled={readOnly}
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
                                        disabled={readOnly}
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
                                        disabled={readOnly}
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
                                                ? `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                                                : ''
                                        }
                                        parser={(value) => value.replace(/\$\s?|(,*)/g, '')}
                                        onChange={(value) =>
                                            handleCodingLineItemChange(index, 'unit_price', value)
                                        }
                                        style={{ width: '100%', ...disabledStyle }}
                                        min={0}
                                        precision={2}
                                        disabled={readOnly}
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
                                                ? `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                                                : ''
                                        }
                                        parser={(value) => value.replace(/\$\s?|(,*)/g, '')}
                                        onChange={(value) =>
                                            handleCodingLineItemChange(index, 'net_amount', value)
                                        }
                                        style={{ width: '100%', ...disabledStyle }}
                                        min={0}
                                        precision={2}
                                        disabled={readOnly}
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
                                        disabled={readOnly}
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
                                        disabled={readOnly}
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
                                        disabled={readOnly}
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
                                        disabled={readOnly}
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
                                        disabled={readOnly}
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
                                        disabled={readOnly}
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
            default:
                return quickViewTab;
        }
    };

    // ---------- status helpers for buttons ----------
    const isApproved = invoiceStatus === 'approved';
    const isRejected = invoiceStatus === 'rejected';
    const isWaitingApproval = invoiceStatus === 'waiting_approval';

    const approveDisabled = !isWaitingApproval;
    const rejectDisabled = !isWaitingApproval;
    const reworkDisabled = isApproved || isRejected;

    const renderStatusTag = () => {
        let color = 'default';
        let label = invoiceStatus;

        switch (invoiceStatus) {
            case 'waiting_approval':
                color = 'warning';
                label = 'Waiting Approval';
                break;
            case 'approved':
                color = 'success';
                label = 'Approved';
                break;
            case 'rejected':
                color = 'error';
                label = 'Rejected';
                break;
            case 'reworked':
                color = 'processing';
                label = 'Reworked';
                break;
            case 'processed':
                color = 'success';
                label = 'Processed';
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
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 20px'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
                    <Tabs
                        activeKey={activeTab}
                        onChange={setActiveTab}
                        style={{ margin: 0, flex: 1 }}
                        items={[
                            { key: '1', label: 'Quick View' },
                            { key: '2', label: 'All Fields' },
                            ...(readOnly ? [{ key: '3', label: 'Coding' }] : [])
                        ]}
                    />
                    <div>
                        {(invoiceStatus === "approved" || invoiceStatus === "rejected") && (
                            <>
                                {renderStatusTag()}
                                {validationInfo?.approver_name &&
                                    validationInfo?.approval_timestamp && (
                                        <div style={{ fontSize: 12, color: '#999' }}>
                                            {(validationInfo.last_action || 'Action').toUpperCase()} by{' '}
                                            <strong>{validationInfo.approver_name}</strong>{' '}
                                            at{' '}
                                            {new Date(
                                                validationInfo.approval_timestamp
                                            ).toLocaleString()}
                                        </div>
                                    )}
                            </>
                        )}
                    </div>

                </div>

                {!readOnly && (
                    <div style={{ display: 'flex', gap: '10px', marginLeft: '24px' }}>
                        <Button
                            type="primary"
                            icon={<SaveOutlined />}
                            onClick={handleSave}
                            loading={saving}
                            size="default"
                        >
                            Save
                        </Button>
                        <Button
                            type="primary"
                            icon={<SendOutlined />}
                            onClick={handleSendForCoding}
                            loading={saving}
                            size="default"
                        >
                            Send for Coding
                        </Button>
                    </div>
                )}


                {readOnly && (
                    <Space direction="vertical" style={{ marginLeft: '24px', width: '400px' }}>
                        {isWaitingApproval && (
                            <div style={{ marginBottom: '12px' }}>
                                <div style={{ marginBottom: '8px', fontWeight: 500 }}>
                                    Approver Comment (Optional):
                                </div>
                                <TextArea
                                    rows={3}
                                    placeholder="Add a comment about this approval decision..."
                                    value={approverComment}
                                    onChange={(e) => setApproverComment(e.target.value)}
                                    maxLength={500}
                                    showCount
                                />
                            </div>
                        )}
                        <Space>
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
                    </Space>
                )}

            </div>

            <div style={{ flex: 1, overflow: 'auto' }}>{renderTabContent()}</div>
        </div>
    );
};

export default GenericInputFields;
