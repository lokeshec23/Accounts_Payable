// src/pages/ApDashboard.jsx
import React, { useEffect, useState } from "react";
import Plot from "react-plotly.js";
import axios from "axios";
import {
    Row,
    Col,
    Card,
    Table,
    Typography,
    Space,
    Button,
} from "antd";
import {
  const [vendorData, setVendorData] = useState(null);
const [topVendors, setTopVendors] = useState([]);
const [payments, setPayments] = useState(null);

// Sorting states
const [sortVendorCountAsc, setSortVendorCountAsc] = useState(false);
const [sortVendorAmtAsc, setSortVendorAmtAsc] = useState(false);
const [sortTopVendorAsc, setSortTopVendorAsc] = useState(false);

// Top N states for charts
const [vendorCountLimit, setVendorCountLimit] = useState(5);
const [vendorAmountLimit, setVendorAmountLimit] = useState(5);

// Top N for table
const [topLimit, setTopLimit] = useState(5);

useEffect(() => {
    const loadData = async () => {
        try {
            const [
                summaryRes,
                agingRes,
                statusRes,
                vendorsRes,
                topRes,
                paymentsRes,
            ] = await Promise.all([
                axios.get(`${API_BASE}/dashboard/summary`),
                axios.get(`${API_BASE}/dashboard/aging`),
                axios.get(`${API_BASE}/dashboard/status_breakdown`),
                axios.get(`${API_BASE}/dashboard/vendors`),
                axios.get(`${API_BASE}/dashboard/top_vendors`),
                axios.get(`${API_BASE}/dashboard/payments`),
            ]);

            setSummary(summaryRes.data);
            setAging(agingRes.data);
            setStatusBreakdown(statusRes.data);
            setVendorData(vendorsRes.data);
            setTopVendors(topRes.data);
            setPayments(paymentsRes.data);
        } catch (err) {
            console.error("Dashboard error:", err);
        }
    };

    loadData();
}, []);

if (!summary || !vendorData || !aging || !statusBreakdown) {
    return <div className="ap-loading">Loading dashboard…</div>;
}

// ---------- Aging chart data ----------
const agingLabels = ["0–30", "31–60", "61–90", "91–120", "120+"];
const agingValues = [
    aging["0_30"],
    aging["31_60"],
    aging["61_90"],
    aging["91_120"],
    aging["120_plus"],
];

// Professional gradient for aging bars
const agingBarColors = [
    'rgba(59, 124, 255, 0.9)',
    'rgba(59, 124, 255, 0.8)',
    'rgba(59, 124, 255, 0.7)',
    'rgba(59, 124, 255, 0.6)',
    'rgba(59, 124, 255, 0.5)'
];

// ---------- Status chart data ----------
const statusLabels = ["Approved", "Waiting Approval", "Rejected"];
const statusValues = [
    statusBreakdown.approved,
    statusBreakdown.waiting_approval,
    statusBreakdown.rejected,
];

// Professional pie chart colors
const statusPieColors = ['#10b981', '#3b7cff', '#ef4444'];

// ---------- Vendor bar charts (sorted + limited) ----------
const vendorCount = [...vendorData.by_count]
    .sort((a, b) => (sortVendorCountAsc ? a.count - b.count : b.count - a.count))
    .slice(0, vendorCountLimit);

const vendorAmount = [...vendorData.by_amount]
    .sort((a, b) =>
        sortVendorAmtAsc ? a.amount - b.amount : b.amount - a.amount
    )
    .slice(0, vendorAmountLimit);

// Professional colors for vendor charts
const vendorCountColors = Array.from({ length: vendorCount.length }, (_, i) =>
    `rgba(139, 92, 246, ${0.7 + (i * 0.05)})` // Purple gradient
);

const vendorAmountColors = Array.from({ length: vendorAmount.length }, (_, i) =>
    `rgba(16, 185, 129, ${0.7 + (i * 0.05)})` // Green gradient
);

// ---------- Top vendors table (sorted + limited) ----------
const sortedTopVendors = [...topVendors]
    .sort((a, b) => (sortTopVendorAsc ? a.total - b.total : b.total - a.total))
    .slice(0, topLimit);

const topVendorRows = sortedTopVendors.map((v, i) => ({
    key: i,
    rank: i + 1,
    vendor: v.vendor,
    count: v.count,
    total: v.total,
}));

const topVendorColumns = [
    { title: "Rank", dataIndex: "rank", width: 70 },
    { title: "Vendor", dataIndex: "vendor" },
    { title: "Invoices", dataIndex: "count", width: 110 },
    {
        title: "Amount",
        dataIndex: "total",
        width: 160,
        render: (v) => `$${v.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}`,
    },
];

return (
    <div className="ap-dashboard-shell">
        <div className="ap-dashboard">
            {/* HEADER */}
            <div className="ap-header">
                <div>
                    <Title level={3} className="ap-header-title">
                        Accounts Payable Dashboard
                    </Title>
                    <Text type="secondary" className="ap-header-subtitle">
                        Enterprise Analytics View
                    </Text>
                </div>
                <div className="ap-header-meta">
                    <span className="ap-header-pill">Dashboard</span>
                </div>
            </div>

            {/* KPI CARDS */}
            <Row gutter={20} className="ap-row">
                <Col xs={24} md={6}>
                    <Card className="ap-kpi-card kpi-invoices">
                        <div className="ap-kpi-inner">
                            <div className="ap-kpi-icon-wrap">
                                <FileTextOutlined className="ap-kpi-icon icon-blue" />
                            </div>
                            <div>
                                <div className="ap-kpi-label">Total Invoices</div>
                                <div className="ap-kpi-value">{summary.total_invoices}</div>
                            </div>
                        </div>
                    </Card>
                </Col>

                <Col xs={24} md={6}>
                    <Card className="ap-kpi-card kpi-total-due">
                        <div className="ap-kpi-inner">
                            <div className="ap-kpi-icon-wrap">
                                <DollarCircleOutlined className="ap-kpi-icon icon-green" />
                            </div>
                            <div>
                                <div className="ap-kpi-label">Total Due</div>
                                <div className="ap-kpi-value">
                                    {`$${summary.total_due.toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}`}
                                </div>
                            </div>
                        </div>
                    </Card>
                </Col>

                <Col xs={24} md={6}>
                    <Card className="ap-kpi-card kpi-approved">
                        <div className="ap-kpi-inner">
                            <div className="ap-kpi-icon-wrap">
                                <CheckCircleOutlined className="ap-kpi-icon icon-cyan" />
                            </div>
                            <div>
                                <div className="ap-kpi-label">Approved</div>
                                <div className="ap-kpi-value">{summary.approved}</div>
                            </div>
                        </div>
                    </Card>
                </Col>

                <Col xs={24} md={6}>
                    <Card className="ap-kpi-card kpi-pending">
                        <div className="ap-kpi-inner">
                            <div className="ap-kpi-icon-wrap">
                                <ClockCircleOutlined className="ap-kpi-icon icon-orange" />
                            </div>
                            <div>
                                <div className="ap-kpi-label">Pending Approval</div>
                                <div className="ap-kpi-value">
                                    {summary.waiting_approval}
                                </div>
                            </div>
                        </div>
                    </Card>
                </Col>
            </Row>

            {/* AGING + STATUS CHARTS */}
            <Row gutter={20} className="ap-row">
                <Col xs={24} md={14}>
                    <Card
                        className="ap-chart-card"
                        title={<span className="ap-card-title">Payable Aging Analysis</span>}
                    >
                        <Plot
                            data={[
                                {
                                    x: agingLabels,
                                    y: agingValues,
                                    type: "bar",
                                    marker: {
                                        color: agingBarColors,
                                        line: {
                                            width: 1.5,
                                            color: 'rgba(59, 124, 255, 0.9)'
                                        },
                                    },
                                    hovertemplate: '<b>%{x} days</b><br>$%{y:,.2f}<extra></extra>',
                                },
                            ]}
                            layout={{
                                autosize: true,
                                margin: { t: 24, r: 10, b: 60, l: 50 },
                                xaxis: {
                                    title: "Aging (days)",
                                    gridcolor: 'rgba(234, 236, 240, 0.5)',
                                    tickfont: { size: 12 },
                                    fixedrange: true,
                                },
                                yaxis: {
                                    title: "Amount ($)",
                                    gridcolor: 'rgba(234, 236, 240, 0.5)',
                                    tickformat: '$,.0f',
                                    tickfont: { size: 12 },
                                    fixedrange: true,
                                },
                                plot_bgcolor: 'rgba(0,0,0,0)',
                                paper_bgcolor: 'rgba(0,0,0,0)',
                                hoverlabel: {
                                    bgcolor: '#1d2939',
                                    font: { color: 'white', size: 12 }
                                },
                                dragmode: false,
                                hovermode: 'closest',
                            }}
                            className="ap-chart"
                            useResizeHandler
                            config={{
                                displayModeBar: false,
                                displaylogo: false,
                                scrollZoom: false,
                                editable: false,
                                staticPlot: false,
                                responsive: true,
                            }}
                        />
                    </Card>
                </Col>

                <Col xs={24} md={10}>
                    <Card
                        className="ap-chart-card"
                        title={
                            <span className="ap-card-title">Invoice Status Breakdown</span>
                        }
                    >
                        <Plot
                            data={[
                                {
                                    labels: statusLabels,
                                    values: statusValues,
                                    type: "pie",
                                    hole: 0.5,
                                    marker: {
                                        colors: statusPieColors,
                                        line: {
                                            width: 1.5,
                                            color: 'white'
                                        }
                                    },
                                    textinfo: 'percent',
                                    textposition: 'outside',
                                    hovertemplate: '<b>%{label}</b><br>Count: %{value}<br>%{percent}<extra></extra>',
                                    pull: [0.02, 0.02, 0.02]
                                },
                            ]}
                            layout={{
                                autosize: true,
                                margin: { t: 24, r: 10, b: 10, l: 10 },
                                showlegend: true,
                                legend: {
                                    orientation: "v",
                                    x: 1.05,
                                    xanchor: "left",
                                    y: 0.5,
                                    font: { size: 12 },
                                    bordercolor: 'rgba(234, 236, 240, 0.8)',
                                    borderwidth: 1,
                                    bgcolor: 'rgba(248, 250, 255, 0.8)'
                                },
                                plot_bgcolor: 'rgba(0,0,0,0)',
                                paper_bgcolor: 'rgba(0,0,0,0)',
                                hoverlabel: {
                                    bgcolor: '#1d2939',
                                    font: { color: 'white', size: 12 }
                                },
                                dragmode: false,
                                hovermode: 'closest',
                            }}
                            className="ap-chart"
                            useResizeHandler
                            config={{
                                displayModeBar: false,
                                displaylogo: false,
                                scrollZoom: false,
                                editable: false,
                                staticPlot: false,
                                responsive: true,
                            }}
                        />
                    </Card>
                </Col>
            </Row>

            {/* VENDOR BAR CHARTS */}
            <Row gutter={20} className="ap-row">
                {/* COUNT */}
                <Col xs={24} md={12}>
                    <Card
                        className="ap-chart-card"
                        title={
                            <Space align="center" size={12}>
                                <span className="ap-card-title">
                                    Invoices by Vendor (Count)
                                </span>
                                <Button
                                    size="small"
                                    className="ap-pill-button"
                                    onClick={() =>
                                        setSortVendorCountAsc((prev) => !prev)
                                    }
                                >
                                    {sortVendorCountAsc ? "Asc" : "Desc"}
                                </Button>
                                <select
                                    value={vendorCountLimit}
                                    onChange={(e) =>
                                        setVendorCountLimit(Number(e.target.value))
                                    }
                                    className="ap-select-inline"
                                >
                                    <option value={5}>Top 5</option>
                                    <option value={10}>Top 10</option>
                                    <option value={15}>Top 15</option>
                                    <option value={20}>Top 20</option>
                                </select>
                            </Space>
                        }
                    >
                        <Plot
                            data={[
                                {
                                    x: vendorCount.map((v) => v.vendor),
                                    y: vendorCount.map((v) => v.count),
                                    type: "bar",
                                    marker: {
                                        color: vendorCountColors,
                                        line: {
                                            color: 'rgba(139, 92, 246, 0.9)',
                                            width: 1.5
                                        },
                                    },
                                    hovertemplate: '<b>%{x}</b><br>Count: %{y}<extra></extra>',
                                },
                            ]}
                            layout={{
                                autosize: true,
                                margin: { t: 24, r: 10, b: 100, l: 50 },
                                xaxis: {
                                    tickangle: -45,
                                    gridcolor: 'rgba(234, 236, 240, 0.5)',
                                    tickfont: { size: 12 },
                                    fixedrange: true,
                                },
                                yaxis: {
                                    title: "Count",
                                    gridcolor: 'rgba(234, 236, 240, 0.5)',
                                    tickfont: { size: 12 },
                                    fixedrange: true,
                                },
                                plot_bgcolor: 'rgba(0,0,0,0)',
                                paper_bgcolor: 'rgba(0,0,0,0)',
                                hoverlabel: {
                                    bgcolor: '#1d2939',
                                    font: { color: 'white', size: 12 }
                                },
                                dragmode: false,
                                hovermode: 'closest',
                            }}
                            className="ap-chart"
                            useResizeHandler
                            config={{
                                displayModeBar: false,
                                displaylogo: false,
                                scrollZoom: false,
                                editable: false,
                                staticPlot: false,
                                responsive: true,
                            }}
                        />
                    </Card>
                </Col>

                {/* AMOUNT */}
                <Col xs={24} md={12}>
                    <Card
                        className="ap-chart-card"
                        title={
                            <Space align="center" size={12}>
                                <span className="ap-card-title">
                                    Invoices by Vendor (Amount)
                                </span>
                                <Button
                                    size="small"
                                    className="ap-pill-button"
                                    onClick={() =>
                                        setSortVendorAmtAsc((prev) => !prev)
                                    }
                                >
                                    {sortVendorAmtAsc ? "Asc" : "Desc"}
                                </Button>
                                <select
                                    value={vendorAmountLimit}
                                    onChange={(e) =>
                                        setVendorAmountLimit(Number(e.target.value))
                                    }
                                    className="ap-select-inline"
                                >
                                    <option value={5}>Top 5</option>
                                    <option value={10}>Top 10</option>
                                    <option value={15}>Top 15</option>
                                    <option value={20}>Top 20</option>
                                </select>
                            </Space>
                        }
                    >
                        <Plot
                            data={[
                                {
                                    x: vendorAmount.map((v) => v.vendor),
                                    y: vendorAmount.map((v) => v.amount),
                                    type: "bar",
                                    marker: {
                                        color: vendorAmountColors,
                                        line: {
                                            color: 'rgba(16, 185, 129, 0.9)',
                                            width: 1.5
                                        },
                                    },
                                    hovertemplate: '<b>%{x}</b><br>$%{y:,.2f}<extra></extra>',
                                },
                            ]}
                            layout={{
                                autosize: true,
                                margin: { t: 24, r: 10, b: 100, l: 50 },
                                xaxis: {
                                    tickangle: -45,
                                    gridcolor: 'rgba(234, 236, 240, 0.5)',
                                    tickfont: { size: 12 },
                                    fixedrange: true,
                                },
                                yaxis: {
                                    title: "Amount ($)",
                                    gridcolor: 'rgba(234, 236, 240, 0.5)',
                                    tickformat: '$,.0f',
                                    tickfont: { size: 12 },
                                    fixedrange: true,
                                },
                                plot_bgcolor: 'rgba(0,0,0,0)',
                                paper_bgcolor: 'rgba(0,0,0,0)',
                                hoverlabel: {
                                    bgcolor: '#1d2939',
                                    font: { color: 'white', size: 12 }
                                },
                                dragmode: false,
                                hovermode: 'closest',
                            }}
                            className="ap-chart"
                            useResizeHandler
                            config={{
                                displayModeBar: false,
                                displaylogo: false,
                                scrollZoom: false,
                                editable: false,
                                staticPlot: false,
                                responsive: true,
                            }}
                        />
                    </Card>
                </Col>
            </Row>

            {/* TOP VENDORS TABLE */}
            <Row gutter={20} className="ap-row">
                <Col xs={24}>
                    <Card
                        className="ap-table-card"
                        title={
                            <Space align="center" size={12}>
                                <span className="ap-card-title">Top Vendors by Amount</span>
                                <Button
                                    size="small"
                                    className="ap-pill-button"
                                    onClick={() => setSortTopVendorAsc((prev) => !prev)}
                                >
                                    {sortTopVendorAsc ? "Asc" : "Desc"}
                                </Button>
                                <select
                                    value={topLimit}
                                    onChange={(e) => setTopLimit(Number(e.target.value))}
                                    className="ap-select-inline"
                                >
                                    <option value={5}>Top 5</option>
                                    <option value={10}>Top 10</option>
                                    <option value={15}>Top 15</option>
                                    <option value={20}>Top 20</option>
                                </select>
                            </Space>
                        }
                    >
                        <Table
                            dataSource={topVendorRows}
                            columns={topVendorColumns}
                            pagination={{ pageSize: 5 }}
                        />
                    </Card>
                </Col>
            </Row>
        </div>
    </div>
);
};

export default ApDashboard;