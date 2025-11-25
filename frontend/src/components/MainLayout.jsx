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
import InvoiceReview from './InvoiceReview';
import { invoiceService } from '../services/api';
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
    const [isFieldsModalOpen, setIsFieldsModalOpen] = useState(false);
    const [viewFilesData, setViewFilesData] = useState([]);
    const [allInvoices, setAllInvoices] = useState([]); // Store all invoices for proper pagination

    // Fetch invoices from backend
    const fetchInvoices = async (page = 1, pageSize = 10) => {
        try {
            setLoading(true);

            // Fetch all invoices to get total count (backend doesn't return total)
            const response = await invoiceService.getInvoices(0, 1000); // Get up to 1000 invoices
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

            // Store all invoices
            setAllInvoices(transformedData);

            // Calculate pagination
            const startIndex = (page - 1) * pageSize;
            const endIndex = startIndex + pageSize;
            const paginatedData = transformedData.slice(startIndex, endIndex);

            setData(paginatedData);
            setPagination({
                current: page,
                pageSize: pageSize,
                total: transformedData.length, // Total count of all invoices
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

    const handleViewFiles = async () => {
        try {
            setLoading(true);
            // Fetch all invoices from backend
            const response = await invoiceService.getInvoices(0, 1000); // Get up to 1000 invoices
            const invoicesArray = Array.isArray(response) ? response : [];

            // Transform invoice data to match table structure
            const transformedInvoices = invoicesArray.map((invoice, index) => {
                const extracted = invoice.extracted_data || {};
                const vendorInfo = extracted.vendor_info || {};
                const clientInfo = extracted.client_info || {};
                const invoiceDetails = extracted.invoice_details || {};
                const servicePeriod = extracted.service_period || {};
                const amounts = extracted.amounts || {};
                const additionalInfo = extracted.additional_info || {};

                // Helper to extract value from object
                const getValue = (obj) => {
                    if (!obj) return '';
                    return obj.value !== null && obj.value !== undefined ? obj.value : '';
                };

                return {
                    key: invoice._id || invoice.id || index,
                    sno: index + 1,
                    filename: invoice.original_filename || invoice.filename || '',
                    // Vendor Level
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
                    // Buyer Information
                    clientName: getValue(clientInfo.name),
                    billingAddress: getValue(clientInfo.billing_address),
                    shippingAddress: getValue(clientInfo.shipping_address),
                    phoneNumber: getValue(clientInfo.phone),
                    emailAddress: getValue(clientInfo.email),
                    clientTaxId: getValue(clientInfo.tax_id),
                    contactPerson: getValue(clientInfo.contact_person),
                    // Invoice Header
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
                    // Line Items - showing count or first item
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
                    // Taxes
                    totalTaxAmount: getValue(amounts.total_tax_amount),
                    taxTypeBreakdown: getValue(amounts.tax_type_breakdown),
                    withholdingTax: getValue(amounts.withholding_tax),
                    // Totals
                    subtotal: getValue(amounts.subtotal),
                    shippingFees: getValue(amounts.shipping_handling_fees),
                    surcharges: getValue(amounts.surcharges),
                    totalInvoiceAmount: getValue(amounts.total_invoice_amount),
                    amountPaid: getValue(amounts.amount_paid),
                    amountDue: getValue(amounts.amount_due),
                    // Compliance
                    notesTerms: getValue(additionalInfo.notes_terms),
                    qrCode: getValue(additionalInfo.qr_code_irn),
                    companyRegNumber: getValue(additionalInfo.company_registration_number),
                    // Approval Workflow - if exists
                    approvalWorkflowId: '',
                    approvalRequired: '',
                    approverList: '',
                    approvalStatus: invoice.status || '',
                    approvalTimestamps: invoice.processed_at ? new Date(invoice.processed_at).toLocaleString() : '',
                };
            });

            // Store transformed data in separate state for View Files
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
        debugger
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
                        // S.No and Filename
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
                        // Vendor Level
                        { title: 'Vendor Name', dataIndex: 'vendorName', key: 'vendorName', width: 150 },
                        { title: 'Vendor Address', dataIndex: 'vendorAddress', key: 'vendorAddress', width: 200 },
                        { title: 'Vendor Country', dataIndex: 'vendorCountry', key: 'vendorCountry', width: 120 },
                        { title: 'Vendor Tax ID', dataIndex: 'vendorTaxId', key: 'vendorTaxId', width: 150 },
                        { title: 'Vendor Contact Email', dataIndex: 'vendorEmail', key: 'vendorEmail', width: 180 },
                        { title: 'Vendor Phone', dataIndex: 'vendorPhone', key: 'vendorPhone', width: 130 },
                        { title: 'Vendor Bank Name', dataIndex: 'vendorBankName', key: 'vendorBankName', width: 150 },
                        { title: 'Vendor Bank Account', dataIndex: 'vendorBankAccount', key: 'vendorBankAccount', width: 150 },
                        { title: 'Vendor Bank Details', dataIndex: 'vendorBankDetails', key: 'vendorBankDetails', width: 180 },
                        { title: 'Vendor Contact Person', dataIndex: 'vendorContactPerson', key: 'vendorContactPerson', width: 170 },
                        { title: 'Vendor Website', dataIndex: 'vendorWebsite', key: 'vendorWebsite', width: 150 },
                        // Buyer Information
                        { title: 'Client Name', dataIndex: 'clientName', key: 'clientName', width: 150 },
                        { title: 'Billing Address', dataIndex: 'billingAddress', key: 'billingAddress', width: 200 },
                        { title: 'Shipping Address', dataIndex: 'shippingAddress', key: 'shippingAddress', width: 200 },
                        { title: 'Phone Number', dataIndex: 'phoneNumber', key: 'phoneNumber', width: 130 },
                        { title: 'Email Address', dataIndex: 'emailAddress', key: 'emailAddress', width: 180 },
                        { title: 'Client Tax ID', dataIndex: 'clientTaxId', key: 'clientTaxId', width: 130 },
                        { title: 'Contact Person', dataIndex: 'contactPerson', key: 'contactPerson', width: 150 },
                        // Invoice Header
                        { title: 'Invoice Number', dataIndex: 'invoiceNumber', key: 'invoiceNumber', width: 130 },
                        { title: 'Invoice Date', dataIndex: 'invoiceDate', key: 'invoiceDate', width: 120 },
                        { title: 'Due Date', dataIndex: 'dueDate', key: 'dueDate', width: 120 },
                        { title: 'Invoice Currency', dataIndex: 'invoiceCurrency', key: 'invoiceCurrency', width: 130 },
                        { title: 'Invoice Type', dataIndex: 'invoiceType', key: 'invoiceType', width: 120 },
                        { title: 'PO Number', dataIndex: 'poNumber', key: 'poNumber', width: 120 },
                        { title: 'Payment Terms', dataIndex: 'paymentTerms', key: 'paymentTerms', width: 150 },
                        { title: 'Payment Method', dataIndex: 'paymentMethod', key: 'paymentMethod', width: 150 },
                        { title: 'Cost Center', dataIndex: 'costCenter', key: 'costCenter', width: 150 },
                        { title: 'Service Period Start', dataIndex: 'servicePeriodStart', key: 'servicePeriodStart', width: 150 },
                        { title: 'Service Period End', dataIndex: 'servicePeriodEnd', key: 'servicePeriodEnd', width: 150 },
                        // Line Items
                        { title: 'Description', dataIndex: 'description', key: 'description', width: 200 },
                        { title: 'Item Code', dataIndex: 'itemCode', key: 'itemCode', width: 120 },
                        { title: 'Quantity', dataIndex: 'quantity', key: 'quantity', width: 100 },
                        { title: 'UOM', dataIndex: 'uom', key: 'uom', width: 80 },
                        { title: 'Unit Price', dataIndex: 'unitPrice', key: 'unitPrice', width: 110 },
                        { title: 'Discount', dataIndex: 'discount', key: 'discount', width: 100 },
                        { title: 'Net Amount', dataIndex: 'netAmount', key: 'netAmount', width: 120 },
                        { title: 'Tax %', dataIndex: 'taxRate', key: 'taxRate', width: 80 },
                        { title: 'Tax Amount', dataIndex: 'taxAmount', key: 'taxAmount', width: 110 },
                        { title: 'Gross Amount', dataIndex: 'grossAmount', key: 'grossAmount', width: 120 },
                        // Taxes
                        { title: 'Total Tax Amount', dataIndex: 'totalTaxAmount', key: 'totalTaxAmount', width: 140 },
                        { title: 'Tax Type Breakdown', dataIndex: 'taxTypeBreakdown', key: 'taxTypeBreakdown', width: 180 },
                        { title: 'Withholding Tax', dataIndex: 'withholdingTax', key: 'withholdingTax', width: 140 },
                        // Totals
                        { title: 'Subtotal', dataIndex: 'subtotal', key: 'subtotal', width: 120 },
                        { title: 'Shipping/Fees', dataIndex: 'shippingFees', key: 'shippingFees', width: 130 },
                        { title: 'Surcharges', dataIndex: 'surcharges', key: 'surcharges', width: 120 },
                        { title: 'Total Invoice Amount', dataIndex: 'totalInvoiceAmount', key: 'totalInvoiceAmount', width: 160 },
                        { title: 'Amount Paid', dataIndex: 'amountPaid', key: 'amountPaid', width: 120 },
                        { title: 'Amount Due', dataIndex: 'amountDue', key: 'amountDue', width: 120 },
                        // Compliance
                        { title: 'Notes/Terms', dataIndex: 'notesTerms', key: 'notesTerms', width: 200 },
                        { title: 'QR Code/IRN', dataIndex: 'qrCode', key: 'qrCode', width: 150 },
                        { title: 'Company Reg Number', dataIndex: 'companyRegNumber', key: 'companyRegNumber', width: 160 },
                        // Approval Workflow
                        { title: 'Approval Workflow ID', dataIndex: 'approvalWorkflowId', key: 'approvalWorkflowId', width: 170 },
                        { title: 'Approval Required', dataIndex: 'approvalRequired', key: 'approvalRequired', width: 140 },
                        { title: 'Approver List', dataIndex: 'approverList', key: 'approverList', width: 150 },
                        { title: 'Approval Status', dataIndex: 'approvalStatus', key: 'approvalStatus', width: 140 },
                        { title: 'Approval Timestamps', dataIndex: 'approvalTimestamps', key: 'approvalTimestamps', width: 170 },
                    ]}
                    pagination={{
                        showSizeChanger: true,
                        showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
                        pageSizeOptions: ['5', '10', '20', '50'],
                        pageSize: 10
                    }}
                    className="invoices-table"
                    scroll={{ x: 'max-content', y: 'calc(80vh - 200px)' }}
                />
            </Modal>
        </div>
    );
};

export default MainLayout;
