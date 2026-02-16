import React from 'react';
import { Skeleton, Row, Col, Card, Space } from 'antd';

export const DashboardSkeleton = () => {
    return (
        <div className="ap-dashboard" style={{ padding: '24px' }}>
            {/* KPI Cards */}
            <Row gutter={20} className="ap-row">
                {[1, 2, 3, 4].map((item) => (
                    <Col xs={24} md={6} key={item}>
                        <Card className="ap-kpi-card" style={{ height: 120 }}>
                            <Skeleton active avatar paragraph={{ rows: 1 }} />
                        </Card>
                    </Col>
                ))}
            </Row>

            {/* Charts Row 1 */}
            <Row gutter={20} className="ap-row" style={{ marginTop: 20 }}>
                <Col xs={24} md={14}>
                    <Card className="ap-chart-card" title={<Skeleton.Input style={{ width: 200 }} active size="small" />}>
                        <Skeleton active paragraph={{ rows: 6 }} />
                    </Card>
                </Col>
                <Col xs={24} md={10}>
                    <Card className="ap-chart-card" title={<Skeleton.Input style={{ width: 150 }} active size="small" />}>
                        <Skeleton.Node active style={{ width: '100%', height: 200 }}>
                            <div />
                        </Skeleton.Node>
                    </Card>
                </Col>
            </Row>

            {/* Charts Row 2 */}
            <Row gutter={20} className="ap-row" style={{ marginTop: 20 }}>
                <Col xs={24} md={12}>
                    <Card className="ap-chart-card" title={<Skeleton.Input style={{ width: 200 }} active size="small" />}>
                        <Skeleton active paragraph={{ rows: 5 }} />
                    </Card>
                </Col>
                <Col xs={24} md={12}>
                    <Card className="ap-chart-card" title={<Skeleton.Input style={{ width: 200 }} active size="small" />}>
                        <Skeleton active paragraph={{ rows: 5 }} />
                    </Card>
                </Col>
            </Row>

            {/* Top Vendors Table */}
            <Row gutter={20} className="ap-row" style={{ marginTop: 20 }}>
                <Col xs={24}>
                    <Card className="ap-table-card" title={<Skeleton.Input style={{ width: 200 }} active size="small" />}>
                        <Skeleton active paragraph={{ rows: 5 }} />
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export const TableSkeleton = ({ rowCount = 5 }) => {
    return (
        <Card className="ap-table-card">
            {/* Toolbar Skeleton */}
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
                <Skeleton.Input style={{ width: 300 }} active />
                <Space>
                    <Skeleton.Button active />
                    <Skeleton.Button active />
                </Space>
            </div>

            {/* Table Header Skeleton */}
            <div style={{ display: 'flex', marginBottom: 16, padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                {[1, 2, 3, 4, 5, 6].map(i => (
                    <Skeleton.Input key={i} style={{ width: 100, marginRight: 20 }} active size="small" />
                ))}
            </div>

            {/* Table Rows Skeleton */}
            {Array.from({ length: rowCount }).map((_, index) => (
                <div key={index} style={{ display: 'flex', marginBottom: 16, padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} style={{ width: 120, marginRight: 20 }}>
                            <Skeleton title={false} paragraph={{ rows: 1, width: '90%' }} active />
                        </div>
                    ))}
                </div>
            ))}
        </Card>
    );
};

export const FormSkeleton = ({ fieldCount = 6 }) => {
    return (
        <div style={{ padding: 24 }}>
            <Row gutter={[24, 24]}>
                {Array.from({ length: fieldCount }).map((_, index) => (
                    <Col xs={24} md={12} lg={8} key={index}>
                        <div style={{ marginBottom: 8 }}>
                            <Skeleton.Input style={{ width: 100, height: 20, marginBottom: 8 }} active size="small" />
                        </div>
                        <Skeleton.Input style={{ width: '100%', height: 32 }} active block />
                    </Col>
                ))}
            </Row>

            <div style={{ marginTop: 32 }}>
                <Skeleton.Input style={{ width: 150, height: 24, marginBottom: 16 }} active />
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                        <Skeleton.Input style={{ flex: 2 }} active />
                        <Skeleton.Input style={{ flex: 1 }} active />
                        <Skeleton.Input style={{ flex: 1 }} active />
                        <Skeleton.Input style={{ flex: 1 }} active />
                    </div>
                ))}
            </div>
        </div>
    );
};

export const ListSkeleton = ({ itemCount = 5 }) => {
    return (
        <div style={{ padding: '20px' }}>
            {Array.from({ length: itemCount }).map((_, index) => (
                <div key={index} style={{ marginBottom: 20, display: 'flex' }}>
                    <Skeleton.Avatar active shape="circle" size="small" style={{ marginRight: 16 }} />
                    <div style={{ width: '100%' }}>
                        <Skeleton.Input style={{ width: '30%', height: 20, marginBottom: 8 }} active size="small" />
                        <Skeleton paragraph={{ rows: 2, width: '90%' }} active />
                    </div>
                </div>
            ))}
        </div>
    );
};

export const ReviewPageSkeleton = () => {
    return (
        <div style={{ display: 'flex', height: 'calc(100vh - 64px)' }}>
            {/* Left Pane (PDF Viewer) */}
            <div style={{ flex: 1, borderRight: '1px solid #e8e8e8', background: '#f5f5f5', padding: 20 }}>
                <Skeleton.Button active style={{ width: '100%', height: '100%' }} />
            </div>

            {/* Right Pane (Form) */}
            <div style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                    <Skeleton.Button active size="default" style={{ width: 100 }} />
                    <Space>
                        <Skeleton.Button active size="default" style={{ width: 80 }} />
                        <Skeleton.Button active size="default" style={{ width: 120 }} />
                    </Space>
                </div>
                <QuickViewSkeleton />
            </div>
        </div>
    );
};

export const DropdownSkeleton = () => {
    return (
        <div style={{ marginTop: 30 }}>
            <Skeleton.Button active size="large" style={{ width: 200, height: 40 }} />
        </div>
    );
};

export const QuickViewSkeleton = () => {
    return (
        <div style={{ padding: '20px' }}>
            {/* Simulate Collapse Header */}
            <Skeleton.Input style={{ width: '100%', height: 46, marginBottom: 20 }} active block />

            {/* Simulate Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} style={{
                        display: 'grid',
                        gridTemplateColumns: '350px 1fr',
                        gap: '16px',
                        alignItems: 'center'
                    }}>
                        <div>
                            <Skeleton.Input style={{ width: 150, height: 20 }} active size="small" />
                        </div>
                        <div>
                            <Skeleton.Input style={{ width: '100%', height: 32 }} active block />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default { DashboardSkeleton, TableSkeleton, FormSkeleton, ListSkeleton, ReviewPageSkeleton, DropdownSkeleton, QuickViewSkeleton };
