import React, { useState, useEffect } from "react";
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
} from "antd";
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    ExclamationCircleOutlined,
    UploadOutlined,
} from "@ant-design/icons";
import { masterDataService } from "../services/api";
import "../styles/MainLayout.css";

const { Title } = Typography;
const { Search } = Input;
const { confirm } = Modal;

const MasterDataPage = () => {
    const [loading, setLoading] = useState(false);
    const [userRole, setUserRole] = useState('');

    const [files, setFiles] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null);

    const [sheets, setSheets] = useState([]);
    const [selectedSheet, setSelectedSheet] = useState(null);

    const [tableData, setTableData] = useState([]);
    const [columns, setColumns] = useState([]);

    const [searchText, setSearchText] = useState("");

    // Pagination state
    const [pagination, setPagination] = useState({
        current: 1,
        pageSize: 20,
        showSizeChanger: true,
        pageSizeOptions: ["5", "10", "20", "50"],
        showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} items`,
    });

    // Modal state
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editRecord, setEditRecord] = useState(null);
    const [addMode, setAddMode] = useState(false);
    const [form] = Form.useForm();

    // Get user role from localStorage
    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            try {
                const user = JSON.parse(storedUser);
                setUserRole(user.role || '');
            } catch (e) {
                setUserRole('');
            }
        }
    }, []);

    // -------------------------------------------------------
    // Load files
    // -------------------------------------------------------
    useEffect(() => {
        loadFiles();
    }, []);

    const loadFiles = async () => {
        try {
            setLoading(true);
            const data = await masterDataService.getFiles();
            setFiles(data);
            if (data.length > 0) setSelectedFile(data[0]);
        } catch {
            message.error("Failed to load files");
        } finally {
            setLoading(false);
        }

    };

    const handleFileUpload = async (file) => {
        try {
            setLoading(true);
            await masterDataService.uploadFile(file);
            message.success("File uploaded successfully");
            loadFiles(); // Refresh file list
        } catch (error) {
            console.error(error);
            message.error("Failed to upload file");
        } finally {
            setLoading(false);
        }
        return false; // Prevent auto upload by antd
    };


    const handleFileDelete = (fileId) => {
        confirm({
            title: "Delete this Excel file?",
            icon: <ExclamationCircleOutlined />,
            content: "This will delete the file and all its sheets permanently.",
            okText: "Yes",
            okType: "danger",
            onOk: async () => {
                try {
                    setLoading(true);
                    await masterDataService.deleteFile(fileId);
                    message.success("File deleted successfully");
                    loadFiles();
                } catch (error) {
                    console.error(error);
                    message.error("Failed to delete file");
                } finally {
                    setLoading(false);
                }
            },
        });
    };

    // -------------------------------------------------------
    // Load sheets on file change
    // -------------------------------------------------------
    useEffect(() => {
        if (selectedFile) loadSheets(selectedFile._id);
    }, [selectedFile]);

    const loadSheets = async (fileId) => {
        try {
            setLoading(true);
            const result = await masterDataService.getSheets(fileId);
            setSheets(result);
            if (result.length > 0) setSelectedSheet(result[0]);
        } catch {
            message.error("Failed to load sheets");
        } finally {
            setLoading(false);
        }
    };

    // -------------------------------------------------------
    // Load sheet data when sheet changes
    // -------------------------------------------------------
    useEffect(() => {
        if (selectedSheet) loadSheetData(selectedSheet.collection_name);
    }, [selectedSheet]);

    const loadSheetData = async (collectionName) => {
        try {
            setLoading(true);

            const result = await masterDataService.getSheetData(collectionName);

            const rows = result.map((r, index = 1) => ({
                key: index,
                ...r,
            }));

            setTableData(rows);

            if (rows.length > 0) {
                generateColumns(rows[0], rows);
            }

            // Reset to first page when data changes
            setPagination({
                ...pagination,
                current: 1,
            });
        } catch (error) {
            console.log(error);
            message.error("Failed to load sheet data");
        } finally {
            setLoading(false);
        }
    };

    // -------------------------------------------------------
    // Auto-generate table columns with sort + filter
    // -------------------------------------------------------

    const generateColumns = (sampleRow, rows) => {
        const colKeys = Object.keys(sampleRow).filter(k => k !== "key");

        const generated = colKeys.map((colKey) => {
            const values = rows.map(r => r[colKey]);

            const uniqueValues = [...new Set(
                values.filter(v => v !== null && v !== undefined && v !== "")
            )];

            return {
                title: colKey.toUpperCase(),
                dataIndex: colKey,
                key: colKey,

                sorter: (a, b) =>
                    String(a[colKey] || "").localeCompare(String(b[colKey] || "")),

                filters: uniqueValues.map(val => ({
                    text: String(val),
                    value: val,
                })),

                filterSearch: true,
                onFilter: (value, record) => record[colKey] === value,
            };
        });

        // Only add Actions column if user is not a coder (view-only for coders)
        if (userRole !== 'coder') {
            generated.push({
                title: "Actions",
                key: "actions",
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

    // -------------------------------------------------------
    // Search functionality
    // -------------------------------------------------------
    const onSearch = (value) => {
        setSearchText(value);
        // Reset to first page when searching
        setPagination({
            ...pagination,
            current: 1,
        });
    };

    // -------------------------------------------------------
    // Handle table pagination change
    // -------------------------------------------------------
    const handleTableChange = (newPagination) => {
        setPagination({
            ...pagination,
            ...newPagination,
        });
    };

    // -------------------------------------------------------
    // Filter data based on search
    // -------------------------------------------------------
    const getFilteredData = () => {
        if (!searchText) return tableData;

        return tableData.filter((record) => {
            return Object.keys(record).some((key) =>
                String(record[key] || "")
                    .toLowerCase()
                    .includes(searchText.toLowerCase())
            );
        });
    };

    // -------------------------------------------------------
    // Add / Edit Modal
    // -------------------------------------------------------
    const openAddModal = () => {
        setEditRecord(null);
        setAddMode(true);
        form.resetFields();
        setIsModalVisible(true);
    };

    const openEditModal = (record) => {
        setEditRecord(record);
        setAddMode(false);
        form.setFieldsValue(record);
        setIsModalVisible(true);
    };

    const handleSave = async () => {
        const values = form.getFieldsValue();

        try {
            if (addMode) {
                await masterDataService.addRow(
                    selectedSheet.collection_name,
                    values
                );
                message.success("Row added");
            } else {
                await masterDataService.editRow(
                    selectedSheet.collection_name,
                    editRecord.key,
                    values
                );
                message.success("Row updated");
            }

            setIsModalVisible(false);
            loadSheetData(selectedSheet.collection_name);
        } catch {
            message.error("Failed to save row");
        }
    };

    // -------------------------------------------------------
    // Delete row
    // -------------------------------------------------------
    const confirmDelete = (index) => {
        confirm({
            title: "Delete this row?",
            icon: <ExclamationCircleOutlined />,
            okText: "Yes",
            okType: "danger",
            onOk: async () => {
                try {
                    await masterDataService.deleteRow(
                        selectedSheet.collection_name,
                        index
                    );
                    message.success("Row deleted");
                    loadSheetData(selectedSheet.collection_name);
                } catch {
                    message.error("Failed to delete row");
                }
            },
        });
    };

    // Get filtered data
    const filteredData = getFilteredData();

    return (
        <div style={{ padding: "24px" }}>
            <Card style={{ minHeight: "80vh" }}>
                {loading && (
                    <div
                        style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            height: "100%",
                            background: "rgba(255, 255, 255, 0.6)",
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            zIndex: 9999
                        }}
                    >
                        <Spin size="large" />
                    </div>
                )}


                {/* ROW 1: FILE TABS & ADD BUTTON */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ flex: 1, marginRight: 20 }}>
                        <Tabs
                            activeKey={selectedFile?._id}
                            onChange={(fileId) =>
                                setSelectedFile(files.find((f) => f._id === fileId))
                            }
                            items={files.map((file) => ({
                                key: file._id,
                                label: file.file_name,
                            }))}
                            style={{ marginBottom: 0 }}
                        />
                    </div>
                    {(
                        <Space>
                            <Upload
                                beforeUpload={handleFileUpload}
                                showUploadList={false}
                                accept=".xls,.xlsx,.csv"
                            >
                                <Button type="primary" icon={<UploadOutlined />}>Upload Excel/CSV</Button>
                            </Upload>
                            
                            <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>
                                Add Row
                            </Button>

                            {selectedFile && (
                                <Button
                                    danger
                                    icon={<DeleteOutlined />}
                                    onClick={() => handleFileDelete(selectedFile._id)}
                                >
                                    Delete File
                                </Button>
                            )}

                        </Space>
                    )}
                </div>

                {/* ROW 2: SHEET TABS & SEARCH BOX */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <div style={{ flex: 1, marginRight: 20 }}>
                        {sheets.length > 0 && (
                            <Tabs
                                activeKey={selectedSheet?.sheet_name}
                                onChange={(name) =>
                                    setSelectedSheet(
                                        sheets.find((s) => s.sheet_name === name)
                                    )
                                }
                                items={sheets.map((sheet) => ({
                                    key: sheet.sheet_name,
                                    label: sheet.sheet_name.replace(/_/g, " "),
                                }))}
                                style={{ marginBottom: 0 }}
                            />
                        )}
                    </div>
                    <Search
                        placeholder="Search"
                        allowClear
                        onSearch={onSearch}
                        onChange={(e) => onSearch(e.target.value)}
                        style={{ width: 300 }}
                    />
                </div>

                {/* TABLE */}
                <Table
                    columns={columns}
                    dataSource={filteredData}
                    pagination={{
                        ...pagination,
                        total: filteredData.length,
                    }}
                    onChange={handleTableChange}
                    scroll={{ x: "max-content", y: "calc(100vh - 380px)" }}
                    className="master-data-table invoices-table"
                />

                {/* EDIT MODAL */}
                <Modal
                    title={addMode ? "Add Row" : "Edit Row"}
                    open={isModalVisible}
                    onCancel={() => setIsModalVisible(false)}
                    onOk={handleSave}
                    okText="Save"
                >
                    <Form form={form} layout="vertical">
                        {/* If editing, show fields based on record. If adding, show fields based on columns */}
                        {(addMode ? columns : Object.keys(editRecord || {})).map((key) => {
                            // Handle both column object (add mode) and key string (edit mode)
                            const fieldKey = addMode ? key.key : key;
                            if (fieldKey === "key" || fieldKey === "actions") return null;

                            return (
                                <Form.Item key={fieldKey} label={fieldKey} name={fieldKey}>
                                    <Input />
                                </Form.Item>
                            );
                        })}
                    </Form>
                </Modal>
            </Card>
        </div>
    );
};

export default MasterDataPage;