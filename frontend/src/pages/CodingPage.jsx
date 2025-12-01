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

            // Transform backend data to table format
            const transformedData = codingInvoices.map((invoice) => ({
                key: invoice._id || invoice.id,
                id: invoice._id || invoice.id,
                filename: invoice.original_filename || invoice.filename || 'N/A',
                vendorName: invoice.extracted_data?.vendor_info?.name?.value || 'N/A',
                invoiceId: invoice.extracted_data?.invoice_details?.invoice_number?.value || 'N/A',
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
            title: 'File Name',
            dataIndex: 'filename',
            key: 'filename',
            width: 250,
            ellipsis: true,
        },
        {
            title: 'Vendor Name',
            dataIndex: 'vendorName',
            key: 'vendorName',
            width: 180,
        },
        {
            title: 'Invoice ID',
            dataIndex: 'invoiceId',
            key: 'invoiceId',
            width: 180,
        },
        {
            title: 'Last Updated',
            dataIndex: 'lastUpdated',
            key: 'lastUpdated',
            width: 200,
        },
        {
            title: 'Uploaded By',
            dataIndex: 'uploadedBy',
            key: 'uploadedBy',
            width: 180,
            ellipsis: true,
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            width: 130,
            render: (status) => {
                let color = 'processing';
                let text = 'Coding';

                if (status === 'waiting_coding') {
                    color = 'warning';
                    text = 'Waiting Coding';
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
                <h1 className="layout-title">Coding</h1>
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
                        scroll={{ x: 1300 }}
                    />
                </Spin>
            </div>
        </div>
    );
};

export default CodingPage;
