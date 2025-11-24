import React, { useState } from 'react';
import InvoiceUpload from '../components/InvoiceUpload';
import InvoiceReview from '../components/InvoiceReview';
import '../styles/InvoicePage.css';

const InvoicePage = () => {
    const [view, setView] = useState('upload'); // 'upload' or 'review'
    const [uploadedFile, setUploadedFile] = useState(null);

    const handleUploadSuccess = (file) => {
        setUploadedFile(file);
        setView('review');
    };

    const handleBack = () => {
        setUploadedFile(null);
        setView('upload');
    };

    return (
        <div className="invoice-page" style={{ padding: view === 'review' ? 0 : undefined }}>
            {view === 'upload' ? (
                <div className="upload-container">
                    <InvoiceUpload onUploadSuccess={(file) => handleUploadSuccess(file)} />
                </div>
            ) : (
                <div style={{ height: '90vh', width: '100%' }}>
                    <InvoiceReview file={uploadedFile} onBack={handleBack} />
                </div>
            )}
        </div>
    );
};

export default InvoicePage;
