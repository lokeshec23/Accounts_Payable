import React, { useState } from "react";
import { Upload, Button, message } from "antd";
import { UploadOutlined, InboxOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { invoiceService } from "../services/api";
import Dragger from "antd/es/upload/Dragger";
import { useNavigate } from "react-router-dom";
import "../styles/InvoicePage.css";

const InvoicePage = () => {
    const navigate = useNavigate();
    const [fileList, setFileList] = useState([]);
    const [loading, setLoading] = useState(false);

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

        try {
            setLoading(true);

            messageApi.open({
                type: "loading",
                content: "Processing invoices...",
                key: "uploading",
                duration: 0
            });

            const response = await invoiceService.uploadInvoices(fileList);

            messageApi.open({
                type: "success",
                content: `${response.count} invoice(s) processed successfully!`,
                key: "uploading"
            });

            if (response.count === 1) {
                navigate("/invoice/review", { state: { invoice: response.invoices[0] } });
            } else {
                navigate("/dashboard");
            }

            setFileList([]);

        } catch (error) {
            console.error("Upload failed:", error);
            messageApi.open({
                type: "error",
                content: "Upload failed",
                key: "uploading"
            });

        } finally {
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

                    {fileList.length > 0 && (
                        <Button
                            type="primary"
                            onClick={handleUpload}
                            icon={<UploadOutlined />}
                            loading={loading}
                            className="upload-submit-btn"
                            style={{ marginTop: 16, width: "100%" }}
                        >
                            Upload {fileList.length} File{fileList.length > 1 ? "s" : ""}
                        </Button>
                    )}
                </div>
            </div >
        </>
    );
};

export default InvoicePage;
