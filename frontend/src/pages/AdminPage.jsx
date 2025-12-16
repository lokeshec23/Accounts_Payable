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
    Typography,
    Tabs,
    Input
} from 'antd';
import { EditOutlined, CheckCircleOutlined, StopOutlined, PlusOutlined } from '@ant-design/icons';
import { adminService } from '../services/api';
import { useGlobalSettings } from '../context/GlobalSettingsContext';

const { Title } = Typography;
const { Option } = Select;

const AdminPage = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [form] = Form.useForm();
    const [newRole, setNewRole] = useState("");
    const [newStatus, setNewStatus] = useState("");
    const { settings, updateSettings } = useGlobalSettings(); // Re-add updateSettings

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

    const renderUserManagement = () => (
        <>
            <Table
                columns={columns}
                dataSource={users}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 10 }}
            />
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
                            {settings.roles && settings.roles.map(role => (
                                <Option key={role} value={role}>{role.toUpperCase()}</Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item name="status" label="Status" rules={[{ required: true }]}>
                        <Select>
                            {settings.statuses && settings.statuses.map(status => (
                                <Option key={status} value={status}>{status.toUpperCase()}</Option>
                            ))}
                        </Select>
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );

    const renderGlobalConfig = () => {
        const handleAddRole = async () => {
             if (!newRole.trim()) return;
             if (settings.roles.includes(newRole.trim().toLowerCase())) {
                 message.error("Role already exists");
                 return;
             }
             const updated = { ...settings, roles: [...settings.roles, newRole.trim().toLowerCase()] };
             await updateSettings(updated);
             setNewRole("");
             message.success("Role added");
        };

        const handleDeleteRole = async (role) => {
            if (role === 'admin') {
                message.error("Cannot delete admin role");
                return;
            }
             const updated = { ...settings, roles: settings.roles.filter(r => r !== role) };
             await updateSettings(updated);
             message.success("Role deleted");
        };

        const handleAddStatus = async () => {
             if (!newStatus.trim()) return;
             const statusSlug = newStatus.trim().toLowerCase().replace(/\s+/g, '_');
             if (settings.statuses.includes(statusSlug)) {
                 message.error("Status already exists");
                 return;
             }
             const updated = { ...settings, statuses: [...settings.statuses, statusSlug] };
             await updateSettings(updated);
             setNewStatus("");
             message.success("Status added");
        };

        const handleDeleteStatus = async (status) => {
             const updated = { ...settings, statuses: settings.statuses.filter(s => s !== status) };
             await updateSettings(updated);
             message.success("Status deleted");
        };

        const handleNavRoleChange = async (path, newRoles) => {
            const updatedNav = settings.navigation.map(item => {
                if (item.path === path) {
                    return { ...item, roles: newRoles };
                }
                return item;
            });
            const updated = { ...settings, navigation: updatedNav };
            await updateSettings(updated);
            message.success("Navigation permission updated");
        };

        const navColumns = [
            { title: 'Label', dataIndex: 'label', key: 'label' },
            { title: 'Path', dataIndex: 'path', key: 'path' },
            {
                title: 'Visible To',
                key: 'roles',
                render: (_, record) => (
                    <Select
                        mode="multiple"
                        style={{ width: '100%' }}
                        placeholder="Select roles"
                        value={record.roles}
                        onChange={(val) => handleNavRoleChange(record.path, val)}
                        options={[
                            { label: 'All', value: 'all' },
                            ...settings.roles.map(r => ({ label: r.toUpperCase(), value: r }))
                        ]}
                    />
                )
            }
        ];

        return (
            <div style={{ padding: '20px 0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px' }}>
                    <Card title="Manage Roles" size="small">
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                            <Input 
                                placeholder="New Role Name" 
                                value={newRole} 
                                onChange={e => setNewRole(e.target.value)}
                            />
                            <Button type="primary" onClick={handleAddRole} icon={<PlusOutlined />}>Add</Button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {settings.roles && settings.roles.map(role => (
                                <Tag key={role} closable={role !== 'admin'} onClose={() => handleDeleteRole(role)} color="blue">
                                    {role.toUpperCase()}
                                </Tag>
                            ))}
                        </div>
                    </Card>

                    <Card title="Manage Statuses" size="small">
                         <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                            <Input 
                                placeholder="New Status Name" 
                                value={newStatus} 
                                onChange={e => setNewStatus(e.target.value)}
                            />
                            <Button type="primary" onClick={handleAddStatus} icon={<PlusOutlined />}>Add</Button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {settings.statuses && settings.statuses.map(status => (
                                <Tag key={status} closable onClose={() => handleDeleteStatus(status)} color="gold">
                                    {status.toUpperCase()}
                                </Tag>
                            ))}
                        </div>
                    </Card>
                </div>

                <Card title="Navigation Visibility" size="small">
                     <Table 
                        dataSource={settings.navigation} 
                        columns={navColumns} 
                        pagination={false}
                        rowKey="path"
                        size="small"
                     />
                </Card>
            </div>
        );
    };

    const items = [
        { key: '1', label: 'User Management', children: renderUserManagement() },
        { key: '2', label: 'Global Config', children: renderGlobalConfig() }
    ];

    return (
        <div style={{ padding: '24px' }}>
             <Typography.Title level={2}>Admin Dashboard</Typography.Title>
            <Card>
                <Tabs defaultActiveKey="1" items={items} />
            </Card>
        </div>
    );
};

export default AdminPage;
