import React, { useState, useEffect } from "react";
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
  Select,
  Spin,
  Tag,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import {
  masterDataService,
  currencyService,
  workflowConfigService,
} from "../services/api";

const { Title, Text } = Typography;
const { confirm } = Modal;

const SettingsPage = () => {
  // New workflow states
  const [vendorWorkflows, setVendorWorkflows] = useState([]);
  const [codificationWorkflows, setCodificationWorkflows] = useState([]);
  const [approvers, setApprovers] = useState([]);
  const [workflowVendors, setWorkflowVendors] = useState([]);
  const [lobs, setLobs] = useState([]);
  const [departments, setDepartments] = useState([]);

  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [userRole, setUserRole] = useState("");

  const EXTRA_CURRENCIES = [
    { code: "USD", name: "US Dollar", symbol: "$" },
    { code: "EUR", name: "Euro", symbol: "€" },
    { code: "INR", name: "Indian Rupee", symbol: "₹" },
    { code: "GBP", name: "British Pound", symbol: "£" },
    { code: "JPY", name: "Japanese Yen", symbol: "¥" },
    { code: "AUD", name: "Australian Dollar", symbol: "A$" },
    { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
    { code: "CHF", name: "Swiss Franc", symbol: "CHF" },
    { code: "CNY", name: "Chinese Yuan", symbol: "¥" },
    { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$" },
    { code: "SGD", name: "Singapore Dollar", symbol: "S$" },
    { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$" },
    { code: "ZAR", name: "South African Rand", symbol: "R" },
    { code: "AED", name: "UAE Dirham", symbol: "د.إ" },
    { code: "SAR", name: "Saudi Riyal", symbol: "﷼" },
    { code: "QAR", name: "Qatari Riyal", symbol: "﷼" },
    { code: "KWD", name: "Kuwaiti Dinar", symbol: "KD" },
    { code: "BHD", name: "Bahraini Dinar", symbol: "BD" },
    { code: "OMR", name: "Omani Rial", symbol: "﷼" },
    { code: "THB", name: "Thai Baht", symbol: "฿" },
    { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp" },
    { code: "MYR", name: "Malaysian Ringgit", symbol: "RM" },
    { code: "PHP", name: "Philippine Peso", symbol: "₱" },
    { code: "KRW", name: "South Korean Won", symbol: "₩" },
    { code: "VND", name: "Vietnamese Dong", symbol: "₫" },
    { code: "BRL", name: "Brazilian Real", symbol: "R$" },
    { code: "MXN", name: "Mexican Peso", symbol: "$" },
    { code: "ARS", name: "Argentine Peso", symbol: "$" },
    { code: "CLP", name: "Chilean Peso", symbol: "$" },
    { code: "COP", name: "Colombian Peso", symbol: "$" },
    { code: "EGP", name: "Egyptian Pound", symbol: "£" },
    { code: "NGN", name: "Nigerian Naira", symbol: "₦" },
    { code: "KES", name: "Kenyan Shilling", symbol: "KSh" },
    { code: "PKR", name: "Pakistani Rupee", symbol: "₨" },
    { code: "BDT", name: "Bangladeshi Taka", symbol: "৳" },
    { code: "LKR", name: "Sri Lankan Rupee", symbol: "Rs" },
    { code: "ILS", name: "Israeli Shekel", symbol: "₪" },
    { code: "TRY", name: "Turkish Lira", symbol: "₺" },
    { code: "RUB", name: "Russian Ruble", symbol: "₽" },
  ];

  const mergedCurrencies = [
    ...currencies,
    ...EXTRA_CURRENCIES.filter(
      (extra) => !currencies.some((c) => c.code === extra.code)
    ),
  ];

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalType, setModalType] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const [form] = Form.useForm();

  const fetchRules = async () => {
    setLoading(true);
    try {
      const [
        vendorWorkflowData,
        codificationWorkflowData,

        currencyData,
        approversData,
        vendorsData,
        lobsData,
        departmentsData,
      ] = await Promise.all([
        workflowConfigService.getVendorWorkflows(),
        workflowConfigService.getCodificationWorkflows(),
        currencyService.getCurrencies(),
        workflowConfigService.getApprovers(),
        workflowConfigService.getWorkflowVendors(),
        workflowConfigService.getLOBs(),
        workflowConfigService.getDepartments(),
      ]);

      setVendorWorkflows(vendorWorkflowData);
      setCodificationWorkflows(codificationWorkflowData);
      setCurrencies(currencyData);
      setApprovers(approversData);
      setWorkflowVendors(vendorsData);
      setLobs(lobsData);
      setDepartments(departmentsData);
    } catch (error) {
      console.error("Error fetching rules:", error);
      message.error("Failed to fetch workflow configuration");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        setUserRole(user.role || "");
      } catch (e) {
        setUserRole("");
      }
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, []);

  const handleAdd = (type) => {
    setModalType(type);
    setEditingRecord(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = (record, type) => {
    setModalType(type);
    setEditingRecord(record);
    // Ensure approver_count exists for old records
    const recordToEdit = { ...record };
    if (!recordToEdit.approver_count) {
      if (record.optional_approver) recordToEdit.approver_count = 5;
      else if (record.threshold_approver) recordToEdit.approver_count = 4;
      else recordToEdit.approver_count = 3;
    }
    // Ensure unique value for select if vendor_id exists
    if (recordToEdit.vendor_id && recordToEdit.vendor_name) {
      recordToEdit.vendor_unique_val = `${recordToEdit.vendor_id}|${recordToEdit.vendor_name}`;
    } else {
      recordToEdit.vendor_unique_val = recordToEdit.vendor_name;
    }

    form.setFieldsValue(recordToEdit);
    setIsModalVisible(true);
  };

  const handleDelete = async (record, type) => {
    let deleteLabel = "";
    if (type === "vendor-workflow") {
      deleteLabel = `Vendor Workflow: ${record.vendor_name}`;
    } else if (type === "codification-workflow") {
      deleteLabel = `Codification Workflow: ${record.lob} - ${record.department_id}`;
    } else if (type === "currency") {
      deleteLabel = `Currency: ${record.name} (${record.symbol})`;
    }

    confirm({
      title: "Are you sure you want to delete this configuration?",
      icon: <ExclamationCircleOutlined />,
      content: deleteLabel,
      okText: "Yes, Delete",
      okType: "danger",
      cancelText: "Cancel",
      async onOk() {
        try {
          if (type === "vendor-workflow") {
            await workflowConfigService.deleteVendorWorkflow(record.id);
          } else if (type === "codification-workflow") {
            await workflowConfigService.deleteCodificationWorkflow(record.id);
          } else if (type === "currency") {
            await currencyService.deleteCurrency(record.id);
          }
          message.success("Configuration deleted successfully");
          fetchRules();
        } catch (error) {
          message.error(error.response?.data?.detail || "Failed to delete configuration");
        }
      },
    });
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (modalType === "vendor-workflow") {
        if (editingRecord) {
          await workflowConfigService.updateVendorWorkflow(editingRecord.id, values);
        } else {
          await workflowConfigService.createVendorWorkflow(values);
        }
      } else if (modalType === "codification-workflow") {
        if (editingRecord) {
          await workflowConfigService.updateCodificationWorkflow(editingRecord.id, values);
        } else {
          await workflowConfigService.createCodificationWorkflow(values);
        }
      } else if (modalType === "currency") {
        if (editingRecord) {
          await currencyService.updateCurrency(editingRecord.id, values);
        } else {
          await currencyService.createCurrency(values);
        }
      }
      setIsModalVisible(false);
      message.success("Configuration saved successfully");
      fetchRules();
    } catch (error) {
      if (error.errorFields) {
        message.error("Please fill in all required fields correctly");
      } else if (error.response?.data?.detail) {
        message.error(error.response.data.detail);
      } else {
        console.error("Error saving configuration:", error);
        message.error("Failed to save configuration");
      }
    }
  };

  const vendorWorkflowColumns = [
    {
      title: "Vendor Name",
      dataIndex: "vendor_name",
      key: "vendor_name",
      render: (val, record) => {
        // Try looking up by ID + Name first
        const uniqueKey = record.vendor_id ? `${record.vendor_id}|${val}` : val;
        let vendor = workflowVendors.find(v => v.value === uniqueKey);
        // Fallback to ID if uniqueKey didn't match (for older data)
        if (!vendor && record.vendor_id) {
          vendor = workflowVendors.find(v => v.id === record.vendor_id);
        }
        return vendor ? vendor.label : (record.vendor_id ? `${record.vendor_id} - ${val}` : val);
      }
    },
    { title: "Approver 1", dataIndex: "mandatory_approver_1", key: "mandatory_approver_1" },
    { title: "Approver 2", dataIndex: "mandatory_approver_2", key: "mandatory_approver_2" },
    { title: "Approver 3", dataIndex: "mandatory_approver_3", key: "mandatory_approver_3" },
    {
      title: "Approver 4 (Threshold)",
      dataIndex: "threshold_approver",
      key: "threshold_approver",
      render: (val) => val || "-"
    },
    {
      title: "Approver 5 (Optional)",
      dataIndex: "optional_approver",
      key: "optional_approver",
      render: (val) => val || "-"
    },
    {
      title: "Threshold",
      dataIndex: "amount_threshold",
      key: "amount_threshold",
      render: (val) => val ? `$${val.toLocaleString()}` : "-"
    },
    ...(userRole !== "coder" ? [{
      title: "Actions",
      key: "actions",
      render: (_, record) => (
        <Space size="middle">
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record, "vendor-workflow")}>Edit</Button>
          <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record, "vendor-workflow")}>Delete</Button>
        </Space>
      ),
    }] : []),
  ];

  const codificationWorkflowColumns = [
    {
      title: "LOB",
      dataIndex: "lob",
      key: "lob",
      render: (val) => {
        const opt = lobs.find(o => o.value === val);
        return opt ? opt.label : val;
      }
    },
    {
      title: "Dept ID",
      dataIndex: "department_id",
      key: "department_id",
      render: (val) => {
        const opt = departments.find(o => o.value === val);
        return opt ? opt.label : val;
      }
    },
    { title: "Approver 1", dataIndex: "mandatory_approver_1", key: "mandatory_approver_1" },
    { title: "Approver 2", dataIndex: "mandatory_approver_2", key: "mandatory_approver_2" },
    { title: "Approver 3", dataIndex: "mandatory_approver_3", key: "mandatory_approver_3" },
    {
      title: "Approver 4 (Threshold)",
      dataIndex: "threshold_approver",
      key: "threshold_approver",
      render: (val) => val || "-"
    },
    {
      title: "Approver 5 (Optional)",
      dataIndex: "optional_approver",
      key: "optional_approver",
      render: (val) => val || "-"
    },
    {
      title: "Threshold",
      dataIndex: "amount_threshold",
      key: "amount_threshold",
      render: (val) => val ? `$${val.toLocaleString()}` : "-"
    },
    ...(userRole !== "coder" ? [{
      title: "Actions",
      key: "actions",
      render: (_, record) => (
        <Space size="middle">
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record, "codification-workflow")}>Edit</Button>
          <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record, "codification-workflow")}>Delete</Button>
        </Space>
      ),
    }] : []),
  ];

  const currencyColumns = [
    { title: "Currency Name", dataIndex: "name", key: "name" },
    { title: "Symbol", dataIndex: "symbol", key: "symbol" },
    { title: "Code", dataIndex: "code", key: "code" },
    ...(userRole !== "coder" ? [{
      title: "Actions",
      key: "actions",
      render: (_, record) => (
        <Space size="middle">
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record, "currency")}>Edit</Button>
          <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record, "currency")}>Delete</Button>
        </Space>
      ),
    }] : []),
  ];

  const renderTabContent = (type, columns, data) => (
    <div style={{ padding: "20px 0" }}>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "flex-end" }}>
        {userRole !== "coder" && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleAdd(type)}>
            Add Rule
          </Button>
        )}
      </div>
      <Table
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        scroll={{ x: true }}
        pagination={{ pageSize: 10 }}
      />
    </div>
  );

  const items = [
    { key: "1", label: "Vendor Based Workflow", children: renderTabContent("vendor-workflow", vendorWorkflowColumns, vendorWorkflows) },
    { key: "2", label: "Codification Based Workflow", children: renderTabContent("codification-workflow", codificationWorkflowColumns, codificationWorkflows) },
    { key: "3", label: "Currency", children: renderTabContent("currency", currencyColumns, currencies) },
  ];

  const renderWorkflowForm = () => (
    <>
      {modalType === "vendor-workflow" && (
        <>
          <Form.Item name="vendor_unique_val" label="Vendor Name" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={workflowVendors}
              disabled={!!editingRecord}
              onChange={(val) => {
                const vendor = workflowVendors.find(v => v.value === val);
                if (vendor) {
                  form.setFieldsValue({
                    vendor_id: vendor.id,
                    vendor_name: vendor.vendor_name
                  });
                }
              }}
            />
          </Form.Item>
          <Form.Item name="vendor_id" noStyle><Input type="hidden" /></Form.Item>
          <Form.Item name="vendor_name" noStyle><Input type="hidden" /></Form.Item>
        </>
      )}
      {modalType === "codification-workflow" && (
        <>
          <Form.Item name="lob" label="LOB" rules={[{ required: true }]}>
            <Select showSearch options={lobs} disabled={!!editingRecord} />
          </Form.Item>
          <Form.Item name="department_id" label="Dept ID" rules={[{ required: true }]}>
            <Select showSearch options={departments} disabled={!!editingRecord} />
          </Form.Item>
        </>
      )}

      <Form.Item name="approver_count" label="Number of Approvers" initialValue={3} rules={[{ required: true }]}>
        <Select options={[
          { value: 3, label: '3 Approvers (Mandatory)' },
          { value: 4, label: '4 Approvers (With Threshold)' },
          { value: 5, label: '5 Approvers (1 Optional)' },
        ]} />
      </Form.Item>

      <Form.Item noStyle shouldUpdate>
        {({ getFieldValue }) => {
          const a1 = getFieldValue('mandatory_approver_1');
          const a2 = getFieldValue('mandatory_approver_2');
          const a3 = getFieldValue('mandatory_approver_3');
          const a4 = getFieldValue('threshold_approver');
          const a5 = getFieldValue('optional_approver');
          const count = getFieldValue('approver_count') || 3;

          const getFilteredOptions = (currentValue) => {
            const allSelected = [a1, a2, a3];
            if (count >= 4) allSelected.push(a4);
            if (count === 5) allSelected.push(a5);

            const selectedOther = allSelected.filter(v => v && v !== currentValue);
            return approvers.filter(opt => !selectedOther.includes(opt.value));
          };

          return (
            <>
              <Form.Item name="mandatory_approver_1" label="Approver 1 (Mandatory)" rules={[{ required: true }]}>
                <Select showSearch options={getFilteredOptions(a1)} placeholder="Select Approver 1" />
              </Form.Item>
              <Form.Item name="mandatory_approver_2" label="Approver 2 (Mandatory)" rules={[{ required: true }]}>
                <Select showSearch options={getFilteredOptions(a2)} placeholder="Select Approver 2" />
              </Form.Item>
              <Form.Item name="mandatory_approver_3" label="Approver 3 (Mandatory)" rules={[{ required: true }]}>
                <Select showSearch options={getFilteredOptions(a3)} placeholder="Select Approver 3" />
              </Form.Item>

              {count >= 4 && (
                <>
                  <Form.Item name="threshold_approver" label="Approver 4 (Threshold)" rules={[{ required: true }]}>
                    <Select showSearch options={getFilteredOptions(a4)} placeholder="Select Approver 4" />
                  </Form.Item>
                  <Form.Item name="amount_threshold" label="Amount Threshold" rules={[{ required: true }]}>
                    <InputNumber style={{ width: "100%" }} min={0} placeholder="Enter threshold amount" />
                  </Form.Item>
                </>
              )}
              {count === 5 && (
                <Form.Item name="optional_approver" label="Approver 5 (Optional)">
                  <Select showSearch options={getFilteredOptions(a5)} allowClear placeholder="Select Approver 5" />
                </Form.Item>
              )}
            </>
          );
        }}
      </Form.Item>
    </>
  );

  return (
    <div style={{ padding: "24px" }}>
      <Card title="Approval Workflow Settings">
        <Tabs defaultActiveKey="1" items={items} />
      </Card>

      <Modal
        title={`${editingRecord ? 'Edit' : 'Add'} ${modalType === "vendor-workflow" ? "Vendor Workflow" : modalType === "codification-workflow" ? "Codification Workflow" : "Currency"}`}
        open={isModalVisible}
        onOk={handleSave}
        onCancel={() => setIsModalVisible(false)}
        destroyOnClose
        width={600}
      >
        <Form form={form} layout="vertical">
          {modalType === "currency" ? (
            <>
              <Form.Item name="code" label="Currency Code" rules={[{ required: true }]}>
                <Select showSearch onChange={(v) => {
                  const s = mergedCurrencies.find(c => c.code === v);
                  if (s) form.setFieldsValue({ name: s.name, symbol: s.symbol });
                }}>
                  {mergedCurrencies.map(c => <Select.Option key={c.code} value={c.code}>{c.code} - {c.name}</Select.Option>)}
                </Select>
              </Form.Item>
              <Form.Item name="name" label="Currency Name" rules={[{ required: true }]}><Input /></Form.Item>
              <Form.Item name="symbol" label="Symbol" rules={[{ required: true }]}><Input /></Form.Item>
            </>
          ) : renderWorkflowForm()}
        </Form>
      </Modal>
    </div>
  );
};

export default SettingsPage;
