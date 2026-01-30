// src/components/AllFieldsTab.jsx
import React, { useMemo, useCallback } from 'react'; // Added useCallback
import { Collapse, Table, Button } from 'antd';
import { PlusOutlined, DownloadOutlined } from '@ant-design/icons';

const { Panel } = Collapse;

const AllFieldsTab = React.memo(({
    formData,
    lineItems,
    selectedVendorDetails,
    disableInputs,
    disabledStyle,
    getCurrencySymbol,
    extractValue,
    parseCurrencyValue,
    renderFieldInput,
    // REMOVE renderFieldGroup from props
    handleAddLineItem,
    exportToExcel,
    lineItemColumns,
    readOnly,
    schema = [] // ADD schema prop
}) => {

    // Define renderFieldGroup inside the component using useCallback
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

    // Memoize vendor master details panel
    const vendorMasterDetailsPanel = useMemo(() => (
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
                                        <input
                                            type="text"
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
    ), [selectedVendorDetails, disabledStyle]);

    // Memoize table data source
    const tableDataSource = useMemo(() => {
        const data = [];
        lineItems.forEach((item, index) => {
            data.push({ ...item, key: `item_${index}` });
        });

        // Single Aggregated GST Row
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

        // Dynamic TDS Row
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
    }, [lineItems, formData, selectedVendorDetails, extractValue, parseCurrencyValue]);

    return (
        <div style={{ padding: '10px 20px' }}>
            <Collapse defaultActiveKey={['Invoice Header', 'vendor_details', 'Line Items']}>
                {/* 1. Invoice Header */}
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

                {/* 2. Vendor Master Details */}
                {vendorMasterDetailsPanel}

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
                        dataSource={tableDataSource}
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

                {/* 4. Vendor Level */}
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

                {/* 5. Buyer Information */}
                {renderFieldGroup('Buyer Information', [
                    'Client Name or Company Name',
                    'Billing Address',
                    'Shipping Address (if different)',
                    'Phone Number',
                    'Email Address (if applicable)',
                    'Client Tax ID (if applicable)',
                    'Contact Person'
                ])}

                {/* 6. Taxes */}
                {renderFieldGroup('Taxes', [
                    'Total Tax Amount',
                    'Tax Type Breakdown (VAT/GST/PST/IGST etc.)',
                    'CGST',
                    'SGST',
                    'IGST',
                    'GST',
                    'Withholding Tax'
                ])}

                {/* 7. Totals */}
                {renderFieldGroup('Totals', [
                    'Subtotal',
                    'Shipping / Handling / Fees',
                    'Surcharges',
                    'Total Invoice Amount',
                    'Total Amount Payable',
                    'Amount Paid',
                    'Amount Due'
                ])}

                {/* 8. Compliance */}
                {renderFieldGroup('Compliance', [
                    'Notes / Terms',
                    'QR Code / IRN / ZATCA ID (region-specific)',
                    'Company Registration Number'
                ])}
            </Collapse>
        </div>
    );
});

AllFieldsTab.displayName = 'AllFieldsTab';

export default AllFieldsTab;