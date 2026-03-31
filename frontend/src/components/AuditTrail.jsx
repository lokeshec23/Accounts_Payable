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
    MessageOutlined,
    SyncOutlined
} from '@ant-design/icons';
import { auditService } from '../services/api';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { ListSkeleton } from './SkeletonLoader';

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
        if (!action) return <ClockCircleOutlined />;
        const act = action.toLowerCase();
        if (act.includes("uploaded")) return <CloudUploadOutlined style={{ color: '#1890ff' }} />;
        if (act.includes("updated")) return <EditOutlined style={{ color: '#f2a917ff' }} />;
        if (act.includes("coding saved")) return <SaveOutlined style={{ color: '#52c41a' }} />;
        if (act.includes("sent for approval")) return <SendOutlined style={{ color: '#722ed1' }} />;
        if (act.includes("approved")) return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
        if (act.includes("rejected")) return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
        if (act.includes("reworked") || act.includes("recalled")) return <UndoOutlined style={{ color: '#f2a917ff' }} />;
        if (act.includes("comment added")) return <MessageOutlined style={{ color: '#1890ff' }} />;
        if (act.includes("sage posted") || act.includes("reposted to sage")) return <SyncOutlined style={{ color: '#52c41a' }} />;
        if (act.includes("failed to post")) return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
        return <ClockCircleOutlined />;
    };

    const getColor = (action) => {
        if (!action) return "orange";
        const act = action.toLowerCase();
        if (act.includes("uploaded")) return "blue";
        if (act.includes("approved")) return "green";
        if (act.includes("rejected") || act.includes("failed")) return "red";
        if (act.includes("sent for approval")) return "purple";
        if (act.includes("coding saved")) return "cyan";
        if (act.includes("sage posted") || act.includes("reposted")) return "green";
        return "orange";
    };

    const renderDetails = (details, action = "") => {
        if (!details) return null;
        const entries = Object.entries(details);
        if (entries.length === 0) return null;

        const isSageAction = action && action.includes("Sage");
        const isSuccessAction = action && (action.includes("posted") || action.includes("reposted")) && !action.toLowerCase().includes("failed");
        const isFailureAction = action && action.toLowerCase().includes("failed") && action.includes("Sage");

        return (
            <div style={{ marginTop: 8, background: 'var(--bg-content, #f5f5f5)', padding: 8, borderRadius: 4 }}>
                {entries.map(([key, value]) => {
                    // Check if value is a "diff" object having 'old' and 'new' keys
                    if (value && typeof value === 'object' && 'old' in value && 'new' in value) {
                        const oldVal = (value.old === null || value.old === undefined || value.old === "") ? "-" : String(value.old);
                        const newVal = (value.new === null || value.new === undefined || value.new === "") ? "-" : String(value.new);

                        // Skip if consolidated/normalized values are the same
                        if (oldVal === newVal) return null;

                        return (
                            <div key={key} style={{ fontSize: '12px', marginBottom: 4 }}>
                                <Text strong>{key.replace(/_/g, ' ').replace(/\./g, ' > ')}: </Text>
                                <Space>
                                    <Text delete type="secondary">{oldVal}</Text>
                                    <Text type="secondary">→</Text>
                                    <Text type="success">{newVal}</Text>
                                </Space>
                            </div>
                        );
                    }

                    // Hide Internal metadata
                    if (key.toLowerCase().trim() === 'type') return null;

                    // Specialized Sage Response Rendering
                    if (key === 'sage_response' || (key === 'error' && isSageAction)) {
                        // If it's a success action, always show success
                        if (isSuccessAction && key === 'sage_response') {
                            return (
                                <div key={key} style={{ fontSize: '13px', marginTop: 4, fontWeight: '500' }}>
                                    <Text type="success">✓ Bill posted to Sage successfully</Text>
                                </div>
                            );
                        }

                        // Handle failure case
                        const isSuccess = key === 'sage_response' && (value?.totalSuccess === 1 || value?.total_success === 1 || !!value?.key || !!value?.id);

                        if (!isSuccess) {
                            // Extract error message from value or details
                            const errorMsg = typeof value === 'string' ? value : (details.error || "Failed to post to Sage, Try reposting");
                            return (
                                <div key={key} style={{ fontSize: '13px', marginTop: 4, fontWeight: '500' }}>
                                    <Text type="danger">⚠ {errorMsg}</Text>
                                </div>
                            );
                        }

                        // Fallback for successful 'sage_response' if it wasn't caught by isSuccessAction check
                        return (
                            <div key={key} style={{ fontSize: '13px', marginTop: 4, fontWeight: '500' }}>
                                <Text type="success">✓ Bill posted to Sage successfully</Text>
                            </div>
                        );
                    }

                    // If it's a Sage action (success or failure), hide technical details to keep history clean
                    if (isSageAction && !['comment', 'user', 'error'].includes(key.toLowerCase())) return null;

                    // Specialized Approver Detail Filtering: only show level and comments
                    const isApprovalAction = action && (
                        action.includes("Approved") ||
                        action.includes("Rejected") ||
                        action.includes("Reworked")
                    );

                    if (isApprovalAction) {
                        const lowKey = key.toLowerCase();
                        if (!['comment', 'approver_level'].includes(lowKey)) return null;
                    }

                    // Fallback for other values (stringify objects/arrays)
                    let displayValue;
                    if (value === null || value === undefined || value === "") {
                        // Skip if it is a comment and it's empty
                        if (key.toLowerCase() === 'comment') return null;
                        displayValue = "-";
                    } else if (typeof value === 'object') {
                        try {
                            displayValue = JSON.stringify(value, null, 2);
                        } catch (e) {
                            displayValue = String(value);
                        }
                    } else {
                        displayValue = String(value);
                    }

                    return (
                        <div key={key} style={{ fontSize: '12px', marginBottom: 4 }}>
                            <Text strong>{key.replace(/_/g, ' ')}: </Text>
                            <pre style={{
                                margin: '4px 0 0 0',
                                padding: '4px',
                                background: 'rgba(0,0,0,0.02)',
                                borderRadius: '4px',
                                fontSize: '11px',
                                overflowX: 'auto',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-all'
                            }}>                                {displayValue}
                            </pre>
                        </div>
                    );
                })}
            </div>
        );
    };

    if (loading) return <ListSkeleton itemCount={5} />;
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
                        {renderDetails(log.details, log.action)}
                    </Space>
                </Timeline.Item>
            ))}
        </Timeline>
        // </Card>
    );
};

export default AuditTrail;
