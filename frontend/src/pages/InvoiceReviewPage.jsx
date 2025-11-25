import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import InvoiceReview from '../components/InvoiceReview';

const InvoiceReviewPage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const invoice = location.state?.invoice;

    const handleBack = () => {
        navigate('/dashboard');
    };

    // If no invoice data, redirect to dashboard
    if (!invoice) {
        navigate('/dashboard');
        return null;
    }

    return (
        <div style={{ height: '100vh', width: '100%' }}>
            <InvoiceReview
                file={invoice.fileUrl}
                onBack={handleBack}
                invoiceData={invoice}
            />
        </div>
    );
};

export default InvoiceReviewPage;
