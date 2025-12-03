import React, { useState } from 'react';
import { Card, Typography, Tabs, Table, Button, Space } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';

const { Title } = Typography;

const MasterDataPage = () => {
    const [vendorData, setVendorData] = useState([
        {
            key: '1',
            vendorCode: 'V001',
            vendorName: 'Sample Vendor 1',
            address: '123 Main St, City',
            contactPerson: 'John Doe',
            email: 'john@vendor1.com',
            phone: '+1234567890',
            taxId: 'TAX123456',
        },
    ]);

    const vendorColumns = [
        {
            title: 'Vendor Code',
            dataIndex: 'vendorCode',
            key: 'vendorCode',
            width: 120,
        },
        {
            title: 'Vendor Name',
            dataIndex: 'vendorName',
            key: 'vendorName',
            width: 200,
        },
        {
            title: 'Address',
            dataIndex: 'address',
            key: 'address',
            width: 250,
        },
        {
            title: 'Contact Person',
            dataIndex: 'contactPerson',
            key: 'contactPerson',
            width: 150,
        },
        {
            title: 'Email',
            dataIndex: 'email',
            key: 'email',
            width: 200,
        },
        {
            title: 'Phone',
            dataIndex: 'phone',
            key: 'phone',
            width: 150,
        },
        {
            title: 'Tax ID',
            dataIndex: 'taxId',
            key: 'taxId',
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
                        icon={<EditOutlined />}
                        onClick={() => console.log('Edit', record)}
                    >
                        Edit
                    </Button>
                    <Button
                        type="link"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => console.log('Delete', record)}
                    >
                        Delete
                    </Button>
                </Space>
            ),
        },
    ];

    const items = [
        {
            key: 'vendor',
            label: 'Vendor Master Data',
            children: (
                <div style={{ padding: '24px' }}>
                    <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Title level={3}>Vendor Master Data</Title>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={() => console.log('Add new vendor')}
                        >
                            Add Vendor
                        </Button>
                    </div>
                    <Table
                        columns={vendorColumns}
                        dataSource={vendorData}
                        pagination={{
                            pageSize: 10,
                            showSizeChanger: true,
                            showTotal: (total) => `Total ${total} vendors`,
                        }}
                        scroll={{ x: 'max-content' }}
                    />
                </div>
            ),
        },
        {
            key: 'codification',
            label: 'Invoice Codification',
            children: (
                <div style={{ padding: '24px' }}>
                    <Title level={3}>Invoice Codification</Title>
                    <Tabs
                        defaultActiveKey="ca_invoice"
                        items={[
                            {
                                key: 'ca_invoice',
                                label: 'CA Invoice Codification',
                                children: (
                                    <div style={{ padding: '16px' }}>
                                        <Table
                                            columns={[
                                                { title: 'Code', dataIndex: 'code', key: 'code' },
                                                { title: 'Description', dataIndex: 'description', key: 'description' },
                                                { title: 'Category', dataIndex: 'category', key: 'category' },
                                                { title: 'Status', dataIndex: 'status', key: 'status' },
                                            ]}
                                            dataSource={[]}
                                            pagination={false}
                                        />
                                    </div>
                                ),
                            },
                            {
                                key: 'entity',
                                label: 'Entity',
                                children: (
                                    <div style={{ padding: '16px' }}>
                                        <Table
                                            columns={[
                                                { title: 'Entity Code', dataIndex: 'entityCode', key: 'entityCode' },
                                                { title: 'Entity Name', dataIndex: 'entityName', key: 'entityName' },
                                                { title: 'Type', dataIndex: 'type', key: 'type' },
                                                { title: 'Status', dataIndex: 'status', key: 'status' },
                                            ]}
                                            dataSource={[]}
                                            pagination={false}
                                        />
                                    </div>
                                ),
                            },
                            {
                                key: 'nature_expense',
                                label: 'Nature of Expense',
                                children: (
                                    <div style={{ padding: '16px' }}>
                                        <Table
                                            columns={[
                                                { title: 'Expense Code', dataIndex: 'expenseCode', key: 'expenseCode' },
                                                { title: 'Expense Name', dataIndex: 'expenseName', key: 'expenseName' },
                                                { title: 'Category', dataIndex: 'category', key: 'category' },
                                                { title: 'Status', dataIndex: 'status', key: 'status' },
                                            ]}
                                            dataSource={[]}
                                            pagination={false}
                                        />
                                    </div>
                                ),
                            },
                            {
                                key: 'vendor_master',
                                label: 'Vendor Master',
                                children: (
                                    <div style={{ padding: '16px' }}>
                                        <Table
                                            columns={[
                                                { title: 'Vendor Code', dataIndex: 'vendorCode', key: 'vendorCode' },
                                                { title: 'Vendor Name', dataIndex: 'vendorName', key: 'vendorName' },
                                                { title: 'Contact', dataIndex: 'contact', key: 'contact' },
                                                { title: 'Status', dataIndex: 'status', key: 'status' },
                                            ]}
                                            dataSource={[]}
                                            pagination={false}
                                        />
                                    </div>
                                ),
                            },
                            {
                                key: 'gl',
                                label: 'GL',
                                children: (
                                    <div style={{ padding: '16px' }}>
                                        <Table
                                            columns={[
                                                { title: 'GL Code', dataIndex: 'glCode', key: 'glCode' },
                                                { title: 'GL Name', dataIndex: 'glName', key: 'glName' },
                                                { title: 'Account Type', dataIndex: 'accountType', key: 'accountType' },
                                                { title: 'Status', dataIndex: 'status', key: 'status' },
                                            ]}
                                            dataSource={[]}
                                            pagination={false}
                                        />
                                    </div>
                                ),
                            },
                            {
                                key: 'lob',
                                label: 'LOB',
                                children: (
                                    <div style={{ padding: '16px' }}>
                                        <Table
                                            columns={[
                                                { title: 'LOB Code', dataIndex: 'lobCode', key: 'lobCode' },
                                                { title: 'LOB Name', dataIndex: 'lobName', key: 'lobName' },
                                                { title: 'Description', dataIndex: 'description', key: 'description' },
                                                { title: 'Status', dataIndex: 'status', key: 'status' },
                                            ]}
                                            dataSource={[]}
                                            pagination={false}
                                        />
                                    </div>
                                ),
                            },
                            {
                                key: 'department',
                                label: 'Department',
                                children: (
                                    <div style={{ padding: '16px' }}>
                                        <Table
                                            columns={[
                                                { title: 'Dept Code', dataIndex: 'deptCode', key: 'deptCode' },
                                                { title: 'Dept Name', dataIndex: 'deptName', key: 'deptName' },
                                                { title: 'Manager', dataIndex: 'manager', key: 'manager' },
                                                { title: 'Status', dataIndex: 'status', key: 'status' },
                                            ]}
                                            dataSource={[]}
                                            pagination={false}
                                        />
                                    </div>
                                ),
                            },
                            {
                                key: 'custom_master',
                                label: 'Custom Master',
                                children: (
                                    <div style={{ padding: '16px' }}>
                                        <Table
                                            columns={[
                                                { title: 'Custom Code', dataIndex: 'customCode', key: 'customCode' },
                                                { title: 'Custom Name', dataIndex: 'customName', key: 'customName' },
                                                { title: 'Type', dataIndex: 'type', key: 'type' },
                                                { title: 'Status', dataIndex: 'status', key: 'status' },
                                            ]}
                                            dataSource={[]}
                                            pagination={false}
                                        />
                                    </div>
                                ),
                            },
                            {
                                key: 'item',
                                label: 'Item',
                                children: (
                                    <div style={{ padding: '16px' }}>
                                        <Table
                                            columns={[
                                                { title: 'Item Code', dataIndex: 'itemCode', key: 'itemCode' },
                                                { title: 'Item Name', dataIndex: 'itemName', key: 'itemName' },
                                                { title: 'Category', dataIndex: 'category', key: 'category' },
                                                { title: 'Status', dataIndex: 'status', key: 'status' },
                                            ]}
                                            dataSource={[]}
                                            pagination={false}
                                        />
                                    </div>
                                ),
                            },
                        ]}
                    />
                </div>
            ),
        },
    ];

    return (
        <div style={{ padding: '24px' }}>
            <Card>
                <Title level={2}></Title>
                <Tabs defaultActiveKey="vendor" items={items} />
            </Card>
        </div>
    );
};

export default MasterDataPage;

