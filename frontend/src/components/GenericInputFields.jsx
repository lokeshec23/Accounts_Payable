import React, { useEffect, useState } from 'react';
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
    message
} from 'antd';
import { PlusOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { invoiceService } from '../services/api';

const { Panel } = Collapse;
const { TextArea } = Input;

const GenericInputFields = ({ data, schema, setHoveredKey, invoiceId, originalData }) => {
    const extractionData = data?.extraction_json || {};
    const lineItemsFromData = data?.items || data?.LineItems || [];

    const [formData, setFormData] = useState({
        ...extractionData,
        LineItems: lineItemsFromData
    });

    const [lineItems, setLineItems] = useState(lineItemsFromData);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setFormData({
            ...extractionData,
            LineItems: data?.items || data?.LineItems || []
        });
        setLineItems(data?.items || data?.LineItems || []);
    }, [data]);

    const handleInputChange = (field, value) => {
        const oldValue = formData[field];
        const newValue =
            typeof oldValue === "object" && oldValue !== null && "value" in oldValue
                ? { ...oldValue, value }
                : value;

        setFormData((prev) => ({
            ...prev,
            [field]: newValue,
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
        const updatedItems = lineItems.filter((_, i) => i !== index);
        setLineItems(updatedItems);
    };

    // const handleSave = async () => {
    //     setSaving(true);
    //     try {
    //         console.log('Saving data:', { ...formData, LineItems: lineItems });
    //         await new Promise(resolve => setTimeout(resolve, 1000));
    //         alert('Data saved successfully!');
    //     } catch (error) {
    //         console.error('Error saving data:', error);
    //         alert('Failed to save data');
    //     } finally {
    //         setSaving(false);
    //     }
    // };

    const extractValue = (fieldValue) => {
        if (fieldValue === null || fieldValue === undefined) return '';
        if (typeof fieldValue === 'object' && fieldValue !== null && 'value' in fieldValue) {
            return fieldValue.value === null || fieldValue.value === undefined ? '' : fieldValue.value;
        }
        return fieldValue;
    };

    const handleSave = async () => {
        if (!invoiceId) {
            message.error('No invoice ID provided');
            return;
        }

        try {
            setSaving(true);

            // Deep copy original extracted_data to preserve structure
            const updatedExtractedData = JSON.parse(JSON.stringify(originalData?.extracted_data || {}));

            // Helper to safely update nested values
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

            // Map formData to backend structure
            // Vendor Info
            if (formData['Vendor Name'] !== undefined) safeUpdate(updatedExtractedData, 'vendor_info.name', extractValue(formData['Vendor Name']));
            if (formData['Vendor Address'] !== undefined) safeUpdate(updatedExtractedData, 'vendor_info.address', extractValue(formData['Vendor Address']));
            if (formData['Vendor Country'] !== undefined) safeUpdate(updatedExtractedData, 'vendor_info.country', extractValue(formData['Vendor Country']));
            if (formData['Vendor Tax ID (VAT/GST/TIN/W9, etc.)'] !== undefined) safeUpdate(updatedExtractedData, 'vendor_info.tax_id', extractValue(formData['Vendor Tax ID (VAT/GST/TIN/W9, etc.)']));
            if (formData['Vendor Contact Email'] !== undefined) safeUpdate(updatedExtractedData, 'vendor_info.contact_email', extractValue(formData['Vendor Contact Email']));
            if (formData['Vendor Phone'] !== undefined) safeUpdate(updatedExtractedData, 'vendor_info.phone', extractValue(formData['Vendor Phone']));
            if (formData['Vendor Bank Name'] !== undefined) safeUpdate(updatedExtractedData, 'vendor_info.bank_name', extractValue(formData['Vendor Bank Name']));
            if (formData['Vendor Bank Account Number'] !== undefined) safeUpdate(updatedExtractedData, 'vendor_info.bank_account_number', extractValue(formData['Vendor Bank Account Number']));
            if (formData['Vendor Bank Details (Account/IBAN/SWIFT/Routing No)'] !== undefined) safeUpdate(updatedExtractedData, 'vendor_info.bank_details', extractValue(formData['Vendor Bank Details (Account/IBAN/SWIFT/Routing No)']));
            if (formData['Vendor Contact Person'] !== undefined) safeUpdate(updatedExtractedData, 'vendor_info.contact_person', extractValue(formData['Vendor Contact Person']));
            if (formData['Vendor Website (if applicable)'] !== undefined) safeUpdate(updatedExtractedData, 'vendor_info.website', extractValue(formData['Vendor Website (if applicable)']));

            // Client Info
            if (formData['Client Name or Company Name'] !== undefined) safeUpdate(updatedExtractedData, 'client_info.name', extractValue(formData['Client Name or Company Name']));
            if (formData['Billing Address'] !== undefined) safeUpdate(updatedExtractedData, 'client_info.billing_address', extractValue(formData['Billing Address']));
            if (formData['Shipping Address (if different)'] !== undefined) safeUpdate(updatedExtractedData, 'client_info.shipping_address', extractValue(formData['Shipping Address (if different)']));
            if (formData['Phone Number'] !== undefined) safeUpdate(updatedExtractedData, 'client_info.phone', extractValue(formData['Phone Number']));
            if (formData['Email Address (if applicable)'] !== undefined) safeUpdate(updatedExtractedData, 'client_info.email', extractValue(formData['Email Address (if applicable)']));
            if (formData['Client Tax ID (if applicable)'] !== undefined) safeUpdate(updatedExtractedData, 'client_info.tax_id', extractValue(formData['Client Tax ID (if applicable)']));
            if (formData['Contact Person'] !== undefined) safeUpdate(updatedExtractedData, 'client_info.contact_person', extractValue(formData['Contact Person']));

            // Invoice Details
            if (formData['Invoice Number'] !== undefined) safeUpdate(updatedExtractedData, 'invoice_details.invoice_number', extractValue(formData['Invoice Number']));
            if (formData['Invoice Date'] !== undefined) safeUpdate(updatedExtractedData, 'invoice_details.invoice_date', extractValue(formData['Invoice Date']));
            if (formData['Due Date'] !== undefined) safeUpdate(updatedExtractedData, 'invoice_details.due_date', extractValue(formData['Due Date']));
            if (formData['Invoice Currency'] !== undefined) safeUpdate(updatedExtractedData, 'invoice_details.currency', extractValue(formData['Invoice Currency']));
            if (formData['Invoice Type'] !== undefined) safeUpdate(updatedExtractedData, 'invoice_details.type', extractValue(formData['Invoice Type']));
            if (formData['PO Number'] !== undefined) safeUpdate(updatedExtractedData, 'invoice_details.po_number', extractValue(formData['PO Number']));
            if (formData['Payment Terms'] !== undefined) safeUpdate(updatedExtractedData, 'invoice_details.payment_terms', extractValue(formData['Payment Terms']));
            if (formData['Payment Method'] !== undefined) safeUpdate(updatedExtractedData, 'invoice_details.payment_method', extractValue(formData['Payment Method']));
            if (formData['Cost Center / Project Code (if printed)'] !== undefined) safeUpdate(updatedExtractedData, 'invoice_details.cost_center', extractValue(formData['Cost Center / Project Code (if printed)']));

            // Service Period
            if (formData['Service period start'] !== undefined) safeUpdate(updatedExtractedData, 'service_period.start_date', extractValue(formData['Service period start']));
            if (formData['Service period end'] !== undefined) safeUpdate(updatedExtractedData, 'service_period.end_date', extractValue(formData['Service period end']));

            // Amounts
            if (formData['Subtotal'] !== undefined) safeUpdate(updatedExtractedData, 'amounts.subtotal', extractValue(formData['Subtotal']));
            if (formData['Shipping / Handling / Fees'] !== undefined) safeUpdate(updatedExtractedData, 'amounts.shipping_handling_fees', extractValue(formData['Shipping / Handling / Fees']));
            if (formData['Surcharges'] !== undefined) safeUpdate(updatedExtractedData, 'amounts.surcharges', extractValue(formData['Surcharges']));
            if (formData['Total Tax Amount'] !== undefined) safeUpdate(updatedExtractedData, 'amounts.total_tax_amount', extractValue(formData['Total Tax Amount']));
            if (formData['Tax Type Breakdown (VAT/GST/PST/IGST etc.)'] !== undefined) safeUpdate(updatedExtractedData, 'amounts.tax_type_breakdown', extractValue(formData['Tax Type Breakdown (VAT/GST/PST/IGST etc.)']));
            if (formData['Withholding Tax'] !== undefined) safeUpdate(updatedExtractedData, 'amounts.withholding_tax', extractValue(formData['Withholding Tax']));
            if (formData['Total Invoice Amount'] !== undefined) safeUpdate(updatedExtractedData, 'amounts.total_invoice_amount', extractValue(formData['Total Invoice Amount']));
            if (formData['Amount Paid'] !== undefined) safeUpdate(updatedExtractedData, 'amounts.amount_paid', extractValue(formData['Amount Paid']));
            if (formData['Amount Due'] !== undefined) safeUpdate(updatedExtractedData, 'amounts.amount_due', extractValue(formData['Amount Due']));

            // Additional Info
            if (formData['Notes / Terms'] !== undefined) safeUpdate(updatedExtractedData, 'additional_info.notes_terms', extractValue(formData['Notes / Terms']));
            if (formData['QR Code / IRN / ZATCA ID (region-specific)'] !== undefined) safeUpdate(updatedExtractedData, 'additional_info.qr_code_irn', extractValue(formData['QR Code / IRN / ZATCA ID (region-specific)']));
            if (formData['Company Registration Number'] !== undefined) safeUpdate(updatedExtractedData, 'additional_info.company_registration_number', extractValue(formData['Company Registration Number']));

            // Line Items
            if (lineItems && Array.isArray(lineItems)) {
                if (!updatedExtractedData.Items) {
                    updatedExtractedData.Items = { value: [] };
                }

                const originalItems = updatedExtractedData.Items.value || [];

                updatedExtractedData.Items.value = lineItems.map((item, index) => {
                    const originalItem = originalItems[index] || {};

                    return {
                        description: { ...(originalItem.description || {}), value: extractValue(item.Description) },
                        item_code: { ...(originalItem.item_code || {}), value: extractValue(item.ItemCode) },
                        quantity: { ...(originalItem.quantity || {}), value: extractValue(item.Quantity) },
                        unit_of_measure: { ...(originalItem.unit_of_measure || {}), value: extractValue(item.UnitOfMeasure) },
                        unit_price: { ...(originalItem.unit_price || {}), value: extractValue(item.UnitPrice) },
                        discount: { ...(originalItem.discount || {}), value: extractValue(item.Discount) },
                        amount: { ...(originalItem.amount || {}), value: extractValue(item.NetAmount) },
                        tax_rate: { ...(originalItem.tax_rate || {}), value: extractValue(item.TaxRate) },
                        tax_amount: { ...(originalItem.tax_amount || {}), value: extractValue(item.TaxAmount) },
                        gross_amount: { ...(originalItem.gross_amount || {}), value: extractValue(item.GrossAmount) }
                    };
                });
            }

            const updatedData = {
                extracted_data: updatedExtractedData
            };

            await invoiceService.updateInvoice(invoiceId, updatedData);
            message.success('Invoice updated successfully!');

        } catch (error) {
            console.error('Error saving invoice:', error);
            message.error(error.response?.data?.detail || 'Failed to save invoice. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const renderFieldInput = (field, value) => {
        const stringValue = extractValue(value);

        if (field.includes('Amount') || field.includes('Price') || field.includes('Total') || field.includes('Tax')) {
            const cleanValue = stringValue.toString().replace(/[^\d.-]/g, '');
            const numValue = parseFloat(cleanValue);

            return (
                <InputNumber
                    style={{ width: '100%' }}
                    value={isNaN(numValue) ? null : numValue}
                    onChange={(val) => handleInputChange(field, val)}
                    step={0.01}
                    formatter={value => (value !== null && value !== undefined && value !== '') ? `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
                    parser={value => value.replace(/\$\s?|(,*)/g, '')}
                />
            );
        } else if (field.includes('Date') || field.includes('period')) {
            return (
                <DatePicker
                    style={{ width: '100%' }}
                    value={stringValue ? dayjs(stringValue) : null}
                    onChange={(date, dateString) => handleInputChange(field, dateString)}
                    format="YYYY-MM-DD"
                />
            );
        } else if (field.includes('Notes') || field.includes('Terms')) {
            return (
                <TextArea
                    rows={3}
                    value={stringValue}
                    onChange={(e) => handleInputChange(field, e.target.value)}
                />
            );
        } else if (field.includes('Approval Required')) {
            return (
                <Checkbox
                    checked={stringValue === 'true' || stringValue === true}
                    onChange={(e) => handleInputChange(field, e.target.checked)}
                >
                    {field}
                </Checkbox>
            );
        } else {
            return (
                <Input
                    value={stringValue}
                    onChange={(e) => handleInputChange(field, e.target.value)}
                />
            );
        }
    };

    // Editable line items table columns
    const lineItemColumns = [
        {
            title: 'S.No',
            dataIndex: 'item_number',
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
                    onChange={(e) => handleLineItemChange(index, 'Description', e.target.value)}
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
                    onChange={(e) => handleLineItemChange(index, 'ItemCode', e.target.value)}
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
                    style={{ width: '100%' }}
                    value={extractValue(val)}
                    onChange={(value) => handleLineItemChange(index, 'Quantity', value)}
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
                    onChange={(e) => handleLineItemChange(index, 'UnitOfMeasure', e.target.value)}
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
                    style={{ width: '100%' }}
                    value={extractValue(val)}
                    onChange={(value) => handleLineItemChange(index, 'UnitPrice', value)}
                    step={0.01}
                    formatter={value => value ? `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
                    parser={value => value.replace(/\$\s?|(,*)/g, '')}
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
                    style={{ width: '100%' }}
                    value={extractValue(val)}
                    onChange={(value) => handleLineItemChange(index, 'Discount', value)}
                    step={0.01}
                    formatter={value => value ? `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
                    parser={value => value.replace(/\$\s?|(,*)/g, '')}
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
                    style={{ width: '100%' }}
                    value={extractValue(val)}
                    onChange={(value) => handleLineItemChange(index, 'NetAmount', value)}
                    step={0.01}
                    formatter={value => value ? `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
                    parser={value => value.replace(/\$\s?|(,*)/g, '')}
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
                >
                    Delete
                </Button>
            )
        }
    ];

    // Tab 1: Quick View
    const quickViewTab = (
        <div style={{ padding: '20px' }}>
            {/* <div style={{ marginBottom: '16px', textAlign: 'right' }}>
                <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    onClick={handleSave}
                    loading={saving}
                    size="large"
                >
                    Save Changes
                </Button>
            </div> */}
            <Collapse defaultActiveKey={['header', 'lineitems']}>
                <Panel header="Header" key="header">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '16px', alignItems: 'center' }}>
                            <div style={{ fontWeight: 500 }}>Vendor Name:</div>
                            <div>{renderFieldInput('Vendor Name', formData['Vendor Name'])}</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '16px', alignItems: 'center' }}>
                            <div style={{ fontWeight: 500 }}>Invoice Number:</div>
                            <div>{renderFieldInput('Invoice Number', formData['Invoice Number'])}</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '16px', alignItems: 'center' }}>
                            <div style={{ fontWeight: 500 }}>Invoice Date:</div>
                            <div>{renderFieldInput('Invoice Date', formData['Invoice Date'])}</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '16px', alignItems: 'center' }}>
                            <div style={{ fontWeight: 500 }}>Due Date:</div>
                            <div>{renderFieldInput('Due Date', formData['Due Date'])}</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '16px', alignItems: 'center' }}>
                            <div style={{ fontWeight: 500 }}>Payment Terms:</div>
                            <div>{renderFieldInput('Payment Terms', formData['Payment Terms'])}</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '16px', alignItems: 'center' }}>
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
                        <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '16px', alignItems: 'center' }}>
                            <div style={{ fontWeight: 500 }}>Total Amount:</div>
                            <div>{renderFieldInput('Total Invoice Amount', formData['Total Invoice Amount'])}</div>
                        </div>
                    </div>
                </Panel>

                <Panel header="Line Items" key="lineitems">
                    <Table
                        columns={lineItemColumns}
                        dataSource={lineItems.map((item, index) => ({ ...item, key: index }))}
                        pagination={false}
                        scroll={{ x: 'max-content' }}
                        size="small"
                    />
                    <Button
                        type="dashed"
                        icon={<PlusOutlined />}
                        onClick={handleAddLineItem}
                        style={{ marginTop: '16px', width: '100%' }}
                    >
                        Add Line Item
                    </Button>
                </Panel>
            </Collapse>
        </div>
    );

    // Tab 2: All Fields
    const allFieldsTab = (
        <div style={{ padding: '10px 20px' }}>
            {/* <div style={{ marginBottom: '16px', textAlign: 'right' }}>
                <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    onClick={handleSave}
                    loading={saving}
                    size="large"
                >
                    Save Changes
                </Button>
            </div> */}
            <Collapse defaultActiveKey={['Vendor Level', 'Invoice Header', 'Line Items']}>
                <Panel header="Vendor Level" key="Vendor Level">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {['Vendor Name', 'Vendor Address', 'Vendor Country', 'Vendor Tax ID (VAT/GST/TIN/W9, etc.)',
                            'Vendor Contact Email', 'Vendor Phone', 'Vendor Bank Name', 'Vendor Bank Account Number',
                            'Vendor Bank Details (Account/IBAN/SWIFT/Routing No)', 'Vendor Contact Person',
                            'Vendor Website (if applicable)'].map((field) => (
                                <div key={field} style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '16px', alignItems: 'center' }}>
                                    <div style={{ fontWeight: 500 }}>{field}:</div>
                                    <div>{renderFieldInput(field, formData[field])}</div>
                                </div>
                            ))}
                    </div>
                </Panel>

                <Panel header="Buyer Information" key="Buyer Information">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {['Client Name or Company Name', 'Billing Address', 'Shipping Address (if different)',
                            'Phone Number', 'Email Address (if applicable)', 'Client Tax ID (if applicable)',
                            'Contact Person'].map((field) => (
                                <div key={field} style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '16px', alignItems: 'center' }}>
                                    <div style={{ fontWeight: 500 }}>{field}:</div>
                                    <div>{renderFieldInput(field, formData[field])}</div>
                                </div>
                            ))}
                    </div>
                </Panel>

                <Panel header="Invoice Header" key="Invoice Header">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {['Invoice Number', 'Invoice Date', 'Due Date', 'Invoice Currency', 'Invoice Type',
                            'PO Number', 'Payment Terms', 'Payment Method', 'Cost Center / Project Code (if printed)',
                            'Service period start', 'Service period end'].map((field) => (
                                <div key={field} style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '16px', alignItems: 'center' }}>
                                    <div style={{ fontWeight: 500 }}>{field}:</div>
                                    <div>{renderFieldInput(field, formData[field])}</div>
                                </div>
                            ))}
                    </div>
                </Panel>

                <Panel header="Line Items" key="Line Items">
                    <Table
                        columns={lineItemColumns}
                        dataSource={lineItems.map((item, index) => ({ ...item, key: index }))}
                        pagination={false}
                        scroll={{ x: 'max-content' }}
                        size="small"
                    />
                    <Button
                        type="dashed"
                        icon={<PlusOutlined />}
                        onClick={handleAddLineItem}
                        style={{ marginTop: '16px', width: '100%' }}
                    >
                        Add Line Item
                    </Button>
                </Panel>

                <Panel header="Taxes" key="Taxes">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {['Total Tax Amount', 'Tax Type Breakdown (VAT/GST/PST/IGST etc.)',
                            'Withholding Tax'].map((field) => (
                                <div key={field} style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '16px', alignItems: 'center' }}>
                                    <div style={{ fontWeight: 500 }}>{field}:</div>
                                    <div>{renderFieldInput(field, formData[field])}</div>
                                </div>
                            ))}
                    </div>
                </Panel>

                <Panel header="Totals" key="Totals">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {['Subtotal', 'Shipping / Handling / Fees', 'Surcharges', 'Total Invoice Amount',
                            'Amount Paid', 'Amount Due'].map((field) => (
                                <div key={field} style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '16px', alignItems: 'center' }}>
                                    <div style={{ fontWeight: 500 }}>{field}:</div>
                                    <div>{renderFieldInput(field, formData[field])}</div>
                                </div>
                            ))}
                    </div>
                </Panel>

                <Panel header="Compliance" key="Compliance">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {['Notes / Terms', 'QR Code / IRN / ZATCA ID (region-specific)',
                            'Company Registration Number'].map((field) => (
                                <div key={field} style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '16px', alignItems: 'center' }}>
                                    <div style={{ fontWeight: 500 }}>{field}:</div>
                                    <div>{renderFieldInput(field, formData[field])}</div>
                                </div>
                            ))}
                    </div>
                </Panel>

                <Panel header="Approval Workflow" key="Approval Workflow">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {['Approval Workflow ID', 'Approval Required', 'Approver List / Roles:',
                            'Approval Status:', 'Approval Timestamps'].map((field) => (
                                <div key={field} style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '16px', alignItems: 'center' }}>
                                    <div style={{ fontWeight: 500 }}>{field}:</div>
                                    <div>{renderFieldInput(field, formData[field])}</div>
                                </div>
                            ))}
                    </div>
                </Panel>
            </Collapse>
        </div>
    );

    // Tab 3: Coding
    const codingTab = (
        <div style={{ padding: '20px' }}>
            <Collapse defaultActiveKey={['header', 'lineitems']}>
                <Panel header="Header" key="header">
                    <Table
                        columns={[
                            {
                                title: 'File Name',
                                dataIndex: 'fileName',
                                key: 'fileName',
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
                                        style={{ width: '100%' }}
                                        placeholder="Enter header coding"
                                    />
                                )
                            }
                        ]}
                        dataSource={[
                            {
                                key: '1',
                                fileName: formData['Vendor Name']?.value || formData['Vendor Name'] || '',
                                invoiceId: formData['Invoice Number']?.value || formData['Invoice Number'] || '',
                                totalAmount: formData['Total Invoice Amount']?.value || formData['Total Invoice Amount'] || '',
                                dueDate: formData['Due Date']?.value || formData['Due Date'] || '',
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
                                dataIndex: 'sNo',
                                key: 'sNo',
                                width: '5%',
                                render: (text, record, index) => index + 1
                            },
                            {
                                title: 'Description',
                                dataIndex: 'description',
                                key: 'description',
                                width: '15%',
                                render: (text, record, index) => (
                                    <Input
                                        value={text}
                                        placeholder="Enter description"
                                    />
                                )
                            },
                            {
                                title: 'Line Type',
                                dataIndex: 'lineType',
                                key: 'lineType',
                                width: '10%',
                                render: (text, record, index) => (
                                    <Select
                                        defaultValue="Expense"
                                        style={{ width: '100%' }}
                                        options={[
                                            { value: 'Expense', label: 'Expense' },
                                            { value: 'Asset', label: 'Asset' },
                                            { value: 'Liability', label: 'Liability' }
                                        ]}
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
                                        value={text}
                                        style={{ width: '100%' }}
                                        min={0}
                                    />
                                )
                            },
                            {
                                title: 'Unit Price',
                                dataIndex: 'unitPrice',
                                key: 'unitPrice',
                                width: '10%',
                                render: (text, record, index) => (
                                    <InputNumber
                                        value={text}
                                        style={{ width: '100%' }}
                                        min={0}
                                        precision={2}
                                    />
                                )
                            },
                            {
                                title: 'Net Amount',
                                dataIndex: 'netAmount',
                                key: 'netAmount',
                                width: '10%',
                                render: (text, record, index) => (
                                    <InputNumber
                                        value={text}
                                        style={{ width: '100%' }}
                                        min={0}
                                        precision={2}
                                    />
                                )
                            },
                            {
                                title: 'GL Code',
                                dataIndex: 'glCode',
                                key: 'glCode',
                                width: '10%',
                                render: (text, record, index) => (
                                    <Input
                                        value={text}
                                        placeholder="GL Code"
                                    />
                                )
                            },
                            {
                                title: 'Cost Center',
                                dataIndex: 'costCenter',
                                key: 'costCenter',
                                width: '10%',
                                render: (text, record, index) => (
                                    <Input
                                        value={text}
                                        placeholder="Cost Center"
                                    />
                                )
                            },
                            {
                                title: 'Project Code',
                                dataIndex: 'projectCode',
                                key: 'projectCode',
                                width: '10%',
                                render: (text, record, index) => (
                                    <Input
                                        value={text}
                                        placeholder="Project Code"
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
                                    />
                                )
                            }
                        ]}
                        dataSource={lineItems.map((item, index) => ({
                            key: index,
                            sNo: index + 1,
                            description: item.Description?.value || '',
                            lineType: 'Expense',
                            quantity: item.Quantity?.value || 0,
                            unitPrice: item.UnitPrice?.value || 0,
                            netAmount: item.NetAmount?.value || 0,
                            glCode: '',
                            costCenter: '',
                            projectCode: ''
                        }))}
                        pagination={false}
                        scroll={{ x: 'max-content' }}
                        size="small"
                    />
                </Panel>
            </Collapse>
        </div>
    );

    const tabItems = [
        {
            key: '1',
            label: 'Quick View',
            children: quickViewTab
        },
        {
            key: '2',
            label: 'All Fields',
            children: allFieldsTab
        },
        {
            key: '3',
            label: 'Coding',
            children: codingTab
        }
    ];

    const [activeTab, setActiveTab] = useState('1');

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

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                backgroundColor: '#fff',
                borderBottom: '1px solid #f0f0f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px 20px'
            }}>
                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    centered
                    style={{ margin: 0, flex: 1 }}
                    items={[
                        { key: '1', label: 'Quick View' },
                        { key: '2', label: 'All Fields' },
                        { key: '3', label: 'Coding' }
                    ]}
                />
                <Button
                    type="primary"
                    icon={<SaveOutlined />}
                    onClick={handleSave}
                    loading={saving}
                    size="large"
                    style={{ marginLeft: '24px' }}
                >
                    Save
                </Button>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
                {renderTabContent()}
            </div>
        </div>
    );
};

export default GenericInputFields;
