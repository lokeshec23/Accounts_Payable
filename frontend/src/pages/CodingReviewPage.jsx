import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Table, Input, InputNumber, Select, message, Collapse } from 'antd';
const { Panel } = Collapse;
import { ArrowLeftOutlined, SendOutlined, DeleteOutlined } from '@ant-design/icons';
import PdfViewerWithHighlight from '../components/PdfViewerWithHighlight';
import { invoiceService, codingService } from '../services/api';

const CodingReviewPage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const invoiceData = location.state?.invoice;

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

    const disabledStyle = {
        color: 'black',
        backgroundColor: 'white',
        opacity: 1
    };

    // Fetch PDF blob
    useEffect(() => {
        const fetchPdf = async () => {
            if (!invoiceData?.id) return;

            try {
                setLoadingPdf(true);
                // Use getPdfBlob to handle authentication (Bearer token)
                const blobUrl = await invoiceService.getPdfBlob(invoiceData.id);
                setPdfUrl(blobUrl);
            } catch (error) {
                console.error('Error fetching PDF:', error);
                // Fallback to direct URL if blob fetch fails
                const fallbackUrl = invoiceData.fileUrl || invoiceData.rawData?.file_url || invoiceService.getPdfUrl(invoiceData.id);
                setPdfUrl(fallbackUrl);
            } finally {
                setLoadingPdf(false);
            }
        };

        fetchPdf();

        // Cleanup blob URL
        return () => {
            if (pdfUrl && pdfUrl.startsWith('blob:')) {
                URL.revokeObjectURL(pdfUrl);
            }
        };
    }, [invoiceData?.id]);

    // Extract line items from invoice data
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
                cost_center: '',
                project_code: ''
            }));
            setCodingLineItems(items);
        }
    }, [invoiceData]);

    // Load existing coding data if available
    useEffect(() => {
        const loadCodingData = async () => {
            if (!invoiceData?.id) return;

            try {
                const response = await codingService.getCoding(invoiceData.id);
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
                console.log('No existing coding data found');
            }
        };

        loadCodingData();
    }, [invoiceData?.id]);

    const handleHeaderCodingChange = (value) => {
        setHeaderCoding(value);
    };

    const handleCodingLineItemChange = (index, field, value) => {
        const newItems = [...codingLineItems];
        newItems[index][field] = value;
        setCodingLineItems(newItems);
    };

    const handleDeleteLineItem = (index) => {
        const newItems = codingLineItems.filter((_, i) => i !== index);
        setCodingLineItems(newItems);
        message.success('Line item deleted');
    };

    const handleSendToApproval = async () => {
        try {
            setSaving(true);

            // Clean line items - remove React-specific fields like 'key' and ensure proper data types
            const cleanedLineItems = codingLineItems.map(({ key, ...item }) => ({
                s_no: parseInt(item.s_no) || 0,
                description: String(item.description || ''),
                line_type: String(item.line_type || 'Expense'),
                quantity: parseFloat(item.quantity) || 0,
                unit_price: parseFloat(item.unit_price) || 0,
                net_amount: parseFloat(item.net_amount) || 0,
                gl_code: String(item.gl_code || ''),
                cost_center: String(item.cost_center || ''),
                project_code: String(item.project_code || '')
            }));

            // Save coding data
            const codingData = {
                invoice_id: invoiceData.id,
                header_coding: headerCoding,
                line_items: cleanedLineItems
            };

            await codingService.saveCoding(codingData);

            // Update invoice status to waiting_approval
            await invoiceService.updateInvoiceStatus(invoiceData.id, 'waiting_approval');

            message.success('Invoice sent to approval successfully!');
            navigate('/approvals');
        } catch (error) {
            console.error('Error sending to approval:', error);
            console.error('Error details:', error.response?.data);

            let errorMessage = 'Failed to send to approval';
            if (error.response?.data?.detail) {
                if (Array.isArray(error.response.data.detail)) {
                    // Handle array of validation errors
                    errorMessage += ': ' + error.response.data.detail.map(err =>
                        `${err.loc?.join(' -> ')}: ${err.msg}`
                    ).join(', ');
                } else {
                    // Handle single error message
                    errorMessage += ': ' + error.response.data.detail;
                }
            } else {
                errorMessage += ': ' + (error.message || 'Unknown error');
            }

            message.error(errorMessage);
        } finally {
            setSaving(false);
        }
    };

    // Handle dragging
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
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    // Header coding table configuration
    const headerColumns = [
        {
            title: 'File Name',
            dataIndex: 'filename',
            key: 'filename',
            width: '20%',
            render: (text) => <Input value={text} disabled style={disabledStyle} />
        },
        {
            title: 'Invoice ID',
            dataIndex: 'invoice_id',
            key: 'invoice_id',
            width: '15%',
            render: (text) => <Input value={text} disabled style={disabledStyle} />
        },
        {
            title: 'Total Amount',
            dataIndex: 'total_amount',
            key: 'total_amount',
            width: '15%',
            render: (text) => <Input value={text} disabled style={disabledStyle} />
        },
        {
            title: 'Amount Due',
            dataIndex: 'amount_due',
            key: 'amount_due',
            width: '15%',
            render: (text) => <Input value={text} disabled style={disabledStyle} />
        },
        {
            title: 'Due Date',
            dataIndex: 'due_date',
            key: 'due_date',
            width: '10%',
            render: (text) => <Input value={text} disabled style={disabledStyle} />
        },
        {
            title: 'Header Coding',
            dataIndex: 'header_coding',
            key: 'header_coding',
            width: '35%',
            render: () => (
                <Input.TextArea
                    value={headerCoding}
                    onChange={(e) => handleHeaderCodingChange(e.target.value)}
                    placeholder="Enter header coding"
                    rows={1}
                    autoSize={{ minRows: 1, maxRows: 4 }}
                    style={{ width: '100%' }}
                />
            )
        }
    ];

    const headerDataSource = [
        {
            key: '1',
            filename: invoiceData?.filename || invoiceData?.vendorName || '',
            invoice_id: invoiceData?.invoiceId || '',
            total_amount: invoiceData?.rawData?.extracted_data?.amounts?.total_invoice_amount?.value || '',
            amount_due: invoiceData?.rawData?.extracted_data?.amounts?.amount_due?.value || '',
            due_date: invoiceData?.rawData?.extracted_data?.invoice_details?.due_date?.value || '',
            header_coding: headerCoding
        }
    ];

    // Line items coding table columns
    const lineItemColumns = [
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
                    disabled
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
                    style={{ width: '100%' }}
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
                    style={{ width: '100%' }}
                    min={0}
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
                    style={{ width: '100%' }}
                    min={0}
                    precision={2}
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
                    style={{ width: '100%' }}
                    min={0}
                    precision={2}
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
                />
            )
        },
        {
            title: 'Cost Center',
            dataIndex: 'cost_center',
            key: 'cost_center',
            width: '10%',
            render: (text, record, index) => (
                <Input
                    value={codingLineItems[index]?.cost_center || ''}
                    placeholder="Cost Center"
                    onChange={(e) =>
                        handleCodingLineItemChange(
                            index,
                            'cost_center',
                            e.target.value
                        )
                    }
                />
            )
        },
        {
            title: 'Project Code',
            dataIndex: 'project_code',
            key: 'project_code',
            width: '10%',
            render: (text, record, index) => (
                <Input
                    value={codingLineItems[index]?.project_code || ''}
                    placeholder="Project Code"
                    onChange={(e) =>
                        handleCodingLineItemChange(
                            index,
                            'project_code',
                            e.target.value
                        )
                    }
                />
            )
        },
        {
            title: 'Actions',
            key: 'actions',
            width: '8%',
            render: (_, record, index) => (
                <Button
                    type="link"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => handleDeleteLineItem(index)}
                >
                    Delete
                </Button>
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
                        extractedData={invoiceData?.extracted_data || invoiceData?.rawData?.extracted_data}
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

                {/* RIGHT SIDE: CODING CONTENT */}
                <div style={{
                    flex: 1,
                    overflow: 'auto',
                    background: 'white',
                    padding: '20px'
                }}>
                    {/* Header with Back Button and Send to Approval */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '20px',
                        paddingBottom: '16px',
                        borderBottom: '1px solid #f0f0f0'
                    }}>
                        <Button
                            icon={<ArrowLeftOutlined />}
                            onClick={() => navigate('/coding')}
                        >
                            Back to Coding
                        </Button>
                        <Button
                            type="primary"
                            icon={<SendOutlined />}
                            onClick={handleSendToApproval}
                            loading={saving}
                        >
                            Send to Approval
                        </Button>
                    </div>

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
                </div>
            </div>
        </div>
    );
};

export default CodingReviewPage;
