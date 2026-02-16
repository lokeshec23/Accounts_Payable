import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDateTimeIST } from '../utils/dateUtils';
import { Table, Button, Tag, Space, Modal, message, Input, Tooltip, Tabs } from 'antd';
import {
    EyeOutlined,
    DeleteOutlined,
    ExclamationCircleOutlined,
    SwapOutlined
} from '@ant-design/icons';
import { invoiceService, currencyService, delegationService } from '../services/api';
import DelegationManager from '../components/DelegationManager';
import { TableSkeleton } from '../components/SkeletonLoader';

const { confirm } = Modal;

const ApprovalsPage = () => {
    const navigate = useNavigate();
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [allApprovalInvoices, setAllApprovalInvoices] = useState([]);
    const [currencies, setCurrencies] = useState([]);
    const storedUser = JSON.parse(localStorage.getItem('user'));

    // Global search term for approvals table
    const [searchTerm, setSearchTerm] = useState('');
    const [activeDelegations, setActiveDelegations] = useState([]);

    // Fetch invoices (full dataset, no manual slicing)
    const fetchInvoices = async () => {
        try {
            setLoading(true);

            const delegations = await delegationService.getDelegations();
            const now = new Date();
            now.setHours(0, 0, 0, 0);

            const active = delegations.filter(d => {
                const start = new Date(d.start_date);
                start.setHours(0, 0, 0, 0);
                const end = new Date(d.end_date);
                end.setHours(0, 0, 0, 0);

                return d.substitute_approver.toLowerCase() === storedUser?.email?.toLowerCase() &&
                    now.getTime() >= start.getTime() && now.getTime() <= end.getTime();
            }).map(d => d.original_approver.toLowerCase());

            setActiveDelegations(active);

            const response = await invoiceService.getInvoices(0, 1000);
            const invoicesArray = Array.isArray(response) ? response : [];

            const transformedData = invoicesArray.map((invoice) => {
                const currentLevel = invoice.current_approver_level || 1;
                const assignedApprovers = invoice.assigned_approvers || [];
                const currentLevelEmail = (assignedApprovers[currentLevel - 1] || '').toLowerCase();
                const isWaiting = invoice.status === 'waiting_approval';

                const isActiveDelegate = active.includes(currentLevelEmail);

                return {
                    key: invoice._id || invoice.id,
                    id: invoice._id || invoice.id,
                    filename: invoice.original_filename || invoice.filename || 'N/A',
                    vendorName: invoice.extracted_data?.vendor_info?.name?.value || 'N/A',
                    invoiceId: invoice.extracted_data?.invoice_details?.invoice_number?.value || 'N/A',
                    totalAmount: invoice.extracted_data?.amounts?.total_invoice_amount?.value || '',
                    amountDue: invoice.extracted_data?.amounts?.amount_due?.value || '',
                    lastUpdated: formatDateTimeIST(invoice.processed_at || invoice.uploaded_at),
                    uploadedBy: invoice.uploaded_by || 'Unknown',
                    status: invoice.status || 'pending',
                    // Logic update: for waiting invoices, show expected approver with delegation info
                    approverName: isWaiting
                        ? (currentLevelEmail || 'Pending') + (isActiveDelegate ? ' (Delegated)' : '')
                        : (invoice.validation_results?.approver_name || '—'),
                    approvalTime: invoice.validation_results?.approval_timestamp
                        ? formatDateTimeIST(invoice.validation_results.approval_timestamp)
                        : '—',
                    approverComment: invoice.validation_results?.approver_comment || '',
                    rawData: invoice,
                    currency: invoice.extracted_data?.invoice_details?.currency?.value || 'USD',
                    currentLevelEmail,
                    isActiveDelegate
                };
            });

            const filteredData = transformedData.filter((item) => {
                const invoiceRec = item.rawData;
                const approvedBy = invoiceRec.approved_by || [];
                const assignedApprovers = invoiceRec.assigned_approvers || [];
                const currentLevel = invoiceRec.current_approver_level || 1;
                const hasApproved = approvedBy.some((a) => {
                    const email = typeof a === 'string' ? a : a?.email;
                    return (email || '').toLowerCase() === (storedUser?.email || '').toLowerCase();
                });

                const currentLevelEmail = item.currentLevelEmail;
                const userEmail = (storedUser?.email || '').toLowerCase();
                const isDesignatedApprover = userEmail === currentLevelEmail;
                const isActiveDelegate = active.includes(currentLevelEmail); // Use active from local scope!

                // If user has already approved, they can only see it again if they are the DESIGNATED approver OR ACTIVE DELEGATE for the current level
                if (hasApproved && !isDesignatedApprover && !isActiveDelegate) return false;

                if (item.status !== 'waiting_approval') return false;

                if (assignedApprovers.length > 0) {
                    return isDesignatedApprover || isActiveDelegate;
                }
                return true;
            });


            setAllApprovalInvoices(filteredData);
            setData(filteredData);
        } catch (error) {
            console.error('Error fetching invoices:', error);
            message.error('Failed to load invoices. Please try again.');
            setData([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchInvoices();

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

    // Global search across all approvals
    const filteredData = useMemo(() => {
        if (!searchTerm) return data;
        const q = searchTerm.toLowerCase();
        return data.filter((row) => {
            const fieldsToSearch = [
                row.filename,
                row.vendorName,
                row.invoiceId,
                row.uploadedBy,
                row.status,
                row.approverName,
                row.approvalTime,
                row.lastUpdated,
            ];
            return fieldsToSearch.some((field) =>
                (field || '').toString().toLowerCase().includes(q)
            );
        });
    }, [data, searchTerm]);

    // View invoice
    const handleView = (record) => {
        navigate('/invoice/review', { state: { invoice: record.rawData, readOnly: true } });
    };

    // Delete invoice
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
                    fetchInvoices();
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
            render: (_, __, index) => index + 1,
        },
        {
            title: 'Vendor Name',
            dataIndex: 'vendorName',
            key: 'vendorName',
            width: 180,
            sorter: (a, b) => (a.vendorName || '').localeCompare(b.vendorName || ''),
            multiple: 2,
            filterSearch: true,
            filters: [...new Set(allApprovalInvoices.map(inv => inv.vendorName).filter(Boolean))].map(name => ({ text: name, value: name })),
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
            filters: [...new Set(allApprovalInvoices.map(inv => inv.invoiceId).filter(Boolean))].map(id => ({ text: id, value: id })),
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
            title: 'Uploaded By',
            dataIndex: 'uploadedBy',
            key: 'uploadedBy',
            width: 160,
            sorter: (a, b) => (a.uploadedBy || '').localeCompare(b.uploadedBy || ''),
            multiple: 4,
            filterSearch: true,
            filters: [...new Set(allApprovalInvoices.map(inv => inv.uploadedBy).filter(Boolean))].map(user => ({ text: user, value: user })),
            onFilter: (value, record) => record.uploadedBy === value,
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            width: 140,
            sorter: (a, b) => (a.status || '').localeCompare(b.status || ''),
            multiple: 5,
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
                        text = 'Waiting Coding';
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
                }

                return <Tag color={color}>{text}</Tag>;
            },
        },
        {
            title: 'Approver',
            dataIndex: 'approverName',
            key: 'approverName',
            width: 150,
            sorter: (a, b) => (a.approverName || '').localeCompare(b.approverName || ''),
            multiple: 6,
        },
        {
            title: 'Action Time',
            dataIndex: 'approvalTime',
            key: 'approvalTime',
            width: 200,
            sorter: (a, b) => {
                if (!a.approvalTime || a.approvalTime === '—') return 1;
                if (!b.approvalTime || b.approvalTime === '—') return -1;
                return new Date(a.approvalTime) - new Date(b.approvalTime);
            },
            multiple: 7,
        },
        {
            title: 'Comment',
            dataIndex: 'approverComment',
            key: 'approverComment',
            width: 200,
            ellipsis: {
                showTitle: false,
            },
            render: (comment) => (
                comment ? (
                    <Tooltip title={comment} placement="topLeft">
                        <span style={{ cursor: 'pointer' }}>{comment}</span>
                    </Tooltip>
                ) : '—'
            ),
        },
        {
            title: 'Last Updated',
            dataIndex: 'lastUpdated',
            key: 'lastUpdated',
            width: 200,
            sorter: (a, b) => new Date(a.lastUpdated) - new Date(b.lastUpdated),
            multiple: 8,
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

    const ApprovalsTable = () => {
        if (loading && data.length === 0) {
            return <TableSkeleton />;
        }

        return (
            <>
                <div className="table-toolbar" style={{ marginBottom: 16 }}>
                    <Input
                        placeholder="Search approvals..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        allowClear
                        className="table-search-input"
                        style={{ width: 300 }}
                    />
                </div>

                <Table
                    columns={columns}
                    dataSource={filteredData}
                    loading={loading}
                    pagination={{
                        defaultPageSize: 10,
                        showSizeChanger: true,
                        pageSizeOptions: ['5', '10', '20', '50'],
                    }}
                    scroll={{ x: 'max-content', y: 'calc(100vh - 280px)' }}
                    bordered
                    className="invoices-table approvals-table"
                />
            </>
        );
    };

    const items = [
        {
            key: '1',
            label: 'Unapproved Invoices',
            children: <ApprovalsTable />,
        },
        {
            key: '2',
            label: 'Change Approver (Delegation)',
            children: <DelegationManager isAdmin={false} onUpdate={fetchInvoices} />,
        },
    ];

    return (
        <div style={{ padding: '24px' }}>
            <Tabs defaultActiveKey="1" items={items} />
        </div>
    );
};

export default ApprovalsPage;
