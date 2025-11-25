import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { message, Spin } from 'antd';
import InvoiceReview from '../components/InvoiceReview';
import { invoiceService } from '../services/api';

const InvoiceReviewPage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [invoiceData, setInvoiceData] = useState(null);
    const [pdfUrl, setPdfUrl] = useState(null);

    // Get invoice from location state (passed from MainLayout)
    const invoice = location.state?.invoice;

    useEffect(() => {
        const fetchInvoiceData = async () => {
            if (!invoice || !invoice.id) {
                message.error('No invoice selected');
                navigate('/dashboard');
                return;
            }

            try {
                setLoading(true);

                // Fetch complete invoice data from backend
                const fullInvoiceData = await invoiceService.getInvoice(invoice.id);
                setInvoiceData(fullInvoiceData);

                // Get PDF as blob with authentication
                const blobUrl = await invoiceService.getPdfBlob(invoice.id);
                setPdfUrl(blobUrl);

            } catch (error) {
                console.error('Error fetching invoice:', error);
                message.error('Failed to load invoice data');
                navigate('/dashboard');
            } finally {
                setLoading(false);
            }
        };

        fetchInvoiceData();
    }, [invoice, navigate]);

    const handleBack = () => {
        navigate('/dashboard');
    };

    if (loading) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh'
            }}>
                <Spin size="large" tip="Loading invoice..." />
            </div>
        );
    }

    if (!invoiceData || !pdfUrl) {
        return null;
    }

    return (
        <div style={{ height: '100vh', width: '100%' }}>
            <InvoiceReview
                file={pdfUrl}
                onBack={handleBack}
                invoiceData={invoiceData}
            />
        </div>
    );
};

export default InvoiceReviewPage;
