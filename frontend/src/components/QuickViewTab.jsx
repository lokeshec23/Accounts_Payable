import React, { useMemo, useState } from 'react';
import {
    Collapse,
    Input,
    InputNumber,
    Select,
    AutoComplete,
    DatePicker,
    Table,
    Button,
    message,
    Modal,
    Descriptions
} from 'antd';
import { PlusOutlined, DeleteOutlined, DownloadOutlined, EyeOutlined } from '@ant-design/icons';

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
    isAmountMismatch,
    calculationDetails,
    isCodingData = false
}) => {
    const [showDetails, setShowDetails] = useState(false);
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

    console.log("DEBUG: QuickViewTab render", { lineItemsCount: lineItems?.length, hasFormData: !!formData, readOnly });

    // Memoize table data source
    const tableDataSource = useMemo(() => {
        const data = [];
        const safeLineItems = Array.isArray(lineItems) ? lineItems : [];

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

        console.log("DEBUG: QuickViewTab tableDataSource", { itemsCount: data.length, totalTaxAmount });

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

            const safeLineItems = Array.isArray(lineItems) ? lineItems : [];
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
    }, [lineItems, formData, selectedVendorDetails, extractValue, parseCurrencyValue, isCodingData]);

    try {
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
                                            const vName = option.vendor['vendor_name'] || option.vendor['VendorName'] || option.vendor['Name'] || option.vendor['VENDOR_NAME'];
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
                                    {renderFieldInput ? renderFieldInput('Invoice Number', formData['Invoice Number']) : <span>{extractValue(formData['Invoice Number'])}</span>}
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
                                <div>{renderFieldInput ? renderFieldInput('Invoice Date', formData['Invoice Date']) : <span>{extractValue(formData['Invoice Date'])}</span>}</div>
                            </div>

                            {/* Due Date */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '350px 1fr',
                                gap: '16px',
                                alignItems: 'center'
                            }}>
                                <div style={{ fontWeight: 500 }}>Due Date:</div>
                                <div>{renderFieldInput ? renderFieldInput('Due Date', formData['Due Date']) : <span>{extractValue(formData['Due Date'])}</span>}</div>
                            </div>

                            {/* Payment Terms */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '350px 1fr',
                                gap: '16px',
                                alignItems: 'center',
                            }}>
                                <div style={{ fontWeight: 500 }}>Payment Terms:</div>
                                <div>{renderFieldInput ? renderFieldInput('Payment Terms', formData['Payment Terms']) : <span>{extractValue(formData['Payment Terms'])}</span>}</div>
                            </div>

                            {/* Invoice Currency */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '350px 1fr',
                                gap: '16px',
                                alignItems: 'center'
                            }}>
                                <div style={{ fontWeight: 500 }}>Invoice Currency:</div>
                                <div>{renderFieldInput ? renderFieldInput('Invoice Currency', formData['Invoice Currency']) : <span>{extractValue(formData['Invoice Currency'])}</span>}</div>
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

                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '350px 1fr',
                                gap: '16px',
                                alignItems: 'start'
                            }}>
                                <div style={{ fontWeight: 500, marginTop: '8px' }}>Total Invoice Amount:</div>
                                <div style={{ width: '100%' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ flex: 1 }}>
                                            {renderFieldInput ? renderFieldInput('Total Invoice Amount', formData['Total Invoice Amount']) : <span>{extractValue(formData['Total Invoice Amount'])}</span>}
                                        </div>
                                        <Button
                                            icon={<EyeOutlined />}
                                            type="text"
                                            onClick={() => setShowDetails(true)}
                                            title="View calculation details"
                                            style={{ color: '#1890ff' }}
                                        />
                                    </div>
                                    {isAmountMismatch && (
                                        <div style={{ color: '#faad14', fontSize: '12px', marginTop: '4px' }}>
                                            ⚠️ Invoice amount in bill is not matched with calculated totals.
                                        </div>
                                    )}
                                </div>
                            </div>

                            <Modal
                                title="Total Invoice Amount - Calculation Details"
                                open={showDetails}
                                onOk={() => setShowDetails(false)}
                                onCancel={() => setShowDetails(false)}
                                width={600}
                            >
                                <Descriptions bordered column={1} size="small">
                                    <Descriptions.Item label="Line Items (Subtotal)">
                                        {getCurrencySymbol()} {calculationDetails?.lineItemsTotal?.toFixed(2)}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Total Tax (GST/VAT)">
                                        {getCurrencySymbol()} {calculationDetails?.totalTax?.toFixed(2)}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Extracted Subtotal (if different)">
                                        {getCurrencySymbol()} {calculationDetails?.extractedSubtotal?.toFixed(2)}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Amount Paid">
                                        {getCurrencySymbol()} {calculationDetails?.amountPaid?.toFixed(2)}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Shipping / Handling / Fees">
                                        {getCurrencySymbol()} {calculationDetails?.shipping?.toFixed(2)}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Surcharges">
                                        {getCurrencySymbol()} {calculationDetails?.surcharges?.toFixed(2)}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="TDS Rate (from Vendor)">
                                        {(calculationDetails?.tdsAmount / calculationDetails?.lineItemsTotal * 100 || 0).toFixed(2)}%
                                    </Descriptions.Item>
                                    <Descriptions.Item label="TDS Deduction Amount" labelStyle={{ color: '#ff4d4f' }}>
                                        - {getCurrencySymbol()} {calculationDetails?.tdsAmount?.toFixed(2)}
                                    </Descriptions.Item>
                                </Descriptions>

                                <div style={{ marginTop: '20px', padding: '12px', backgroundColor: 'var(--bg-content, #f5f5f5)', borderRadius: '4px' }}>
                                    <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Payable Amount Derivation:</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span>Base Invoice Total Used:</span>
                                        <span>{getCurrencySymbol()} {calculationDetails?.baseTotalUsed?.toFixed(2)}</span>
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#8c8c8c', marginBottom: '8px', textAlign: 'right' }}>
                                        (via {calculationDetails?.baseTotalSource})
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ff4d4f', marginBottom: '4px' }}>
                                        <span>Less TDS Deduction:</span>
                                        <span>- {getCurrencySymbol()} {calculationDetails?.tdsAmount?.toFixed(2)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #d9d9d9', paddingTop: '4px', fontWeight: 'bold' }}>
                                        <span>Total Amount Payable:</span>
                                        <span>{getCurrencySymbol()} {((calculationDetails?.baseTotalUsed || 0) - (calculationDetails?.tdsAmount || 0)).toFixed(2)}</span>
                                    </div>
                                </div>

                                <div style={{ marginTop: '20px' }}>
                                    <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>Heuristic Calculations:</div>
                                    <div style={{ padding: '4px 0' }}>
                                        <b>1. Line Items + Tax:</b> {getCurrencySymbol()} {calculationDetails?.calc1?.toFixed(2)}
                                    </div>
                                    <div style={{ padding: '4px 0' }}>
                                        <b>2. Subtotal + Tax:</b> {getCurrencySymbol()} {calculationDetails?.calc2?.toFixed(2)}
                                    </div>
                                    <div style={{ padding: '4px 0' }}>
                                        <b>3. Total Reconciliation:</b> {getCurrencySymbol()} {calculationDetails?.calc3?.toFixed(2)}
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
                                    <b>Extraction Value:</b> {getCurrencySymbol()} {calculationDetails?.currentTotal?.toFixed(2)}
                                    <div style={{ fontSize: '12px' }}>
                                        {isAmountMismatch
                                            ? "❌ Mismatch detected: The extracted amount does not match any heuristic calculation."
                                            : "✅ Match found: The extracted amount matches one of the heuristic calculations."}
                                    </div>
                                </div>
                            </Modal>

                            {/* Total Amount Payable */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '350px 1fr',
                                gap: '16px',
                                alignItems: 'center'
                            }}>
                                <div style={{ fontWeight: 500 }}>Total Amount Payable:</div>
                                <div>{renderFieldInput ? renderFieldInput('Total Amount Payable', formData['Total Amount Payable']) : <span>{extractValue(formData['Total Amount Payable'])}</span>}</div>
                            </div>

                            {/* Amount Paid */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '350px 1fr',
                                gap: '16px',
                                alignItems: 'center'
                            }}>
                                <div style={{ fontWeight: 500 }}>Amount Paid:</div>
                                <div>{renderFieldInput ? renderFieldInput('Amount Paid', formData['Amount Paid']) : <span>{extractValue(formData['Amount Paid'])}</span>}</div>
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
                            background: 'var(--bg-content, #f0f2f5)',
                            borderRadius: '6px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            alignItems: 'flex-end',
                            borderTop: '1px solid #d9d9d9'
                        }}>
                            <div style={{ textAlign: 'right' }}>
                                <span style={{ fontSize: '13px', color: '#8c8c8c', marginRight: '12px' }}>Total Sum of Line Items <sub>( Excl GST )</sub>:</span>
                                <span style={{ fontSize: '16px', fontWeight: 500, color: '#595959' }}>
                                    {getCurrencySymbol()} {(Array.isArray(lineItems) ? lineItems : []).reduce((sum, item) => {
                                        if (!item) return sum;
                                        return sum + parseCurrencyValue(
                                            extractValue(item.NetAmount) ||
                                            extractValue(item.amount) ||
                                            extractValue(item.net_amount) ||
                                            item.amount ||
                                            item.net_amount
                                        );
                                    }, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                            <div style={{ textAlign: 'right', borderTop: '1px solid #d9d9d9', paddingTop: '8px', width: '100%', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '14px', color: '#595959' }}>Total Amount Payable:</span>
                                <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#1890ff' }}>
                                    {getCurrencySymbol()} {parseCurrencyValue(extractValue(formData['Total Amount Payable'])).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                    </Panel>
                </Collapse>
            </div>
        );
    } catch (err) {
        console.error("CRITICAL: QuickViewTab render crash", err);
        return <div style={{ padding: '20px', color: 'red' }}>Error rendering Quick View. Check console.</div>;
    }
});

QuickViewTab.displayName = 'QuickViewTab';

export default QuickViewTab;