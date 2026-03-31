import React, { useState, useEffect, useMemo } from "react";
import {
    Card,
    Typography,
    Tabs,
    Table,
    Button,
    Space,
    Spin,
    message,
    Input,
    Modal,
    Form,
    Upload,
    Select,
    Empty,
    Switch
} from "antd";
 
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    ExclamationCircleOutlined,
    UploadOutlined,
    InboxOutlined
} from "@ant-design/icons";
import { masterDataService, currencyService } from "../services/api";
import { TableSkeleton } from "../components/SkeletonLoader";
import "../styles/MainLayout.css";
 
const { Title, Text } = Typography;
const { Search } = Input;
const { confirm } = Modal;
const { Dragger } = Upload;
 
const MASTER_TABS = [
    { key: "Entity_Master", label: "Entity Master" },
    { key: "Vendor_Master", label: "Vendor Master" },
    { key: "TDS_Rates", label: "TDS Rates" },
    { key: "GL", label: "GL Master" },
    { key: "LOB", label: "LOB Master" },
    { key: "Department", label: "Department Master" },
    { key: "Customer", label: "Customer Master" },
    { key: "Item", label: "Item Master" },
    { key: "Exchange_Rate", label: "Currency" }
];
 
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
 
const MasterDataPage = () => {
    const [loading, setLoading] = useState(false);
    const [userRole, setUserRole] = useState('');
    const [activeTab, setActiveTab] = useState("Entity_Master");
    const [activeSubTab, setActiveSubTab] = useState(null); // { name, collection_name }
    const [tabStatus, setTabStatus] = useState({}); // { tabKey: { file_name, status, sheets: [] } }
 
    const [tableData, setTableData] = useState([]);
    const [columns, setColumns] = useState([]);
    const [searchText, setSearchText] = useState("");
 
    const [currencies, setCurrencies] = useState([]);
    const mergedCurrencies = useMemo(() => {
        return [
            ...currencies,
            ...EXTRA_CURRENCIES.filter(
                (extra) => !currencies.some((c) => c.code === extra.code)
            )
        ];
    }, [currencies]);
 
    // TDS Rates for dropdowns in Vendor Master
    const [tdsRates, setTdsRates] = useState([]);
 
    const [pagination, setPagination] = useState({
        current: 1,
        pageSize: 10,
        showSizeChanger: true,
        pageSizeOptions: ["5", "10", "20", "50"],
        showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
    });
 
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editRecord, setEditRecord] = useState(null);
    const [addMode, setAddMode] = useState(false);
    const [form] = Form.useForm();
    const tdsApplicable = Form.useWatch("TDS/Withhold Tax Applicability Configuration", form);
 
 
    // Effect to clear TDS fields when TDS is set to "No"
    useEffect(() => {
        if (tdsApplicable === "No") {
            form.setFieldsValue({
                "TDS Percentage": null,
                "TDS Section Code and Description": null
            });
        }
    }, [tdsApplicable, form]);
 
 
    useEffect(() => {
        const storedUser = sessionStorage.getItem('user');
        if (storedUser) {
            try {
                const user = JSON.parse(storedUser);
                setUserRole(user.role || '');
            } catch (e) {
                setUserRole('');
            }
        }
    }, []);
 
    useEffect(() => {
        loadTabStatus();
    }, []);
    useEffect(() => {
        if (activeTab) {
            // Immediately clear current view to avoid showing stale data from previous tab
            setTableData([]);
            setColumns([]);
            setSearchText("");

            // No specialized logic needed for Exchange_Rate as it follows standard master data flow

            // Reset activeSubTab to the first sheet of this tab if available
            const status = tabStatus[activeTab];
            if (status && status.sheets && status.sheets.length > 0) {
                setActiveSubTab(status.sheets[0]);
            } else {
                setActiveSubTab(null);
                loadSheetData(`master_data_${activeTab}`);
            }
        }
    }, [activeTab, tabStatus, userRole]);
 
    useEffect(() => {
        if (activeSubTab) {
            loadSheetData(activeSubTab.collection_name);
        }
    }, [activeSubTab]);
 
 
 
    // Fetch TDS Rates whenever TDS_Rates tab data would be available
    useEffect(() => {
        if (activeTab === "Vendor_Master") {
            fetchTdsRates();
        }
    }, [activeTab]);
 
    const fetchTdsRates = async () => {
        try {
            // Intelligent discovery: search for sheet with "TDS" or "Rates" or "Tax"
            const tdsStatus = tabStatus["TDS_Rates"];
            let collectionName = "master_data_TDS_Rates";
            if (tdsStatus && tdsStatus.sheets && tdsStatus.sheets.length > 0) {
                const sheet = tdsStatus.sheets.find(s =>
                    s.name.toLowerCase().includes("tds") ||
                    s.name.toLowerCase().includes("rate") ||
                    s.name.toLowerCase().includes("tax")
                );
                collectionName = sheet ? sheet.collection_name : tdsStatus.sheets[0].collection_name;
            }
            const data = await masterDataService.getSheetData(collectionName);
            setTdsRates(data);
        } catch (error) {
            console.error("Failed to fetch TDS rates for dropdowns", error);
        }
    };
 
 
 
    const loadTabStatus = async () => {
        try {
            setLoading(true);
            const data = await masterDataService.getFiles();
            const statusMap = {};
            data.forEach(item => {
                statusMap[item.tab_name] = item;
            });
            setTabStatus(statusMap);
        } catch {
            message.error("Failed to load master data status");
        } finally {
            setLoading(false);
        }
    };
 
    const loadSheetData = async (targetCollection) => {
        try {
            setLoading(true);
            const collectionName = targetCollection || (activeSubTab ? activeSubTab.collection_name : `master_data_${activeTab}`);
            const result = await masterDataService.getSheetData(collectionName);
 
 
            const rows = result.map((r, index) => ({
                key: index,
                ...r,
            }));
 
            setTableData(rows);
 
            if (rows.length > 0) {
                generateColumns(rows[0], rows);
            } else {
                setColumns([]);
            }
 
            setPagination(prev => ({ ...prev, current: 1 }));
        } catch (error) {
            console.log(error);
            // Don't show error if it's just missing data
            setTableData([]);
            setColumns([]);
        } finally {
            setLoading(false);
        }
    };
 
    const handleFileUpload = async (file) => {
        try {
            setLoading(true);
            await masterDataService.uploadFile(activeTab, file);
            message.success(`${activeTab} uploaded successfully`);
            await loadTabStatus();
        } catch (error) {
 
            console.error(error);
            message.error("Failed to upload file");
        } finally {
            setLoading(false);
        }
        return false;
    };
 
    const handleTabDelete = () => {
        confirm({
            title: `Delete data for ${activeTab.replace(/_/g, " ")}?`,
            icon: <ExclamationCircleOutlined />,
            content: "This will permanently delete all rows in this tab.",
            okText: "Yes",
            okType: "danger",
            onOk: async () => {
                try {
                    setLoading(true);
                    await masterDataService.deleteFile(activeTab);
                    message.success("Data deleted successfully");
                    await loadTabStatus();
                    setTableData([]);
                    setColumns([]);
                } catch (error) {
 
                    message.error("Failed to delete data");
                } finally {
                    setLoading(false);
                }
            },
        });
    };
 
    const generateColumns = (sampleRow, rows) => {
        const HIDDEN_COLS = new Set(["key", "id", "created_at", "updated_at", "raw_data", "vendor_key", "entity_id"]);
        const colKeys = Object.keys(sampleRow).filter(k => !HIDDEN_COLS.has(k));
 
        const generated = colKeys.map((colKey) => {
            const values = rows.map(r => r[colKey]);
            const uniqueValues = [...new Set(
                values.filter(v => v !== null && v !== undefined && v !== "")
            )];
 
            return {
                title: colKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
 
                dataIndex: colKey,
                key: colKey,
                sorter: (a, b) => String(a[colKey] || "").localeCompare(String(b[colKey] || "")),
                filters: uniqueValues.slice(0, 50).map(val => ({
                    text: String(val),
                    value: val,
                })),
                filterSearch: true,
                onFilter: (value, record) => record[colKey] === value,
            };
        });
 
        if (userRole !== 'coder') {
            generated.push({
                title: "Actions",
                key: "actions",
                fixed: 'right',
                width: 150,
                render: (_, record) => (
                    <Space>
                        <Button
                            type="link"
                            icon={<EditOutlined />}
                            onClick={() => openEditModal(record)}
                        >
                            Edit
                        </Button>
                        <Button
                            type="link"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => confirmDelete(record.key)}
                        >
                            Delete
                        </Button>
                    </Space>
                ),
            });
        }
        setColumns(generated);
    };
 
    const openAddModal = () => {
        setEditRecord(null);
        setAddMode(true);
        form.resetFields();
        // Set defaults for Vendor Master
        if (activeTab === "Vendor_Master") {
            form.setFieldsValue({
                "GST / Use Tax Eligibility Configuration": "Eligible",
                "TDS/Withhold Tax Applicability Configuration": "No",
                "Workflow Applicability Configuration": "Yes",
                "Line Grouping": "No"
            });
        }
        setIsModalVisible(true);
    };
 
    const openEditModal = (record) => {
        setEditRecord(record);
        setAddMode(false);
        form.setFieldsValue(record);
        setIsModalVisible(true);
    };
 
    const handleSave = async () => {
        try {
            const values = await form.validateFields();
            const collectionName = activeSubTab ? activeSubTab.collection_name : `master_data_${activeTab}`;
 
            if (addMode) {
                await masterDataService.addRow(collectionName, values);
                message.success("Row added");
            } else {
                await masterDataService.editRow(collectionName, editRecord.key, { ...editRecord, ...values });
                message.success("Row updated");
            }
 
            setIsModalVisible(false);
            loadSheetData();
        } catch (error) {
            console.error(error);
            message.error("Failed to save row");
        }
    };
 
    const confirmDelete = (indexOrId) => {
        let title = "Delete this row?";
        if (activeTab === "Currency") {
            const currency = tableData.find(c => c.id === indexOrId);
            if (currency) title = `Currency: ${currency.name} (${currency.symbol})`;
        }
 
        confirm({
            title: title,
            icon: <ExclamationCircleOutlined />,
            okText: "Yes",
            okType: "danger",
            onOk: async () => {
                try {
                    const collectionName = activeSubTab ? activeSubTab.collection_name : `master_data_${activeTab}`;
                    await masterDataService.deleteRow(collectionName, indexOrId);
                    message.success("Row deleted");
 
                    loadSheetData();
                } catch {
                    message.error("Failed to delete row");
                }
            },
        });
    };
 
    const filteredData = useMemo(() => {
        if (!searchText) return tableData;
        return tableData.filter((record) =>
            Object.keys(record).some((key) =>
                String(record[key] || "").toLowerCase().includes(searchText.toLowerCase())
            )
        );
    }, [tableData, searchText]);
 
    const renderUploadView = () => (
        <div style={{ padding: '60px 0', textAlign: 'center' }}>
            <Dragger
                beforeUpload={handleFileUpload}
                showUploadList={false}
                accept=".xls,.xlsx,.csv"
                style={{ background: '#fafafa', borderRadius: 8, padding: 40 }}
            >
                <p className="ant-upload-drag-icon">
                    <InboxOutlined style={{ color: '#1890ff' }} />
                </p>
                <p className="ant-upload-text">Click or drag file to this area to upload {activeTab.replace(/_/g, " ")}</p>
                <p className="ant-upload-hint">Support for .xls, .xlsx, .csv files.</p>
            </Dragger>
        </div>
    );
 
    return (
        <div style={{ padding: "24px", fontFamily: "'Inter', sans-serif" }}>
 
            <Card className="master-data-card" style={{ minHeight: "80vh", borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                    <Title level={4} style={{ margin: 0 }}>Master Data Management</Title>
                    {columns.length > 0 && (
                        <Space>
                            <Search
                                placeholder="Search table..."
                                allowClear
                                onChange={(e) => setSearchText(e.target.value)}
                                style={{ width: 250 }}
                            />
                            {activeTab !== "Exchange_Rate" && (
                                <>
                                    <Upload beforeUpload={handleFileUpload} showUploadList={false} accept=".xls,.xlsx,.csv">
                                        <Button icon={<UploadOutlined />}>Re-upload</Button>
                                    </Upload>
                                    <Button danger icon={<DeleteOutlined />} onClick={handleTabDelete}>Clear Tab</Button>
                                </>
                            )}
                            {(activeTab === "Exchange_Rate" || activeTab === "GL" || activeTab === "LOB" || activeTab === "Department" || activeTab === "Customer" || activeTab === "Vendor_Master" || activeTab === "Item") && (
                                <Button 
                                    onClick={async () => {
                                        try {
                                            setLoading(true);
                                            await masterDataService.triggerSync(activeTab);
                                            message.success(`${activeTab.replace(/_/g, " ")} sync started`);
                                            // Refresh data after a short delay to allow sync to progress
                                            setTimeout(() => loadSheetData(), 2000);
                                        } catch (error) {
                                            message.error("Sync failed");
                                        } finally {
                                            setLoading(false);
                                        }
                                    }}
                                    icon={<UploadOutlined />}
                                >
                                    Sync from Sage
                                </Button>
                            )}
                            <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>Add {activeTab === "Exchange_Rate" ? "Currency" : "Row"}</Button>
                        </Space>
                    )}
                </div>
 
                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    items={MASTER_TABS.map(tab => ({
                        key: tab.key,
                        label: tab.label
                    }))}
                    className="master-data-tabs"
                />
 
                {!loading && tabStatus[activeTab]?.sheets?.length > 1 && (
                    <Tabs
                        size="small"
                        type="card"
                        activeKey={activeSubTab?.collection_name}
                        onChange={(key) => setActiveSubTab(tabStatus[activeTab].sheets.find(s => s.collection_name === key))}
                        items={tabStatus[activeTab].sheets.map(s => ({
                            key: s.collection_name,
                            label: s.name
                        }))}
                        style={{ marginBottom: 16 }}
                    />
                )}
 
 
                {loading ? (
                    <TableSkeleton />
                ) : (
                    <>
                        {columns.length > 0 ? (
                            <Table
                                columns={columns}
                                dataSource={filteredData}
                                pagination={{
                                    ...pagination,
                                    current: pagination.current,
                                    total: filteredData.length,
                                    onChange: (page, pageSize) => setPagination({ ...pagination, current: page, pageSize })
                                }}
                                scroll={{ x: "max-content", y: "calc(100vh - 400px)" }}
                                className="master-data-table invoices-table"
                            />
                        ) : (
                            activeTab === "Exchange_Rate" ? (
                                <Empty
                                    description="No Exchange Rates Found"
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                >
                                    <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>
                                        Add Currency
                                    </Button>
                                </Empty>
                            ) : renderUploadView()
                        )}
                    </>
                )}
 
                <Modal
                    title={addMode ? `Add to ${activeTab.replace(/_/g, " ")}` : `Edit Row`}
                    open={isModalVisible}
                    onCancel={() => setIsModalVisible(false)}
                    onOk={handleSave}
                    okText="Save"
                    width={activeTab === "Vendor_Master" ? 700 : 520}
                >
                    <Form form={form} layout="vertical" initialValues={editRecord}>
                        {activeTab === "Currency" ? (
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
                        ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                                {columns.filter(c => c.key !== 'actions').map((col) => {
                                    const fieldKey = col.key;
 
                                    // Specialized rendering for Vendor Master configuration fields
                                    if (activeTab === "Entity_Master") {
                                        if (fieldKey === "GST Applicable") {
                                            return (
                                                <Form.Item
                                                    key={fieldKey}
                                                    label={fieldKey}
                                                    name={fieldKey}
                                                    style={{ width: 'calc(50% - 8px)' }}
                                                    valuePropName="checked"
                                                    getValueProps={(value) => ({ checked: value === 'Yes' })}
                                                    getValueFromEvent={(val) => (val ? 'Yes' : 'No')}
                                                >
                                                    <Switch checkedChildren="Yes" unCheckedChildren="No" />
                                                </Form.Item>
                                            );
                                        }
                                    }
 
                                    if (activeTab === "Vendor_Master") {
                                        if (fieldKey === "GST / Use Tax Eligibility Configuration") {
                                            return (
                                                <Form.Item
                                                    key={fieldKey}
                                                    label={fieldKey}
                                                    name={fieldKey}
                                                    style={{ width: 'calc(50% - 8px)' }}
                                                    valuePropName="checked"
                                                    getValueProps={(value) => ({ checked: value === 'Eligible' })}
                                                    getValueFromEvent={(val) => (val ? 'Eligible' : 'Ineligible')}
                                                >
                                                    <Switch checkedChildren="Eligible" unCheckedChildren="Ineligible" />
                                                </Form.Item>
                                            );
                                        }
                                        if (fieldKey === "TDS/Withhold Tax Applicability Configuration") {
                                            return (
                                                <Form.Item
                                                    key={fieldKey}
                                                    label={fieldKey}
                                                    name={fieldKey}
                                                    style={{ width: 'calc(50% - 8px)' }}
                                                    valuePropName="checked"
                                                    getValueProps={(value) => ({ checked: value === 'Yes' })}
                                                    getValueFromEvent={(val) => (val ? 'Yes' : 'No')}
                                                >
                                                    <Switch checkedChildren="Yes" unCheckedChildren="No" />
                                                </Form.Item>
                                            );
                                        }
                                        if (fieldKey === "Workflow Applicability Configuration") {
                                            return (
                                                <Form.Item
                                                    key={fieldKey}
                                                    label={fieldKey}
                                                    name={fieldKey}
                                                    style={{ width: 'calc(50% - 8px)' }}
                                                    valuePropName="checked"
                                                    getValueProps={(value) => ({ checked: value === 'Yes' })}
                                                    getValueFromEvent={(val) => (val ? 'Yes' : 'No')}
                                                >
                                                    <Switch checkedChildren="Yes" unCheckedChildren="No" />
                                                </Form.Item>
                                            );
                                        }
                                        if (fieldKey === "Line Grouping") {
                                            return (
                                                <Form.Item
                                                    key={fieldKey}
                                                    label={fieldKey}
                                                    name={fieldKey}
                                                    style={{ width: 'calc(50% - 8px)' }}
                                                    valuePropName="checked"
                                                    getValueProps={(value) => ({ checked: value === 'Yes' })}
                                                    getValueFromEvent={(val) => (val ? 'Yes' : 'No')}
                                                >
                                                    <Switch checkedChildren="Yes" unCheckedChildren="No" />
                                                </Form.Item>
                                            );
                                        }
 
                                        if (fieldKey === "TDS Percentage") {
                                            const isApplicable = tdsApplicable === "Yes";
                                            return (
                                                <Form.Item key={fieldKey} label={fieldKey} name={fieldKey} style={{ width: 'calc(50% - 8px)' }}>
                                                    <Select
                                                        disabled={!isApplicable}
                                                        options={tdsRates.map(r => ({
                                                            value: r["TDS Percentage"] || r["Percentage"] || r["Rate"] || r["TDS Rate"],
                                                            label: r["TDS Percentage"] || r["Percentage"] || r["Rate"] || r["TDS Rate"]
                                                        }))}
                                                        onChange={(value) => {
                                                            const matched = tdsRates.find(r =>
                                                                (r["TDS Percentage"] || r["Percentage"] || r["Rate"] || r["TDS Rate"]) === value
                                                            );
                                                            if (matched) {
                                                                const descValue = matched["Section Code"] || matched["Description"] || matched["Code"] || matched["Section"];
                                                                if (descValue) {
                                                                    form.setFieldValue("TDS Section Code and Description", descValue);
                                                                }
                                                            }
                                                        }}
                                                    />
                                                </Form.Item>
                                            );
                                        }
 
 
                                        if (fieldKey === "TDS Section Code and Description") {
                                            const isApplicable = tdsApplicable === "Yes";
                                            return (
                                                <Form.Item
                                                    key={fieldKey}
                                                    label={fieldKey}
                                                    name={fieldKey}
                                                    style={{ width: '100%' }}
                                                >
                                                    <Select
                                                        disabled={!isApplicable}
                                                        options={tdsRates.map(r => {
                                                            const code = r["Section"] || r["Code"] || "";
                                                            const desc = r["Description"] || r["Nature of Payment"] || "";
                                                            const combined = `${code} - ${desc}`;
 
                                                            return {
                                                                value: combined,   // ✅ THIS gets stored in DB
                                                                label: combined
                                                            };
                                                        })}
                                                        onChange={(value) => {
                                                            const matched = tdsRates.find(r => {
                                                                const code = r["Section"] || r["Code"] || "";
                                                                const desc = r["Description"] || r["Nature of Payment"] || "";
                                                                return `${code} - ${desc}` === value;
                                                            });
 
                                                            if (matched) {
                                                                const rateValue =
                                                                    matched["TDS Percentage"] ||
                                                                    matched["Percentage"] ||
                                                                    matched["Rate"] ||
                                                                    matched["TDS Rate"];
 
                                                                if (rateValue) {
                                                                    form.setFieldValue("TDS Percentage", rateValue);
                                                                }
                                                            }
                                                        }}
                                                    />
                                                </Form.Item>
 
                                            );
                                        }
 
 
                                    }
 
                                    return (
                                        <Form.Item key={fieldKey} label={col.title} name={fieldKey} style={{ width: 'calc(50% - 8px)' }}>
                                            <Input />
                                        </Form.Item>
                                    );
                                })}
                            </div>
                        )}
                    </Form>
                </Modal>
            </Card>
        </div>
    );
};
 
export default MasterDataPage;
 