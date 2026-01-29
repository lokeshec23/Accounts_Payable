import React, { useEffect, useState } from 'react';
import { Timeline, Card, Typography, Spin, Empty, Tag, Descriptions, Space } from 'antd';
import {
    CloudUploadOutlined,
    EditOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    SaveOutlined,
    SendOutlined,
    ClockCircleOutlined,
    UndoOutlined,
    MessageOutlined
} from '@ant-design/icons';
import { auditService } from '../services/api';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

const { Text, Title } = Typography;

const AuditTrail = ({ invoiceId }) => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchLogs = async () => {
        try {
            setLoading(true);
            const data = await auditService.getAuditTrail(invoiceId);
            setLogs(data);
        } catch (error) {
            console.error("Error fetching audit trail:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (invoiceId) {
            fetchLogs();
        }
    }, [invoiceId]);

    const getIcon = (action) => {
        if (action.startsWith("Invoice Uploaded")) return <CloudUploadOutlined style={{ color: '#1890ff' }} />;
        if (action.startsWith("Invoice Updated")) return <EditOutlined style={{ color: '#faad14' }} />;
        if (action.startsWith("Coding Saved")) return <SaveOutlined style={{ color: '#52c41a' }} />;
        if (action.startsWith("Sent for Approval")) return <SendOutlined style={{ color: '#722ed1' }} />;
        if (action.startsWith("Approved")) return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
        if (action.startsWith("Rejected")) return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
        if (action.startsWith("Reworked")) return <UndoOutlined style={{ color: '#faad14' }} />;
        if (action.startsWith("Recalled")) return <UndoOutlined style={{ color: '#faad14' }} />;
        if (action.startsWith("Comment Added")) return <MessageOutlined style={{ color: '#1890ff' }} />;
        return <ClockCircleOutlined />;
    };

    const getColor = (action) => {
        if (action.startsWith("Invoice Uploaded")) return "blue";
        if (action.startsWith("Approved")) return "green";
        if (action.startsWith("Rejected")) return "red";
        if (action.startsWith("Sent for Approval")) return "purple";
        if (action.startsWith("Coding Saved")) return "cyan";
        return "gray";
    };

    const renderDetails = (details) => {
        if (!details) return null;
        const entries = Object.entries(details);
        if (entries.length === 0) return null;

        return (
            <div style={{ marginTop: 8, background: '#f5f5f5', padding: 8, borderRadius: 4 }}>
                {entries.map(([key, value]) => {
                    // Check if value is a "diff" object having 'old' and 'new' keys
                    if (value && typeof value === 'object' && 'old' in value && 'new' in value) {
                        return (
                            <div key={key} style={{ fontSize: '12px', marginBottom: 4 }}>
                                <Text strong>{key.replace(/_/g, ' ').replace(/\./g, ' > ')}: </Text>
                                <Space>
                                    <Text delete type="secondary">{String(value.old)}</Text>
                                    <Text type="secondary">→</Text>
                                    <Text type="success">{String(value.new)}</Text>
                                </Space>
                            </div>
                        );
                    }

                    // Fallback for simple values
                    return (
                        <div key={key} style={{ fontSize: '12px' }}>
                            <Text strong>{key.replace(/_/g, ' ')}: </Text>
                            <Text type="secondary">{String(value)}</Text>
                        </div>
                    );
                })}
            </div>
        );
    };

    if (loading) return <Spin style={{ display: 'block', margin: '20px auto' }} />;
    if (!logs || logs.length === 0) return <Empty description="No audit history found" />;

    return (
        // <Card title="Audit Trail" bordered={false} bodyStyle={{ padding: '24px' }}>
            <Timeline mode="left">
                {logs.map((log) => (
                    <Timeline.Item
                        key={log.id}
                        dot={getIcon(log.action)}
                        color={getColor(log.action)}
                        label={dayjs.utc(log.timestamp).local().format('MMM D, YYYY hh:mm A')}
                    >
                        <Space direction="vertical" style={{ width: '100%' }}>
                            <Space>
                                <Tag color={getColor(log.action)}>{log.action}</Tag>
                                <Text type="secondary">by</Text>
                                <Text strong>{log.user}</Text>
                            </Space>
                            {renderDetails(log.details)}
                        </Space>
                    </Timeline.Item>
                ))}
            </Timeline>
        // </Card>
    );
};

export default AuditTrail;
