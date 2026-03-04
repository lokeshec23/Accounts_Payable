import React, { useState } from "react";
import { Upload, Button, message, Modal, Progress } from "antd";
import { UploadOutlined, InboxOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { invoiceService } from "../services/api";
import Dragger from "antd/es/upload/Dragger";
import { useNavigate } from "react-router-dom";
import "../styles/InvoicePage.css";

const InvoicePage = () => {
    const navigate = useNavigate();
    const [fileList, setFileList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    const [messageApi, contextHolder] = message.useMessage();

    // 🟩 Hidden file input for folder upload
    const folderInputRef = React.useRef(null);

    const handleFolderSelect = (event) => {
        const files = Array.from(event.target.files);
        setFileList((prev) => [...prev, ...files]);
    };

    const uploadProps = {
        multiple: true,
        fileList,
        accept: ".pdf",

        beforeUpload: (file) => {
            setFileList((prev) => [...prev, file]);
            return false;
        },

        onRemove: (file) => {
            setFileList((prev) => prev.filter((f) => f.uid !== file.uid));
        },

        // IMPORTANT: handle click manually so folder upload works
        customRequest: () => { }
    };

    const handleUpload = async () => {
        if (fileList.length === 0) {
            messageApi.warning("Please select at least one file");
            return;
        }

        let eventSource = null;

        try {
            setLoading(true);

            const taskId = crypto.randomUUID();

            eventSource = new EventSource(invoiceService.getUploadProgressUrl(taskId));
            let currentProgress = 25;
            setUploadProgress(25);

            eventSource.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.status === 'processing' && data.message) {
                    if (data.progress && data.progress > currentProgress) {
                        currentProgress = data.progress;
                        setUploadProgress(currentProgress);
                    }
                }
            };

            const response = await invoiceService.uploadInvoices(fileList, taskId);

            const processedCount = response.count || 0;
            const failedCount = response.failed?.length || 0;

            if (failedCount > 0) {
                // Show a list of failures
                const failureItems = response.failed.map(f => (
                    <div key={f.filename} style={{ marginBottom: 8 }}>
                        <strong>{f.filename}:</strong> {f.reason}
                    </div>
                ));

                Modal.error({
                    title: 'Upload Results',
                    content: (
                        <div>
                            {processedCount > 0 && <p style={{ color: 'green' }}>✓ {processedCount} successfully processed.</p>}
                            <p style={{ color: 'red' }}>✗ {failedCount} failed:</p>
                            <div style={{ maxHeight: 300, overflow: 'auto' }}>
                                {failureItems}
                            </div>
                        </div>
                    ),
                    width: 600,
                });
            }

            if (processedCount > 0) {
                messageApi.open({
                    type: "success",
                    content: `${processedCount} invoice${processedCount > 1 ? 's' : ''} processed successfully!`,
                    key: "uploading"
                });

                if (processedCount === 1 && failedCount === 0) {
                    navigate("/invoice/review", { state: { invoice: response.invoices[0] } });
                } else {
                    // If multiple files or some failures, go to dashboard to see results
                    navigate("/dashboard");
                }
            } else if (failedCount > 0) {
                messageApi.destroy("uploading");
            }

            setFileList([]);

        } catch (error) {
            console.error("Upload failed:", error);
            console.log("Error Response:", error.response);
            console.log("Error Status:", error.response?.status);
            console.log("Error Detail:", error.response?.data?.detail);

            messageApi.destroy("uploading");

            // Check if it's a duplicate invoice error (400 status)
            if (error.response?.status === 400 && error.response?.data?.detail) {
                // Show detailed error message for duplicates
                Modal.error({
                    title: 'Duplicate Invoice Detected',
                    content: error.response.data.detail,
                    width: 600,
                });
                messageApi.error("Duplicate Invoice Detected");
            } else {
                // Generic error message for other failures
                // DEBUG: Show full error details in toast
                const errorMsg = error.response?.data?.detail ?
                    (typeof error.response.data.detail === 'object' ? JSON.stringify(error.response.data.detail) : error.response.data.detail)
                    : (error.message || "Unknown error");

                messageApi.error(`Error (${error.response?.status || 'No Status'}): ${errorMsg}`);
            }

        } finally {
            if (eventSource) {
                eventSource.close();
            }
            setLoading(false);
        }
    };

    return (
        <>
            {contextHolder}

            <div className="invoice-page">
                <div className="upload-container">
                    <h2 className="upload-title">Upload Invoice Files</h2>
                    <p className="upload-description">
                        Drag a PDF, multiple PDFs, or upload a folder.
                    </p>

                    {/* 🟩 HIDDEN folder picker */}
                    <input
                        type="file"
                        ref={folderInputRef}
                        style={{ display: "none" }}
                        webkitdirectory="true"
                        onChange={handleFolderSelect}
                    />

                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                        <Button
                            icon={<FolderOpenOutlined />}
                            onClick={() => folderInputRef.current.click()}
                            style={{
                                borderColor: '#1890ff',
                                color: '#1890ff',
                                backgroundColor: '#e6f7ff'
                            }}
                        >
                            Upload Folder
                        </Button>
                    </div>

                    <Dragger {...uploadProps} className="upload-dragger">
                        <p className="ant-upload-drag-icon">
                            <InboxOutlined />
                        </p>
                        <p className="ant-upload-text">Click or drag PDF files to upload</p>
                        <p className="ant-upload-hint">
                            Supports single or multiple PDF files
                        </p>
                    </Dragger>

                    {fileList.length > 0 && !loading && (
                        <Button
                            type="primary"
                            onClick={handleUpload}
                            icon={<UploadOutlined />}
                            className="upload-submit-btn"
                            style={{ marginTop: 16, width: "100%" }}
                        >
                            Upload {fileList.length} File{fileList.length > 1 ? "s" : ""}
                        </Button>
                    )}

                    {loading && (
                        <div style={{ marginTop: 16, textAlign: 'center', padding: '10px 0' }}>
                            <Progress
                                percent={uploadProgress}
                                status="active"
                                strokeColor={{
                                    '0%': '#108ee9',
                                    '100%': '#87d068',
                                }}
                            />
                            <div style={{ marginTop: 8, fontWeight: 'bold', color: '#666' }}>
                                Uploading... ({uploadProgress}%)
                            </div>
                        </div>
                    )}
                </div>
            </div >
        </>
    );
};

export default InvoicePage;
