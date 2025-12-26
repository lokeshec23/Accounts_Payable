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
  approverConfigService,
  masterDataService,
  currencyService,
} from "../services/api";

const { Title, Text } = Typography;

const { confirm } = Modal;

const SettingsPage = () => {
  const [amountRules, setAmountRules] = useState([]);
  const [vendorRules, setVendorRules] = useState([]);
  const [glRules, setGlRules] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [defaultConfig, setDefaultConfig] = useState(null);
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

  // Modal State
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [modalType, setModalType] = useState(null); // 'amount', 'vendor', 'gl', 'currency'
  const [editingRecord, setEditingRecord] = useState(null);
  const [form] = Form.useForm();

  // Master Data State
  const [vendorOptions, setVendorOptions] = useState([]);
  const [glOptions, setGlOptions] = useState([]);
  const [loadingMasterData, setLoadingMasterData] = useState(false);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const [amountData, vendorData, glData, defaultData, currencyData] =
        await Promise.all([
          approverConfigService.getAmountRules(),
          approverConfigService.getAllConfigs(),
          approverConfigService.getGLRules(),
          approverConfigService.getDefaultConfig(),
          currencyService.getCurrencies(),
        ]);
      setAmountRules(amountData);
      setVendorRules(vendorData);
      setGlRules(glData);
      setDefaultConfig(defaultData);
      setCurrencies(currencyData);
    } catch (error) {
      console.error("Error fetching rules:", error);
      message.error("Failed to fetch rules");
    } finally {
      setLoading(false);
    }
  };

  // Get user role from localStorage
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

  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        setLoadingMasterData(true);
        const files = await masterDataService.getFiles();

        const targetFile = files.find(
          (f) => f.file_name?.trim() === "AP_CA Inc_Invoice_Codification"
        );

        if (!targetFile) {
          console.error(
            "Master file 'AP_CA Inc_Invoice_Codification' not found"
          );
          return;
        }

        const sheets = await masterDataService.getSheets(targetFile._id);

        // Load GL
        const glSheet = sheets.find((s) => s.sheet_name === "GL");
        if (glSheet) {
          const rows = await masterDataService.getSheetData(
            glSheet.collection_name
          );
          const gl = rows.map((row) => {
            const acc =
              row["Account number"] || row["account_number"] || row["Code"];
            const title = row["Title"] || row["Name"] || row["Description"];
            return {
              value: `${acc} - ${title}`,
              label: `${acc} - ${title}`,
            };
          });
          setGlOptions(gl);
        }

        // Load Vendors
        const vendorSheet = sheets.find((s) =>
          [
            "Vendor",
            "Vendor_Master",
            "Vendor Master",
            "Customer_Master",
            "Vendor_Info",
          ].includes(s.sheet_name)
        );

        if (vendorSheet) {
          const rows = await masterDataService.getSheetData(
            vendorSheet.collection_name
          );

          const vendors = rows
            .map((row, index) => {
              const name =
                row["VENDOR_NAME"] ||
                row["Vendor_Name"] ||
                row["Vendor name"] ||
                row["Name"] ||
                row["vendor_name"] ||
                row["vendorName"] ||
                row["CUSTOMER_NAME"];

              if (!name) return null;

              return {
                value: `${name}__${index}`,
                label: name,
              };
            })
            .filter(Boolean);

          setVendorOptions(vendors);
        }
      } catch (error) {
        console.error("Error fetching master data:", error);
      } finally {
        setLoadingMasterData(false);
      }
    };

    fetchMasterData();
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

  // const handleDelete = (record) => {
  //     confirm({
  //         title: 'Are you sure you want to delete this invoice?',
  //         icon: <ExclamationCircleOutlined />,
  //         content: `Invoice: ${record.invoiceId} (${record.filename})`,
  //         okText: 'Yes, Delete',
  //         okType: 'danger',
  //         cancelText: 'Cancel',
  //         async onOk() {
  //             try {
  //                 await invoiceService.deleteInvoice(record.id);
  //                 message.success('Invoice deleted successfully');
  //                 fetchInvoices();
  //             } catch (error) {
  //                 console.error('Error deleting invoice:', error);
  //                 message.error('Failed to delete invoice. Please try again.');
  //             }
  //         },
  //     });
  // };

  const handleDelete = async (record, type) => {
    let deleteLabel = "";

    if (type === "amount") {
      const match = currencies.find(
        (c) =>
          c.code?.toUpperCase() === record.currency?.toUpperCase() ||
          c.name?.toLowerCase() === record.currency?.toLowerCase()
      );
      const symbol = match
        ? match.symbol
        : record.currency === "INR"
        ? "₹"
        : "$";
      deleteLabel = `Amount Range: ${symbol}${record.min_amount} - ${symbol}${record.max_amount}`;
    } else if (type === "vendor") {
      deleteLabel = `Vendor: ${record.vendorName}`;
    } else if (type === "gl") {
      deleteLabel = `GL Code: ${record.glTitle}`;
    } else if (type === "currency") {
      deleteLabel = `Currency: ${record.name} (${record.symbol})`;
    }

    confirm({
      title: "Are you sure you want to delete this rule?",
      icon: <ExclamationCircleOutlined />,
      content: deleteLabel,
      okText: "Yes, Delete",
      okType: "danger",
      cancelText: "Cancel",

      async onOk() {
        try {
          if (type === "amount") {
            await approverConfigService.deleteAmountRule(record.id);
          } else if (type === "vendor") {
            await approverConfigService.deleteConfig(record.vendorName);
          } else if (type === "gl") {
            await approverConfigService.deleteGLRule(record.glTitle);
          } else if (type === "currency") {
            await currencyService.deleteCurrency(record.id);
          }

          message.success("Rule deleted successfully");
          fetchRules();
        } catch (error) {
          console.error("Error deleting rule:", error);
          message.error("Failed to delete rule");
        }
      },
    });
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      if (modalType === "amount") {
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
          await approverConfigService.updateAmountRule(
            editingRecord.id,
            values
          );
        } else {
          await approverConfigService.createAmountRule(values);
        }
      } else if (modalType === "vendor") {
        await approverConfigService.createOrUpdateConfig(values);
      } else if (modalType === "gl") {
        await approverConfigService.createGLRule(values);
      } else if (modalType === "currency") {
        if (editingRecord) {
          await currencyService.updateCurrency(editingRecord.id, values);
        } else {
          await currencyService.createCurrency(values);
        }
      }

      setIsModalVisible(false);
      message.success("Rule saved successfully");
      fetchRules();
    } catch (error) {
      console.error("Error saving rule:", error);
      message.error("Failed to save rule");
    }
  };

  // Columns
  const amountColumns = [
    {
      title: "Min Amount",
      dataIndex: "min_amount",
      key: "min_amount",
      render: (val, record) => {
        const match = currencies.find(
          (c) =>
            c.code?.toUpperCase() === record.currency?.toUpperCase() ||
            c.name?.toLowerCase() === record.currency?.toLowerCase()
        );
        const symbol = match
          ? match.symbol
          : record.currency === "INR"
          ? "₹"
          : "$";
        return `${symbol}${val?.toLocaleString() || 0}`;
      },
    },
    {
      title: "Max Amount",
      dataIndex: "max_amount",
      key: "max_amount",
      render: (val, record) => {
        const match = currencies.find(
          (c) =>
            c.code?.toUpperCase() === record.currency?.toUpperCase() ||
            c.name?.toLowerCase() === record.currency?.toLowerCase()
        );
        const symbol = match
          ? match.symbol
          : record.currency === "INR"
          ? "₹"
          : "$";
        return `${symbol}${val?.toLocaleString() || 0}`;
      },
    },
    {
      title: "Currency",
      dataIndex: "currency",
      key: "currency",
      render: (val) => val || "USD",
    },
    {
      title: "Approvers Required",
      dataIndex: "approver_count",
      key: "approver_count",
    },
    // Only show actions if user is not a coder
    ...(userRole !== "coder"
      ? [
          {
            title: "Actions",
            key: "actions",
            render: (_, record) => (
              <Space size="middle">
                <span
                  style={{
                    color: "#1677ff",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                  onClick={() => handleEdit(record, "amount")}
                >
                  <EditOutlined />
                  Edit
                </span>

                <span
                  style={{
                    color: "#ff4d4f",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                  onClick={() => handleDelete(record, "amount")}
                >
                  <DeleteOutlined />
                  Delete
                </span>
              </Space>
            ),
          },
        ]
      : []),
  ];

  const vendorColumns = [
    { title: "Vendor Name", dataIndex: "vendorName", key: "vendorName" },
    {
      title: "Approvers Required",
      dataIndex: "approverCount",
      key: "approverCount",
    },
    // Only show actions if user is not a coder
    ...(userRole !== "coder"
      ? [
          {
            title: "Actions",
            key: "actions",
            render: (_, record) => (
              <Space size="middle">
                <span
                  style={{
                    color: "#1677ff",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                  onClick={() => handleEdit(record, "vendor")}
                >
                  <EditOutlined />
                  Edit
                </span>

                <span
                  style={{
                    color: "#ff4d4f",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                  onClick={() => handleDelete(record, "vendor")}
                >
                  <DeleteOutlined />
                  Delete
                </span>
              </Space>
            ),
          },
        ]
      : []),
  ];

  const glColumns = [
    { title: "GL Code", dataIndex: "glTitle", key: "glTitle" },
    {
      title: "Approvers Required",
      dataIndex: "approverCount",
      key: "approverCount",
    },
    // Only show actions if user is not a coder
    ...(userRole !== "coder"
      ? [
          {
            title: "Actions",
            key: "actions",
            render: (_, record) => (
              <Space size="middle">
                <span
                  style={{
                    color: "#1677ff",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                  onClick={() => handleEdit(record, "gl")}
                >
                  <EditOutlined />
                  Edit
                </span>

                <span
                  style={{
                    color: "#ff4d4f",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                  onClick={() => handleDelete(record, "gl")}
                >
                  <DeleteOutlined />
                  Delete
                </span>
              </Space>
            ),
          },
        ]
      : []),
  ];

  const currencyColumns = [
    { title: "Currency Name", dataIndex: "name", key: "name" },
    { title: "Symbol", dataIndex: "symbol", key: "symbol" },
    { title: "Code", dataIndex: "code", key: "code" },
    ...(userRole !== "coder"
      ? [
          {
            title: "Actions",
            key: "actions",
            render: (_, record) => (
              <Space size="middle">
                <span
                  style={{
                    color: "#1677ff",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                  onClick={() => handleEdit(record, "currency")}
                >
                  <EditOutlined />
                  Edit
                </span>

                <span
                  style={{
                    color: "#ff4d4f",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                  onClick={() => handleDelete(record, "currency")}
                >
                  <DeleteOutlined />
                  Delete
                </span>
              </Space>
            ),
          },
        ]
      : []),
  ];

  const paginationConfig = {
    defaultPageSize: 10,
    showSizeChanger: true,
    showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
    pageSizeOptions: ["5", "10", "20", "50"],
  };

  const renderDefaultSettings = () => (
    <div style={{ padding: "20px 0" }}>
      {/* <Title level={4}></Title> */}
      <Text type="secondary" style={{ display: "block", marginBottom: "20px" }}>
        This setting defines the default number of approvers required when no
        specific Vendor or Amount rule matches.
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
        key={defaultConfig?.updated_at || "loading"} // Force re-render when data loads
      >
        <Form.Item
          name="default_approver_count"
          label="Default Approvers Required"
          rules={[{ required: true }]}
        >
          <InputNumber min={1} max={4} />
        </Form.Item>
        {userRole !== "coder" && (
          <Form.Item>
            <Button type="primary" htmlType="submit">
              Save
            </Button>
          </Form.Item>
        )}
      </Form>
    </div>
  );

  const generateFilters = (data, key) => {
    const vals = [...new Set(data.map((item) => item[key]).filter(Boolean))];
    return vals.map((v) => ({ text: v, value: v }));
  };

  const renderTabContent = (type, columns, data) => {
    const [searchText, setSearchText] = useState("");

    // GLOBAL SEARCH FILTER
    const filteredData = data.filter((row) =>
      Object.values(row || {})
        .join(" ")
        .toLowerCase()
        .includes(searchText.toLowerCase())
    );

    // Inject sorting + filtering into columns
    const enhancedColumns = columns.map((col) => {
      if (!col.dataIndex) return col;

      return {
        ...col,
        sorter: (a, b) =>
          (a[col.dataIndex] || "")
            .toString()
            .localeCompare((b[col.dataIndex] || "").toString()),

        filters: generateFilters(data, col.dataIndex),
        onFilter: (value, record) =>
          String(record[col.dataIndex] ?? "") === String(value),
      };
    });

    return (
      <div>
        {/* 🔍 SEARCH + ADD RULE (RIGHT ALIGNED) */}
        {userRole !== "coder" && (
          <div
            style={{
              marginBottom: 16,
              display: "flex",
              justifyContent: "flex-end",
              gap: "10px",
            }}
          >
            <Input
              placeholder="Search..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
              style={{ width: 250 }}
            />

            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => handleAdd(type)}
            >
              Add Rule
            </Button>
          </div>
        )}
        <Table
          columns={enhancedColumns}
          dataSource={filteredData}
          rowKey={(record) => record.id || record.vendorName || record.glTitle}
          loading={loading}
          pagination={paginationConfig}
          scroll={{ x: true }}
        />
      </div>
    );
  };

  const items = [
    {
      key: "0-default",
      label: "Default Approvers",
      children: renderDefaultSettings(),
    },
    {
      key: "1",
      label: "By Amount",
      children: renderTabContent("amount", amountColumns, amountRules),
    },
    {
      key: "2",
      label: "By Vendor Name",
      children: renderTabContent("vendor", vendorColumns, vendorRules),
    },
    {
      key: "3",
      label: "By GL Code",
      children: renderTabContent("gl", glColumns, glRules),
    },
    {
      key: "4",
      label: "Currency",
      children: renderTabContent("currency", currencyColumns, currencies),
    },
  ];

  return (
    <div style={{ padding: "24px" }}>
      <Card title="Approval Workflow Settings">
        <Tabs defaultActiveKey="1" items={items} />
      </Card>

      <Modal
        title={`Add/Edit ${
          modalType === "amount"
            ? "Amount"
            : modalType === "vendor"
            ? "Vendor"
            : modalType === "gl"
            ? "GL"
            : "Currency"
        } Rule`}
        open={isModalVisible}
        onOk={handleSave}
        onCancel={() => setIsModalVisible(false)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          {modalType === "currency" && (
            <>
              <Form.Item
                name="code"
                label="Currency Code"
                rules={[{ required: true }]}
              >
                <Select
                  showSearch
                  placeholder="Select currency"
                  onChange={(value) => {
                    const selected = mergedCurrencies.find(
                      (c) => c.code === value
                    );
                    if (selected) {
                      form.setFieldsValue({
                        name: selected.name,
                        symbol: selected.symbol,
                      });
                    }
                  }}
                >
                  {mergedCurrencies.map((c) => (
                    <Select.Option key={c.code} value={c.code}>
                      {c.code} - {c.name}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item
                name="name"
                label="Currency Name"
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>

              <Form.Item
                name="symbol"
                label="Symbol"
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
            </>
          )}
          {modalType === "amount" && (
            <>
              <Form.Item name="currency" label="Currency" initialValue="USD">
                <Select>
                  {currencies.map((c) => (
                    <Select.Option key={c.id || c.code} value={c.code}>
                      {c.code} ({c.symbol})
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item
                name="min_amount"
                label="Min Amount"
                rules={[{ required: true }]}
              >
                <InputNumber
                  style={{ width: "100%" }}
                  formatter={(value) => {
                    const curr = form.getFieldValue("currency") || "USD";
                    const match = mergedCurrencies.find((c) => c.code === curr);
                    const symbol = match ? match.symbol : "$";
                    return `${symbol} ${value}`.replace(
                      /\B(?=(\d{3})+(?!\d))/g,
                      ","
                    );
                  }}
                  parser={(value) => {
                    const allSymbols = [
                      ...new Set([
                        ...mergedCurrencies.map((c) => c.symbol),
                        "$",
                        "₹",
                        "€",
                      ]),
                    ].filter(Boolean);
                    const escapeRegex = (s) =>
                      s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                    const pattern = new RegExp(
                      `[${allSymbols.map(escapeRegex).join("")}\\s,]*`,
                      "g"
                    );
                    return value.replace(pattern, "");
                  }}
                />
              </Form.Item>
              <Form.Item
                name="max_amount"
                label="Max Amount"
                rules={[{ required: true }]}
              >
                <InputNumber
                  style={{ width: "100%" }}
                  formatter={(value) => {
                    const curr = form.getFieldValue("currency") || "USD";
                    const match = mergedCurrencies.find((c) => c.code === curr);
                    const symbol = match ? match.symbol : "$";
                    return `${symbol} ${value}`.replace(
                      /\B(?=(\d{3})+(?!\d))/g,
                      ","
                    );
                  }}
                  parser={(value) => {
                    const allSymbols = [
                      ...new Set([
                        ...mergedCurrencies.map((c) => c.symbol),
                        "$",
                        "₹",
                        "€",
                      ]),
                    ].filter(Boolean);
                    const escapeRegex = (s) =>
                      s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                    const pattern = new RegExp(
                      `[${allSymbols.map(escapeRegex).join("")}\\s,]*`,
                      "g"
                    );
                    return value.replace(pattern, "");
                  }}
                />
              </Form.Item>
              <Form.Item
                name="approver_count"
                label="Approvers Required"
                rules={[{ required: true }]}
              >
                <InputNumber min={1} max={4} style={{ width: "100%" }} />
              </Form.Item>
            </>
          )}
          {modalType === "vendor" && (
            <>
              <Form.Item
                name="vendorName"
                label="Vendor Name"
                rules={[{ required: true }]}
              >
                <Select
                  showSearch
                  options={vendorOptions}
                  optionFilterProp="value"
                  filterOption={(input, option) =>
                    String(option?.value || "")
                      .toLowerCase()
                      .includes(input.toLowerCase())
                  }
                />
              </Form.Item>
              <Form.Item
                name="approverCount"
                label="Approvers Required"
                rules={[{ required: true }]}
              >
                <InputNumber min={1} max={4} style={{ width: "100%" }} />
              </Form.Item>
            </>
          )}
          {modalType === "gl" && (
            <>
              <Form.Item
                name="glTitle"
                label="GL Code"
                rules={[{ required: true }]}
              >
                <Select
                  showSearch
                  placeholder="Select GL Code"
                  disabled={!!editingRecord}
                  loading={loadingMasterData}
                  options={glOptions}
                  filterOption={(input, option) =>
                    (option?.label ?? "")
                      .toLowerCase()
                      .includes(input.toLowerCase())
                  }
                />
              </Form.Item>
              <Form.Item
                name="approverCount"
                label="Approvers Required"
                rules={[{ required: true }]}
              >
                <InputNumber min={1} max={4} style={{ width: "100%" }} />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </div>
  );
};

export default SettingsPage;
