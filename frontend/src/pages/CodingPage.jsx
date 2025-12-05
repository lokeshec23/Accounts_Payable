import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Tag, Space, Spin, message } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { invoiceService } from '../services/api';
import '../styles/MainLayout.css';

const CodingPage = () => {
    const navigate = useNavigate();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [pagination, setPagination] = useState({
        current: 1,
        pageSize: 10,
        total: 0,
    });

    const [allCodingInvoices, setAllCodingInvoices] = useState([]);

    // Fetch invoices from backend
    const fetchInvoices = async (page = 1, pageSize = 10) => {
        try {
            setLoading(true);

            // Fetch all invoices
            const response = await invoiceService.getInvoices(0, 1000);
            const invoicesArray = Array.isArray(response) ? response : [];

            // Filter only coding status invoices
            const codingInvoices = invoicesArray.filter(inv =>
                inv.status === 'coding' || inv.status === 'waiting_coding'
            );

            setAllCodingInvoices(codingInvoices);

            // Transform backend data to table format
            const transformedData = codingInvoices.map((invoice) => ({
                key: invoice._id || invoice.id,
                id: invoice._id || invoice.id,
                filename: invoice.original_filename || invoice.filename || 'N/A',
                vendorName: invoice.extracted_data?.vendor_info?.name?.value || 'N/A',
                invoiceId: invoice.extracted_data?.invoice_details?.invoice_number?.value || 'N/A',
                totalAmount: invoice.extracted_data?.amounts?.total_invoice_amount?.value || '',
                amountDue: invoice.extracted_data?.amounts?.amount_due?.value || '',
                lastUpdated: new Date(invoice.processed_at || invoice.uploaded_at).toLocaleString('en-US', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                }),
                uploadedBy: invoice.uploaded_by || 'Unknown',
                status: invoice.status || 'coding',
                fileUrl: invoice.file_url || '/sample-invoice.pdf',
                rawData: invoice
            }));

            // Calculate pagination
            const startIndex = (page - 1) * pageSize;
            const endIndex = startIndex + pageSize;
            const paginatedData = transformedData.slice(startIndex, endIndex);

            setData(paginatedData);
            setPagination({
                current: page,
                pageSize: pageSize,
                total: transformedData.length,
            });
        } catch (error) {
            console.error('Error fetching invoices:', error);
            message.error('Failed to load invoices. Please try again.');
            setData([]);
        } finally {
            setLoading(false);
        }
    };

    // Load invoices on component mount
    useEffect(() => {
        fetchInvoices();
    }, []);

    // Handle table pagination change
    const handleTableChange = (newPagination) => {
        fetchInvoices(newPagination.current, newPagination.pageSize);
    };

    const columns = [
        {
            title: 'S.No',
            key: 'sno',
            width: 70,
            render: (_, __, index) => {
                const { current, pageSize } = pagination;
                return (current - 1) * pageSize + index + 1;
            },
        },
        {
            title: 'Vendor Name',
            dataIndex: 'vendorName',
            key: 'vendorName',
            width: 180,
            sorter: (a, b) => (a.vendorName || '').localeCompare(b.vendorName || ''),
            filterSearch: true,
            filters: [...new Set(allCodingInvoices.map(inv => inv.vendorName).filter(Boolean))].map(name => ({ text: name, value: name })),
            onFilter: (value, record) => record.vendorName === value,
        },
        {
            title: 'Invoice ID',
            dataIndex: 'invoiceId',
            key: 'invoiceId',
            width: 180,
            sorter: (a, b) => (a.invoiceId || '').localeCompare(b.invoiceId || ''),
            filterSearch: true,
            filters: [...new Set(allCodingInvoices.map(inv => inv.invoiceId).filter(Boolean))].map(id => ({ text: id, value: id })),
            onFilter: (value, record) => record.invoiceId === value,
        },
        {
            title: 'Total Amount',
            dataIndex: 'totalAmount',
            key: 'totalAmount',
            width: 150,
            sorter: (a, b) => (parseFloat(a.totalAmount) || 0) - (parseFloat(b.totalAmount) || 0),
            render: (val) => {
                if (!val) return '-';
                const strVal = val.toString();
                return strVal.startsWith('$') ? strVal : `$${strVal}`;
            },
        },
        {
            title: 'Amount Due',
            dataIndex: 'amountDue',
            key: 'amountDue',
            width: 150,
            sorter: (a, b) => (parseFloat(a.amountDue) || 0) - (parseFloat(b.amountDue) || 0),
            render: (val) => {
                if (!val) return '-';
                const strVal = val.toString();
                return strVal.startsWith('$') ? strVal : `$${strVal}`;
            },
        },
        {
            title: 'Last Updated',
            dataIndex: 'lastUpdated',
            key: 'lastUpdated',
            width: 200,
            sorter: (a, b) => new Date(a.lastUpdated) - new Date(b.lastUpdated),
        },
        {
            title: 'Uploaded By',
            dataIndex: 'uploadedBy',
            key: 'uploadedBy',
            width: 180,
            ellipsis: true,
            sorter: (a, b) => (a.uploadedBy || '').localeCompare(b.uploadedBy || ''),
            filterSearch: true,
            filters: [...new Set(allCodingInvoices.map(inv => inv.uploadedBy).filter(Boolean))].map(user => ({ text: user, value: user })),
            onFilter: (value, record) => record.uploadedBy === value,
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            width: 130,
            sorter: (a, b) => (a.status || '').localeCompare(b.status || ''),
            filters: [
                { text: 'Coding', value: 'coding' },
                { text: 'Coding', value: 'waiting_coding' },
            ],
            onFilter: (value, record) => record.status === value,
            render: (status) => {
                let color = 'orange';
                let text = 'Coding';

                if (status === 'waiting_coding') {
                    color = 'orange';
                    text = 'Coding';
                }

                return <Tag color={color}>{text}</Tag>;
            },
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 100,
            render: (_, record) => (
                <Space size="small">
                    <Button
                        type="link"
                        icon={<EyeOutlined />}
                        onClick={() => handleView(record)}
                    >
                        View
                    </Button>
                </Space>
            ),
        },
    ];

    const handleView = (record) => {
        // Navigate to coding review page with the record data
        navigate('/coding/review', { state: { invoice: record } });
    };

    return (
        <div className="main-layout">
            <div className="layout-header">
                {/* <h1 className="layout-title">Coding</h1> */}
            </div>

            <div className="layout-content">
                <Spin spinning={loading} tip="Loading invoices...">
                    <Table
                        columns={columns}
                        dataSource={data}
                        pagination={{
                            ...pagination,
                            showSizeChanger: true,
                            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
                            pageSizeOptions: ['5', '10', '20', '50']
                        }}
                        onChange={handleTableChange}
                        className="invoices-table"
                        scroll={{ x: 1300, y: 'calc(100vh - 320px)' }}
                    />
                </Spin>
            </div>
        </div>
    );
};

export default CodingPage;
