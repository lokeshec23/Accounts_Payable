import React from 'react';
import InvoiceUpload from '../components/InvoiceUpload';
import '../styles/InvoicePage.css';

const InvoicePage = () => {
    return (
        <div className="invoice-page">
            <div className="upload-container">
                <InvoiceUpload />
            </div>
        </div>
    );
};

export default InvoicePage;
