import React, { useState } from 'react';
import {
    Card,
    Typography,
    Tabs,
    Table,
    Button,
    Space,
    Modal,
    Form,
    Select,
    InputNumber,
    Input,
    Tag,
    message
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;
const { Option } = Select;

const SettingsPage = () => {
    // State for workflow rules
    const [rules, setRules] = useState([
        {
            key: '1',
            conditionField: 'totalAmount',
            conditionOperator: '>',
            conditionValue: 10000,
            approvalsRequired: 2,
            description: 'Requires 2 approvals if Total Amount is greater than $10,000'
        }
    ]);

    // Modal state
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingRule, setEditingRule] = useState(null);
    const [form] = Form.useForm();

    // Columns for the rules table
    const columns = [
        {
            title: 'Condition',
            key: 'condition',
            render: (_, record) => (
                <Space>
                    <Tag color="blue">{record.conditionField === 'totalAmount' ? 'Total Amount' : record.conditionField}</Tag>
                    <Text strong>{record.conditionOperator}</Text>
                    <Text>${record.conditionValue.toLocaleString()}</Text>
                </Space>
            ),
        },
        {
            title: 'Approvals Required',
            dataIndex: 'approvalsRequired',
            key: 'approvalsRequired',
            render: (val) => <Tag color="orange">{val} Approvals</Tag>,
        },
        {
            title: 'Description',
            dataIndex: 'description',
            key: 'description',
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space>
                    <Button
                        type="link"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record)}
                    >
                        Edit
                    </Button>
                    <Button
                        type="link"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete(record.key)}
                    >
                        Delete
                    </Button>
                </Space>
            ),
        },
    ];

    // Handlers
    const handleAdd = () => {
        setEditingRule(null);
        form.resetFields();
        setIsModalVisible(true);
    };

    const handleEdit = (record) => {
        setEditingRule(record);
        form.setFieldsValue(record);
        setIsModalVisible(true);
    };

    const handleDelete = (key) => {
        setRules(rules.filter(r => r.key !== key));
        message.success('Rule deleted successfully');
    };

    const handleSave = () => {
        form.validateFields().then(values => {
            const description = `Requires ${values.approvalsRequired} approvals if ${values.conditionField === 'totalAmount' ? 'Total Amount' : values.conditionField
                } ${values.conditionOperator} $${values.conditionValue}`;

            const newRule = {
                ...values,
                description,
                key: editingRule ? editingRule.key : Date.now().toString(),
            };

            if (editingRule) {
                setRules(rules.map(r => (r.key === editingRule.key ? newRule : r)));
                message.success('Rule updated successfully');
            } else {
                setRules([...rules, newRule]);
                message.success('Rule added successfully');
            }

            setIsModalVisible(false);
        });
    };

    const WorkflowSetupTab = () => (
        <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    {/* <Title level={3}>Approval Workflow Rules</Title> */}
                    {/* <Text type="secondary">Define rules to dynamically adjust the number of required approvals based on invoice criteria.</Text> */}
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
                    Add Rule
                </Button>
            </div>

            <Table
                columns={columns}
                dataSource={rules}
                pagination={false}
                rowKey="key"
            />

            <Modal
                title={editingRule ? "Edit Workflow Rule" : "Add Workflow Rule"}
                open={isModalVisible}
                onOk={handleSave}
                onCancel={() => setIsModalVisible(false)}
                destroyOnClose
            >
                <Form form={form} layout="vertical">
                    <Form.Item
                        name="conditionField"
                        label="Condition Field"
                        rules={[{ required: true, message: 'Please select a field' }]}
                        initialValue="totalAmount"
                    >
                        <Select>
                            <Option value="totalAmount">Total Amount</Option>
                            <Option value="vendorName">Vendor Name</Option>
                            <Option value="invoiceNumber">Invoice Number</Option>
                            <Option value="invoiceDate">Invoice Date</Option>
                            <Option value="dueDate">Due Date</Option>
                            <Option value="taxAmount">Tax Amount</Option>
                            <Option value="subtotal">Subtotal</Option>
                            <Option value="currency">Currency</Option>
                            <Option value="poNumber">PO Number</Option>
                            <Option value="vendorAddress">Vendor Address</Option>
                            <Option value="vendorTaxId">Vendor Tax ID</Option>
                            <Option value="clientName">Client Name</Option>
                        </Select>
                    </Form.Item>

                    <Space style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                        <Form.Item
                            name="conditionOperator"
                            label="Operator"
                            rules={[{ required: true }]}
                            initialValue=">"
                            style={{ width: 120 }}
                        >
                            <Select>
                                <Option value=">">Greater Than (&gt;)</Option>
                                <Option value="<">Less Than (&lt;)</Option>
                                <Option value="=">Equals (=)</Option>
                                <Option value=">=">Greater/Equal (&ge;)</Option>
                                <Option value="<=">Less/Equal (&le;)</Option>
                            </Select>
                        </Form.Item>

                        <Form.Item
                            name="conditionValue"
                            label="Value"
                            rules={[{ required: true, message: 'Please enter a value' }]}
                        >
                            <InputNumber
                                formatter={value => `$ ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                                parser={value => value.replace(/\$\s?|(,*)/g, '')}
                                style={{ width: '100%' }}
                            />
                        </Form.Item>
                    </Space>

                    <Form.Item
                        name="approvalsRequired"
                        label="Approvals Required"
                        extra="Number of approvals needed when this condition is met."
                        rules={[{ required: true, message: 'Please enter number of approvals' }]}
                        initialValue={1}
                    >
                        <InputNumber min={1} max={10} style={{ width: '100%' }} />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );

    const items = [
        {
            key: 'workflow-setup',
            label: 'Workflow Setup',
            children: <WorkflowSetupTab />,
        },
    ];

    return (
        <div style={{ padding: '24px' }}>
            <Card>
                {/* <Title level={2}>Settings</Title> */}
                <Tabs defaultActiveKey="workflow-setup" items={items} />
            </Card>
        </div>
    );
};

export default SettingsPage;

