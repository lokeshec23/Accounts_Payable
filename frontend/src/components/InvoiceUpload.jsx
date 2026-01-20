import React, { useState } from 'react';
import { Upload, Button, message } from 'antd';
import { UploadOutlined, InboxOutlined } from '@ant-design/icons';
import { invoiceService } from '../services/api';
import '../styles/InvoicePage.css';

const { Dragger } = Upload;

const InvoiceUpload = ({ onUploadSuccess }) => {
    const [fileList, setFileList] = useState([]);
    const [uploading, setUploading] = useState(false);

    // AntD v5 message hook
    const [messageApi, contextHolder] = message.useMessage();

    const uploadProps = {
        name: 'files',
        multiple: true,
        directory: false,           // ❌ remove default folder-only mode
        webkitdirectory: true,      // ✔ allow folder drag-drop
        fileList,
        accept: '.pdf',

        beforeUpload: (file) => {
            setFileList(prev => [...prev, file]);
            return false;
        },

        onRemove: (file) => {
            setFileList(prev => prev.filter(f => f.uid !== file.uid));
        }
    };


    const handleUpload = async () => {
        if (fileList.length === 0) {
            messageApi.warning("Please select at least one file");
            return;
        }

        try {
            setUploading(true);
            const startTime = Date.now();
            console.log(`[Frontend] Upload and processing started at: ${new Date(startTime).toLocaleString()}`);

            messageApi.open({
                type: "loading",
                content: "Uploading and processing invoices...",
                key: "uploading",
                duration: 0
            });

            // Correct multi-file upload
            const response = await invoiceService.uploadInvoices(fileList);

            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000;
            console.log(`[Frontend] Upload and processing completed in ${duration.toFixed(2)} seconds`);

            messageApi.open({
                type: "success",
                content: `${response.count} file(s) processed successfully! (Time: ${duration.toFixed(2)}s)`,
                key: "uploading"
            });

            setFileList([]);

            if (onUploadSuccess) {
                onUploadSuccess(response);
            }

        } catch (error) {
            const err = error?.response?.data?.detail || "Upload failed";

            messageApi.open({
                type: "error",
                content: err,
                key: "uploading"
            });

        } finally {
            setUploading(false);
        }
    };

    return (
        <>
            {contextHolder}

            <div
                className="upload-container"
                style={{ boxShadow: 'none', padding: 0, maxWidth: '100%' }}
            >
                <h2 className="upload-title">Upload Invoice Files - Dashboard</h2>
                <p className="upload-description">
                    Drag & drop files or folders, or click to browse
                </p>

                <Dragger {...uploadProps} className="upload-dragger">
                    <p className="ant-upload-drag-icon">
                        <InboxOutlined />
                    </p>
                    <p className="ant-upload-text">Click or drag files to upload</p>
                    <p className="ant-upload-hint">
                        Supports PDF, JSON, XML, CSV (single, multiple, folder)
                    </p>
                </Dragger>

                {fileList.length > 0 && (
                    <Button
                        type="primary"
                        onClick={handleUpload}
                        loading={uploading}
                        icon={<UploadOutlined />}
                        style={{ marginTop: 16, width: '100%' }}
                    >
                        Upload & Process
                    </Button>
                )}
            </div>
        </>
    );
};

export default InvoiceUpload;
