import React from 'react';
import { Card, Typography, Tabs } from 'antd';

const { Title } = Typography;

const MasterDataPage = () => {
    const items = [
        {
            key: 'vendor',
            label: 'Vendor Master Data',
            children: (
                <div style={{ padding: '24px' }}>
                    <Title level={3}>Vendor Master Data</Title>
                    <p>Vendor master data management - Coming Soon</p>
                </div>
            ),
        },
        {
            key: 'codification',
            label: 'Invoice Codification',
            children: (
                <div style={{ padding: '24px' }}>
                    <Title level={3}>Invoice Codification</Title>
                    <p>Invoice codification settings - Coming Soon</p>
                </div>
            ),
        },
    ];

    return (
        <div style={{ padding: '24px' }}>
            <Card>
                <Title level={2}>Master Data</Title>
                <Tabs defaultActiveKey="vendor" items={items} />
            </Card>
        </div>
    );
};

export default MasterDataPage;
