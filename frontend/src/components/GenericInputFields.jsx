import React, { useEffect, useState } from 'react';
import {
    Collapse,
    Input,
    InputNumber,
    Select,
    Checkbox,
    DatePicker,
    Table,
    Button,
    message
} from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { invoiceService } from '../services/api';

const { Panel } = Collapse;
const { TextArea } = Input;

const GenericInputFields = ({ data, schema, setHoveredKey, invoiceId, originalData }) => {
    // UPDATED: Handle both extraction_json and direct data structure
    const extractionData = data?.extraction_json || {};

    // UPDATED: Get line items from multiple possible locations
    const lineItemsFromData = data?.items || data?.LineItems || [];

    const [formData, setFormData] = useState({
        ...extractionData,
        LineItems: lineItemsFromData
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setFormData({
            ...extractionData,
            LineItems: data?.items || data?.LineItems || []
        });
    }, [data]);

    const handleMouseEnter = (key, pageNum) => {
        if (key && pageNum != null) {
            setHoveredKey({ key, pageNum });
        }
    };

    const handleMouseLeave = () => {
        setHoveredKey({ key: null, pageNum: null });
    };

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

//     const handleSave = async () => {
//     if (!invoiceId) {
//         message.error('No invoice ID provided');
//         return;
//     }

//     try {
//         setSaving(true);

//         // Start with the complete original extracted_data from the database
//         const updatedExtractedData = JSON.parse(JSON.stringify(originalData?.extracted_data || {}));

//         // Helper to safely update a value in nested structure
//         const safeUpdate = (obj, path, newValue) => {
//             const keys = path.split('.');
//             let current = obj;
            
//             for (let i = 0; i < keys.length - 1; i++) {
//                 if (!current[keys[i]]) current[keys[i]] = {};
//                 current = current[keys[i]];
//             }
            
//             const lastKey = keys[keys.length - 1];
//             if (!current[lastKey]) current[lastKey] = {};
            
//             // If it has a 'value' property, update it; otherwise set value
//             if (typeof current[lastKey] === 'object' && current[lastKey] !== null) {
//                 current[lastKey].value = newValue;
//             } else {
//                 current[lastKey] = { value: newValue };
//             }
//         };

//         // Update vendor_info
//         if (formData['Vendor Name'] !== undefined) {
//             safeUpdate(updatedExtractedData, 'vendor_info.name', extractValue(formData['Vendor Name']));
//         }
//         if (formData['Vendor Address'] !== undefined) {
//             safeUpdate(updatedExtractedData, 'vendor_info.address', extractValue(formData['Vendor Address']));
//         }

//         // Update client_info
//         if (formData['Client Name'] !== undefined) {
//             safeUpdate(updatedExtractedData, 'client_info.name', extractValue(formData['Client Name']));
//         }
//         if (formData['Billing Address'] !== undefined) {
//             safeUpdate(updatedExtractedData, 'client_info.billing_address', extractValue(formData['Billing Address']));
//         }
//         if (formData['Shipping Address'] !== undefined) {
//             safeUpdate(updatedExtractedData, 'client_info.shipping_address', extractValue(formData['Shipping Address']));
//         }

//         // Update invoice_details
//         if (formData['Invoice Number'] !== undefined) {
//             safeUpdate(updatedExtractedData, 'invoice_details.invoice_number', extractValue(formData['Invoice Number']));
//         }
//         if (formData['Invoice Date'] !== undefined) {
//             safeUpdate(updatedExtractedData, 'invoice_details.invoice_date', extractValue(formData['Invoice Date']));
//         }
//         if (formData['Due Date'] !== undefined) {
//             safeUpdate(updatedExtractedData, 'invoice_details.due_date', extractValue(formData['Due Date']));
//         }

//         // Update amounts
//         if (formData['Total Amount'] !== undefined) {
//             safeUpdate(updatedExtractedData, 'amounts.total_invoice_amount', extractValue(formData['Total Amount']));
//         }
//         if (formData['Tax Amount'] !== undefined) {
//             safeUpdate(updatedExtractedData, 'amounts.total_tax_amount', extractValue(formData['Tax Amount']));
//         }
//         if (formData['Subtotal'] !== undefined) {
//             safeUpdate(updatedExtractedData, 'amounts.subtotal', extractValue(formData['Subtotal']));
//         }

//         // Update Items (line items)
//         if (formData.LineItems && Array.isArray(formData.LineItems)) {
//             if (!updatedExtractedData.Items) {
//                 updatedExtractedData.Items = { value: [] };
//             }
            
//             // Get original items array
//             const originalItems = updatedExtractedData.Items.value || [];
            
//             // Update items array
//             updatedExtractedData.Items.value = formData.LineItems.map((item, index) => {
//                 const originalItem = originalItems[index] || {};
                
//                 return {
//                     description: {
//                         ...(originalItem.description || {}),
//                         value: extractValue(item.Description)
//                     },
//                     quantity: {
//                         ...(originalItem.quantity || {}),
//                         value: extractValue(item.Quantity)
//                     },
//                     unit_price: {
//                         ...(originalItem.unit_price || {}),
//                         value: extractValue(item.UnitPrice)
//                     },
//                     amount: {
//                         ...(originalItem.amount || {}),
//                         value: extractValue(item.NetAmount)
//                     }
//                 };
//             });
//         }

//         // Log what we're sending for debugging
//         console.log('Updating invoice:', invoiceId);
//         console.log('Sending extracted_data:', updatedExtractedData);

//         // Call the API to update
//         const response = await invoiceService.updateInvoice(invoiceId, {
//             extracted_data: updatedExtractedData
//         });

//         console.log('Update successful:', response);
//         message.success('Invoice updated successfully!');
        
//     } catch (error) {
//         console.error('Error saving invoice:', error);
//         console.error('Error details:', error.response?.data);
//         message.error(error.response?.data?.detail || 'Failed to save invoice. Please try again.');
//     } finally {
//         setSaving(false);
//     }
// };

    // Field categorization
    const categorizeFields = (fields) => {
        const categories = {
            vendor: [],
            buyer: [],
            header: [],
            financials: [],
            compliance: [],
            approval: []
        };

        fields.forEach(field => {
            if (field.includes('Vendor')) categories.vendor.push(field);
            else if (field.includes('Client') || field.includes('Billing') || field.includes('Shipping')) categories.buyer.push(field);
            else if (field.includes('Invoice') || field.includes('PO') || field.includes('Payment') || field.includes('Service')) categories.header.push(field);
            else if (field.includes('Tax') || field.includes('Amount') || field.includes('Subtotal') || field.includes('Total')) categories.financials.push(field);
            else if (field.includes('Approval')) categories.approval.push(field);
            else categories.compliance.push(field);
        });

        return categories;
    };

    const flatFields = schema?.flatFields || [];
    const categorizedFields = categorizeFields(flatFields);
    const sectionData = formData.LineItems || [];

    // Helper functions
    const formatCurrency = (value) => {
        if (value === null || value === undefined || value === 'N/A' || value === '') return 'N/A';
        const numValue = typeof value === 'string' ? parseFloat(value.replace(/[^\d.-]/g, '')) : value;
        if (isNaN(numValue)) return 'N/A';
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2
        }).format(numValue);
    };

    const formatNumber = (value) => {
        if (value === null || value === undefined || value === 'N/A' || value === '') return 'N/A';
        const numValue = typeof value === 'string' ? parseFloat(value.replace(/[^\d.-]/g, '')) : value;
        if (isNaN(numValue)) return 'N/A';
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(numValue);
    };

    const calculateTotal = (items, field) => {
        if (!items || !Array.isArray(items)) return 0;
        return items.reduce((total, item) => {
            const value = item[field]?.value || item[field];
            if (value && value !== 'N/A' && value !== '') {
                const numValue = typeof value === 'string' ? parseFloat(value.replace(/[^\d.-]/g, '')) : value;
                return total + (numValue || 0);
            }
            return total;
        }, 0);
    };

    const extractValue = (fieldValue) => {
        if (fieldValue === null || fieldValue === undefined) return '';
        if (typeof fieldValue === 'object' && fieldValue !== null && 'value' in fieldValue) {
            // Check if value property is null/undefined
            return fieldValue.value === null || fieldValue.value === undefined ? '' : fieldValue.value;
        }
        return fieldValue;
    };

    // Render field input
    const renderFieldInput = (field, value) => {
        const stringValue = extractValue(value);

        if (field.includes('Amount') || field.includes('Price') || field.includes('Total') || field.includes('Tax')) {
            // Clean the string value (remove currency symbols and commas) before parsing
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
        } else if (field.includes('Notes') || field.includes('Terms') || field.includes('Description')) {
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

    // Line items table columns
    const lineItemColumns = [
        { title: '#', dataIndex: 'item_number', key: 'item_number', width: 50, render: (text, record, index) => index + 1 },
        { title: 'Description', dataIndex: 'Description', key: 'Description', width: 200, render: (val) => extractValue(val) || 'N/A' },
        { title: 'Item Code', dataIndex: 'ItemCode', key: 'ItemCode', width: 120, render: (val) => extractValue(val) || 'N/A' },
        { title: 'Qty', dataIndex: 'Quantity', key: 'Quantity', width: 80, render: (val) => formatNumber(extractValue(val)) },
        { title: 'Unit', dataIndex: 'UnitOfMeasure', key: 'UnitOfMeasure', width: 80, render: (val) => extractValue(val) || 'N/A' },
        { title: 'Unit Price', dataIndex: 'UnitPrice', key: 'UnitPrice', width: 100, render: (val) => formatCurrency(extractValue(val)) },
        { title: 'Discount', dataIndex: 'Discount', key: 'Discount', width: 100, render: (val) => formatCurrency(extractValue(val)) },
        { title: 'Net Amount', dataIndex: 'NetAmount', key: 'NetAmount', width: 120, render: (val) => formatCurrency(extractValue(val)) },
        {
            title: 'Tax Rate', dataIndex: 'TaxRate', key: 'TaxRate', width: 100, render: (val) => {
                const value = extractValue(val);
                return value && value !== 'N/A' ? `${formatNumber(value)}%` : 'N/A';
            }
        },
        { title: 'Tax Amount', dataIndex: 'TaxAmount', key: 'TaxAmount', width: 120, render: (val) => formatCurrency(extractValue(val)) },
        { title: 'Gross Amount', dataIndex: 'GrossAmount', key: 'GrossAmount', width: 120, render: (val) => formatCurrency(extractValue(val)) },
    ];

    const renderFieldSection = (title, fields, defaultOpen = true) => {
        if (fields.length === 0) return null;

        return (
            <Panel header={title} key={title}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {fields.map((field) => (
                        <div
                            key={field}
                            onMouseEnter={() => {
                                let coordinatesData = data.extraction_json_with_coordinates || data.extraction_json;
                                const coords = coordinatesData?.[field]?.coordinates;
                                if (coords == null) return;
                                handleMouseEnter(field, coordinatesData?.[field]?.page_num);
                            }}
                            onMouseLeave={handleMouseLeave}
                        >
                            <div style={{ marginBottom: '4px', fontWeight: 500 }}>{field}</div>
                            {renderFieldInput(field, formData[field])}
                        </div>
                    ))}
                </div>
            </Panel>
        );
    };

    return (
        <div style={{ padding: '10px 20px' }}>
            {/* Save Button */}
            {/* {invoiceId && (
                <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                    <Button
                        type="primary"
                        icon={<SaveOutlined />}
                        onClick={handleSave}
                        loading={saving}
                        size="large"
                    >
                        Save Changes
                    </Button>
                </div>
            )} */}

            <Collapse defaultActiveKey={['Vendor Information', 'Invoice Header', 'Line Items', 'Financial Information']}>
                {renderFieldSection('Vendor Information', categorizedFields.vendor)}
                {renderFieldSection('Buyer Information', categorizedFields.buyer)}
                {renderFieldSection('Invoice Header', categorizedFields.header)}

                {/* Line Items Section */}
                {sectionData && sectionData.length > 0 && (
                    <Panel header={`Line Items (${sectionData.length})`} key="Line Items">
                        <Table
                            columns={lineItemColumns}
                            dataSource={sectionData.map((item, index) => ({ ...item, key: index }))}
                            pagination={false}
                            scroll={{ x: 'max-content' }}
                            size="small"
                            summary={() => (
                                <Table.Summary fixed>
                                    <Table.Summary.Row style={{ backgroundColor: '#f5f5f5', fontWeight: 600 }}>
                                        <Table.Summary.Cell index={0} colSpan={7} align="right">Totals:</Table.Summary.Cell>
                                        <Table.Summary.Cell index={7}>{formatCurrency(calculateTotal(sectionData, 'NetAmount'))}</Table.Summary.Cell>
                                        <Table.Summary.Cell index={8}></Table.Summary.Cell>
                                        <Table.Summary.Cell index={9}>{formatCurrency(calculateTotal(sectionData, 'TaxAmount'))}</Table.Summary.Cell>
                                        <Table.Summary.Cell index={10}>{formatCurrency(calculateTotal(sectionData, 'GrossAmount'))}</Table.Summary.Cell>
                                    </Table.Summary.Row>
                                </Table.Summary>
                            )}
                        />
                    </Panel>
                )}

                {(!sectionData || sectionData.length === 0) && (
                    <Panel header="Line Items" key="Line Items Empty">
                        <div style={{
                            padding: '20px',
                            backgroundColor: '#f8f9fa',
                            border: '1px dashed #dee2e6',
                            textAlign: 'center',
                            color: '#6c757d',
                            borderRadius: '4px'
                        }}>
                            No line items found in this invoice
                        </div>
                    </Panel>
                )}

                {renderFieldSection('Financial Information', categorizedFields.financials)}
                {renderFieldSection('Compliance & Notes', categorizedFields.compliance, false)}
                {renderFieldSection('Approval Workflow', categorizedFields.approval, false)}
            </Collapse>
        </div>
    );
};

export default GenericInputFields;