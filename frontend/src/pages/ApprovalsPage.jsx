import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Tag, Space, Modal, message } from 'antd';
import {
    EyeOutlined,
    DeleteOutlined,
    ExclamationCircleOutlined
} from '@ant-design/icons';
import { invoiceService } from '../services/api';

const { confirm } = Modal;

const ApprovalsPage = () => {
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

            // Fetch all invoices to get total count
            const response = await invoiceService.getInvoices(0, 1000);
            const invoicesArray = Array.isArray(response) ? response : [];

            // Transform backend data to table format
            const transformedData = invoicesArray.map((invoice) => ({
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
                status: invoice.status || 'pending',
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

    // Handle view invoice
    const handleView = (record) => {
        navigate('/invoice/review', { state: { invoice: record.rawData, readOnly: true } });
    };

    // Handle delete invoice
    const handleDelete = (record) => {
        confirm({
            title: 'Are you sure you want to delete this invoice?',
            icon: <ExclamationCircleOutlined />,
            content: `File: ${record.filename}`,
            okText: 'Yes, Delete',
            okType: 'danger',
            cancelText: 'Cancel',
            async onOk() {
                try {
                    await invoiceService.deleteInvoice(record.id);
                    message.success('Invoice deleted successfully');
                    fetchInvoices(pagination.current, pagination.pageSize);
                } catch (error) {
                    console.error('Error deleting invoice:', error);
                    message.error('Failed to delete invoice. Please try again.');
                }
            },
        });
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
                let color = 'default';
                let text = status;

                switch (status) {
                    case 'completed':
                    case 'approved':
                        color = 'success';
                        text = 'Completed';
                        break;
                    case 'waiting_approval':
                    case 'pending':
                        color = 'warning';
                        text = 'Pending';
                        break;
                    case 'error':
                    case 'failed':
                    case 'rejected':
                        color = 'error';
                        text = 'Error';
                        break;
                    case 'processing':
                        color = 'processing';
                        text = 'Processing';
                        break;
                    default:
                        color = 'default';
                }

                return <Tag color={color}>{text}</Tag>;
            },
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 180,
            render: (_, record) => (
                <Space size="small">
                    <Button
                        type="link"
                        icon={<EyeOutlined />}
                        onClick={() => handleView(record)}
                    >
                        View
                    </Button>
                    <Button
                        type="link"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete(record)}
                    >
                        Delete
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <div style={{ padding: '24px' }}>
            {/* <h1 style={{ marginBottom: '24px' }}>s</h1> */}
            <Table
                columns={columns}
                dataSource={data}
                loading={loading}
                pagination={pagination}
                onChange={handleTableChange}
                scroll={{ x: 'max-content' }}
                bordered
            />
        </div>
    );
};

export default ApprovalsPage;
