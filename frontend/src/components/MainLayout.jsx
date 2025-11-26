// src/components/MainLayout.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Tag, Space, Modal, Spin, message } from 'antd';
import {
    PlusOutlined,
    EyeOutlined,
    DeleteOutlined,
    FolderOpenOutlined,
    ExclamationCircleOutlined
} from '@ant-design/icons';
import InvoiceUpload from './InvoiceUpload';
import { invoiceService } from '../services/api';
import '../styles/MainLayout.css';

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
    const [isFieldsModalOpen, setIsFieldsModalOpen] = useState(false);
    const [viewFilesData, setViewFilesData] = useState([]);
    const [allInvoices, setAllInvoices] = useState([]);

    const fetchInvoices = async (page = 1, pageSize = 10) => {
        try {
            setLoading(true);

            const response = await invoiceService.getInvoices(0, 1000);
            const invoicesArray = Array.isArray(response) ? response : [];

            const transformedData = invoicesArray.map((invoice) => {
                const extracted = invoice.extracted_data || {};
                const vendorInfo = extracted.vendor_info || {};
                const invoiceDetails = extracted.invoice_details || {};
                const validation = invoice.validation_results || {};

                const getValue = (obj) => {
                    if (!obj) return '';
                    return obj.value !== null && obj.value !== undefined ? obj.value : '';
                };

                return {
                    key: invoice._id || invoice.id,
                    id: invoice._id || invoice.id,
                    filename: invoice.original_filename || invoice.filename || 'N/A',
                    vendorName: getValue(vendorInfo.name) || 'N/A',
                    invoiceId: getValue(invoiceDetails.invoice_number) || 'N/A',
                    lastUpdated: new Date(invoice.processed_at || invoice.uploaded_at).toLocaleString('en-US', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                    }),
                    uploadedBy: invoice.uploaded_by || 'Unknown',
                    status: invoice.status || 'waiting_approval',
                    fileUrl: invoice.file_url || '/sample-invoice.pdf',
                    approverName: validation.approver_name || '',
                    approvalTime: validation.approval_timestamp
                        ? new Date(validation.approval_timestamp).toLocaleString('en-US', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true
                        })
                        : '',
                    rawData: invoice
                };
            });

            setAllInvoices(transformedData);

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
            setAllInvoices([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInvoices();
    }, []);

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
            width: 150,
            render: (status) => {
                let color = 'default';
                let text = status;

                switch (status) {
                    case 'approved':
                        color = 'success';
                        text = 'Approved';
                        break;
                    case 'waiting_approval':
                        color = 'warning';
                        text = 'Waiting for Approval';
                        break;
                    case 'rejected':
                        color = 'error';
                        text = 'Rejected';
                        break;
                    case 'reworked':
                        color = 'processing';
                        text = 'Reworked';
                        break;
                    case 'processed':
                        color = 'success';
                        text = 'Processed';
                        break;
                    case 'pending':
                        color = 'warning';
                        text = 'Pending';
                        break;
                    default:
                        color = 'default';
                        text = status || 'Unknown';
                }

                return <Tag color={color}>{text}</Tag>;
            },
        },
        {
            title: 'Approver',
            dataIndex: 'approverName',
            key: 'approverName',
            width: 180,
            render: (val) => val || '-'
        },
        {
            title: 'Action Time',
            dataIndex: 'approvalTime',
            key: 'approvalTime',
            width: 200,
            render: (val) => val || '-'
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
        navigate('/invoice');
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
    };

    const handleUploadSuccess = (file) => {
        setIsModalOpen(false);
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

    const handleViewFiles = async () => {
        try {
            setLoading(true);
            const response = await invoiceService.getInvoices(0, 1000);
            const invoicesArray = Array.isArray(response) ? response : [];

            const transformedInvoices = invoicesArray.map((invoice, index) => {
                const extracted = invoice.extracted_data || {};
                const vendorInfo = extracted.vendor_info || {};
                const clientInfo = extracted.client_info || {};
                const invoiceDetails = extracted.invoice_details || {};
                const servicePeriod = extracted.service_period || {};
                const amounts = extracted.amounts || {};
                const additionalInfo = extracted.additional_info || {};
                const validation = invoice.validation_results || {};

                const getValue = (obj) => {
                    if (!obj) return '';
                    return obj.value !== null && obj.value !== undefined ? obj.value : '';
                };

                return {
                    key: invoice._id || invoice.id || index,
                    sno: index + 1,
                    filename: invoice.original_filename || invoice.filename || '',
                    vendorName: getValue(vendorInfo.name),
                    vendorAddress: getValue(vendorInfo.address),
                    vendorCountry: getValue(vendorInfo.country),
                    vendorTaxId: getValue(vendorInfo.tax_id),
                    vendorEmail: getValue(vendorInfo.contact_email),
                    vendorPhone: getValue(vendorInfo.phone),
                    vendorBankName: getValue(vendorInfo.bank_name),
                    vendorBankAccount: getValue(vendorInfo.bank_account_number),
                    vendorBankDetails: getValue(vendorInfo.bank_details),
                    vendorContactPerson: getValue(vendorInfo.contact_person),
                    vendorWebsite: getValue(vendorInfo.website),

                    clientName: getValue(clientInfo.name),
                    billingAddress: getValue(clientInfo.billing_address),
                    shippingAddress: getValue(clientInfo.shipping_address),
                    phoneNumber: getValue(clientInfo.phone),
                    emailAddress: getValue(clientInfo.email),
                    clientTaxId: getValue(clientInfo.tax_id),
                    contactPerson: getValue(clientInfo.contact_person),

                    invoiceNumber: getValue(invoiceDetails.invoice_number),
                    invoiceDate: getValue(invoiceDetails.invoice_date),
                    dueDate: getValue(invoiceDetails.due_date),
                    invoiceCurrency: getValue(invoiceDetails.currency),
                    invoiceType: getValue(invoiceDetails.type),
                    poNumber: getValue(invoiceDetails.po_number),
                    paymentTerms: getValue(invoiceDetails.payment_terms),
                    paymentMethod: getValue(invoiceDetails.payment_method),
                    costCenter: getValue(invoiceDetails.cost_center),
                    servicePeriodStart: getValue(servicePeriod.start_date),
                    servicePeriodEnd: getValue(servicePeriod.end_date),

                    description: extracted.Items?.value?.[0]?.description?.value || '',
                    itemCode: extracted.Items?.value?.[0]?.item_number?.value || '',
                    quantity: extracted.Items?.value?.[0]?.quantity?.value || '',
                    uom: extracted.Items?.value?.[0]?.unit_of_measure?.value || '',
                    unitPrice: extracted.Items?.value?.[0]?.unit_price?.value || '',
                    discount: extracted.Items?.value?.[0]?.discount?.value || '',
                    netAmount: extracted.Items?.value?.[0]?.amount?.value || '',
                    taxRate: extracted.Items?.value?.[0]?.tax_rate?.value || '',
                    taxAmount: extracted.Items?.value?.[0]?.tax?.value || '',
                    grossAmount: extracted.Items?.value?.[0]?.gross_amount?.value || '',

                    totalTaxAmount: getValue(amounts.total_tax_amount),
                    taxTypeBreakdown: getValue(amounts.tax_type_breakdown),
                    withholdingTax: getValue(amounts.withholding_tax),

                    subtotal: getValue(amounts.subtotal),
                    shippingFees: getValue(amounts.shipping_handling_fees),
                    surcharges: getValue(amounts.surcharges),
                    totalInvoiceAmount: getValue(amounts.total_invoice_amount),
                    amountPaid: getValue(amounts.amount_paid),
                    amountDue: getValue(amounts.amount_due),

                    notesTerms: getValue(additionalInfo.notes_terms),
                    qrCode: getValue(additionalInfo.qr_code_irn),
                    companyRegNumber: getValue(additionalInfo.company_registration_number),

                    approvalWorkflowId: '',
                    approvalRequired: '',
                    approverList: '',
                    approvalStatus: invoice.status || '',
                    approvalTimestamps: validation.approval_timestamp
                        ? new Date(validation.approval_timestamp).toLocaleString()
                        : (invoice.processed_at ? new Date(invoice.processed_at).toLocaleString() : ''),
                    approverName: validation.approver_name || ''
                };
            });

            setViewFilesData(transformedInvoices);
            setIsFieldsModalOpen(true);
        } catch (error) {
            console.error('Error fetching invoices for view files:', error);
            message.error('Failed to load invoice data');
        } finally {
            setLoading(false);
        }
    };

    const handleView = (record) => {
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
                        scroll={{ x: 1600 }}
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

            <Modal
                title="Invoice Fields Reference"
                open={isFieldsModalOpen}
                onCancel={() => setIsFieldsModalOpen(false)}
                footer={null}
                width="95%"
                destroyOnClose
                centered
            >
                <Table
                    dataSource={viewFilesData}
                    columns={[
                        {
                            title: 'S.No',
                            key: 'sno',
                            width: 70,
                            fixed: 'left',
                            render: (_, __, index) => index + 1,
                        },
                        {
                            title: 'Filename',
                            dataIndex: 'filename',
                            key: 'filename',
                            width: 200,
                            fixed: 'left',
                        },
                        { title: 'Vendor Name', dataIndex: 'vendorName', key: 'vendorName', width: 150 },
                        { title: 'Vendor Address', dataIndex: 'vendorAddress', key: 'vendorAddress', width: 200 },
                        { title: 'Vendor Country', dataIndex: 'vendorCountry', key: 'vendorCountry', width: 120 },
                        { title: 'Vendor Tax ID', dataIndex: 'vendorTaxId', key: 'vendorTaxId', width: 150 },
                        { title: 'Vendor Contact Email', dataIndex: 'vendorEmail', key: 'vendorEmail', width: 180 },
                        { title: 'Vendor Phone', dataIndex: 'vendorPhone', key: 'vendorPhone', width: 130 },
                        // ... keep the rest of your columns as they were, and optionally add:
                        { title: 'Approval Status', dataIndex: 'approvalStatus', key: 'approvalStatus', width: 140 },
                        { title: 'Approver', dataIndex: 'approverName', key: 'approverName', width: 160 },
                        { title: 'Approval Time', dataIndex: 'approvalTimestamps', key: 'approvalTimestamps', width: 200 },
                    ]}
                    scroll={{ x: 3000 }}
                    size="small"
                />
            </Modal>
        </div>
    );
};

export default MainLayout;
