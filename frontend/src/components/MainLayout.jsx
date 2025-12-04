// src/components/MainLayout.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Table,
    Button,
    Tag,
    Space,
    Modal,
    Spin,
    message,
    Input,
    Tabs,
} from 'antd';
import {
    PlusOutlined,
    EyeOutlined,
    DeleteOutlined,
    FolderOpenOutlined,
    ExclamationCircleOutlined,
} from '@ant-design/icons';

import InvoiceUpload from './InvoiceUpload';
import { invoiceService } from '../services/api';
import ApDashboard from '../pages/ApDashboard'; // 📊 Dashboard
import '../styles/MainLayout.css';

const { confirm } = Modal;

const MainLayout = () => {
    const navigate = useNavigate();
    const [allInvoices, setAllInvoices] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isFieldsModalOpen, setIsFieldsModalOpen] = useState(false);
    const [viewFilesData, setViewFilesData] = useState([]);

    // Global search for main table
    const [searchTerm, setSearchTerm] = useState('');

    // Global search for View Files modal table
    const [fieldsSearchTerm, setFieldsSearchTerm] = useState('');

    // ------------ FETCH INVOICES --------------
    const fetchInvoices = async () => {
        try {
            setLoading(true);

            const response = await invoiceService.getInvoices(0, 1000);
            const invoicesArray = Array.isArray(response) ? response : [];

            const transformedData = invoicesArray.map((invoice) => {
                const extracted = invoice.extracted_data || {};
                const vendorInfo = extracted.vendor_info || {};
                const invoiceDetails = extracted.invoice_details || {};
                const amounts = extracted.amounts || {};
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
                    totalAmount: getValue(amounts.total_invoice_amount),
                    amountDue: getValue(amounts.amount_due),
                    lastUpdated: new Date(invoice.processed_at || invoice.uploaded_at).toLocaleString(
                        'en-US',
                        {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true,
                        }
                    ),
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
                            hour12: true,
                        })
                        : '',
                    rawData: invoice,
                };
            });

            setAllInvoices(transformedData);
        } catch (error) {
            console.error('Error fetching invoices:', error);
            message.error('Failed to load invoices. Please try again.');
            setAllInvoices([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInvoices();
    }, []);

    // ------------ GLOBAL SEARCH (MAIN TABLE) --------------
    const filteredInvoices = useMemo(() => {
        if (!searchTerm) return allInvoices;
        const q = searchTerm.toLowerCase();

        return allInvoices.filter((inv) => {
            const fieldsToSearch = [
                inv.filename,
                inv.vendorName,
                inv.invoiceId,
                inv.uploadedBy,
                inv.status,
                inv.approverName,
                inv.approvalTime,
                inv.lastUpdated,
            ];
            return fieldsToSearch.some((field) =>
                (field || '').toString().toLowerCase().includes(q)
            );
        });
    }, [allInvoices, searchTerm]);

    // ------------ MAIN TABLE COLUMNS --------------
    const columns = [
        {
            title: 'S.No',
            key: 'sno',
            width: 70,
            render: (_, record) => {
                // Index within filteredInvoices so it stays consistent with pagination
                const actualIndex = filteredInvoices.findIndex((inv) => inv.key === record.key);
                return actualIndex + 1;
            },
        },
        {
            title: 'Vendor Name',
            dataIndex: 'vendorName',
            key: 'vendorName',
            width: 180,
            sorter: (a, b) => (a.vendorName || '').localeCompare(b.vendorName || ''),
            multiple: 2,
            filterSearch: true,
            filters: [...new Set(allInvoices.map(inv => inv.vendorName).filter(Boolean))].map(name => ({ text: name, value: name })),
            onFilter: (value, record) => record.vendorName === value,
        },
        {
            title: 'Invoice ID',
            dataIndex: 'invoiceId',
            key: 'invoiceId',
            width: 180,
            sorter: (a, b) => (a.invoiceId || '').localeCompare(b.invoiceId || ''),
            multiple: 3,
            filterSearch: true,
            filters: [...new Set(allInvoices.map(inv => inv.invoiceId).filter(Boolean))].map(id => ({ text: id, value: id })),
            onFilter: (value, record) => record.invoiceId === value,
        },
        {
            title: 'Total Amount',
            dataIndex: 'totalAmount',
            key: 'totalAmount',
            width: 150,
            sorter: (a, b) => (parseFloat(a.totalAmount) || 0) - (parseFloat(b.totalAmount) || 0),
            render: (val) => val ? `$${val}` : '-',
        },
        {
            title: 'Amount Due',
            dataIndex: 'amountDue',
            key: 'amountDue',
            width: 150,
            sorter: (a, b) => (parseFloat(a.amountDue) || 0) - (parseFloat(b.amountDue) || 0),
            render: (val) => val ? `$${val}` : '-',
        },
        {
            title: 'Last Updated',
            dataIndex: 'lastUpdated',
            key: 'lastUpdated',
            width: 200,
            sorter: (a, b) => new Date(a.lastUpdated) - new Date(b.lastUpdated),
            multiple: 4,
        },
        {
            title: 'Uploaded By',
            dataIndex: 'uploadedBy',
            key: 'uploadedBy',
            width: 180,
            ellipsis: true,
            sorter: (a, b) => (a.uploadedBy || '').localeCompare(b.uploadedBy || ''),
            multiple: 5,
            filterSearch: true,
            filters: [...new Set(allInvoices.map(inv => inv.uploadedBy).filter(Boolean))].map(user => ({ text: user, value: user })),
            onFilter: (value, record) => record.uploadedBy === value,
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            width: 150,
            sorter: (a, b) => (a.status || '').localeCompare(b.status || ''),
            multiple: 6,
            filters: [
                { text: 'Approved', value: 'approved' },
                { text: 'Waiting for Approval', value: 'waiting_approval' },
                { text: 'Rejected', value: 'rejected' },
                { text: 'Reworked', value: 'reworked' },
                { text: 'Processed', value: 'processed' },
                { text: 'Pending', value: 'pending' },
            ],
            onFilter: (value, record) => record.status === value,
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
            sorter: (a, b) => (a.approverName || '').localeCompare(b.approverName || ''),
            multiple: 7,
            filterSearch: true,
            filters: [...new Set(allInvoices.map(inv => inv.approverName).filter(Boolean))].map(approver => ({ text: approver, value: approver })),
            onFilter: (value, record) => record.approverName === value,
            render: (val) => val || '-',
        },
        {
            title: 'Action Time',
            dataIndex: 'approvalTime',
            key: 'approvalTime',
            width: 200,
            sorter: (a, b) => {
                if (!a.approvalTime) return 1;
                if (!b.approvalTime) return -1;
                return new Date(a.approvalTime) - new Date(b.approvalTime);
            },
            multiple: 8,
            render: (val) => val || '-',
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

    // ------------ HANDLERS --------------
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
                    lastUpdated: new Date().toLocaleString(),
                },
            },
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
                        : invoice.processed_at
                            ? new Date(invoice.processed_at).toLocaleString()
                            : '',
                    approverName: validation.approver_name || '',
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
                    fetchInvoices();
                } catch (error) {
                    console.error('Error deleting invoice:', error);
                    message.error('Failed to delete invoice. Please try again.');
                }
            },
        });
    };

    // ------------ FILTERED DATA FOR VIEW FILES MODAL --------------
    const filteredViewFilesData = useMemo(() => {
        if (!fieldsSearchTerm) return viewFilesData;
        const q = fieldsSearchTerm.toLowerCase();
        return viewFilesData.filter((row) => {
            const fieldsToSearch = [
                row.filename,
                row.vendorName,
                row.vendorAddress,
                row.vendorCountry,
                row.vendorTaxId,
                row.vendorEmail,
                row.vendorPhone,
                row.clientName,
                row.invoiceNumber,
                row.invoiceDate,
                row.dueDate,
                row.approvalStatus,
                row.approverName,
                row.approvalTimestamps,
            ];
            return fieldsToSearch.some((field) =>
                (field || '').toString().toLowerCase().includes(q)
            );
        });
    }, [viewFilesData, fieldsSearchTerm]);

    // =====================================================
    //            ⭐  TABS INTEGRATION  ⭐
    // =====================================================

    const tabItems = [
        {
            key: 'invoices',
            label: 'Invoices',
            children: (
                <>
                    <div className="layout-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div className="layout-actions" style={{ display: 'flex', gap: '10px' }}>
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
                        <div className="table-toolbar" style={{ margin: 0 }}>
                            <Input
                                placeholder="Search invoices..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                allowClear
                                className="table-search-input"
                                style={{ width: '300px' }}
                            />
                        </div>
                    </div>

                    <Spin spinning={loading} tip="Loading invoices...">
                        <Table
                            columns={columns}
                            dataSource={filteredInvoices}
                            pagination={{
                                defaultPageSize: 10,
                                showSizeChanger: true,
                                showTotal: (total, range) =>
                                    `${range[0]}-${range[1]} of ${total} items`,
                                pageSizeOptions: ['5', '10', '20', '50'],
                            }}
                            className="invoices-table"
                            scroll={{ x: 1600 }}
                        />
                    </Spin>
                </>
            ),
        },
        {
            key: 'dashboard',
            label: 'Dashboard',
            children: (
                <div className="dashboard-tab">
                    <ApDashboard />
                </div>
            ),
        },
    ];

    // =====================================================

    return (
        <div className="main-layout">
            <Tabs defaultActiveKey="dashboard" items={tabItems} className="main-tabs" />

            {/* UPLOAD MODAL */}
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

            {/* VIEW FILES MODAL */}
            <Modal
                title="Invoice Fields Reference"
                open={isFieldsModalOpen}
                onCancel={() => setIsFieldsModalOpen(false)}
                footer={null}
                width="95%"
                destroyOnClose
                centered
            >
                {/* Global search above View Files modal table */}
                <div className="table-toolbar modal-toolbar">
                    <Input
                        placeholder="Search invoice fields..."
                        value={fieldsSearchTerm}
                        onChange={(e) => setFieldsSearchTerm(e.target.value)}
                        allowClear
                        className="table-search-input"
                    />
                </div>

                <Table
                    dataSource={filteredViewFilesData}
                    className="invoices-table invoice-fields-table"
                    rowKey="key"
                    columns={[
                        {
                            title: 'S.No',
                            key: 'sno',
                            width: 70,
                            fixed: 'left',
                            render: (_, __, index) => index + 1,
                        },
                        {
                            title: 'Vendor Name',
                            dataIndex: 'vendorName',
                            key: 'vendorName',
                            width: 150,
                            fixed: 'left',
                            sorter: (a, b) =>
                                (a.vendorName || '').localeCompare(b.vendorName || ''),
                            multiple: 2,
                        },
                        {
                            title: 'Vendor Address',
                            dataIndex: 'vendorAddress',
                            key: 'vendorAddress',
                            width: 200,
                            sorter: (a, b) =>
                                (a.vendorAddress || '').localeCompare(b.vendorAddress || ''),
                            multiple: 3,
                        },
                        {
                            title: 'Vendor Country',
                            dataIndex: 'vendorCountry',
                            key: 'vendorCountry',
                            width: 120,
                            sorter: (a, b) =>
                                (a.vendorCountry || '').localeCompare(b.vendorCountry || ''),
                            multiple: 4,
                        },
                        {
                            title: 'Vendor Tax ID',
                            dataIndex: 'vendorTaxId',
                            key: 'vendorTaxId',
                            width: 150,
                            sorter: (a, b) =>
                                (a.vendorTaxId || '').localeCompare(b.vendorTaxId || ''),
                            multiple: 5,
                        },
                        {
                            title: 'Vendor Contact Email',
                            dataIndex: 'vendorEmail',
                            key: 'vendorEmail',
                            width: 180,
                            sorter: (a, b) =>
                                (a.vendorEmail || '').localeCompare(b.vendorEmail || ''),
                            multiple: 6,
                        },
                        {
                            title: 'Vendor Phone',
                            dataIndex: 'vendorPhone',
                            key: 'vendorPhone',
                            width: 130,
                            sorter: (a, b) =>
                                (a.vendorPhone || '').localeCompare(b.vendorPhone || ''),
                            multiple: 7,
                        },
                        {
                            title: 'Total Amount',
                            dataIndex: 'totalInvoiceAmount',
                            key: 'totalInvoiceAmount',
                            width: 150,
                            render: (val) => val ? `$${val}` : '-',
                        },
                        {
                            title: 'Amount Due',
                            dataIndex: 'amountDue',
                            key: 'amountDue',
                            width: 150,
                            render: (val) => val ? `$${val}` : '-',
                        },
                        {
                            title: 'Approval Status',
                            dataIndex: 'approvalStatus',
                            key: 'approvalStatus',
                            width: 140,
                            sorter: (a, b) =>
                                (a.approvalStatus || '').localeCompare(b.approvalStatus || ''),
                            multiple: 8,
                            filters: [
                                { text: 'Approved', value: 'approved' },
                                { text: 'Waiting for Approval', value: 'waiting_approval' },
                                { text: 'Rejected', value: 'rejected' },
                                { text: 'Reworked', value: 'reworked' },
                                { text: 'Processed', value: 'processed' },
                                { text: 'Pending', value: 'pending' },
                            ],
                            onFilter: (value, record) => record.approvalStatus === value,
                        },
                        {
                            title: 'Approver',
                            dataIndex: 'approverName',
                            key: 'approverName',
                            width: 160,
                            sorter: (a, b) =>
                                (a.approverName || '').localeCompare(b.approverName || ''),
                            multiple: 9,
                        },
                        {
                            title: 'Approval Time',
                            dataIndex: 'approvalTimestamps',
                            key: 'approvalTimestamps',
                            width: 200,
                            sorter: (a, b) => {
                                if (!a.approvalTimestamps) return 1;
                                if (!b.approvalTimestamps) return -1;
                                return (
                                    new Date(a.approvalTimestamps) -
                                    new Date(b.approvalTimestamps)
                                );
                            },
                            multiple: 10,
                        },
                    ]}
                    scroll={{ x: 3000 }}
                    size="small"
                />
            </Modal>
        </div>
    );
};

export default MainLayout;
