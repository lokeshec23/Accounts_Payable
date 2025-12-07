import React, { useState, useEffect } from 'react';
import { Timeline, Tag, Spin, Empty, Card } from 'antd';
import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    CloseCircleOutlined,
    UserOutlined,
    FileTextOutlined,
    CheckOutlined,
    HourglassOutlined
} from '@ant-design/icons';
import { workflowService } from '../services/api';
import './WorkflowTab.css';

const WorkflowTab = ({ invoiceId }) => {
    const [workflowData, setWorkflowData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchWorkflowHistory();
    }, [invoiceId]);

    const fetchWorkflowHistory = async () => {
        if (!invoiceId) return;

        try {
            setLoading(true);
            const data = await workflowService.getWorkflowHistory(invoiceId);
            setWorkflowData(data);
        } catch (error) {
            console.error('Error fetching workflow history:', error);
        } finally {
            setLoading(false);
        }
    };

    const getStepIcon = (stepType, status) => {
        if (status === 'approved') {
            return <CheckCircleOutlined style={{ fontSize: '16px', color: '#52c41a' }} />;
        } else if (status === 'rejected') {
            return <CloseCircleOutlined style={{ fontSize: '16px', color: '#ff4d4f' }} />;
        } else if (status === 'completed') {
            return <CheckOutlined style={{ fontSize: '16px', color: '#1890ff' }} />;
        } else if (status === 'pending') {
            return <HourglassOutlined style={{ fontSize: '16px', color: '#faad14' }} />;
        }
        return <ClockCircleOutlined style={{ fontSize: '16px', color: '#d9d9d9' }} />;
    };

    const getStatusTag = (status) => {
        const statusConfig = {
            completed: { color: 'blue', text: 'Completed' },
            approved: { color: 'green', text: 'Approved' },
            rejected: { color: 'red', text: 'Rejected' },
            pending: { color: 'gold', text: 'Pending' }
        };

        const config = statusConfig[status] || { color: 'default', text: status };
        return <Tag color={config.color}>{config.text}</Tag>;
    };

    const formatTimestamp = (timestamp) => {
        if (!timestamp) return '—';
        const date = new Date(timestamp);
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });
    };

    const getTimelineItems = () => {
        if (!workflowData || !workflowData.steps) return [];

        return workflowData.steps.map((step, index) => ({
            key: step.id,
            dot: getStepIcon(step.step_type, step.status),
            children: (
                <div className="workflow-step-content">
                    <div className="workflow-step-header">
                        <span className="workflow-step-name">{step.step_name}</span>
                        {getStatusTag(step.status)}
                    </div>
                    <div className="workflow-step-details">
                        <div className="workflow-step-user">
                            <UserOutlined /> <strong>{step.user}</strong>
                        </div>
                        <div className="workflow-step-time">
                            {formatTimestamp(step.timestamp)}
                        </div>
                    </div>
                    {step.comment && (
                        <div className="workflow-step-comment">
                            <FileTextOutlined /> {step.comment}
                        </div>
                    )}
                </div>
            )
        }));
    };

    if (loading) {
        return (
            <div className="workflow-loading">
                <Spin size="large" tip="Loading workflow history..." />
            </div>
        );
    }

    if (!workflowData || !workflowData.steps || workflowData.steps.length === 0) {
        return (
            <div className="workflow-empty">
                <Empty
                    description="No workflow history available"
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
            </div>
        );
    }

    return (
        <div className="workflow-tab-container">
            <Card
                title="Workflow History"
                className="workflow-card"
                extra={
                    <div className="workflow-info">
                        {workflowData.vendor_name && (
                            <Tag color="purple">Vendor: {workflowData.vendor_name}</Tag>
                        )}
                        <Tag color="cyan">
                            Required Approvers: {workflowData.required_approvers}
                        </Tag>
                    </div>
                }
            >
                <Timeline items={getTimelineItems()} />
            </Card>
        </div>
    );
};

export default WorkflowTab;
