// src/components/QuickViewTab.jsx
import React, { useMemo } from 'react';
import {
    Collapse,
    Input,
    InputNumber,
    Select,
    AutoComplete,
    DatePicker,
    Table,
    Button,
    message
} from 'antd';
import { PlusOutlined, DeleteOutlined, DownloadOutlined } from '@ant-design/icons';

const { Panel } = Collapse;

const QuickViewTab = React.memo(({
    formData,
    lineItems,
    vendorId,
    vendorIdOptions,
    vendorNameOptions,
    memo,
    selectedVendorDetails,
    isDuplicateError,
    disableInputs,
    disabledStyle,
    getCurrencySymbol,
    extractValue,
    parseCurrencyValue,
    renderFieldInput,
    handleInputChange,
    handleLineItemChange,
    handleAddLineItem,
    setVendorId,
    setMemo,
    debouncedVendorIdSearch,
    debouncedVendorNameSearch,
    handleVendorChange,
    skipNextVendorLookup,
    exportToExcel,
    lineItemColumns,
    readOnly,
    isCodingData = false
}) => {
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
    ), [selectedVendorDetails, disabledStyle]);

    // Memoize table data source
    const tableDataSource = useMemo(() => {
        const data = [];
        lineItems.forEach((item, index) => {
            const desc = (extractValue(item.Description) || item.Description || '').toString().trim();
            const isSystemRow = ['Total GST', 'Total GST (Ineligible)', 'TDS Deduction'].includes(desc);
            if (!isSystemRow) {
                data.push({ ...item, key: `item_${index}` });
            }
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

            const calculatedSubtotal = lineItems.reduce((sum, item) => {
                const net = parseCurrencyValue(
                    extractValue(item.NetAmount) ||
                    extractValue(item.amount) ||
                    extractValue(item.net_amount) ||
                    item.amount ||
                    item.net_amount
                );
                return sum + net;
            }, 0);

            // Use extracted subtotal if it differs from calculated
            const extractedSubtotal = parseCurrencyValue(extractValue(formData['Subtotal']));
            const subtotal = (extractedSubtotal > 0 && Math.abs(calculatedSubtotal - extractedSubtotal) > 0.01)
                ? extractedSubtotal : calculatedSubtotal;

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
    }, [lineItems, formData, selectedVendorDetails, extractValue, parseCurrencyValue, isCodingData]);

    return (
        <div style={{ padding: '20px' }}>
            <Collapse defaultActiveKey={['header', 'vendor_details', 'lineitems']}>
                <Panel header="Header" key="header">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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

                        {/* Exchange Rate - Only if not USD */}
                        {extractValue(formData['Invoice Currency']) !== 'USD' && (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '350px 1fr',
                                gap: '16px',
                                alignItems: 'center'
                            }}>
                                <div style={{ fontWeight: 500 }}>Exchange Rate:</div>
                                <div>
                                    <InputNumber
                                        style={{ width: '100%', ...disabledStyle }}
                                        value={formData.exchangeRate}
                                        onChange={(val) => handleInputChange('exchangeRate', val)}
                                        placeholder="Enter exchange rate"
                                        disabled={disableInputs}
                                    />
                                </div>
                            </div>
                        )}

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

                {/* Vendor Master Details */}
                {vendorMasterDetailsPanel}

                {/* Line Items */}
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
            </Collapse>
        </div>
    );
});

QuickViewTab.displayName = 'QuickViewTab';

export default QuickViewTab;