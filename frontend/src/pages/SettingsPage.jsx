import React, { useState, useEffect } from 'react';
import {
    Card,
    Typography,
    Tabs,
    Table,
    Button,
    Space,
    Modal,
    Form,
    Input,
    InputNumber,
    message,
    Spin
} from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { approverConfigService } from '../services/api';

const { Title, Text } = Typography;

const SettingsPage = () => {
    const [amountRules, setAmountRules] = useState([]);
    const [vendorRules, setVendorRules] = useState([]);
    const [glRules, setGlRules] = useState([]);
    const [defaultConfig, setDefaultConfig] = useState(null);
    const [loading, setLoading] = useState(false);

    // Modal State
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [modalType, setModalType] = useState(null); // 'amount', 'vendor', 'gl'
    const [editingRecord, setEditingRecord] = useState(null);
    const [form] = Form.useForm();

    const fetchRules = async () => {
        setLoading(true);
        try {
            const [amountData, vendorData, glData, defaultData] = await Promise.all([
                approverConfigService.getAmountRules(),
                approverConfigService.getAllConfigs(),
                approverConfigService.getGLRules(),
                approverConfigService.getDefaultConfig()
            ]);
            console.log('Amount Rules:', amountData);
            console.log('Vendor Rules:', vendorData);
            console.log('GL Rules:', glData);
            console.log('Default Config:', defaultData);
            setAmountRules(amountData);
            setVendorRules(vendorData);
            setGlRules(glData);
            setDefaultConfig(defaultData);
        } catch (error) {
            console.error("Error fetching rules:", error);
            message.error("Failed to fetch rules");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRules();
    }, []);

    // Handlers
    const handleAdd = (type) => {
        setModalType(type);
        setEditingRecord(null);
        form.resetFields();
        setIsModalVisible(true);
    };

    const handleEdit = (record, type) => {
        setModalType(type);
        setEditingRecord(record);
        form.setFieldsValue(record);
        setIsModalVisible(true);
    };

    const handleDelete = async (record, type) => {
        try {
            if (type === 'amount') {
                await approverConfigService.deleteAmountRule(record.id);
            } else if (type === 'vendor') {
                await approverConfigService.deleteConfig(record.vendorName);
            } else if (type === 'gl') {
                await approverConfigService.deleteGLRule(record.glTitle);
            }
            message.success('Rule deleted successfully');
            fetchRules();
        } catch (error) {
            console.error("Error deleting rule:", error);
            message.error("Failed to delete rule");
        }
    };

    const handleSave = async () => {
        try {
            const values = await form.validateFields();
            if (modalType === 'amount') {
                // Amount API doesn't have update yet for ID, just create new for simplicity or handle edit logic
                // If editing, we might need a different API call or pass ID. 
                // The backend 'create' handles basic insertion. For update, we'd need a specific PUT or handle it.
                // Given the backend `create_amount_rule` is a POST, let's treat it as create.
                // If we strictly followed the plan, we might not have full Edit for Amount/GL yet on backend for PUT if not explicitly added.
                // Let's check backend... `create_or_update_approver_config` handles Vendor. 
                // `create_gl_rule` handles GL update.
                // `create_amount_rule` is pure insert. I'll just do insert for Amount for now, or delete-then-insert for 'edit' to mimic update if needed, but for now I will assume Add Only for Amount or Add new.
                // But actually, for Amount, since it's range based, 'editing' usually means changing the range.

                if (editingRecord) {
                    // For Amount, since I didn't make a PUT endpoint, I'll delete old and create new
                    await approverConfigService.deleteAmountRule(editingRecord.id);
                }
                await approverConfigService.createAmountRule(values);

            } else if (modalType === 'vendor') {
                await approverConfigService.createOrUpdateConfig(values);
            } else if (modalType === 'gl') {
                await approverConfigService.createGLRule(values);
            }

            setIsModalVisible(false);
            message.success('Rule saved successfully');
            fetchRules();
        } catch (error) {
            console.error("Error saving rule:", error);
            message.error("Failed to save rule");
        }
    };

    // Columns
    const amountColumns = [
        { title: 'Min Amount', dataIndex: 'min_amount', key: 'min_amount', render: (val) => `$${val?.toLocaleString() || 0}` },
        { title: 'Max Amount', dataIndex: 'max_amount', key: 'max_amount', render: (val) => `$${val?.toLocaleString() || 0}` },
        { title: 'Approvers Required', dataIndex: 'approver_count', key: 'approver_count' },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space>
                    <Button icon={<EditOutlined />} type="text" onClick={() => handleEdit(record, 'amount')} />
                    <Button icon={<DeleteOutlined />} type="text" danger onClick={() => handleDelete(record, 'amount')} />
                </Space>
            )
        }
    ];

    const vendorColumns = [
        { title: 'Vendor Name', dataIndex: 'vendorName', key: 'vendorName' },
        { title: 'Approvers Required', dataIndex: 'approverCount', key: 'approverCount' },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space>
                    <Button icon={<EditOutlined />} type="text" onClick={() => handleEdit(record, 'vendor')} />
                    <Button icon={<DeleteOutlined />} type="text" danger onClick={() => handleDelete(record, 'vendor')} />
                </Space>
            )
        }
    ];

    const glColumns = [
        { title: 'GL Code', dataIndex: 'glTitle', key: 'glTitle' },
        { title: 'Approvers Required', dataIndex: 'approverCount', key: 'approverCount' },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space>
                    <Button icon={<EditOutlined />} type="text" onClick={() => handleEdit(record, 'gl')} />
                    <Button icon={<DeleteOutlined />} type="text" danger onClick={() => handleDelete(record, 'gl')} />
                </Space>
            )
        }
    ];

    const paginationConfig = {
        defaultPageSize: 10,
        showSizeChanger: true,
        showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
        pageSizeOptions: ['10', '20', '50'],
    };

    const renderDefaultSettings = () => (
        <div style={{ padding: '20px 0' }}>
            {/* <Title level={4}></Title> */}
            <Text type="secondary" style={{ display: 'block', marginBottom: '20px' }}>
                This setting defines the default number of approvers required when no specific Vendor or Amount rule matches.
            </Text>

            <Form
                layout="inline"
                onFinish={async (values) => {
                    try {
                        await approverConfigService.createOrUpdateDefaultConfig(values);
                        message.success("Default settings updated successfully");
                        fetchRules();
                    } catch (err) {
                        message.error("Failed to update default settings");
                    }
                }}
                initialValues={defaultConfig}
                key={defaultConfig?.updated_at || 'loading'} // Force re-render when data loads
            >
                <Form.Item
                    name="default_approver_count"
                    label="Default Approvers Required"
                    rules={[{ required: true }]}
                >
                    <InputNumber min={1} max={4} />
                </Form.Item>
                <Form.Item>
                    <Button type="primary" htmlType="submit">
                        Save
                    </Button>
                </Form.Item>
            </Form>
        </div>
    );

    const renderTabContent = (type, columns, data) => (
        <div>
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => handleAdd(type)}>
                    Add Rule
                </Button>
            </div>
            <Table
                columns={columns}
                dataSource={data || []}
                rowKey={(record) => record.id || record.vendorName || record.glTitle}
                loading={loading}
                pagination={paginationConfig}
            />
        </div>
    );

    const items = [
        {
            key: '0',
            label: 'Default',
            children: renderDefaultSettings(),
        },
        {
            key: '1',
            label: 'By Amount',
            children: renderTabContent('amount', amountColumns, amountRules),
        },
        {
            key: '2',
            label: 'By Vendor Name',
            children: renderTabContent('vendor', vendorColumns, vendorRules),
        },
        {
            key: '3',
            label: 'By GL Code',
            children: renderTabContent('gl', glColumns, glRules),
        },
    ];

    return (
        <div style={{ padding: '24px' }}>
            <Card title="Approval Workflow Settings">
                <Tabs defaultActiveKey="1" items={items} />
            </Card>

            <Modal
                title={`Add/Edit ${modalType === 'amount' ? 'Amount' : modalType === 'vendor' ? 'Vendor' : 'GL'} Rule`}
                open={isModalVisible}
                onOk={handleSave}
                onCancel={() => setIsModalVisible(false)}
                destroyOnHidden
            >
                <Form form={form} layout="vertical">
                    {modalType === 'amount' && (
                        <>
                            <Form.Item name="min_amount" label="Min Amount" rules={[{ required: true }]}>
                                <InputNumber style={{ width: '100%' }} formatter={value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={value => value.replace(/\$\s?|(,*)/g, '')} />
                            </Form.Item>
                            <Form.Item name="max_amount" label="Max Amount" rules={[{ required: true }]}>
                                <InputNumber style={{ width: '100%' }} formatter={value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={value => value.replace(/\$\s?|(,*)/g, '')} />
                            </Form.Item>
                            <Form.Item name="approver_count" label="Approvers Required" rules={[{ required: true }]}>
                                <InputNumber min={1} max={4} style={{ width: '100%' }} />
                            </Form.Item>
                        </>
                    )}
                    {modalType === 'vendor' && (
                        <>
                            <Form.Item name="vendorName" label="Vendor Name" rules={[{ required: true }]}>
                                <Input disabled={!!editingRecord} />
                            </Form.Item>
                            <Form.Item name="approverCount" label="Approvers Required" rules={[{ required: true }]}>
                                <InputNumber min={1} max={4} style={{ width: '100%' }} />
                            </Form.Item>
                        </>
                    )}
                    {modalType === 'gl' && (
                        <>
                            <Form.Item name="glTitle" label="GL Code" rules={[{ required: true }]}>
                                <Input disabled={!!editingRecord} />
                            </Form.Item>
                            <Form.Item name="approverCount" label="Approvers Required" rules={[{ required: true }]}>
                                <InputNumber min={1} max={4} style={{ width: '100%' }} />
                            </Form.Item>
                        </>
                    )}
                </Form>
            </Modal>
        </div>
    );
};

export default SettingsPage;
