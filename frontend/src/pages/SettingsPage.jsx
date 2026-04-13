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
  Radio,
  Checkbox,
} from "antd";
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";
import {
  masterDataService,
  workflowConfigService,
} from "../services/api";
import { TableSkeleton } from "../components/SkeletonLoader";

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

  const [loading, setLoading] = useState(false);
  const [userRole, setUserRole] = useState("");

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalType, setModalType] = useState(null);
  const [editingRecord, setEditingRecord] = useState(null);
  const [form] = Form.useForm();

  const fetchRules = async () => {
    setLoading(true);
    try {
      // Fetch workflows
      try {
        const vWorkflows = await workflowConfigService.getVendorWorkflows();
        setVendorWorkflows(vWorkflows || []);
      } catch (e) {
        console.error("Error fetching vendor workflows:", e);
      }

      try {
        const cWorkflows = await workflowConfigService.getCodificationWorkflows();
        setCodificationWorkflows(cWorkflows || []);
      } catch (e) {
        console.error("Error fetching codification workflows:", e);
      }

      // Fetch master data for dropdowns
      try {
        const approversData = await workflowConfigService.getApprovers();
        setApprovers(approversData || []);
      } catch (e) {
        console.error("Error fetching approvers:", e);
      }

      try {
        const vendorsData = await workflowConfigService.getWorkflowVendors();
        setWorkflowVendors(vendorsData || []);
      } catch (e) {
        console.error("Error fetching workflow vendors:", e);
      }

      try {
        const lobsData = await workflowConfigService.getLOBs();
        setLobs(lobsData || []);
      } catch (e) {
        console.error("Error fetching LOBs:", e);
      }

      try {
        const departmentsData = await workflowConfigService.getDepartments();
        setDepartments(departmentsData || []);
      } catch (e) {
        console.error("Error fetching departments:", e);
      }

    } catch (error) {
      console.error("Error in fetchRules general:", error);
      message.error("Failed to fetch workflow configuration");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const storedUser = sessionStorage.getItem("user");
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
      recordToEdit.approver_count = 3; // Default for old records
    }
    // Ensure is_threshold_enabled for old records
    if (recordToEdit.is_threshold_enabled === undefined) {
      recordToEdit.is_threshold_enabled = !!recordToEdit.threshold_approver;
    }

    // Expand [FINANCE_TEAM] into actual emails so users can see and remove them
    const financeTeamEmailsExp = approvers.filter(a => (a.department || '').toLowerCase().trim() === 'finance team').map(a => a.value);
    const expandFinanceTeam = (approversList) => {
      if (!approversList) return [];
      const list = Array.isArray(approversList) ? approversList : [approversList];
      if (list.includes('[FINANCE_TEAM]')) {
        return Array.from(new Set([...list.filter(v => v !== '[FINANCE_TEAM]'), ...financeTeamEmailsExp]));
      }
      return list;
    };

    recordToEdit.mandatory_approver_1 = expandFinanceTeam(recordToEdit.mandatory_approver_1);
    recordToEdit.mandatory_approver_2 = expandFinanceTeam(recordToEdit.mandatory_approver_2);
    recordToEdit.mandatory_approver_3 = expandFinanceTeam(recordToEdit.mandatory_approver_3);
    recordToEdit.mandatory_approver_4 = expandFinanceTeam(recordToEdit.mandatory_approver_4);
    recordToEdit.mandatory_approver_5 = expandFinanceTeam(recordToEdit.mandatory_approver_5);
    recordToEdit.threshold_approver = expandFinanceTeam(recordToEdit.threshold_approver);

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
      }
      setIsModalVisible(false);
      message.success("Configuration saved successfully");
      fetchRules();
    } catch (error) {
      if (error.errorFields) {
        message.error("Please fill in all required fields correctly");
      } else {
        const errorDetail = error.response?.data?.detail;
        let errorMsg = "Failed to save configuration";
        
        if (typeof errorDetail === 'string') {
          errorMsg = errorDetail;
        } else if (Array.isArray(errorDetail)) {
          // Robustly handle FastAPI validation error list
          errorMsg = errorDetail.map(err => `${err.loc?.join('.')}: ${err.msg}`).join(', ');
        } else if (errorDetail && typeof errorDetail === 'object') {
          errorMsg = JSON.stringify(errorDetail);
        }
        
        console.error("Error saving configuration:", error);
        message.error(errorMsg);
      }
    }
  };

  const formatApprover = (val) => {
    if (!val || (Array.isArray(val) && val.length === 0)) return "";
    let arr = Array.isArray(val) ? val : [val];
    arr = arr.map(v => v === '[FINANCE_TEAM]' ? 'Finance Team' : v);
    return arr.join(", ");
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
    { title: "Approver 1", dataIndex: "mandatory_approver_1", key: "mandatory_approver_1", render: formatApprover },
    { title: "Approver 2", dataIndex: "mandatory_approver_2", key: "mandatory_approver_2", render: formatApprover },
    { title: "Approver 3", dataIndex: "mandatory_approver_3", key: "mandatory_approver_3", render: formatApprover },
    { title: "Approver 4", dataIndex: "mandatory_approver_4", key: "mandatory_approver_4", render: formatApprover },
    { title: "Approver 5", dataIndex: "mandatory_approver_5", key: "mandatory_approver_5", render: formatApprover },
    {
      title: "Threshold Approver",
      dataIndex: "threshold_approver",
      key: "threshold_approver",
      render: (val, record) => record.is_threshold_enabled ? formatApprover(val) : "Disabled"
    },
    {
      title: "Threshold",
      dataIndex: "amount_threshold",
      key: "amount_threshold",
      render: (val, record) => record.is_threshold_enabled ? (val ? `$${val.toLocaleString()}` : "-") : "-"
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
    { title: "Approver 1", dataIndex: "mandatory_approver_1", key: "mandatory_approver_1", render: formatApprover },
    { title: "Approver 2", dataIndex: "mandatory_approver_2", key: "mandatory_approver_2", render: formatApprover },
    { title: "Approver 3", dataIndex: "mandatory_approver_3", key: "mandatory_approver_3", render: formatApprover },
    { title: "Approver 4", dataIndex: "mandatory_approver_4", key: "mandatory_approver_4", render: formatApprover },
    { title: "Approver 5", dataIndex: "mandatory_approver_5", key: "mandatory_approver_5", render: formatApprover },
    {
      title: "Threshold Approver",
      dataIndex: "threshold_approver",
      key: "threshold_approver",
      render: (val, record) => record.is_threshold_enabled ? formatApprover(val) : "Disabled"
    },
    {
      title: "Threshold",
      dataIndex: "amount_threshold",
      key: "amount_threshold",
      render: (val, record) => record.is_threshold_enabled ? (val ? `$${val.toLocaleString()}` : "-") : "-"
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

  const renderTabContent = (type, columns, data) => (
    <div style={{ padding: "20px 0" }}>
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "flex-end" }}>
        {userRole !== "coder" && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => handleAdd(type)}>
            Add Rule
          </Button>
        )}
      </div>
      {loading ? (
        <TableSkeleton />
      ) : (
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          scroll={{ x: true }}
          pagination={{ pageSize: 10 }}
        />
      )}
    </div>
  );

  const items = [
    { key: "1", label: "Vendor Based Workflow", children: renderTabContent("vendor-workflow", vendorWorkflowColumns, vendorWorkflows) },
    { key: "2", label: "Codification Based Workflow", children: renderTabContent("codification-workflow", codificationWorkflowColumns, codificationWorkflows) },
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

      <Form.Item name="approver_count" label="Number of Approvers" initialValue={1} rules={[{ required: true }]}>
        <Select options={[
          { value: 1, label: '1 Approver' },
          { value: 2, label: '2 Approvers' },
          { value: 3, label: '3 Approvers' },
          { value: 4, label: '4 Approvers' },
          { value: 5, label: '5 Approvers' },
        ]} />
      </Form.Item>

      <Form.Item name="is_threshold_enabled" label="Enable Threshold Approver" initialValue={false}>
        <Radio.Group>
          <Radio value={true}>Yes</Radio>
          <Radio value={false}>No</Radio>
        </Radio.Group>
      </Form.Item>

      <Form.Item noStyle shouldUpdate>
        {({ getFieldValue }) => {
          const a1 = getFieldValue('mandatory_approver_1');
          const a2 = getFieldValue('mandatory_approver_2');
          const a3 = getFieldValue('mandatory_approver_3');
          const a4 = getFieldValue('mandatory_approver_4');
          const a5 = getFieldValue('mandatory_approver_5');
          const thresholdApp = getFieldValue('threshold_approver');
          
          const count = getFieldValue('approver_count') || 1;
          const isThresholdEnabled = getFieldValue('is_threshold_enabled');

          const getFilteredOptions = (currentValue = []) => {
            // Flatten in case some are arrays (mode="multiple")
            const flatCurrent = Array.isArray(currentValue) ? currentValue : [currentValue].filter(Boolean);
            const allSelected = [a1, a2, a3, a4, a5, thresholdApp].flat().filter(Boolean);
            const selectedOther = allSelected.filter(v => !flatCurrent.includes(v));
            return approvers.filter(opt => !selectedOther.includes(opt.value));
          };

          const financeTeamEmails = approvers.filter(a => (a.department || '').toLowerCase().trim() === 'finance team').map(a => a.value);

          const isFinanceTeamSelected = (val) => {
            if (!val || !financeTeamEmails.length) return false;
            if (val.includes('[FINANCE_TEAM]')) return true;
            return financeTeamEmails.every(email => val.includes(email));
          };

          const handleFinanceTeamChange = (e, fieldName, currentVal) => {
            const currentValues = Array.isArray(currentVal) ? currentVal.filter(v => v !== '[FINANCE_TEAM]') : [];
            if (e.target.checked) {
              const newValues = Array.from(new Set([...currentValues, ...financeTeamEmails]));
              form.setFieldsValue({ [fieldName]: newValues });
            } else {
              const newValues = currentValues.filter(email => !financeTeamEmails.includes(email));
              form.setFieldsValue({ [fieldName]: newValues });
            }
          };

          return (
            <>
              {count >= 1 && (
                <Form.Item label="Approver 1 (Mandatory)" required>
                  <Space direction="vertical" style={{ width: "100%" }}>
                    <Checkbox 
                      checked={isFinanceTeamSelected(a1)}
                      onChange={(e) => handleFinanceTeamChange(e, 'mandatory_approver_1', a1)}
                    >
                      Assign to Finance Team
                    </Checkbox>
                    <Form.Item name="mandatory_approver_1" noStyle rules={[{ required: true, message: "Please select an approver or assign to Finance Team" }]}>
                      <Select 
                        mode="multiple" 
                        showSearch 
                        options={getFilteredOptions(a1)} 
                        placeholder="Select Approver(s) 1" 
                      />
                    </Form.Item>
                  </Space>
                </Form.Item>
              )}
              {count >= 2 && (
                <Form.Item label="Approver 2 (Mandatory)" required>
                  <Space direction="vertical" style={{ width: "100%" }}>
                    <Checkbox 
                      checked={isFinanceTeamSelected(a2)}
                      onChange={(e) => handleFinanceTeamChange(e, 'mandatory_approver_2', a2)}
                    >
                      Assign to Finance Team
                    </Checkbox>
                    <Form.Item name="mandatory_approver_2" noStyle rules={[{ required: true, message: "Please select an approver or assign to Finance Team" }]}>
                      <Select 
                        mode="multiple" 
                        showSearch 
                        options={getFilteredOptions(a2)} 
                        placeholder="Select Approver(s) 2" 
                      />
                    </Form.Item>
                  </Space>
                </Form.Item>
              )}
              {count >= 3 && (
                <Form.Item label="Approver 3 (Mandatory)" required>
                  <Space direction="vertical" style={{ width: "100%" }}>
                    <Checkbox 
                      checked={isFinanceTeamSelected(a3)}
                      onChange={(e) => handleFinanceTeamChange(e, 'mandatory_approver_3', a3)}
                    >
                      Assign to Finance Team
                    </Checkbox>
                    <Form.Item name="mandatory_approver_3" noStyle rules={[{ required: true, message: "Please select an approver or assign to Finance Team" }]}>
                      <Select 
                        mode="multiple" 
                        showSearch 
                        options={getFilteredOptions(a3)} 
                        placeholder="Select Approver(s) 3" 
                      />
                    </Form.Item>
                  </Space>
                </Form.Item>
              )}
              {count >= 4 && (
                <Form.Item label="Approver 4 (Mandatory)" required>
                  <Space direction="vertical" style={{ width: "100%" }}>
                    <Checkbox 
                      checked={isFinanceTeamSelected(a4)}
                      onChange={(e) => handleFinanceTeamChange(e, 'mandatory_approver_4', a4)}
                    >
                      Assign to Finance Team
                    </Checkbox>
                    <Form.Item name="mandatory_approver_4" noStyle rules={[{ required: true, message: "Please select an approver or assign to Finance Team" }]}>
                      <Select 
                        mode="multiple" 
                        showSearch 
                        options={getFilteredOptions(a4)} 
                        placeholder="Select Approver(s) 4" 
                      />
                    </Form.Item>
                  </Space>
                </Form.Item>
              )}
              {count >= 5 && (
                <Form.Item label="Approver 5 (Mandatory)" required>
                  <Space direction="vertical" style={{ width: "100%" }}>
                    <Checkbox 
                      checked={isFinanceTeamSelected(a5)}
                      onChange={(e) => handleFinanceTeamChange(e, 'mandatory_approver_5', a5)}
                    >
                      Assign to Finance Team
                    </Checkbox>
                    <Form.Item name="mandatory_approver_5" noStyle rules={[{ required: true, message: "Please select an approver or assign to Finance Team" }]}>
                      <Select 
                        mode="multiple" 
                        showSearch 
                        options={getFilteredOptions(a5)} 
                        placeholder="Select Approver(s) 5" 
                      />
                    </Form.Item>
                  </Space>
                </Form.Item>
              )}

              {isThresholdEnabled && (
                <>
                  <Form.Item name="threshold_approver" label="Threshold Approver" rules={[{ required: true, message: "Please select an approver" }]}>
                    <Select 
                      mode="multiple" 
                      showSearch 
                      options={approvers} 
                      placeholder="Select Threshold Approver(s)" 
                    />
                  </Form.Item>
                  <Form.Item name="amount_threshold" label="Amount Threshold" rules={[{ required: true }]}>
                    <InputNumber style={{ width: "100%" }} min={0} placeholder="Enter threshold amount" />
                  </Form.Item>
                </>
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
        title={`${editingRecord ? 'Edit' : 'Add'} ${modalType === "vendor-workflow" ? "Vendor Workflow" : "Codification Workflow"}`}
        open={isModalVisible}
        onOk={handleSave}
        onCancel={() => setIsModalVisible(false)}
        destroyOnClose
        width={600}
      >
        <Form form={form} layout="vertical">
          {renderWorkflowForm()}
        </Form>
      </Modal>
    </div>
  );
};

export default SettingsPage;
