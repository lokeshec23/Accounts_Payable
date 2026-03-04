import React, { useState } from 'react';
import { Upload, Button, message, Progress } from 'antd';
import { UploadOutlined, InboxOutlined } from '@ant-design/icons';
import { invoiceService } from '../services/api';
import '../styles/InvoicePage.css';

const { Dragger } = Upload;

const InvoiceUpload = ({ onUploadSuccess }) => {
    const [fileList, setFileList] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

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

        let eventSource = null;

        try {
            setUploading(true);
            const startTime = Date.now();
            console.log(`[Frontend] Upload and processing started at: ${new Date(startTime).toLocaleString()}`);

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

            // Correct multi-file upload with taskId
            const response = await invoiceService.uploadInvoices(fileList, taskId);

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
            if (eventSource) {
                eventSource.close();
            }
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

                {fileList.length > 0 && !uploading && (
                    <Button
                        type="primary"
                        onClick={handleUpload}
                        icon={<UploadOutlined />}
                        style={{ marginTop: 16, width: '100%' }}
                    >
                        Upload & Process
                    </Button>
                )}

                {uploading && (
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
        </>
    );
};

export default InvoiceUpload;
