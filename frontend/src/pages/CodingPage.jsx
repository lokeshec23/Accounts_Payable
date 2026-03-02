import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Tag, Space, message } from 'antd';
import { EyeOutlined } from '@ant-design/icons';
import { TableSkeleton } from '../components/SkeletonLoader';
import { invoiceService, currencyService } from '../services/api';
import { formatDateTimeIST } from '../utils/dateUtils';
import '../styles/MainLayout.css';

const CodingPage = () => {
    const navigate = useNavigate();

    const [allCodingInvoices, setAllCodingInvoices] = useState([]);
    const [loading, setLoading] = useState(false);
    const [currencies, setCurrencies] = useState([]);
    const [pageSize, setPageSize] = useState(10);

    // ✅ Fetch invoices only once
    const fetchInvoices = async () => {
        try {
            setLoading(true);

            const response = await invoiceService.getInvoices(0, 1000);
            const invoicesArray = Array.isArray(response) ? response : [];

            const validStatuses = [
                'coding',
                'waiting_coding',
                'reworked',
                'waiting_approval',
            ];

            const codingInvoices = invoicesArray.filter(inv =>
                validStatuses.includes(inv.status)
            );

            const transformedData = codingInvoices.map((invoice) => ({
                key: invoice._id || invoice.id,
                id: invoice._id || invoice.id,
                filename:
                    invoice.original_filename ||
                    invoice.filename ||
                    'N/A',
                vendorName:
                    invoice.extracted_data?.vendor_info?.name?.value ||
                    'N/A',
                invoiceId:
                    invoice.extracted_data?.invoice_details?.invoice_number
                        ?.value || 'N/A',
                totalAmount:
                    invoice.extracted_data?.amounts?.total_invoice_amount
                        ?.value || '',
                amountDue:
                    invoice.extracted_data?.amounts?.amount_due?.value ||
                    '',
                lastUpdated: formatDateTimeIST(
                    invoice.processed_at || invoice.uploaded_at
                ),
                uploadedBy: invoice.uploaded_by || 'Unknown',
                status: invoice.status || 'coding',
                fileUrl: invoice.file_url || '/sample-invoice.pdf',
                rawData: invoice,
                currency:
                    invoice.extracted_data?.invoice_details?.currency
                        ?.value || 'USD',
            }));

            setAllCodingInvoices(transformedData);

        } catch (error) {
            console.error('Error fetching invoices:', error);
            message.error('Failed to load invoices.');
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
                console.error('Failed to fetch currencies', err);
            }
        };

        fetchCurrencies();
    }, []);

    // ✅ Dynamic filter generator
    const generateFilters = (field) => {
        return [
            ...new Set(
                allCodingInvoices
                    .map(item => item[field])
                    .filter(val => val && val !== 'N/A')
            ),
        ].map(val => ({
            text: val,
            value: val,
        }));
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
            width: 200,
            sorter: (a, b) =>
                (a.vendorName || '').localeCompare(b.vendorName || ''),
            filters: generateFilters('vendorName'),
            onFilter: (value, record) =>
                record.vendorName === value,
            filterSearch: true,
        },
        {
            title: 'Invoice ID',
            dataIndex: 'invoiceId',
            key: 'invoiceId',
            width: 180,
            sorter: (a, b) =>
                (a.invoiceId || '').localeCompare(b.invoiceId || ''),
            filters: generateFilters('invoiceId'),
            onFilter: (value, record) =>
                record.invoiceId === value,
            filterSearch: true,
        },
        {
            title: 'Total Amount',
            dataIndex: 'totalAmount',
            key: 'totalAmount',
            width: 150,
            sorter: (a, b) =>
                (parseFloat(a.totalAmount) || 0) -
                (parseFloat(b.totalAmount) || 0),
            render: (val) => {
                if (!val) return '-';
                const cleanVal = val
                    .toString()
                    .replace(/[$,₹,€]/g, '')
                    .trim();
                return `$${cleanVal}`;
            },
        },
        {
            title: 'Amount Due',
            dataIndex: 'amountDue',
            key: 'amountDue',
            width: 150,
            sorter: (a, b) =>
                (parseFloat(a.amountDue) || 0) -
                (parseFloat(b.amountDue) || 0),
            render: (val) => {
                if (!val) return '-';
                const cleanVal = val
                    .toString()
                    .replace(/[$,₹,€]/g, '')
                    .trim();
                return `$${cleanVal}`;
            },
        },
        {
            title: 'Last Updated',
            dataIndex: 'lastUpdated',
            key: 'lastUpdated',
            width: 200,
            sorter: (a, b) =>
                new Date(a.lastUpdated) -
                new Date(b.lastUpdated),
        },
        {
            title: 'Uploaded By',
            dataIndex: 'uploadedBy',
            key: 'uploadedBy',
            width: 180,
            sorter: (a, b) =>
                (a.uploadedBy || '').localeCompare(b.uploadedBy || ''),
            filters: generateFilters('uploadedBy'),
            onFilter: (value, record) =>
                record.uploadedBy === value,
            filterSearch: true,
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            width: 150,
            filters: [
                { text: 'Coding', value: 'coding' },
                { text: 'Waiting Coding', value: 'waiting_coding' },
                { text: 'Waiting Approval', value: 'waiting_approval' },
                { text: 'Reworked', value: 'reworked' },
            ],
            onFilter: (value, record) =>
                record.status === value,
            render: (status) => {
                let color = 'orange';
                let text = 'Coding';

                if (status === 'waiting_coding') {
                    text = 'Waiting Coding';
                } else if (status === 'waiting_approval') {
                    color = 'gold';
                    text = 'Waiting Approval';
                } else if (status === 'reworked') {
                    color = 'purple';
                    text = 'Reworked';
                }

                return <Tag color={color}>{text}</Tag>;
            },
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 100,
            render: (_, record) => (
                <Space size="small">
                    <Button
                        type="link"
                        icon={<EyeOutlined />}
                        onClick={() => handleView(record)}
                    >
                        View
                    </Button>
                </Space>
            ),
        },
    ];

    const handleView = (record) => {
        navigate('/coding/review', {
            state: { invoice: record },
        });
    };

    return (
        <div className="main-layout">
            <div className="layout-content">
                {loading && allCodingInvoices.length === 0 ? (
                    <TableSkeleton />
                ) : (
                    <Table
                        columns={columns}
                        dataSource={allCodingInvoices}
                        loading={loading}
                            pagination={{
                                pageSize: pageSize,
                                showSizeChanger: true,
                                pageSizeOptions: ['5', '10', '20', '50'],
                                onShowSizeChange: (current, size) => {
                                    setPageSize(size);
                                },
                                showTotal: (total, range) =>
                                    `${range[0]}-${range[1]} of ${total} items`,
                            }}
                        className="invoices-table"
                        scroll={{
                            x: 1300,
                            y: 'calc(100vh - 320px)',
                        }}
                    />
                )}
            </div>
        </div>
    );
};

export default CodingPage;