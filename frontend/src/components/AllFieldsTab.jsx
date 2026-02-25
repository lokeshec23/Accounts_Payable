import React, { useMemo, useCallback, useState } from 'react';
import { Collapse, Table, Button, Modal, Descriptions } from 'antd';
import { PlusOutlined, DownloadOutlined, EyeOutlined, DeleteOutlined } from '@ant-design/icons';

const { Panel } = Collapse;

const AllFieldsTab = React.memo((props) => {
    const {
        formData,
        lineItems,
        selectedVendorDetails,
        disableInputs,
        disabledStyle,
        getCurrencySymbol,
        extractValue,
        parseCurrencyValue,
        renderFieldInput,
        handleAddLineItem,
        exportToExcel,
        lineItemColumns,
        isAmountMismatch,
        calculationDetails,
        schema = [],
        isCodingData = false,
        readOnly = false
    } = props;

    const [showDetails, setShowDetails] = useState(false);

    try {
        const safeLineItems = Array.isArray(lineItems) ? lineItems : [];

        // Define renderFieldGroup inside the component using useCallback
        const renderFieldGroup = useCallback((groupName, fields) => {
            const filteredFields = fields;
            console.log(`DEBUG: AllFieldsTab renderFieldGroup ${groupName}`, { fieldsCount: filteredFields.length });

            if (filteredFields.length === 0) return null;

            return (
                <Panel header={groupName} key={groupName}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '10px 0' }}>
                        {filteredFields.map(field => {
                            try {
                                const fieldSchema = Array.isArray(schema)
                                    ? schema.find(s => s && s.label === field)
                                    : null;
                                const label = fieldSchema?.display_name || field;
                                const value = formData ? formData[field] : '';

                                return (
                                    <div key={field} style={{
                                        display: 'grid', gridTemplateColumns: '350px 1fr', gap: '16px', alignItems: 'start'
                                    }}>
                                        <div style={{ fontWeight: 500, marginTop: '8px' }}>{label}:</div>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ flex: 1 }}>
                                                    {renderFieldInput ? renderFieldInput(field, value) : <span>{String(value || '')}</span>}
                                                </div>
                                                {field === 'Total Invoice Amount' && (
                                                    <Button
                                                        icon={<EyeOutlined />}
                                                        type="text"
                                                        onClick={() => setShowDetails(true)}
                                                        title="View calculation details"
                                                        style={{ color: '#1890ff' }}
                                                    />
                                                )}
                                            </div>
                                            {field === 'Total Invoice Amount' && isAmountMismatch && (
                                                <div style={{ color: '#faad14', fontSize: '12px', marginTop: '4px' }}>
                                                    ⚠️ Invoice amount in bill is not matched with calculated totals.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            } catch (err) {
                                console.error(`Error rendering field ${field}`, err);
                                return <div key={field} style={{ color: 'red' }}>Error rendering {field}</div>;
                            }
                        })}
                    </div>
                </Panel>
            );
        }, [formData, schema, renderFieldInput, isAmountMismatch]);

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
                                        display: 'grid', gridTemplateColumns: '350px 1fr', gap: '16px', alignItems: 'center'
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
            safeLineItems.forEach((item, index) => {
                if (!item) return;
                const desc = (extractValue(item.Description) || item.Description || '').toString().trim();
                const isSystemRow = ['Total GST', 'Total GST (Ineligible)', 'TDS Deduction'].includes(desc);
                if (!isSystemRow) {
                    data.push({ ...item, key: `item_${index}` });
                }
            });

            // Single Aggregated GST Row
            const formTaxValue = parseCurrencyValue(extractValue(formData?.['Total Tax Amount']));
            const totalTaxAmount = safeLineItems.reduce((sum, item) => {
                if (!item) return sum;
                const t = parseCurrencyValue(
                    extractValue(item.TaxAmount) ||
                    extractValue(item.tax_amount) ||
                    item.TaxAmount ||
                    item.tax_amount
                );
                return sum + t;
            }, 0) +
                parseCurrencyValue(extractValue(formData?.['CGST'])) +
                parseCurrencyValue(extractValue(formData?.['SGST'])) +
                parseCurrencyValue(extractValue(formData?.['IGST']));

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
                    'TDS Percentage', 'Percentage', 'Rate', 'TDS Rate', 'Withholding Rate'
                ]) || '0';
                let tdsRate = parseFloat(tdsRateVal.toString().replace('%', '')) || 0;
                if (tdsRate > 1) tdsRate = tdsRate / 100;

                const subtotal = safeLineItems.reduce((sum, item) => {
                    if (!item) return sum;
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
        }, [safeLineItems, formData, selectedVendorDetails, extractValue, parseCurrencyValue]);

        return (
            <div style={{ padding: '10px 20px' }}>
                <Collapse defaultActiveKey={['Invoice Header', 'vendor_details', 'Line Items']}>
                    {/* 1. Invoice Header */}
                    {renderFieldGroup('Invoice Header', [
                        'Invoice Number', 'Invoice Date', 'Due Date', 'Invoice Currency', 'Invoice Type',
                        'PO Number', 'Payment Terms', 'Payment Method', 'Cost Center / Project Code (if printed)',
                        'Service period start', 'Service period end'
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
                            key={getCurrencySymbol ? getCurrencySymbol() : 'table'}
                            columns={lineItemColumns}
                            dataSource={tableDataSource}
                            pagination={false}
                            scroll={{ x: 'max-content' }}
                            size="small"
                        />
                        <div style={{
                            marginTop: '12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            alignItems: 'flex-end',
                            padding: '16px',
                            background: '#f0f2f5',
                            borderRadius: '6px',
                            borderTop: '1px solid #d9d9d9'
                        }}>
                            <div style={{ textAlign: 'right' }}>
                                <span style={{ fontSize: '13px', color: '#8c8c8c', marginRight: '12px' }}>Total Line Items Net Amount:</span>
                                <span style={{ fontSize: '15px', fontWeight: 500, color: '#595959' }}>
                                    {getCurrencySymbol ? getCurrencySymbol() : '$'} {safeLineItems.reduce((sum, item) => {
                                        if (!item) return sum;
                                        return sum + parseCurrencyValue(
                                            extractValue(item.NetAmount) ||
                                            extractValue(item.amount) ||
                                            extractValue(item.net_amount) ||
                                            item.amount ||
                                            item.net_amount
                                        );
                                    }, 0).toFixed(2)}
                                </span>
                            </div>
                            <div style={{ textAlign: 'right', borderTop: '1px solid #d9d9d9', paddingTop: '8px', width: '100%', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '14px', color: '#595959' }}>Total Amount Payable:</span>
                                <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#1890ff' }}>
                                    {getCurrencySymbol ? getCurrencySymbol() : '$'} {parseCurrencyValue(extractValue(formData?.['Total Amount Payable'])).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <Button
                                    icon={<EyeOutlined />}
                                    type="text"
                                    onClick={() => setShowDetails(true)}
                                    title="View calculation details"
                                    style={{ color: '#1890ff' }}
                                />
                            </div>
                        </div>
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
                        'Vendor Name', 'Vendor Address', 'Vendor Country', 'Vendor Tax ID (VAT/GST/TIN/W9, etc.)',
                        'Vendor Contact Email', 'Vendor Phone', 'Vendor Bank Name', 'Vendor Bank Account Number',
                        'Vendor Bank Details (Account/IBAN/SWIFT/Routing No)', 'Vendor Contact Person', 'Vendor Website (if applicable)'
                    ])}

                    {/* 5. Buyer Information */}
                    {renderFieldGroup('Buyer Information', [
                        'Client Name or Company Name', 'Billing Address', 'Shipping Address (if different)',
                        'Phone Number', 'Email Address (if applicable)', 'Client Tax ID (if applicable)', 'Contact Person'
                    ])}

                    {/* 6. Taxes */}
                    {renderFieldGroup('Taxes', [
                        'Total Tax Amount', 'Tax Type Breakdown (VAT/GST/PST/IGST etc.)', 'CGST', 'SGST', 'IGST', 'GST', 'Withholding Tax'
                    ])}

                    {/* 7. Totals */}
                    {renderFieldGroup('Totals', [
                        'Subtotal', 'Shipping / Handling / Fees', 'Surcharges', 'Total Invoice Amount', 'Total Amount Payable',
                        'Amount Paid', 'Amount Due'
                    ])}

                    {/* 8. Compliance */}
                    {renderFieldGroup('Compliance', [
                        'Notes / Terms', 'QR Code / IRN / ZATCA ID (region-specific)', 'Company Registration Number'
                    ])}
                </Collapse>

                <Modal
                    title="Total Invoice Amount - Calculation Details"
                    open={showDetails}
                    onOk={() => setShowDetails(false)}
                    onCancel={() => setShowDetails(false)}
                    width={600}
                >
                    <Descriptions bordered column={1} size="small">
                        <Descriptions.Item label="Line Items (Subtotal)">
                            {getCurrencySymbol ? getCurrencySymbol() : '$'} {calculationDetails?.lineItemsTotal?.toFixed(2)}
                        </Descriptions.Item>
                        <Descriptions.Item label="Total Tax (GST/VAT)">
                            {getCurrencySymbol ? getCurrencySymbol() : '$'} {calculationDetails?.totalTax?.toFixed(2)}
                        </Descriptions.Item>
                        <Descriptions.Item label="Extracted Subtotal (if different)">
                            {getCurrencySymbol ? getCurrencySymbol() : '$'} {calculationDetails?.extractedSubtotal?.toFixed(2)}
                        </Descriptions.Item>
                        <Descriptions.Item label="Amount Paid">
                            {getCurrencySymbol ? getCurrencySymbol() : '$'} {calculationDetails?.amountPaid?.toFixed(2)}
                        </Descriptions.Item>
                        <Descriptions.Item label="Shipping / Handling / Fees">
                            {getCurrencySymbol ? getCurrencySymbol() : '$'} {calculationDetails?.shipping?.toFixed(2)}
                        </Descriptions.Item>
                        <Descriptions.Item label="Surcharges">
                            {getCurrencySymbol ? getCurrencySymbol() : '$'} {calculationDetails?.surcharges?.toFixed(2)}
                        </Descriptions.Item>
                        <Descriptions.Item label="TDS Rate (from Vendor)">
                            {(calculationDetails?.tdsAmount / calculationDetails?.lineItemsTotal * 100 || 0).toFixed(2)}%
                        </Descriptions.Item>
                        <Descriptions.Item label="TDS Deduction Amount" labelStyle={{ color: '#ff4d4f' }}>
                            - {getCurrencySymbol ? getCurrencySymbol() : '$'} {calculationDetails?.tdsAmount?.toFixed(2)}
                        </Descriptions.Item>
                    </Descriptions>

                    <div style={{ marginTop: '20px', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Payable Amount Derivation:</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span>Base Invoice Total Used:</span>
                            <span>{getCurrencySymbol ? getCurrencySymbol() : '$'} {calculationDetails?.baseTotalUsed?.toFixed(2)}</span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#8c8c8c', marginBottom: '8px', textAlign: 'right' }}>
                            (via {calculationDetails?.baseTotalSource})
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ff4d4f', marginBottom: '4px' }}>
                            <span>Less TDS Deduction:</span>
                            <span>- {getCurrencySymbol ? getCurrencySymbol() : '$'} {calculationDetails?.tdsAmount?.toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #d9d9d9', paddingTop: '4px', fontWeight: 'bold' }}>
                            <span>Total Amount Payable:</span>
                            <span>{getCurrencySymbol ? getCurrencySymbol() : '$'} {((calculationDetails?.baseTotalUsed || 0) - (calculationDetails?.tdsAmount || 0)).toFixed(2)}</span>
                        </div>
                    </div>

                    <div style={{ marginTop: '20px' }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>Heuristic Calculations:</div>
                        <div style={{ padding: '4px 0' }}>
                            <b>1. Line Items + Tax:</b> {getCurrencySymbol ? getCurrencySymbol() : '$'} {calculationDetails?.calc1?.toFixed(2)}
                        </div>
                        <div style={{ padding: '4px 0' }}>
                            <b>2. Subtotal + Tax:</b> {getCurrencySymbol ? getCurrencySymbol() : '$'} {calculationDetails?.calc2?.toFixed(2)}
                        </div>
                        <div style={{ padding: '4px 0' }}>
                            <b>3. Total Reconciliation:</b> {getCurrencySymbol ? getCurrencySymbol() : '$'} {calculationDetails?.calc3?.toFixed(2)}
                            <div style={{ fontSize: '11px', color: '#8c8c8c' }}>
                                (Line Items + Tax + Shipping + Surcharges - Amount Paid)
                            </div>
                        </div>
                    </div>

                    <div style={{
                        marginTop: '20px',
                        paddingTop: '10px',
                        borderTop: '1px solid #f0f0f0',
                        color: isAmountMismatch ? '#faad14' : '#52c41a'
                    }}>
                        <b>Extraction Value:</b> {getCurrencySymbol ? getCurrencySymbol() : '$'} {calculationDetails?.currentTotal?.toFixed(2)}
                        <div style={{ fontSize: '12px' }}>
                            {isAmountMismatch
                                ? "❌ Mismatch detected: The extracted amount does not match any heuristic calculation."
                                : "✅ Match found: The extracted amount matches one of the heuristic calculations."}
                        </div>
                    </div>
                </Modal>
            </div>
        );
    } catch (err) {
        console.error("CRITICAL: AllFieldsTab render crash", err);
        return <div style={{ padding: '20px', color: 'red' }}>Error rendering All Fields. Check console.</div>;
    }
});

AllFieldsTab.displayName = 'AllFieldsTab';

export default AllFieldsTab;