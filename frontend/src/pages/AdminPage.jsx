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
import { EditOutlined, CheckCircleOutlined, StopOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { adminService } from '../services/api';
import { useGlobalSettings } from '../context/GlobalSettingsContext';

const { Title } = Typography;
const { Option } = Select;

const AdminPage = () => {
    const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [isNavModalOpen, setIsNavModalOpen] = useState(false);
    const [editingNav, setEditingNav] = useState(null);
    const [newRoleTabs, setNewRoleTabs] = useState([]);
    
    // User Management State
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [form] = Form.useForm(); // For User Edit Modal
    
    // Forms for Modals
    const [roleForm] = Form.useForm();
    const [statusForm] = Form.useForm();
    const [navForm] = Form.useForm();

    const { settings, updateSettings } = useGlobalSettings();

    // ... (fetchUsers and renderUserManagement keep same logic, just ensure state doesn't conflict)
    // Actually, I need to keep the user management state too.

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
        { title: 'Username', dataIndex: 'username', key: 'username' },
        { title: 'Email', dataIndex: 'email', key: 'email' },
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
        { title: 'Created At', dataIndex: 'created_at', key: 'created_at', render: (date) => new Date(date).toLocaleDateString() },
        {
            title: 'Actions',
            key: 'actions',
            render: (_, record) => (
                <Button icon={<EditOutlined />} onClick={() => handleEdit(record)}>Edit</Button>
            )
        }
    ];

    const renderUserManagement = () => (
        <>
            <Table columns={columns} dataSource={users} rowKey="id" loading={loading} pagination={{ pageSize: 10 }} />
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
        // Role Management
        const handleAddRole = async () => {
            try {
                const values = await roleForm.validateFields();
                const roleName = values.roleName.trim().toLowerCase();
                
                if (settings.roles.includes(roleName)) {
                    message.error("Role already exists");
                    return;
                }

                // 1. Add Role
                const updatedRoles = [...settings.roles, roleName];
                
                // 2. Update Navigation Access
                const updatedNav = settings.navigation.map(item => {
                    if (values.accessibleTabs && values.accessibleTabs.includes(item.path)) {
                        return { ...item, roles: [...item.roles, roleName] };
                    }
                    return item;
                });

                await updateSettings({ ...settings, roles: updatedRoles, navigation: updatedNav });
                
                message.success("Role added with access configured");
                setIsRoleModalOpen(false);
                roleForm.resetFields();
            } catch (err) {
                console.error(err);
            }
        };

        const handleDeleteRole = async (role) => {
            if (role === 'admin') {
                message.error("Cannot delete admin role");
                return;
            }
            await updateSettings({ ...settings, roles: settings.roles.filter(r => r !== role) });
            message.success("Role deleted");
        };

        // Status Management
        const handleAddStatus = async () => {
             try {
                const values = await statusForm.validateFields();
                const statusSlug = values.statusName.trim().toLowerCase().replace(/\s+/g, '_');
                
                if (settings.statuses.includes(statusSlug)) {
                    message.error("Status already exists");
                    return;
                }

                await updateSettings({ ...settings, statuses: [...settings.statuses, statusSlug] });
                message.success("Status added");
                setIsStatusModalOpen(false);
                statusForm.resetFields();
             } catch (err) { console.error(err); }
        };

        const handleDeleteStatus = async (status) => {
             await updateSettings({ ...settings, statuses: settings.statuses.filter(s => s !== status) });
             message.success("Status deleted");
        };

        // Navigation Management
        const openNavEdit = (record) => {
            setEditingNav(record);
            navForm.setFieldsValue({
                label: record.label,
                roles: record.roles
            });
            setIsNavModalOpen(true);
        };

        const saveNavEdit = async () => {
            try {
                const values = await navForm.validateFields();
                const updatedNav = settings.navigation.map(item => {
                    if (item.path === editingNav.path) {
                        return { ...item, label: values.label, roles: values.roles };
                    }
                    return item;
                });
                await updateSettings({ ...settings, navigation: updatedNav });
                message.success("Navigation updated");
                setIsNavModalOpen(false);
            } catch (err) { console.error(err); }
        };

        const handleDeleteNavigation = async (path) => {
            const updatedNav = settings.navigation.filter(item => item.path !== path);
            await updateSettings({ ...settings, navigation: updatedNav });
            message.success("Navigation item hidden (will return if in code)");
        };

        const navColumns = [
            { title: 'Label', dataIndex: 'label', key: 'label' },
            { title: 'Path', dataIndex: 'path', key: 'path' },
            { 
                title: 'Visible To', 
                dataIndex: 'roles', 
                key: 'roles',
                render: (roles) => (
                    <>
                        {roles.map(role => {
                             let color = 'blue';
                             if (role === 'admin') color = 'red';
                             return <Tag color={color} key={role}>{role.toUpperCase()}</Tag>;
                        })}
                    </>
                )
            },
            {
                title: 'Actions',
                key: 'actions',
                render: (_, record) => (
                    <Space>
                        <Button icon={<EditOutlined />} onClick={() => openNavEdit(record)} />
                        <Button danger icon={<DeleteOutlined />} onClick={() => handleDeleteNavigation(record.path)} />
                    </Space>
                )
            }
        ];

        return (
            <div style={{ padding: '20px 0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px' }}>
                    {/* Role Management Card */}
                    <Card 
                        title="Role Management" 
                        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setIsRoleModalOpen(true)}>Add Role</Button>}
                    >
                         <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {settings.roles && settings.roles.map(role => (
                                <Tag key={role} closable={role !== 'admin'} onClose={() => handleDeleteRole(role)} color="blue" style={{ fontSize: '14px', padding: '5px 10px' }}>
                                    {role.toUpperCase()}
                                </Tag>
                            ))}
                        </div>
                    </Card>

                    {/* Status Management Card */}
                    <Card 
                        title="Status Management" 
                        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setIsStatusModalOpen(true)}>Add Status</Button>}
                    >
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {settings.statuses && settings.statuses.map(status => (
                                <Tag key={status} closable onClose={() => handleDeleteStatus(status)} color="gold" style={{ fontSize: '14px', padding: '5px 10px' }}>
                                    {status.toUpperCase()}
                                </Tag>
                            ))}
                        </div>
                    </Card>
                </div>

                {/* Navigation Config Card */}
                <Card title="Navigation & Access Control">
                     <Table 
                        dataSource={settings.navigation} 
                        columns={navColumns} 
                        pagination={false}
                        rowKey="path"
                    />
                </Card>

                {/* --- MODALS --- */}

                {/* Add Role Modal */}
                <Modal
                    title="Add New Role"
                    open={isRoleModalOpen}
                    onOk={handleAddRole}
                    onCancel={() => setIsRoleModalOpen(false)}
                >
                    <Form form={roleForm} layout="vertical">
                        <Form.Item name="roleName" label="Role Name" rules={[{ required: true }]}>
                            <Input placeholder="e.g. Supervisor" />
                        </Form.Item>
                        <Form.Item name="accessibleTabs" label="Accessible Tabs">
                            <Select mode="multiple" placeholder="Select tabs this role can access">
                                {settings.navigation.map(nav => (
                                    <Option key={nav.path} value={nav.path}>{nav.label} ({nav.path})</Option>
                                ))}
                            </Select>
                        </Form.Item>
                    </Form>
                </Modal>

                {/* Add Status Modal */}
                <Modal
                    title="Add New Status"
                    open={isStatusModalOpen}
                    onOk={handleAddStatus}
                    onCancel={() => setIsStatusModalOpen(false)}
                >
                     <Form form={statusForm} layout="vertical">
                        <Form.Item name="statusName" label="Status Name" rules={[{ required: true }]}>
                            <Input placeholder="e.g. In Review" />
                        </Form.Item>
                    </Form>
                </Modal>

                {/* Edit Navigation Modal */}
                <Modal
                    title={`Edit Navigation: ${editingNav?.path}`}
                    open={isNavModalOpen}
                    onOk={saveNavEdit}
                    onCancel={() => setIsNavModalOpen(false)}
                >
                    <Form form={navForm} layout="vertical">
                        <Form.Item name="label" label="Label" rules={[{ required: true }]}>
                            <Input />
                        </Form.Item>
                        <Form.Item name="roles" label="Visible To (Roles)" rules={[{ required: true }]}>
                             <Select mode="multiple">
                                <Option value="all">All</Option>
                                {settings.roles.map(r => (
                                    <Option key={r} value={r}>{r.toUpperCase()}</Option>
                                ))}
                            </Select>
                        </Form.Item>
                    </Form>
                </Modal>
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
