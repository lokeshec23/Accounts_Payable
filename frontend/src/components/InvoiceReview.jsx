import React, { useState, useEffect } from 'react';
import PdfViewer from './Pdfviewer';
import GenericInputFields from './GenericInputFields';
import { Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { schemaMap } from '../config/schemaMap';

const InvoiceReview = ({ file, onBack }) => {
    const [numPages, setNumPages] = useState(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [hoveredKey, setHoveredKey] = useState(null);

    // Mock data for demonstration since we don't have real backend extraction yet
    const [mockData, setMockData] = useState({
        doc_type: 'invoice',
        extraction_json: {
            'Vendor Name': { value: 'Example Vendor Inc.', page_num: 1 },
            'Invoice Number': { value: 'INV-2023-001', page_num: 1 },
            'Invoice Date': { value: '2023-10-25', page_num: 1 },
            'Total Amount': { value: '1,250.00', page_num: 1 },
            'Tax Amount': { value: '100.00', page_num: 1 },
            'Subtotal': { value: '1,150.00', page_num: 1 }
        },
        items: [
            {
                Description: { value: 'Consulting Services' },
                Quantity: { value: '10' },
                UnitPrice: { value: '100.00' },
                NetAmount: { value: '1000.00' }
            },
            {
                Description: { value: 'Software License' },
                Quantity: { value: '1' },
                UnitPrice: { value: '150.00' },
                NetAmount: { value: '150.00' }
            }
        ]
    });

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            width: '100vw',
            position: 'fixed',
            top: 0,
            left: 0,
            background: 'white',
            zIndex: 1000
        }}>
            <div style={{
                padding: '15px 20px',
                borderBottom: '1px solid #e8e8e8',
                background: 'white',
                display: 'flex',
                alignItems: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
                <Button icon={<ArrowLeftOutlined />} onClick={onBack} size="large">
                    Back to Dashboard
                </Button>
            </div>
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* Left Side: PDF Viewer */}
                <div style={{
                    flex: 1,
                    borderRight: '1px solid #e8e8e8',
                    overflow: 'hidden',
                    background: '#f5f5f5',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <PdfViewer
                        file={file}
                        numPages={numPages}
                        setNumPages={setNumPages}
                        pageNumber={pageNumber}
                        setPageNumber={setPageNumber}
                        data={mockData}
                        hoveredKey={hoveredKey}
                    />
                </div>

                {/* Right Side: Input Fields */}
                <div style={{
                    flex: 1,
                    overflow: 'auto',
                    background: 'white'
                }}>
                    <GenericInputFields
                        data={mockData}
                        schema={schemaMap.invoice}
                        setHoveredKey={setHoveredKey}
                    />
                </div>
            </div>
        </div>
    );
};

export default InvoiceReview;
