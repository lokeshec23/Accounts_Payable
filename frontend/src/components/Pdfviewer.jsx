import React, { useState, useMemo, useEffect } from 'react';
import { Spin } from 'antd';
import '../styles/Pdfviewer.css';

const PdfViewer = ({ file }) => {
    const [loading, setLoading] = useState(true);

    // Memoize the file URL to prevent re-creation on every render
    const fileUrl = useMemo(() => {
        if (!file) return null;
        return file instanceof File ? URL.createObjectURL(file) : file;
    }, [file]);

    // Cleanup the object URL when component unmounts or file changes
    useEffect(() => {
        setLoading(true);

        return () => {
            if (file instanceof File && fileUrl) {
                URL.revokeObjectURL(fileUrl);
            }
        };
    }, [file, fileUrl]);

    const handleLoad = () => {
        setLoading(false);
    };

    if (!fileUrl) {
        return (
            <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <Spin size="large" tip="No file selected..." />
            </div>
        );
    }

    return (
        <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            width: '100%',
            height: '100%'
        }}>
            {loading && (
                <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 10
                }}>
                    <Spin size="large" tip="Loading PDF..." />
                </div>
            )}
            <iframe
                key={fileUrl}
                src={fileUrl}
                style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    display: loading ? 'none' : 'block'
                }}
                onLoad={handleLoad}
                title="PDF Viewer"
            />
        </div>
    );
};

export default PdfViewer;
