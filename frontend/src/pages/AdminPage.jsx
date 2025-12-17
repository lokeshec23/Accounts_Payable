import React, { useEffect, useState } from "react";
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
  Input,
} from "antd";
import {
  EditOutlined,
  DeleteOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { adminService } from "../services/api";
import { useGlobalSettings } from "../context/GlobalSettingsContext";

const { Title } = Typography;
const { Option } = Select;

/* ================= ROLE COLORS ================= */
const ROLE_COLORS = {
  admin: "red",
  coder: "blue",
  approver: "purple",
};

/* ================= HIDDEN ROUTES ================= */
const HIDDEN_NAV_PATHS = [
  "/invoice/review",
  "/coding/review",
  "/design-system",
  "/select-entity",
];

const AdminPage = () => {
  const { settings, updateSettings } = useGlobalSettings();

  /* ================= USER MANAGEMENT ================= */
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm] = Form.useForm();

  /* ================= STATUS MANAGEMENT ================= */
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusForm] = Form.useForm();

  /* ================= ROLE ACCESS ================= */
  const [navModalOpen, setNavModalOpen] = useState(false);
  const [editingRoleNav, setEditingRoleNav] = useState(null);
  const [navForm] = Form.useForm();

  /* ================= ADD ROLE ================= */
  const [addRoleModalOpen, setAddRoleModalOpen] = useState(false);
  const [addRoleForm] = Form.useForm();

  /* ================= FETCH USERS ================= */
  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const data = await adminService.getAllUsers();
      setUsers(data);
    } catch {
      message.error("Failed to load users");
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  /* ================= USER EDIT ================= */

  const handleEditUser = (user) => {
    setEditingUser(user);
    userForm.setFieldsValue({
      role: user.role,
      status: user.status,
    });
    setUserModalOpen(true);
  };

  const handleSaveUser = async () => {
    const values = await userForm.validateFields();
    await adminService.updateUserRole(
      editingUser.id,
      values.role,
      values.status
    );
    message.success("User updated");
    setUserModalOpen(false);
    fetchUsers();
  };

  const userColumns = [
    { title: "Username", dataIndex: "username" },
    { title: "Email", dataIndex: "email" },
    {
      title: "Role",
      dataIndex: "role",
      render: (r) => (
        <Tag color={ROLE_COLORS[r] || "default"}>
          {r.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (s) => (
        <Tag color="gold">{s.toUpperCase()}</Tag>
      ),
    },
    {
      title: "Actions",
      render: (_, r) => (
        <Button
          type="link"
          icon={<EditOutlined />}
          onClick={() => handleEditUser(r)}
        >
          Edit
        </Button>
      ),
    },
  ];

  /* ================= STATUS MANAGEMENT ================= */

  const handleAddStatus = async () => {
    const { statusName } = await statusForm.validateFields();
    const slug = statusName.toLowerCase().replace(/\s+/g, "_");

    if (settings.statuses.includes(slug)) {
      message.error("Status already exists");
      return;
    }

    await updateSettings({
      ...settings,
      statuses: [...settings.statuses, slug],
    });

    message.success("Status added");
    setStatusModalOpen(false);
    statusForm.resetFields();
  };

  const handleDeleteStatus = async (status) => {
    await updateSettings({
      ...settings,
      statuses: settings.statuses.filter((s) => s !== status),
    });
    message.success("Status deleted");
  };

  /* ================= ROLE → LABEL MAP ================= */

  const buildRoleNavigationMap = () => {
    const map = {};
    settings.roles.forEach((r) => (map[r] = []));

    settings.navigation.forEach((nav) => {
      if (HIDDEN_NAV_PATHS.includes(nav.path)) return;
      nav.roles.forEach((r) => {
        if (map[r]) map[r].push(nav.label);
      });
    });

    return Object.entries(map).map(([role, labels]) => ({
      role,
      labels,
    }));
  };

  /* ================= EDIT ROLE ACCESS ================= */

  const openRoleNavEdit = (record) => {
    setEditingRoleNav(record);

    const selectedPaths = settings.navigation
      .filter((nav) => nav.roles.includes(record.role))
      .map((nav) => nav.path);

    navForm.setFieldsValue({
      role: record.role,
      paths: selectedPaths,
    });

    setNavModalOpen(true);
  };

  const saveRoleNavEdit = async () => {
    const { role, paths } = await navForm.validateFields();

    const updatedNavigation = settings.navigation.map((nav) => {
      const hasRole = nav.roles.includes(role);
      const shouldHave = paths.includes(nav.path);

      if (shouldHave && !hasRole) {
        return { ...nav, roles: [...nav.roles, role] };
      }

      if (!shouldHave && hasRole) {
        return {
          ...nav,
          roles: nav.roles.filter((r) => r !== role),
        };
      }

      return nav;
    });

    await updateSettings({
      ...settings,
      navigation: updatedNavigation,
    });

    message.success("Access updated");
    setNavModalOpen(false);
  };

  /* ================= DELETE ROLE ================= */

  const handleDeleteRole = (role) => {
    Modal.confirm({
      title: `Delete role "${role}"?`,
      okType: "danger",
      async onOk() {
        await updateSettings({
          ...settings,
          roles: settings.roles.filter((r) => r !== role),
          navigation: settings.navigation.map((n) => ({
            ...n,
            roles: n.roles.filter((r) => r !== role),
          })),
        });
        message.success("Role deleted");
      },
    });
  };

  /* ================= ADD ROLE ================= */

  const handleAddRole = async () => {
    const { roleName } = await addRoleForm.validateFields();
    const role = roleName.trim().toLowerCase();

    if (settings.roles.includes(role)) {
      message.error("Role already exists");
      return;
    }

    const updatedNav = settings.navigation.map((n) =>
      n.path === "/dashboard"
        ? { ...n, roles: [...n.roles, role] }
        : n
    );

    await updateSettings({
      ...settings,
      roles: [...settings.roles, role],
      navigation: updatedNav,
    });

    message.success("Role added with Dashboard access");
    setAddRoleModalOpen(false);
    addRoleForm.resetFields();
  };

  /* ================= NAV TABLE ================= */

  const navColumns = [
    {
      title: "Role",
      dataIndex: "role",
      render: (r) => (
        <Tag color={ROLE_COLORS[r] || "default"}>
          {r.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: "Labels",
      dataIndex: "labels",
      render: (labels) => (
        <Space wrap>
          {labels.map((l) => (
            <Tag key={l} color="geekblue">
              {l}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title: "Actions",
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => openRoleNavEdit(record)}
          >
            Edit
          </Button>

          {record.role !== "admin" && (
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDeleteRole(record.role)}
            >
              Delete
            </Button>
          )}
        </Space>
      ),
    },
  ];

  /* ================= RENDER ================= */

  return (
    <div style={{ padding: 24 }}>
      <Title level={2}>Admin Dashboard</Title>

      <Card>
        <Tabs
          items={[
            {
              key: "1",
              label: "User Management",
              children: (
                <>
                  <Table
                    columns={userColumns}
                    dataSource={users}
                    rowKey="id"
                    loading={loadingUsers}
                  />

                  <Modal
                    title="Edit User"
                    open={userModalOpen}
                    onOk={handleSaveUser}
                    onCancel={() => setUserModalOpen(false)}
                  >
                    <Form form={userForm} layout="vertical">
                      <Form.Item name="role" label="Role" rules={[{ required: true }]}>
                        <Select>
                          {settings.roles.map((r) => (
                            <Option key={r} value={r}>
                              {r.toUpperCase()}
                            </Option>
                          ))}
                        </Select>
                      </Form.Item>

                      <Form.Item
                        name="status"
                        label="Status"
                        rules={[{ required: true }]}
                      >
                        <Select>
                          {settings.statuses.map((s) => (
                            <Option key={s} value={s}>
                              {s.toUpperCase()}
                            </Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Form>
                  </Modal>
                </>
              ),
            },
            {
              key: "2",
              label: "Global Config",
              children: (
                <>
                  <Card
                    title="Status Management"
                    extra={
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => setStatusModalOpen(true)}
                      >
                        Add Status
                      </Button>
                    }
                    style={{ marginBottom: 24 }}
                  >
                    <Space wrap>
                      {settings.statuses.map((s) => (
                        <Tag
                          key={s}
                          color="gold"
                          closable
                          onClose={() => handleDeleteStatus(s)}
                        >
                          {s.toUpperCase()}
                        </Tag>
                      ))}
                    </Space>
                  </Card>

                  <Card
                    title="Navigation & Access Control"
                    extra={
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => setAddRoleModalOpen(true)}
                      >
                        Add Role
                      </Button>
                    }
                  >
                    <Table
                      rowKey="role"
                      pagination={false}
                      columns={navColumns}
                      dataSource={buildRoleNavigationMap()}
                    />
                  </Card>
                </>
              ),
            },
          ]}
        />
      </Card>

      {/* ADD ROLE MODAL */}
      <Modal
        title="Add Role"
        open={addRoleModalOpen}
        onOk={handleAddRole}
        onCancel={() => setAddRoleModalOpen(false)}
      >
        <Form form={addRoleForm} layout="vertical">
          <Form.Item
            name="roleName"
            label="Role Name"
            rules={[{ required: true }]}
          >
            <Input placeholder="e.g. Management" />
          </Form.Item>
        </Form>
      </Modal>

      {/* EDIT ROLE ACCESS MODAL */}
      <Modal
        title={`Edit Access : ${editingRoleNav?.role?.toUpperCase()}`}
        open={navModalOpen}
        onOk={saveRoleNavEdit}
        onCancel={() => setNavModalOpen(false)}
      >
        <Form form={navForm} layout="vertical">
          <Form.Item label="Role">
            <Tag color={ROLE_COLORS[editingRoleNav?.role]}>
              {editingRoleNav?.role?.toUpperCase()}
            </Tag>
          </Form.Item>

          <Form.Item
            name="paths"
            label="Accessible Labels"
            rules={[{ required: true }]}
          >
            <Select mode="multiple">
              {settings.navigation
                .filter((n) => !HIDDEN_NAV_PATHS.includes(n.path))
                .map((n) => (
                  <Option key={n.path} value={n.path}>
                    {n.label}
                  </Option>
                ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* ADD STATUS MODAL */}
      <Modal
        title="Add Status"
        open={statusModalOpen}
        onOk={handleAddStatus}
        onCancel={() => setStatusModalOpen(false)}
      >
        <Form form={statusForm} layout="vertical">
          <Form.Item
            name="statusName"
            label="Status Name"
            rules={[{ required: true }]}
          >
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AdminPage;
