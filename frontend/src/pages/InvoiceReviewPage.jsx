import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { message, Button, Result } from 'antd';
import InvoiceReview from '../components/InvoiceReview';
import { invoiceService } from '../services/api';
import { ReviewPageSkeleton } from '../components/SkeletonLoader';

const InvoiceReviewPage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [invoiceData, setInvoiceData] = useState(null);
    const [pdfUrl, setPdfUrl] = useState(null);

    // Get invoice from location state (passed from MainLayout)
    const invoice = location.state?.invoice;
    const readOnly = location.state?.readOnly || false;

    const fetchInvoiceData = useCallback(async () => {
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
    }, [invoice, navigate]);

    useEffect(() => {
        fetchInvoiceData();
    }, [fetchInvoiceData]);

    const handleBack = () => {
        navigate('/dashboard', { state: { activeTab: 'invoices' } });
    };

    if (loading) {
        return <ReviewPageSkeleton />;
    }

    if (!invoiceData || !pdfUrl) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <Result
                    status="warning"
                    title="Invoice data could not be loaded"
                    subTitle="The invoice data or PDF is unavailable. Please try again from the invoice list."
                    extra={
                        <Button type="primary" onClick={() => navigate('/dashboard')}>
                            Back to Dashboard
                        </Button>
                    }
                />
            </div>
        );
    }

    // Check if invoice is in a terminal/read-only status
    const terminalStatuses = ['approved', 'rejected', 'sage_posted'];
    const isTerminalStatus = terminalStatuses.includes(invoiceData?.status);
    const effectiveReadOnly = readOnly || isTerminalStatus;

    return (
        <div style={{ height: 'calc(100vh - 10vh)', width: '100%' }}>
            <InvoiceReview
                file={pdfUrl}
                onBack={handleBack}
                invoiceData={invoiceData}
                readOnly={effectiveReadOnly}
                onRefresh={fetchInvoiceData}
            />
        </div>
    );
};

export default InvoiceReviewPage;
