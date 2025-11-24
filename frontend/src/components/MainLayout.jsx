import React, { useState } from 'react';
import { Table, Button, Space, Modal } from 'antd';
import { PlusOutlined, FolderOpenOutlined, EyeOutlined, DeleteOutlined } from '@ant-design/icons';
import InvoiceUpload from './InvoiceUpload';
import InvoiceReview from './InvoiceReview';
import '../styles/MainLayout.css';

const MainLayout = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentView, setCurrentView] = useState('upload'); // 'upload' or 'review'
    const [uploadedFile, setUploadedFile] = useState(null);

    // Sample data for the table
    const [data] = useState([
        {
            key: '1',
            filename: '123456789_W2.json',
            vendorName: 'John Doe',
            invoiceId: 'INV-20250915-001',
            lastUpdated: '2025-09-14 10:45 AM',
            uploadedBy: 'John Doe',
            status: 'Completed'
        },
        {
            key: '2',
            filename: '12345_LoanFile.json',
            vendorName: 'Lando Norris',
            invoiceId: 'INV-20250914-005',
            lastUpdated: '2025-09-13 04:22 PM',
            uploadedBy: 'Emily Johnson',
            status: 'Pending'
        },
        {
            key: '3',
            filename: '12345_LoanFile1.json',
            vendorName: 'Lewis Hamilton',
            invoiceId: 'INV-20250913-009',
            lastUpdated: '2025-09-12 02:17 PM',
            uploadedBy: 'Michael Smith',
            status: 'Error'
        },
        {
            key: '4',
            filename: '12_CreditReport.json',
            vendorName: 'Max Verstappen',
            invoiceId: 'INV-20250912-003',
            lastUpdated: '2025-09-13 04:22 PM',
            uploadedBy: 'Daniel Miller',
            status: 'Completed'
        },
        {
            key: '5',
            filename: '123_TaxReturn.json',
            vendorName: 'Charles Leclerc',
            invoiceId: 'INV-20250911-007',
            lastUpdated: '2025-09-12 02:17 PM',
            uploadedBy: 'Ashley Davis',
            status: 'Error'
        }
    ]);

    const columns = [
        {
            title: 'File Name',
            dataIndex: 'filename',
            key: 'filename',
            width: 200,
        },
        {
            title: 'Vendor Name',
            dataIndex: 'vendorName',
            key: 'vendorName',
            width: 150,
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
            width: 180,
        },
        {
            title: 'Uploaded By',
            dataIndex: 'uploadedBy',
            key: 'uploadedBy',
            width: 150,
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 150,
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
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        // Reset state after closing
        setTimeout(() => {
            setCurrentView('upload');
            setUploadedFile(null);
        }, 300);
    };

    const handleUploadSuccess = (file) => {
        setUploadedFile(file);
        setCurrentView('review');
    };

    const handleBackToUpload = () => {
        setUploadedFile(null);
        setCurrentView('upload');
    };

    const handleViewFiles = () => {
        console.log('View Files clicked');
        // Add your logic here
    };

    const handleView = (record) => {
        console.log('View:', record);
        // Add your view logic here
    };

    const handleDelete = (record) => {
        console.log('Delete:', record);
        // Add your delete logic here
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
                <Table
                    columns={columns}
                    dataSource={data}
                    pagination={{
                        pageSize: 10,
                        showSizeChanger: true,
                        showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
                        pageSizeOptions: ['5', '10', '20', '50']
                    }}
                    className="invoices-table"
                />
            </div>

            <Modal
                title={null}
                open={isModalOpen}
                onCancel={handleCloseModal}
                footer={null}
                width={currentView === 'review' ? '95vw' : 700}
                style={{ top: currentView === 'review' ? 20 : 100 }}
                destroyOnClose
                bodyStyle={{ height: currentView === 'review' ? '85vh' : 'auto', padding: 0 }}
            >
                {currentView === 'upload' ? (
                    <div style={{ padding: '24px' }}>
                        <InvoiceUpload onUploadSuccess={handleUploadSuccess} />
                    </div>
                ) : (
                    <div style={{ height: '100%' }}>
                        <InvoiceReview file={uploadedFile} onBack={handleBackToUpload} />
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default MainLayout;