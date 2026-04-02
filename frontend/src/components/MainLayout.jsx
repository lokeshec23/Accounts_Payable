// src/components/MainLayout.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Table,
    Button,
    Tag,
    Space,
    Modal,
    message,
    Input,
    Tabs,
    Upload,
    Progress
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
import { invoiceService, currencyService } from '../services/api';
import ApDashboard from '../pages/ApDashboard'; // 📊 Dashboard
import { TableSkeleton } from './SkeletonLoader';
import { formatDateTimeIST } from '../utils/dateUtils';
import '../styles/MainLayout.css';
import { v4 as uuidv4 } from "uuid";

const { Dragger } = Upload;

const { confirm } = Modal;

const MainLayout = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [uploadProgress, setUploadProgress] = useState(0);
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
    const [currencies, setCurrencies] = useState([]);
    const [userRole, setUserRole] = useState('');
    const [userName, setUserName] = useState('');
    const [userEmail, setUserEmail] = useState('');

    // Tab control - check if navigation state requests a specific tab
    const [activeTab, setActiveTab] = useState(() => {
        return location.state?.activeTab || 'invoices';
    });

    // Update active tab when location state changes
    // Approvers cannot see the Dashboard tab
    useEffect(() => {
        if (location.state?.activeTab) {
            const storedUser = sessionStorage.getItem('user');
            let role = '';
            try { role = JSON.parse(storedUser)?.role || ''; } catch { }
            if (role === 'approver' && location.state.activeTab === 'dashboard') {
                setActiveTab('invoices');
            } else {
                setActiveTab(location.state.activeTab);
            }
        }
    }, [location.state]);

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
                    if (obj === null || obj === undefined) return '';

                    // Case 1: Azure-style { value: "..." }
                    if (typeof obj === 'object' && 'value' in obj) {
                        return obj.value ?? '';
                    }

                    // Case 2: Plain string / number
                    return obj;
                };

                // if (!vendorInfo.id && !vendorInfo.vendor_id) {
                //         console.warn("⚠️ Missing vendor id for invoice:", {
                //             filename: invoice.original_filename,
                //             vendorInfo
                //         });
                // }


                const currentLevel = invoice.current_approver_level || 1;
                const assignedApprovers = invoice.assigned_approvers || [];
                const rawCurrentLevel = assignedApprovers[currentLevel - 1];
                
                let currentLevelEmail = '';
                if (Array.isArray(rawCurrentLevel)) {
                    currentLevelEmail = rawCurrentLevel.filter(a => typeof a === 'string').map(a => a.toLowerCase()).join(', ');
                } else if (typeof rawCurrentLevel === 'string') {
                    currentLevelEmail = rawCurrentLevel.toLowerCase();
                }
                
                const isWaiting = invoice.status === 'waiting_approval';

                return {
                    key: invoice._id || invoice.id,
                    id: invoice._id || invoice.id,
                    filename: invoice.original_filename || invoice.filename || 'N/A',
                    vendorName: getValue(invoice.vendor_name || vendorInfo.name) || 'N/A',
                    vendorId: getValue(invoice.vendor_id || vendorInfo.id || vendorInfo.vendor_id) || 'N/A',
                    invoiceId: getValue(invoiceDetails.invoice_number) || 'N/A',
                    totalAmount: getValue(amounts.total_invoice_amount),
                    amountDue: getValue(amounts.amount_due),
                    lastUpdated: formatDateTimeIST(invoice.processed_at || invoice.uploaded_at),
                    uploadedBy: invoice.uploaded_by || 'Unknown',
                    status: invoice.status || 'waiting_approval',
                    fileUrl: invoice.file_url || '/sample-invoice.pdf',
                    approverName: isWaiting
                        ? (currentLevelEmail || 'Pending')
                        : (validation.approver_name || ''),
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
        const storedUser = sessionStorage.getItem('user');
        if (storedUser) {
            try {
                const user = JSON.parse(storedUser);
                setUserRole(user.role || '');
                setUserName(user.name || user.username || user.email || '');
                // Capture email in both state and sessionStorage for matching
                const email = (user.email || '').toLowerCase();
                setUserEmail(email);
                if (email) {
                    sessionStorage.setItem('userEmail', email);
                }
            } catch (e) {
                setUserRole('');
                setUserName('');
                setUserEmail('');
            }
        }
    }, []);

    useEffect(() => {
        const fetchCurrencies = async () => {
            try {
                const data = await currencyService.getCurrencies();
                setCurrencies(data);
            } catch (err) {
                console.error("Failed to fetch currencies", err);
            }
        };
        fetchCurrencies();
    }, []);

    useEffect(() => {
        fetchInvoices();
    }, []);

    // ------------ GLOBAL SEARCH (MAIN TABLE) --------------
    // Only show invoices associated with the current user
    const userFilteredInvoices = useMemo(() => {
        // 1. Admin and Coder see everything
        if (userRole === 'admin' || userRole === 'coder') {
            return allInvoices;
        }

        const lowerEmail = userEmail.toLowerCase();
        const lowerUserName = (userName || '').toLowerCase();
        
        // Safety: If we don't have user info, restrict to nothing
        if (!lowerUserName && !lowerEmail) {
            return [];
        }

        return allInvoices.filter((inv) => {
            // Check if user is in assigned_approvers list (email-based, primary check)
            const assignedApprovers = inv.rawData?.assigned_approvers || [];
            const isAssigned = assignedApprovers.some(level => {
                if (Array.isArray(level)) {
                    return level.some(a => 
                        a && typeof a === 'string' && (
                            (lowerEmail && a.toLowerCase() === lowerEmail) ||
                            (lowerUserName && a.toLowerCase() === lowerUserName)
                        )
                    );
                }
                return level && typeof level === 'string' && (
                    (lowerEmail && level.toLowerCase() === lowerEmail) ||
                    (lowerUserName && level.toLowerCase() === lowerUserName)
                );
            });

            // For approver role: only show if they are in the assigned_approvers list
            // (covers all statuses: waiting_approval, approved, rejected, etc.)
            if (userRole === 'approver') {
                // Also check approved_by in case they approved an earlier level
                const approvedBy = inv.rawData?.approved_by || [];
                const hasApproved = approvedBy.some(a => {
                    const identifier = (typeof a === 'string' ? a : a?.email || a?.name || '').toLowerCase();
                    return (lowerEmail && identifier === lowerEmail) || (lowerUserName && identifier === lowerUserName);
                });
                return isAssigned || hasApproved;
            }

            // For other roles (non-admin, non-coder): show if they uploaded or are assigned
            const isUploader = (inv.uploadedBy && inv.uploadedBy !== 'Unknown') && (
                inv.uploadedBy.toLowerCase() === lowerUserName || 
                (lowerEmail && inv.uploadedBy.toLowerCase() === lowerEmail)
            );

            // Check if user has already approved
            const approvedBy = inv.rawData?.approved_by || [];
            const hasApproved = approvedBy.some(a => {
                const identifier = (typeof a === 'string' ? a : a?.email || a?.name || '').toLowerCase();
                return (lowerEmail && identifier === lowerEmail) || (lowerUserName && identifier === lowerUserName);
            });

            return isUploader || isAssigned || hasApproved;
        });
    }, [allInvoices, userName, userEmail, userRole]);

    const filteredInvoices = useMemo(() => {
        if (!searchTerm) return userFilteredInvoices;
        const q = searchTerm.toLowerCase();

        return userFilteredInvoices.filter((inv) => {
            const fieldsToSearch = [
                inv.filename,
                inv.vendorName,
                inv.vendorId,
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
    }, [userFilteredInvoices, searchTerm]);

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
            title: 'Vendor Id',
            dataIndex: 'vendorId',
            key: 'vendorId',
            width: 180,
            sorter: (a, b) => (a.vendorId || '').localeCompare(b.vendorId || ''),
            multiple: 2,
            filterSearch: true,
            filters: [...new Set(allInvoices.map(inv => inv.vendorId).filter(Boolean))].map(id => ({ text: id, value: id })),
            onFilter: (value, record) => record.vendorId === value,
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
                const symbol = '$';
                const cleanVal = strVal.replace(/[$,₹,€]/g, '').trim();
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
                const symbol = '$';
                const cleanVal = strVal.replace(/[$,₹,€]/g, '').trim();
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
            width: 200,
            sorter: (a, b) => (a.status || '').localeCompare(b.status || ''),
            multiple: 6,
            filters: [
                { text: 'Processed', value: 'processed' },
                { text: 'Coding', value: 'waiting_coding' },
                { text: 'Waiting for Approval', value: 'waiting_approval' },
                { text: 'Approved', value: 'approved' },
                { text: 'Rejected', value: 'rejected' },
                { text: 'Reworked', value: 'reworked' },
                { text: 'Posted to Sage', value: 'sage_posted' },
                { text: 'Failed to Post to Sage', value: 'sage_post_failed' },
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
                    case 'sage_posted':
                        color = 'geekblue';
                        text = 'Posted to Sage';
                        break;
                    case 'sage_post_failed':
                        color = 'volcano';
                        text = 'Failed to Post to Sage';
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
            width: 200,
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
            fixed: 'right',
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

        let eventSource = null;

        try {
            setUploading(true);

            const taskId = uuidv4();

            eventSource = new EventSource(invoiceService.getUploadProgressUrl(taskId));
            let currentProgress = 25;
            setUploadProgress(25);

            eventSource.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.status === 'processing' && data.message) {
                    if (data.progress && data.progress > currentProgress) {
                        currentProgress = data.progress;
                        setUploadProgress(currentProgress);
                    }
                }
            }

            const response = await invoiceService.uploadInvoices(fileList, taskId);

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
            if (eventSource) {
                eventSource.close();
            }
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
                    if (obj === null || obj === undefined) return '';

                    // Azure-style: { value: "..." }
                    if (typeof obj === 'object' && 'value' in obj) {
                        return obj.value ?? '';
                    }

                    // Plain string / number
                    return obj;
                };


                return {
                    key: invoice._id || invoice.id || index,
                    sno: index + 1,
                    filename: invoice.original_filename || invoice.filename || '',
                    vendorName: getValue(invoice.vendor_name || vendorInfo.name),
                    vendorId: getValue(invoice.vendor_id || vendorInfo.id || vendorInfo.vendor_id),
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
                row.vendorId,
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
        ...(userRole !== 'approver' ? [{
            key: 'dashboard',
            label: 'Dashboard',
            children: (
                <div className="dashboard-tab">
                    <ApDashboard />
                </div>
            ),
        }] : []),
        {
            key: 'invoices',
            label: userRole === 'approver' ? '' : 'Invoices',
            children: (
                <>
                    <div className="layout-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div className="layout-actions" style={{ display: 'flex', gap: '10px' }}>
                            {userRole !== "approver" && <Button
                                type="default"
                                icon={<FolderOpenOutlined />}
                                onClick={handleViewFiles}
                                className="view-files-btn"
                            >
                                View Files
                            </Button>}
                            {userRole !== "approver" && userRole !== "admin" && (
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

                    {loading ? (
                        <TableSkeleton />
                    ) : (
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
                    )}
                </>
            ),
        },

    ];

    // =====================================================

    return (
        <div className="main-layout">
            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={tabItems}
                className="main-tabs"
            />

            {/* UPLOAD MODAL */}
            <Modal
                title="Upload Invoice"
                open={isModalOpen}
                onCancel={handleCloseModal}
                footer={null}
                width={700}
                destroyOnHidden
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
                destroyOnHidden
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

                {/* ⭐ WRAPPER REQUIRED FOR STICKY HEADER - Removed fixed height/overflow from here */}
                <div>
                    <Table
                        dataSource={filteredViewFilesData}
                        className="invoice-fields-table"
                        rowKey="key"
                        // sticky={{ offsetHeader: 0 }} // Removed sticky prop as scroll.y handles it
                        pagination={false}
                        size="small"
                        scroll={{ x: 3000, y: '70vh' }}   // ⭐ Added scroll.y here
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
                destroyOnHidden
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
                        showUploadList={false}
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

                    {fileList.length > 0 && !uploading && (
                        <Button
                            type="primary"
                            onClick={handleUpload}
                            icon={<UploadOutlined />}
                            style={{ marginTop: 16, width: '100%' }}
                        >
                            Upload {fileList.length} File{fileList.length > 1 ? 's' : ''}
                        </Button>
                    )}
                    {uploading && (
                        <div style={{ marginTop: 16, textAlign: 'center', padding: '10px 0' }}>
                            <Progress
                                percent={uploadProgress}
                                status="active"
                                strokeColor={{
                                    '0%': '#108ee9',
                                    '100%': '#87d068',
                                }}
                            />
                            <div style={{ marginTop: 8, fontWeight: 'bold', color: '#666' }}>
                                Uploading... ({uploadProgress}%)
                            </div>
                        </div>
                    )}
                    {fileList.length > 0 && (
                        <div
                            style={{
                                marginTop: 20,
                                maxHeight: "200px",
                                overflowY: "auto",
                                border: "1px solid #f0f0f0",
                                borderRadius: "6px",
                                padding: "8px"
                            }}
                        >
                            {fileList.map((file) => (
                                <div
                                    key={file.uid}
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        padding: "6px 0",
                                        borderBottom: "1px solid #f5f5f5"
                                    }}
                                >
                                    <span>{file.name}</span>

                                    <Button
                                        type="text"
                                        danger
                                        icon={<DeleteOutlined />}
                                        onClick={() =>
                                            setFileList((prev) =>
                                                prev.filter((f) => f.uid !== file.uid)
                                            )
                                        }
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Modal>

        </div>
    );
};

export default MainLayout;
