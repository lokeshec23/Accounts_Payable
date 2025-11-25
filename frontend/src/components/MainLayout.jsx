import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, message, Spin, Modal } from 'antd';
import { PlusOutlined, FolderOpenOutlined, EyeOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { invoiceService } from '../services/api';
import { useNavigate } from 'react-router-dom';
import InvoiceUpload from './InvoiceUpload';
import InvoiceReview from './InvoiceReview';
import '../styles/MainLayout.css';
import InvoicePage from '../pages/InvoicePage';

const { confirm } = Modal;

const MainLayout = () => {
    const navigate = useNavigate();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [pagination, setPagination] = useState({
        current: 1,
        pageSize: 10,
        total: 0,
    });
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Fetch invoices from backend
    const fetchInvoices = async (page = 1, pageSize = 10) => {
        try {
            setLoading(true);
            const skip = (page - 1) * pageSize;
            const response = await invoiceService.getInvoices(skip, pageSize);

            // Backend returns an array directly, not an object with invoices property
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
                rawData: invoice // Keep raw data for viewing
            }));

            setData(transformedData);
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

    const handleAddInvoice = () => {
        // setIsModalOpen(true);
        navigate('/invoice');
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
    };

    const handleUploadSuccess = (file) => {

        // Close the modal
        setIsModalOpen(false);
        // Navigate to review page with the uploaded file
        navigate('/invoice/review', {
            state: {
                invoice: {
                    fileUrl: file instanceof File ? URL.createObjectURL(file) : file,
                    filename: file.name || 'Uploaded Invoice',
                    invoiceId: 'NEW',
                    vendorName: 'To be extracted',
                    uploadedBy: 'Current User',
                    lastUpdated: new Date().toLocaleString()
                }
            }
        });
    };

    const handleViewFiles = () => {
        console.log('View Files clicked');
        message.info('View files functionality - to be implemented');
    };

    const handleView = (record) => {
        // Navigate to invoice review page with the record data
        navigate('/invoice/review', { state: { invoice: record } });
    };

    const handleDelete = (record) => {
        confirm({
            title: 'Are you sure you want to delete this invoice?',
            icon: <ExclamationCircleOutlined />,
            content: `Invoice: ${record.invoiceId} (${record.filename})`,
            okText: 'Yes, Delete',
            okType: 'danger',
            cancelText: 'Cancel',
            async onOk() {
                try {
                    await invoiceService.deleteInvoice(record.id);
                    message.success('Invoice deleted successfully');
                    // Refresh the list
                    fetchInvoices(pagination.current, pagination.pageSize);
                } catch (error) {
                    console.error('Error deleting invoice:', error);
                    message.error('Failed to delete invoice. Please try again.');
                }
            },
        });
    };

    return (
        <div className="main-layout">
            <div className="layout-header">
                <h1 className="layout-title">Invoices</h1>
                <div className="layout-actions">
                    <Button
                        type="default"
                        icon={<FolderOpenOutlined />}
                        onClick={handleViewFiles}
                        className="view-files-btn"
                    >
                        View Files
                    </Button>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={handleAddInvoice}
                        className="add-invoice-btn"
                    >
                        Add Invoice
                    </Button>
                </div>
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

            <Modal
                title="Upload Invoice"
                open={isModalOpen}
                onCancel={handleCloseModal}
                footer={null}
                width={700}
                destroyOnClose
            >
                <InvoiceUpload onUploadSuccess={handleUploadSuccess} />
            </Modal>
        </div>
    );
};

export default MainLayout;