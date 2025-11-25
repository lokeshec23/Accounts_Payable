import React, { useState } from 'react';
import { Upload, Button, message } from 'antd';
import { UploadOutlined, InboxOutlined } from '@ant-design/icons';
import { invoiceService } from '../services/api';  // FIXED: Added import
import '../styles/InvoicePage.css';

const { Dragger } = Upload;

const InvoiceUpload = ({ onUploadSuccess }) => {
    const [fileList, setFileList] = useState([]);
    const [uploading, setUploading] = useState(false);

    const uploadProps = {
        name: 'file',
        multiple: false, // Changed to false since backend handles single file
        fileList: fileList,
        accept: '.pdf', // Only accept supported formats
        beforeUpload: (file) => {
            // Validate file type
            const isPdf = file.type === 'application/pdf';
            const isJson = file.type === 'application/json';
            const isXml = file.type === 'application/xml' || file.type === 'text/xml';
            const isCsv = file.type === 'text/csv';
            
            if (!isPdf && !isJson && !isXml && !isCsv) {
                message.error('You can only upload PDF, JSON, XML or CSV files!');
                return Upload.LIST_IGNORE;
            }

            // Replace existing file with new one
            setFileList([file]);
            return false; // Prevent auto upload
        },
        onRemove: () => {
            setFileList([]);
        },
    };

    const handleUpload = async () => {
        if (fileList.length === 0) {
            message.warning('Please select a file to upload');
            return;
        }

        const file = fileList[0];

        try {
            setUploading(true);
            message.loading({ content: 'Uploading and processing invoice...', key: 'uploading', duration: 0 });
            
            // Upload and process the invoice
            const response = await invoiceService.uploadInvoice(file);
            
            console.log('Upload response:', response);
            
            message.success({ content: 'Invoice uploaded and processed successfully!', key: 'uploading' });
            
            // Clear file list
            setFileList([]);

            // Pass the response data to parent component
            if (onUploadSuccess) {
                // Create a structure that includes both the file and the processed data
                onUploadSuccess({
                    file: file,
                    invoiceData: response,
                    pdfUrl: response.id ? invoiceService.getPdfUrl(response.id) : null
                });
            }
        } catch (error) {
            console.error('Upload failed:', error);
            const errorMessage = error.response?.data?.detail || error.message || 'Upload failed. Please try again.';
            message.error({ content: errorMessage, key: 'uploading' });
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="upload-container" style={{ boxShadow: 'none', padding: '0', maxWidth: '100%' }}>
            <h2 className="upload-title">Upload Invoice Files</h2>
            <p className="upload-description">
                Drag and drop your invoice file here or click to browse
            </p>

            <Dragger {...uploadProps} className="upload-dragger">
                <p className="ant-upload-drag-icon">
                    <InboxOutlined />
                </p>
                <p className="ant-upload-text">Click or drag file to this area to upload</p>
                <p className="ant-upload-hint">
                    Support for PDF, JSON, XML, and CSV files. The file will be automatically processed.
                </p>
            </Dragger>

            {fileList.length > 0 && (
                <Button
                    type="primary"
                    onClick={handleUpload}
                    loading={uploading}
                    icon={<UploadOutlined />}
                    className="upload-submit-btn"
                    style={{ marginTop: '16px', width: '100%' }}
                >
                    Upload and Process
                </Button>
            )}
        </div>
    );
};

export default InvoiceUpload;