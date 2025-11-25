import React, { useState } from 'react';
import { Upload, Button, message, Table, Tag, Space, Modal } from 'antd';
import { UploadOutlined, InboxOutlined, EyeOutlined } from '@ant-design/icons';
import { invoiceService } from '../services/api';
import InvoiceUpload from '../components/InvoiceUpload';
import InvoiceReview from '../components/InvoiceReview';
import '../styles/InvoicePage.css';
import Dragger from 'antd/es/upload/Dragger';
import { useNavigate } from 'react-router-dom';


const InvoicePage = () => {
    const navigate = useNavigate();
    const [fileList, setFileList] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(false);
    const [previewVisible, setPreviewVisible] = useState(false);
    const [previewData, setPreviewData] = useState(null);

    // Columns for invoices table
    const columns = [
        {
            title: 'Filename',
            dataIndex: 'original_filename',
            key: 'filename',
        },
        {
            title: 'Uploaded',
            dataIndex: 'uploaded_at',
            key: 'uploaded_at',
            render: (date) => new Date(date).toLocaleDateString(),
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (status) => {
                const statusColors = {
                    'waiting_approval': 'orange',
                    'approved': 'green',
                    'rejected': 'red',
                    'processed': 'blue'
                };
                return <Tag color={statusColors[status]}>{status.replace('_', ' ').toUpperCase()}</Tag>;
            },
        },
        {
            title: 'Confidence',
            dataIndex: 'confidence_score',
            key: 'confidence_score',
            render: (score) => (
                <Tag color={score === 'high' ? 'green' : score === 'medium' ? 'orange' : 'red'}>
                    {score?.toUpperCase() || 'LOW'}
                </Tag>
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space>
                    <Button
                        icon={<EyeOutlined />}
                        onClick={() => showInvoiceDetails(record)}
                        size="small"
                    >
                        View
                    </Button>
                </Space>
            ),
        },
    ];

    // const showInvoiceDetails = (invoice) => {
    //     setPreviewData(invoice);
    //     setPreviewVisible(true);
    // };

    const uploadProps = {
        name: 'file',
        multiple: true,
        fileList: fileList,
        beforeUpload: (file) => {
            // Add file to list without auto-uploading
            setFileList([...fileList, file]);
            return false; // Prevent auto upload
        },
        onRemove: (file) => {
            const index = fileList.indexOf(file);
            const newFileList = fileList.slice();
            newFileList.splice(index, 1);
            setFileList(newFileList);
        },
        accept: '.pdf',
    };

    const handleUpload = async () => {
        debugger
        if (fileList.length === 0) {
            message.warning('Please select files to upload');
            return;
        }

        setLoading(true);
        try {
            // for (const file of fileList) {
            // }
            const response = await invoiceService.uploadInvoice(fileList[0]);
            console.log("response", response);
            if (Object.values(response).length) {
                const { invoice_details } = response
                navigate('/invoice/review', {
                    state: {
                        invoice: {
                            // fileUrl: file instanceof File ? URL.createObjectURL(file) : file,
                            filename: 'Uploaded Invoice',
                            invoiceId: invoice_details?.invoice_number?.value,
                            vendorName: 'To be extracted',
                            uploadedBy: 'Current User',
                            lastUpdated: new Date().toLocaleString()
                        }
                    }
                });
            }
            message.success(`${fileList.length} file(s) uploaded successfully`);
            setFileList([]);
            loadInvoices(); // Refresh the invoices list
        } catch (error) {
            message.error('Upload failed. Please try again.');
            console.log("error in handleUpload  ", error);
        } finally {
            setLoading(false);
        }
    };

    const loadInvoices = async () => {
        try {
            const response = await invoiceService.getInvoices();
            setInvoices(response);
        } catch (error) {
            message.error('Failed to load invoices');
        }
    };

    // Load invoices on component mount
    React.useEffect(() => {
        loadInvoices();
    }, []);

    return (
        <div className="invoice-page">
            <div className="upload-container">
                <h2 className="upload-title">Upload Invoice Files - invoie page</h2>
                <p className="upload-description">
                    Drag and drop your invoice PDF files here or click to browse
                </p>

                <Dragger {...uploadProps} className="upload-dragger">
                    <p className="ant-upload-drag-icon">
                        <InboxOutlined />
                    </p>
                    <p className="ant-upload-text">Click or drag PDF files to this area to upload</p>
                    <p className="ant-upload-hint">
                        Support for single or bulk upload. Only PDF files are accepted.
                    </p>
                </Dragger>

                {fileList.length > 0 && (
                    <Button
                        type="primary"
                        onClick={handleUpload}
                        icon={<UploadOutlined />}
                        className="upload-submit-btn"
                        loading={loading}
                    >
                        Upload {fileList.length} File{fileList.length > 1 ? 's' : ''}
                    </Button>
                )}
            </div>
        </div>
    );
};

export default InvoicePage;