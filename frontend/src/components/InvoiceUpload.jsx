import React, { useState } from 'react';
import { Upload, Button, message } from 'antd';
import { UploadOutlined, InboxOutlined } from '@ant-design/icons';
import '../styles/InvoicePage.css';

const { Dragger } = Upload;

const InvoiceUpload = ({ onUploadSuccess }) => {
    const [fileList, setFileList] = useState([]);

    const uploadProps = {
        name: 'file',
        multiple: true,
        fileList: fileList,
        beforeUpload: (file) => {
            // Add file to list without auto-uploading
            setFileList([...fileList, file]);
            return false; // Prevent auto upload
        },
        onRemove: (file) => {
            const index = fileList.indexOf(file);
            const newFileList = fileList.slice();
            newFileList.splice(index, 1);
            setFileList(newFileList);
        },
        onChange: (info) => {
            const { status } = info.file;
            if (status === 'done') {
                message.success(`${info.file.name} file uploaded successfully.`);
            } else if (status === 'error') {
                message.error(`${info.file.name} file upload failed.`);
            }
        },
    };

    const handleUpload = () => {
        if (fileList.length === 0) {
            message.warning('Please select files to upload');
            return;
        }

        // Here you would typically upload to your backend
        console.log('Uploading files:', fileList);
        message.success(`${fileList.length} file(s) uploaded successfully`);
        setFileList([]);

        if (onUploadSuccess) {
            onUploadSuccess();
        }
    };

    return (
        <div className="upload-container" style={{ boxShadow: 'none', padding: '0', maxWidth: '100%' }}>
            <h2 className="upload-title">Upload Invoice Files</h2>
            <p className="upload-description">
                Drag and drop your invoice files here or click to browse
            </p>

            <Dragger {...uploadProps} className="upload-dragger">
                <p className="ant-upload-drag-icon">
                    <InboxOutlined />
                </p>
                <p className="ant-upload-text">Click or drag file to this area to upload</p>
                <p className="ant-upload-hint">
                    Support for single or bulk upload. Accepted formats: PDF, JSON, XML, CSV
                </p>
            </Dragger>

            {fileList.length > 0 && (
                <Button
                    type="primary"
                    onClick={handleUpload}
                    icon={<UploadOutlined />}
                    className="upload-submit-btn"
                >
                    Upload {fileList.length} File{fileList.length > 1 ? 's' : ''}
                </Button>
            )}
        </div>
    );
};

export default InvoiceUpload;
