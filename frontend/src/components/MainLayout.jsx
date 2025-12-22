// src/components/MainLayout.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
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
    Upload,
} from 'antd';
import {
    PlusOutlined,
    EyeOutlined,
    DeleteOutlined,
    FolderOpenOutlined,
    ExclamationCircleOutlined,
    UploadOutlined,
    InboxOutlined,
} from '@ant-design/icons';

import InvoiceUpload from './InvoiceUpload';
import { invoiceService } from '../services/api';
import ApDashboard from '../pages/ApDashboard'; // 📊 Dashboard
import { formatDateTimeIST } from '../utils/dateUtils';
import '../styles/MainLayout.css';

const { Dragger } = Upload;

const { confirm } = Modal;

const MainLayout = () => {
    const navigate = useNavigate();
    const [allInvoices, setAllInvoices] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isFieldsModalOpen, setIsFieldsModalOpen] = useState(false);
    const [viewFilesData, setViewFilesData] = useState([]);

    // Upload modal state
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [fileList, setFileList] = useState([]);
    const [uploading, setUploading] = useState(false);
    const folderInputRef = useRef(null);

    // Global search for main table
    const [searchTerm, setSearchTerm] = useState('');

    // Global search for View Files modal table
    const [fieldsSearchTerm, setFieldsSearchTerm] = useState('');

    const [userRole, setUserRole] = useState('');
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
                    lastUpdated: formatDateTimeIST(invoice.processed_at || invoice.uploaded_at),
                    uploadedBy: invoice.uploaded_by || 'Unknown',
                    status: invoice.status || 'waiting_approval',
                    fileUrl: invoice.file_url || '/sample-invoice.pdf',
                    approverName: validation.approver_name || '',
                    approvalTime: validation.approval_timestamp
                        ? formatDateTimeIST(validation.approval_timestamp)
                        : '',
                    approverName: validation.approver_name || '',
                    approvalTime: validation.approval_timestamp
                        ? formatDateTimeIST(validation.approval_timestamp)
                        : '',
                    rawData: invoice,
                    currency: getValue(invoiceDetails.currency)
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
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            try {
                const user = JSON.parse(storedUser);
                setUserRole(user.role || '');
            } catch (e) {
                setUserRole('');
            }
        }
    }, []);
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
            render: (val, record) => {
                if (!val) return '-';
                const strVal = val.toString();
                const symbol = record.currency === 'INR' ? '₹' : '$';
                const cleanVal = strVal.replace(/[$,₹]/g, '').trim();
                return `${symbol}${cleanVal}`;
            },
        },
        {
            title: 'Amount Due',
            dataIndex: 'amountDue',
            key: 'amountDue',
            width: 150,
            sorter: (a, b) => (parseFloat(a.amountDue) || 0) - (parseFloat(b.amountDue) || 0),
            render: (val, record) => {
                if (!val) return '-';
                const strVal = val.toString();
                const symbol = record.currency === 'INR' ? '₹' : '$';
                const cleanVal = strVal.replace(/[$,₹]/g, '').trim();
                return `${symbol}${cleanVal}`;
            },
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
                { text: 'Processed', value: 'processed' },
                { text: 'Coding', value: 'waiting_coding' },
                { text: 'Waiting for Approval', value: 'waiting_approval' },
                { text: 'Approved', value: 'approved' },
                { text: 'Rejected', value: 'rejected' },
                { text: 'Reworked', value: 'reworked' },
            ],
            onFilter: (value, record) => record.status === value,
            render: (status) => {
                let color = 'default';
                let text = status;

                switch (status) {
                    case 'processed':
                        color = 'cyan';
                        text = 'Processed';
                        break;
                    case 'waiting_coding':
                        color = 'orange';
                        text = 'Coding';
                        break;
                    case 'waiting_approval':
                        color = 'gold';
                        text = 'Waiting for Approval';
                        break;
                    case 'approved':
                        color = 'green';
                        text = 'Approved';
                        break;
                    case 'rejected':
                        color = 'red';
                        text = 'Rejected';
                        break;
                    case 'reworked':
                        color = 'purple';
                        text = 'Reworked';
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
                    {userRole !== "approver" && (
                    <Button
                        type="link"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete(record)}
                    >
                        Delete
                    </Button>
                    )}

                </Space>
            ),
        },
    ];

    // ------------ HANDLERS --------------
    const handleAddInvoice = () => {
        setIsUploadModalOpen(true);
    };

    const handleFolderSelect = (event) => {
        const files = Array.from(event.target.files);
        setFileList((prev) => [...prev, ...files]);
    };

    const handleUpload = async () => {
        if (fileList.length === 0) {
            message.warning('Please select at least one file');
            return;
        }

        try {
            setUploading(true);

            message.open({
                type: 'loading',
                content: 'Processing invoices...',
                key: 'uploading',
                duration: 0
            });

            const response = await invoiceService.uploadInvoices(fileList);

            message.open({
                type: 'success',
                content: `${response.count} invoice(s) processed successfully!`,
                key: 'uploading'
            });

            setIsUploadModalOpen(false);
            setFileList([]);
            fetchInvoices(); // Refresh the invoice list

            if (response.count === 1) {
                navigate('/invoice/review', { state: { invoice: response.invoices[0] } });
            } else {
                navigate('/dashboard');
            }

        } catch (error) {
            console.error('Upload failed:', error);
            message.open({
                type: 'error',
                content: 'Upload failed',
                key: 'uploading'
            });
        } finally {
            setUploading(false);
        }
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
                    lastUpdated: formatDateTimeIST(new Date()),
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
                        ? formatDateTimeIST(validation.approval_timestamp)
                        : invoice.processed_at
                            ? formatDateTimeIST(invoice.processed_at)
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

        const status = record.status?.toLowerCase();

        // If user is approver, always go to invoice review to see approval buttons
        if (userRole === 'approver') {
            navigate("/invoice/review", { state: { invoice: record } });
            return;
        }

        if (status === "processed") {
            navigate("/invoice/review", { state: { invoice: record } });
        }
        else if (status === "waiting_coding" || status === "coding" || status === "waiting_approval") {
            navigate("/coding/review", { state: { invoice: record } });
        }
        else {
            navigate("/invoice/review", { state: { invoice: record } });
        }
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
            key: 'dashboard',
            label: 'Dashboard',
            children: (
                <div className="dashboard-tab">
                    <ApDashboard />
                </div>
            ),
        },
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
                            {userRole !== "approver" && (
                                <Button
                                    type="primary"
                                    icon={<PlusOutlined />}
                                    onClick={handleAddInvoice}
                                    className="add-invoice-btn"
                                >
                                    Add Invoice
                                </Button>
                            )}

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
                            scroll={{ x: 1600, y: 'calc(100vh - 320px)' }}
                        />
                    </Spin>
                </>
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

                {/* ⭐ WRAPPER REQUIRED FOR STICKY HEADER */}
                <div style={{ maxHeight: "70vh", overflow: "auto" }}>
                    <Table
                        dataSource={filteredViewFilesData}
                        className="invoice-fields-table"
                        rowKey="key"
                        sticky={{ offsetHeader: 0 }}
                        pagination={false}
                        size="small"
                        scroll={{ x: 3000 }}   // ⭐ DO NOT use scroll.y here
                         columns={[
      // ================= BASIC =================
      {
        title: "S.No",
        width: 70,
        render: (_, __, index) => index + 1,
        fixed: "left",
      },
      {
        title: "Vendor Name",
        dataIndex: "vendorName",
        width: 180,
        fixed: "left",
      },

      // ================= VENDOR =================
      {
        title: "Vendor Address",
        dataIndex: "vendorAddress",
        width: 250,
      },
      {
        title: "Vendor Country",
        dataIndex: "vendorCountry",
        width: 150,
      },
      {
        title: "Vendor Tax ID",
        dataIndex: "vendorTaxId",
        width: 180,
      },
      {
        title: "Vendor Email",
        dataIndex: "vendorEmail",
        width: 220,
      },
      {
        title: "Vendor Phone",
        dataIndex: "vendorPhone",
        width: 160,
      },

      // ================= CLIENT =================
      {
        title: "Client Name",
        dataIndex: "clientName",
        width: 220,
      },
      {
        title: "Billing Address",
        dataIndex: "billingAddress",
        width: 300,
      },
      {
        title: "Shipping Address",
        dataIndex: "shippingAddress",
        width: 300,
      },

      // ================= INVOICE =================
      {
        title: "Invoice Number",
        dataIndex: "invoiceNumber",
        width: 180,
      },
      {
        title: "Invoice Date",
        dataIndex: "invoiceDate",
        width: 160,
      },
      {
        title: "Due Date",
        dataIndex: "dueDate",
        width: 160,
      },
      {
        title: "Currency",
        dataIndex: "currency",
        width: 120,
      },

      // ================= LINE ITEM =================
      {
        title: "Description",
        dataIndex: "description",
        width: 320,
      },
      {
        title: "Item Code",
        dataIndex: "itemCode",
        width: 160,
      },
      {
        title: "Quantity",
        dataIndex: "quantity",
        width: 120,
      },
      {
        title: "Unit Price",
        dataIndex: "unitPrice",
        width: 160,
        render: (val, record) => {
            if (!val) return '-';
            const symbol = record.invoiceCurrency === 'INR' ? '₹' : '$';
            const cleanVal = val.toString().replace(/[$,₹]/g, '').trim();
            return `${symbol}${cleanVal}`;
        },
      },
      {
        title: "Net Amount",
        dataIndex: "netAmount",
        width: 160,
        render: (val, record) => {
            if (!val) return '-';
            const symbol = record.invoiceCurrency === 'INR' ? '₹' : '$';
            const cleanVal = val.toString().replace(/[$,₹]/g, '').trim();
            return `${symbol}${cleanVal}`;
        },
      },
      {
        title: "Tax Amount",
        dataIndex: "taxAmount",
        width: 160,
        render: (val, record) => {
            if (!val) return '-';
            const symbol = record.invoiceCurrency === 'INR' ? '₹' : '$';
            const cleanVal = val.toString().replace(/[$,₹]/g, '').trim();
            return `${symbol}${cleanVal}`;
        },
      },

      // ================= TOTALS =================
      {
        title: "Subtotal",
        dataIndex: "subtotal",
        width: 160,
        render: (val, record) => {
            if (!val) return '-';
            const symbol = record.invoiceCurrency === 'INR' ? '₹' : '$';
            const cleanVal = val.toString().replace(/[$,₹]/g, '').trim();
            return `${symbol}${cleanVal}`;
        },
      },
      {
        title: "Total Amount",
        dataIndex: "totalInvoiceAmount",
        width: 180,
        render: (val, record) => {
            if (!val) return '-';
            const symbol = record.invoiceCurrency === 'INR' ? '₹' : '$';
            const cleanVal = val.toString().replace(/[$,₹]/g, '').trim();
            return `${symbol}${cleanVal}`;
        },
      },
      {
        title: "Amount Due",
        dataIndex: "amountDue",
        width: 180,
        render: (val, record) => {
            if (!val) return '-';
            const symbol = record.invoiceCurrency === 'INR' ? '₹' : '$';
            const cleanVal = val.toString().replace(/[$,₹]/g, '').trim();
            return `${symbol}${cleanVal}`;
        },
      },

      // ================= APPROVAL =================
      {
        title: "Approval Status",
        dataIndex: "approvalStatus",
        width: 170,
        render: (status) => {
          let color = "default";
          if (status === "approved") color = "green";
          if (status === "rejected") color = "red";
          if (status === "waiting_approval") color = "gold";
          if (status === "waiting_coding") color = "orange";
          if (status === "reworked") color = "purple";
          return <Tag color={color}>{status}</Tag>;
        },
      },
      {
        title: "Approver",
        dataIndex: "approverName",
        width: 180,
      },
      {
        title: "Approval Time",
        dataIndex: "approvalTime",
        width: 200,
      },
    ]}
                    />
                </div>
            </Modal>

            {/* UPLOAD INVOICE MODAL */}
            <Modal
                title="Upload Invoice Files"
                open={isUploadModalOpen}
                onCancel={() => {
                    setIsUploadModalOpen(false);
                    setFileList([]);
                }}
                footer={null}
                width={700}
                destroyOnClose
            >
                <div style={{ padding: '20px 0' }}>
                    <p style={{ marginBottom: '16px', color: '#666' }}>
                        Drag a PDF, multiple PDFs, or upload a folder.
                    </p>

                    {/* Hidden folder picker */}
                    <input
                        type="file"
                        ref={folderInputRef}
                        style={{ display: 'none' }}
                        webkitdirectory="true"
                        onChange={handleFolderSelect}
                    />

                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                        <Button
                            icon={<FolderOpenOutlined />}
                            onClick={() => folderInputRef.current.click()}
                            style={{
                                borderColor: '#1890ff',
                                color: '#1890ff',
                                backgroundColor: '#e6f7ff'
                            }}
                        >
                            Upload Folder
                        </Button>
                    </div>

                    <Dragger
                        multiple
                        fileList={fileList}
                        accept=".pdf"
                        beforeUpload={(file) => {
                            setFileList((prev) => [...prev, file]);
                            return false;
                        }}
                        onRemove={(file) => {
                            setFileList((prev) => prev.filter((f) => f.uid !== file.uid));
                        }}
                        customRequest={() => { }}
                    >
                        <p className="ant-upload-drag-icon">
                            <InboxOutlined style={{ fontSize: '48px', color: '#1890ff' }} />
                        </p>
                        <p className="ant-upload-text">Click or drag PDF files to upload</p>
                        <p className="ant-upload-hint">
                            Supports single or multiple PDF files
                        </p>
                    </Dragger>

                    {fileList.length > 0 && (
                        <Button
                            type="primary"
                            onClick={handleUpload}
                            icon={<UploadOutlined />}
                            loading={uploading}
                            style={{ marginTop: 16, width: '100%' }}
                        >
                            Upload {fileList.length} File{fileList.length > 1 ? 's' : ''}
                        </Button>
                    )}
                </div>
            </Modal>

        </div>
    );
};

export default MainLayout;
