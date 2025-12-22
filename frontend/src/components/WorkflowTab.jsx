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
import { formatDateTimeIST } from '../utils/dateUtils';
import './WorkflowTab.css';

const WorkflowTab = ({ invoiceId, refreshTrigger }) => {
  const [workflowData, setWorkflowData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWorkflowHistory();
  }, [invoiceId, refreshTrigger]);

  const fetchWorkflowHistory = async () => {
    if (!invoiceId) return;
    try {
      setLoading(true);
      const data = await workflowService.getWorkflowHistory(invoiceId);
      setWorkflowData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- ICONS & TAGS ---------------- */

  const getStepIcon = (stepType, status) => {
    if (status === 'approved') return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
    if (status === 'rejected') return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
    if (status === 'completed') return <CheckOutlined style={{ color: '#1890ff' }} />;
    if (status === 'pending') return <HourglassOutlined style={{ color: '#faad14' }} />;
    if (status === 'reworked') return <FileTextOutlined style={{ color: '#722ed1' }} />;
    return <ClockCircleOutlined />;
  };

  const getStatusTag = (status) => {
    const map = {
      completed: { color: 'blue', text: 'Completed' },
      approved: { color: 'green', text: 'Approved' },
      rejected: { color: 'red', text: 'Rejected' },
      pending: { color: 'gold', text: 'Pending' },
      reworked: { color: 'purple', text: 'Reworked' }
    };
    const cfg = map[status] || { color: 'default', text: status };
    return <Tag color={cfg.color}>{cfg.text}</Tag>;
  };

  const getPendingStepName = (n) => {
    const map = {
      1: 'First approval',
      2: 'Second approval',
      3: 'Third approval',
      4: 'Fourth approval'
    };
    return map[n] || `${n}th approval`;
  };

  /* ---------------- CORE LOGIC (OPTION B) ---------------- */

  const getTimelineItems = () => {
    if (!workflowData?.steps) return [];

    /* 1️⃣ keep ALL steps (history + current) */
    const allSteps = workflowData.steps.filter(
      s => s.step_type !== 'waiting_approval'
    );

    /* 2️⃣ find last REWORK (cycle boundary) */
    const lastReworkIndex = [...allSteps]
      .map((s, i) => ({ s, i }))
      .reverse()
      .find(x => x.s.status === 'reworked')?.i;

    /* 3️⃣ current cycle steps (logic only) */
    const currentCycleSteps =
      lastReworkIndex !== undefined
        ? allSteps.slice(lastReworkIndex + 1)
        : allSteps;

    /* 4️⃣ clone full steps for rendering */
    let steps = [...allSteps];

    /* 5️⃣ insert cycle separator */
    if (lastReworkIndex !== undefined) {
      steps.splice(lastReworkIndex + 1, 0, {
        id: 'cycle_break',
        step_type: 'cycle_break',
        status: 'reworked',
        step_name: 'Approval restarted after rework',
        user: '',
        timestamp: null
      });
    }

    /* 6️⃣ coding pending logic */
    const currentStatus = workflowData.current_status || workflowData.status;
    const needsCoding = ['processed', 'waiting_coding', 'reworked'].includes(currentStatus);

    if (needsCoding) {
      const lastStep = currentCycleSteps[currentCycleSteps.length - 1];
      if (!lastStep || lastStep.step_type !== 'coding') {
        steps.push({
          id: 'pending_coding',
          step_type: 'coding',
          status: 'pending',
          step_name: 'Coding',
          user: 'Pending',
          timestamp: null
        });
      }
    }

    /* 7️⃣ generate pending approvals ONLY for current cycle */
    const required = workflowData.required_approvers || 0;
    const startFrom = workflowData.current_approver_level || 1;

    const existingApprovers = new Set(
      currentCycleSteps
        .filter(s => s.step_type?.startsWith('approver_'))
        .map(s => s.step_type)
    );

    for (let i = startFrom; i <= required; i++) {
      const type = `approver_${i}`;
      if (existingApprovers.has(type)) continue;

      steps.push({
        id: `pending_${i}`,
        step_type: type,
        status: 'pending',
        step_name: getPendingStepName(i),
        user: 'Pending',
        timestamp: null
      });
    }

    /* 8️⃣ render timeline */
    return steps.map((step, index) => {
      if (step.step_type === 'cycle_break') {
        return {
          key: 'cycle_break',
          dot: <FileTextOutlined style={{ color: '#722ed1' }} />,
          children: <em style={{ color: '#722ed1' }}>{step.step_name}</em>
        };
      }

      return {
        key: step.id || index,
        dot: getStepIcon(step.step_type, step.status),
        children: (
          <div className="workflow-step-content">
            <div className="workflow-step-header">
              <span className="workflow-step-name">{step.step_name}</span>
              {getStatusTag(step.status)}
            </div>

            <div className="workflow-step-details">
              {step.status !== 'pending' ? (
                <>
                  <div><UserOutlined /> <strong>{step.user}</strong></div>
                  <div>{formatDateTimeIST(step.timestamp)}</div>
                </>
              ) : (
                <em style={{ color: '#999' }}>
                  {step.step_type === 'coding'
                    ? 'Waiting for coding'
                    : 'Waiting for approval'}
                </em>
              )}
            </div>

            {step.comment && (
              <div className="workflow-step-comment">
                <FileTextOutlined /> {step.comment}
              </div>
            )}
          </div>
        )
      };
    });
  };

  /* ---------------- UI ---------------- */

  if (loading) {
    return <Spin size="large" tip="Loading workflow history..." />;
  }

  if (!workflowData?.steps?.length) {
    return <Empty description="No workflow history" />;
  }

  return (
    <div className="workflow-tab-container">
      <Card
  title="Workflow History"
  className="workflow-card"
  extra={
    <div className="workflow-info" style={{ display: 'flex', gap: '10px' }}>
      {workflowData.approver_breakdown?.vendor && (
        <Tag color="cyan">
          Vendor ({workflowData.approver_breakdown.vendor.name}):
          {workflowData.approver_breakdown.vendor.count}
        </Tag>
      )}
      {workflowData.approver_breakdown?.amount && (
        <Tag color="orange">
          Amount ({workflowData.approver_breakdown.amount.currency === 'INR' ? '₹' : '$'}{workflowData.approver_breakdown.amount.value}):
          {workflowData.approver_breakdown.amount.count}
        </Tag>
      )}
      {workflowData.approver_breakdown?.gl && (
        <Tag color="purple">
          GL: {workflowData.approver_breakdown.gl.count}
        </Tag>
      )}
      <Tag color="red" style={{ fontWeight: 'bold' }}>
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
