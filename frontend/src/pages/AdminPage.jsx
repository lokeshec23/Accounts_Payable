import React, { useState, useEffect } from 'react';
import {
    Card,
    Table,
    Button,
    Tag,
    Space,
    Modal,
    Form,
    Select,
    message,
    Typography
} from 'antd';
import { EditOutlined, CheckCircleOutlined, StopOutlined } from '@ant-design/icons';
import { adminService } from '../services/api';

const { Title } = Typography;
const { Option } = Select;

const AdminPage = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [form] = Form.useForm();

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const data = await adminService.getAllUsers();
            setUsers(data);
        } catch (error) {
            console.error("Error fetching users:", error);
            message.error("Failed to load users");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleEdit = (user) => {
        setEditingUser(user);
        form.setFieldsValue({
            role: user.role,
            status: user.status
        });
        setIsModalVisible(true);
    };

    const handleSave = async () => {
        try {
            const values = await form.validateFields();
            await adminService.updateUserRole(editingUser.id, values.role, values.status);
            message.success('User updated successfully');
            setIsModalVisible(false);
            fetchUsers();
        } catch (error) {
            console.error("Error updating user:", error);
            message.error("Failed to update user");
        }
    };

    const columns = [
        {
            title: 'Username',
            dataIndex: 'username',
            key: 'username',
        },
        {
            title: 'Email',
            dataIndex: 'email',
            key: 'email',
        },
        {
            title: 'Role',
            dataIndex: 'role',
            key: 'role',
            render: (role) => {
                let color = 'geekblue';
                if (role === 'admin') color = 'red';
                if (role === 'coder') color = 'green';
                if (role === 'approver') color = 'purple';
                return <Tag color={color}>{role.toUpperCase()}</Tag>;
            }
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (status) => {
                let color = 'default';
                if (status === 'active') color = 'success';
                if (status === 'pending') color = 'warning';
                if (status === 'rejected') color = 'error';
                return <Tag color={color}>{status.toUpperCase()}</Tag>;
            }
        },
        {
            title: 'Created At',
            dataIndex: 'created_at',
            key: 'created_at',
            render: (date) => new Date(date).toLocaleDateString()
        },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Space>
                    <Button
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record)}
                    >
                        Edit
                    </Button>
                </Space>
            )
        }
    ];

    return (
        <div style={{ padding: '24px' }}>
            <Card title="User Management (Admin)">
                <Table
                    columns={columns}
                    dataSource={users}
                    rowKey="id"
                    loading={loading}
                    pagination={{ pageSize: 10 }}
                />
            </Card>

            <Modal
                title={`Edit User: ${editingUser?.username}`}
                open={isModalVisible}
                onOk={handleSave}
                onCancel={() => setIsModalVisible(false)}
                destroyOnHidden
            >
                <Form form={form} layout="vertical">
                    <Form.Item name="role" label="Role" rules={[{ required: true }]}>
                        <Select>
                            <Option value="user">User</Option>
                            <Option value="coder">Coder</Option>
                            <Option value="approver">Approver</Option>
                            <Option value="admin">Admin</Option>
                        </Select>
                    </Form.Item>
                    <Form.Item name="status" label="Status" rules={[{ required: true }]}>
                        <Select>
                            <Option value="pending">Pending</Option>
                            <Option value="active">Active</Option>
                            <Option value="rejected">Rejected</Option>
                        </Select>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default AdminPage;
