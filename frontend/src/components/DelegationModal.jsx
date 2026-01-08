import React, { useState, useEffect } from 'react';
import { Modal, Form, Select, DatePicker, Button, Table, Space, message, Tag } from 'antd';
import { delegationService, workflowConfigService } from '../services/api';
import moment from 'moment';

const { RangePicker } = DatePicker;
const { Option } = Select;

const DelegationModal = ({ open, onCancel, isAdmin = false }) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [delegations, setDelegations] = useState([]);
    const [approvers, setApprovers] = useState([]);
    const storedUser = JSON.parse(localStorage.getItem('user'));

    const fetchDelegations = async () => {
        try {
            const data = await delegationService.getDelegations();
            setDelegations(data);
        } catch (error) {
            console.error('Failed to fetch delegations:', error);
        }
    };

    const fetchApprovers = async () => {
        try {
            const data = await workflowConfigService.getApprovers();
            setApprovers(data);
        } catch (error) {
            console.error('Failed to fetch approvers:', error);
        }
    };

    useEffect(() => {
        if (open) {
            fetchDelegations();
            fetchApprovers();
            if (!isAdmin) {
                form.setFieldsValue({ original_approver: storedUser?.email });
            }
        }
    }, [open, isAdmin, storedUser?.email, form]);

    const handleCreate = async (values) => {
        setLoading(true);
        try {
            const payload = {
                original_approver: values.original_approver,
                substitute_approver: values.substitute_approver,
                start_date: values.dates[0].toISOString(),
                end_date: values.dates[1].toISOString(),
            };
            await delegationService.createDelegation(payload);
            message.success('Delegation created successfully');
            form.resetFields();
            if (!isAdmin) {
                form.setFieldsValue({ original_approver: storedUser?.email });
            }
            fetchDelegations();
        } catch (error) {
            message.error(error.response?.data?.detail || 'Failed to create delegation');
        } finally {
            setLoading(false);
        }
    };

    const handleRevert = async (id) => {
        try {
            await delegationService.revertDelegation(id);
            message.success('Delegation reverted');
            fetchDelegations();
        } catch (error) {
            message.error('Failed to revert delegation');
        }
    };

    const columns = [
        {
            title: 'Original Approver',
            dataIndex: 'original_approver',
            key: 'original_approver',
        },
        {
            title: 'Substitute',
            dataIndex: 'substitute_approver',
            key: 'substitute_approver',
        },
        {
            title: 'From',
            dataIndex: 'start_date',
            key: 'start_date',
            render: (date) => moment(date).format('YYYY-MM-DD'),
        },
        {
            title: 'To',
            dataIndex: 'end_date',
            key: 'end_date',
            render: (date) => moment(date).format('YYYY-MM-DD'),
        },
        {
            title: 'Status',
            key: 'status',
            render: (_, record) => {
                const now = moment();
                const start = moment(record.start_date);
                const end = moment(record.end_date);
                if (now.isBetween(start, end, 'day', '[]')) {
                    return <Tag color="green">Active</Tag>;
                } else if (now.isBefore(start)) {
                    return <Tag color="blue">Scheduled</Tag>;
                } else {
                    return <Tag color="default">Expired</Tag>;
                }
            }
        },
        {
            title: 'Action',
            key: 'action',
            render: (_, record) => (
                <Button type="link" danger onClick={() => handleRevert(record._id)}>
                    Revert
                </Button>
            ),
        },
    ];

    return (
        <Modal
            title="Manage Approver Delegation"
            open={open}
            onCancel={onCancel}
            footer={null}
            width={800}
        >
            <Form form={form} layout="vertical" onFinish={handleCreate}>
                <Space align="start">
                    <Form.Item
                        name="original_approver"
                        label="From Approver"
                        rules={[{ required: true }]}
                        style={{ width: 200 }}
                    >
                        <Select disabled={!isAdmin}>
                            {approvers.map(a => (
                                <Option key={a.email} value={a.email}>{a.username} ({a.email})</Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item
                        name="substitute_approver"
                        label="To Substitute"
                        rules={[{ required: true }]}
                        style={{ width: 200 }}
                    >
                        <Select showSearch optionFilterProp="children">
                            {approvers.map(a => (
                                <Option key={a.email} value={a.email}>{a.username} ({a.email})</Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item
                        name="dates"
                        label="Date Range"
                        rules={[{ required: true }]}
                    >
                        <RangePicker />
                    </Form.Item>
                    <Form.Item label=" ">
                        <Button type="primary" htmlType="submit" loading={loading}>
                            Add
                        </Button>
                    </Form.Item>
                </Space>
            </Form>

            <Table
                dataSource={delegations}
                columns={columns}
                rowKey="_id"
                pagination={{ pageSize: 5 }}
                size="small"
                style={{ marginTop: 20 }}
            />
        </Modal>
    );
};

export default DelegationModal;
