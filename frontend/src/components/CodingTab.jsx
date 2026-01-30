// src/components/CodingTab.jsx
import React, { useMemo } from 'react';
import { Collapse, Input, InputNumber, Select, Table, Button } from 'antd';
import { DeleteOutlined, DownloadOutlined } from '@ant-design/icons';

const { Panel } = Collapse;

const CodingTab = React.memo(({
    formData,
    codingLineItems,
    headerCoding,
    disableInputs,
    disabledStyle,
    getCurrencySymbol,
    extractValue,
    parseCurrencyValue,
    handleHeaderCodingChange,
    handleCodingLineItemChange,
    handleDeleteLineItem,
    exportToExcel
}) => {
    // Memoize header table data
    const headerData = useMemo(() => [{
        key: '1',
        vendorName: formData['Vendor Name']?.value || formData['Vendor Name'] || '',
        invoiceId: formData['Invoice Number']?.value || formData['Invoice Number'] || '',
        totalAmount: formData['Total Invoice Amount']?.value || formData['Total Invoice Amount'] || '',
        dueDate: formData['Due Date']?.value || formData['Due Date'] || '',
        paymentTerms: formData['Payment Terms']?.value || formData['Payment Terms'] || '',
        headerCoding: ''
    }], [formData]);

    // Memoize header columns
    const headerColumns = useMemo(() => [
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
    ], [getCurrencySymbol, parseCurrencyValue, disabledStyle, headerCoding, handleHeaderCodingChange, disableInputs]);

    // Memoize line item columns
    const lineItemColumns = useMemo(() => [
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
                    onChange={(value) => handleCodingLineItemChange(index, 'line_type', value)}
                    options={[
                        { value: 'Expense', label: 'Expense' },
                        { value: 'Asset', label: 'Asset' },
                        { value: 'Liability', label: 'Liability' },
                        { value: 'Tax', label: 'Tax' }
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
                    onChange={(value) => handleCodingLineItemChange(index, 'quantity', value)}
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
                    onChange={(value) => handleCodingLineItemChange(index, 'unit_price', value)}
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
                    onChange={(value) => handleCodingLineItemChange(index, 'net_amount', value)}
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
                    onChange={(e) => handleCodingLineItemChange(index, 'gl_code', e.target.value)}
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
    ], [codingLineItems, disableInputs, disabledStyle, handleCodingLineItemChange, handleDeleteLineItem]);

    // Memoize line items table data
    const lineItemsData = useMemo(() =>
        codingLineItems.map((item, index) => ({
            key: index,
            ...item
        }))
        , [codingLineItems]);

    return (
        <div style={{ padding: '20px' }}>
            <Collapse defaultActiveKey={['header', 'lineitems']}>
                <Panel header="Header" key="header">
                    <Table
                        key={getCurrencySymbol()}
                        columns={headerColumns}
                        dataSource={headerData}
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
                        columns={lineItemColumns}
                        dataSource={lineItemsData}
                        pagination={false}
                        scroll={{ x: 'max-content' }}
                        size="small"
                    />
                </Panel>
            </Collapse>
        </div>
    );
});

CodingTab.displayName = 'CodingTab';

export default CodingTab;