// src/components/GLSummaryTab.jsx
import React, { useMemo } from 'react';

const GLSummaryTab = React.memo(({
    originalData,
    codingLineItems,
    formData,
    getCurrencySymbol,
    extractValue,
    parseCurrencyValue
}) => {
    // Memoize GL summary calculation
    const glSummaryData = useMemo(() => {
        const persistedSummary = originalData?.gl_summary;

        if (persistedSummary && persistedSummary.length > 0) {
            return persistedSummary;
        }

        // Fallback to calculation if not persisted yet
        const summaryMap = {};
        codingLineItems.forEach(item => {
            if (item.gl_code) {
                summaryMap[item.gl_code] = (summaryMap[item.gl_code] || 0) + (parseFloat(item.net_amount) || 0);
            }
        });

        return Object.entries(summaryMap).map(([glCode, total]) => ({
            gl_code: glCode,
            total_amount: total
        }));
    }, [originalData, codingLineItems]);

    // Memoize total amount payable
    const totalAmountPayable = useMemo(() =>
        parseCurrencyValue(extractValue(formData['Total Amount Payable']))
        , [formData, extractValue, parseCurrencyValue]);

    return (
        <div style={{
            padding: '20px',
            background: 'var(--bg-content, #f9f9f9)',
            borderRadius: '8px',
            border: '1px solid var(--border-color, #e8e8e8)',
            marginTop: '10px'
        }}>
            <h3 style={{
                marginBottom: '16px',
                borderBottom: '2px solid #1890ff',
                paddingBottom: '8px',
                color: 'var(--color-text-primary, #001529)'
            }}>
                GL Distribution Summary
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {glSummaryData.length === 0 ? (
                    <p style={{ fontStyle: 'italic', color: '#8c8c8c' }}>
                        No GL codes assigned to line items yet.
                    </p>
                ) : (
                    glSummaryData.map((item) => (
                        <div
                            key={item.gl_code}
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '10px 15px',
                                background: 'var(--bg-main-layout, white)',
                                borderRadius: '6px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                borderLeft: '4px solid #1890ff'
                            }}
                        >
                            <span style={{ fontWeight: '600', fontSize: '15px' }}>
                                {item.gl_code}
                            </span>
                            <span style={{ fontWeight: 'bold', fontSize: '16px', color: '#1890ff' }}>
                                {getCurrencySymbol()} {parseFloat(item.total_amount).toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2
                                })}
                            </span>
                        </div>
                    ))
                )}
            </div>

            <div style={{
                marginTop: '20px',
                padding: '16px',
                background: 'var(--bg-main-layout, white)',
                borderRadius: '6px',
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                borderTop: '1px solid var(--border-color, #d9d9d9)'
            }}>
                <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '14px', color: 'var(--color-text-secondary, #595959)', marginRight: '12px' }}>
                        Total Amount Payable:
                    </span>
                    <span style={{ fontSize: '20px', fontWeight: 'bold', color: '#1890ff' }}>
                        {getCurrencySymbol()} {totalAmountPayable.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        })}
                    </span>
                </div>
            </div>
        </div>
    );
});

GLSummaryTab.displayName = 'GLSummaryTab';

export default GLSummaryTab;