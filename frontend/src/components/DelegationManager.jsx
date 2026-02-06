import React, { useState, useEffect } from 'react';
import { Modal, Form, Select, DatePicker, Button, Table, Space, message, Tag } from 'antd';
import { delegationService, workflowConfigService } from '../services/api';


// Native date handling
// Native date handling
const formatDate = (date) => {
    if (!date) return '';
    // If it's already YYYY-MM-DD string, just return the date part
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)) {
        return date.substring(0, 10);
    }
    const d = new Date(date);
    if (isNaN(d.getTime())) return date;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const { Option } = Select;

const DelegationManager = ({ isAdmin = false, onUpdate }) => {
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
        fetchDelegations();
        fetchApprovers();
        if (!isAdmin) {
            form.setFieldsValue({ original_approver: storedUser?.email });
        }
    }, [isAdmin, storedUser?.email, form]);

    const handleCreate = async (values) => {
        setLoading(true);
        try {
            // Helper to get local YYYY-MM-DD
            const toLocalDateString = (date) => {
                if (date && typeof date.format === 'function') {
                    return date.format('YYYY-MM-DD');
                }
                const d = new Date(date);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

            const startDate = toLocalDateString(values.start_date);
            const endDate = toLocalDateString(values.end_date);

            if (new Date(startDate) > new Date(endDate)) {
                message.error('End date cannot be before start date');
                setLoading(false);
                return;
            }

            const payload = {
                original_approver: values.original_approver,
                substitute_approver: values.substitute_approver,
                start_date: startDate,
                end_date: endDate,
            };
            await delegationService.createDelegation(payload);
            message.success('Delegation created successfully');
            form.resetFields();
            if (!isAdmin) {
                form.setFieldsValue({ original_approver: storedUser?.email });
            }
            fetchDelegations();
            if (onUpdate) onUpdate();
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
            if (onUpdate) onUpdate();
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
            title: 'Start Date',
            dataIndex: 'start_date',
            key: 'start_date',
            render: (date) => formatDate(date),
        },
        {
            title: 'End Date',
            dataIndex: 'end_date',
            key: 'end_date',
            render: (date) => formatDate(date),
        },
        {
            title: 'Status',
            key: 'status',
            render: (_, record) => {
                const now = new Date();
                now.setHours(0, 0, 0, 0);
                const start = new Date(record.start_date);
                start.setHours(0, 0, 0, 0);
                const end = new Date(record.end_date);
                end.setHours(0, 0, 0, 0);

                if (now.getTime() >= start.getTime() && now.getTime() <= end.getTime()) {
                    return <Tag color="green">Active</Tag>;
                } else if (now.getTime() < start.getTime()) {
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
                <Button type="link" danger onClick={() => handleRevert(record.id)}>
                    Revert
                </Button>
            ),
        },
    ];

    return (
        <div style={{ padding: '16px' }}>
            <Form form={form} layout="vertical" onFinish={handleCreate}>
                <Space align="start">
                    <Form.Item
                        name="original_approver"
                        label="From Approver"
                        rules={[{ required: true }]}
                        style={{ width: 250 }}
                    >
                        <Select disabled={!isAdmin}>
                            {approvers.map(a => (
                                <Option key={a.value} value={a.value}>{a.label}</Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item
                        name="substitute_approver"
                        label="To Substitute"
                        rules={[{ required: true }]}
                        style={{ width: 250 }}
                    >
                        <Select showSearch optionFilterProp="children">
                            {approvers.map(a => (
                                <Option key={a.value} value={a.value}>{a.label}</Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item
                        name="start_date"
                        label="Start Date"
                        rules={[{ required: true }]}
                    >
                        <DatePicker style={{ width: 150 }} />
                    </Form.Item>
                    <Form.Item
                        name="end_date"
                        label="End Date"
                        rules={[{ required: true }]}
                    >
                        <DatePicker style={{ width: 150 }} />
                    </Form.Item>
                    <Form.Item label=" ">
                        <Button type="primary" htmlType="submit" loading={loading}>
                            Add Delegation
                        </Button>
                    </Form.Item>
                </Space>
            </Form>

            <Table
                dataSource={delegations}
                columns={columns}
                rowKey="id"
                pagination={{ pageSize: 5 }}
                size="small"
                style={{ marginTop: 20 }}
            />
        </div>
    );
};

export default DelegationManager;
