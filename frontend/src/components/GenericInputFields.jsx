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
    Checkbox
} from 'antd';
import { PlusOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

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

    const handleSave = async () => {
        setSaving(true);
        try {
            console.log('Saving data:', { ...formData, LineItems: lineItems });
            await new Promise(resolve => setTimeout(resolve, 1000));
            alert('Data saved successfully!');
        } catch (error) {
            console.error('Error saving data:', error);
            alert('Failed to save data');
        } finally {
            setSaving(false);
        }
    };

    const extractValue = (fieldValue) => {
        if (fieldValue === null || fieldValue === undefined) return '';
        if (typeof fieldValue === 'object' && fieldValue !== null && 'value' in fieldValue) {
            return fieldValue.value === null || fieldValue.value === undefined ? '' : fieldValue.value;
        }
        return fieldValue;
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
                                    <DatePicker
                                        style={{ width: '100%' }}
                                        format="YYYY-MM-DD"
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

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                backgroundColor: '#fff',
                borderBottom: '1px solid #f0f0f0'
            }}>
                <Tabs
                    defaultActiveKey="1"
                    items={tabItems}
                    centered
                    style={{ margin: 0 }}
                    tabBarExtraContent={{
                        right: (
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
                        )
                    }}
                />
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
                {/* Tab content will be rendered here by Ant Design */}
            </div>
        </div>
    );
};

export default GenericInputFields;
