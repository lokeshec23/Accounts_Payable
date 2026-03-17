// src/pages/ApDashboard.jsx
import React, { useEffect, useState, useCallback } from "react";
import { DashboardSkeleton } from "../components/SkeletonLoader";
import Plot from "react-plotly.js";
import api from "../services/api";   // ✅ FIX: Use our axios instance
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
    DollarCircleOutlined,
    FileTextOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
} from "@ant-design/icons";

import "../styles/ApDashboard.css";
import { useTheme } from "../context/ThemeContext";
import { useDashboardData } from "../hooks/useDashboardData";

const { Title, Text } = Typography;

const ApDashboard = () => {
    const { isDarkMode } = useTheme();
    const {
        summary,
        aging,
        statusBreakdown,
        vendorData,
        topVendors,
        loading,
        error
    } = useDashboardData();

    // Sorting states
    const [sortVendorCountAsc, setSortVendorCountAsc] = useState(false);
    const [sortVendorAmtAsc, setSortVendorAmtAsc] = useState(false);
    const [sortTopVendorAsc, setSortTopVendorAsc] = useState(false);

    // Top N states
    const [vendorCountLimit, setVendorCountLimit] = useState(5);
    const [vendorAmountLimit, setVendorAmountLimit] = useState(5);
    const [topLimit, setTopLimit] = useState(5);

    const handleSortVendorCount = useCallback(() => setSortVendorCountAsc(prev => !prev), []);
    const handleSortVendorAmt = useCallback(() => setSortVendorAmtAsc(prev => !prev), []);
    const handleSortTopVendor = useCallback(() => setSortTopVendorAsc(prev => !prev), []);

    // ---------- Aging chart data ----------
    const agingData = React.useMemo(() => {
        if (!aging) return null;
        const labels = ["0–30", "31–60", "61–90", "91–120", "120+"];
        const values = [
            aging["0_30"],
            aging["31_60"],
            aging["61_90"],
            aging["91_120"],
            aging["120_plus"],
        ];
        const colors = [
            'rgba(59, 124, 255, 0.9)',
            'rgba(59, 124, 255, 0.8)',
            'rgba(59, 124, 255, 0.7)',
            'rgba(59, 124, 255, 0.6)',
            'rgba(59, 124, 255, 0.5)'
        ];
        return { labels, values, colors };
    }, [aging]);

    // ---------- Status chart ----------
    const statusData = React.useMemo(() => {
        if (!statusBreakdown) return null;
        const labels = [
            "Approved", "Waiting Approval", "Pending", "Waiting Coding",
            "Rejected", "Reworked", "Processed"
        ];
        const values = [
            statusBreakdown.approved || 0,
            statusBreakdown.waiting_approval || 0,
            statusBreakdown.pending || 0,
            statusBreakdown.waiting_coding || 0,
            statusBreakdown.rejected || 0,
            statusBreakdown.reworked || 0,
            statusBreakdown.processed || 0
        ];
        const colors = [
            "#10b981", "#3b82f6", "#f59e0b", "#8b5cf6",
            "#ef4444", "#ec4899", "#14b8a6"
        ];
        return { labels, values, colors };
    }, [statusBreakdown]);

    // ---------- Vendor charts ----------
    const vendorCountData = React.useMemo(() => {
        if (!vendorData?.by_count) return [];
        return [...vendorData.by_count]
            .sort((a, b) => (sortVendorCountAsc ? a.count - b.count : b.count - a.count))
            .slice(0, vendorCountLimit);
    }, [vendorData, sortVendorCountAsc, vendorCountLimit]);

    const vendorAmountData = React.useMemo(() => {
        if (!vendorData?.by_amount) return [];
        return [...vendorData.by_amount]
            .sort((a, b) => (sortVendorAmtAsc ? a.amount - b.amount : b.amount - a.amount))
            .slice(0, vendorAmountLimit);
    }, [vendorData, sortVendorAmtAsc, vendorAmountLimit]);

    const vendorCountColors = React.useMemo(() =>
        Array.from({ length: vendorCountData.length }, (_, i) => `rgba(139, 92, 246, ${0.7 + (i * 0.05)})`),
        [vendorCountData.length]
    );

    const vendorAmountColors = React.useMemo(() =>
        Array.from({ length: vendorAmountData.length }, (_, i) => `rgba(16, 185, 129, ${0.7 + (i * 0.05)})`),
        [vendorAmountData.length]
    );

    // ---------- Top vendors table ----------
    const topVendorRows = React.useMemo(() => {
        return [...topVendors]
            .sort((a, b) => (sortTopVendorAsc ? a.total - b.total : b.total - a.total))
            .slice(0, topLimit)
            .map((v, i) => ({
                key: i,
                rank: i + 1,
                vendor: v.vendor,
                count: v.count,
                total: v.total,
            }));
    }, [topVendors, sortTopVendorAsc, topLimit]);

    const topVendorColumns = React.useMemo(() => [
        { title: "Rank", dataIndex: "rank", width: 70 },
        { title: "Vendor", dataIndex: "vendor" },
        { title: "Invoices", dataIndex: "count", width: 110 },
        {
            title: "Amount",
            dataIndex: "total",
            width: 160,
            render: (v) => `${v.toFixed(2)}`,
        },
    ], []);

    if (loading || !summary || !vendorData || !aging || !statusBreakdown) {
        return <DashboardSkeleton />;
    }

    if (error) {
        return (
            <div className="ap-error-container">
                <Text type="danger">Error loading dashboard data. Please try again later.</Text>
            </div>
        );
    }

    return (
        // <div className="ap-dashboard-shell">
        <div className="ap-dashboard">

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
                                    {summary.total_due.toFixed(2)}
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
                {/* Aging */}
                <Col xs={24} md={14}>
                    <Card
                        className="ap-chart-card"
                        title={<span className="ap-card-title">Payable Aging Analysis</span>}
                    >
                        <Plot
                            data={[
                                {
                                    x: agingData.labels,
                                    y: agingData.values,
                                    type: "bar",
                                    marker: {
                                        color: agingData.colors,
                                        line: {
                                            width: 1.5,
                                            color: 'rgba(59, 124, 255, 0.9)'
                                        },
                                    },
                                    hovertemplate: '<b>%{x} days</b><br>%{y:.2f}<extra></extra>',
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
                                    title: "Amount",
                                    gridcolor: 'rgba(234, 236, 240, 0.5)',
                                    tickformat: '.0f',
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
                            }}
                        />
                    </Card>
                </Col>

                {/* Status */}
                <Col xs={24} md={10}>
                    <Card
                        className="ap-chart-card"
                        title={<span className="ap-card-title">Invoice Status Breakdown</span>}
                    >
                        <Plot
                            data={[
                                {
                                    labels: statusData.labels,
                                    values: statusData.values,
                                    type: "pie",
                                    hole: 0.4, // Smaller hole to make room for text
                                    marker: {
                                        colors: statusData.colors,
                                        line: { width: 1.5, color: "white" },
                                    },
                                    textinfo: "percent",
                                    textposition: "inside", // Percentages inside slices
                                    textfont: {
                                        size: 9,
                                        family: "'Inter', sans-serif",
                                        color: "white", // White text for better contrast
                                    },
                                    hovertemplate:
                                        "<b>%{label}</b><br>Count: %{value}<br>%{percent}<extra></extra>",
                                    pull: statusData.labels.map(() => 0.01), // Smaller pull effect
                                },
                            ]}
                            layout={{
                                autosize: true,
                                height: 260, // Even smaller
                                margin: { t: 10, r: 10, b: 10, l: 10 }, // Minimal margins
                                showlegend: true,
                                legend: {
                                    orientation: "v",
                                    x: 1.02,  // Closer to chart
                                    xanchor: "left",
                                    y: 0.5,
                                    font: {
                                        size: 12,  // Very small legend
                                        family: "'Inter', sans-serif",
                                        color: isDarkMode ? "#fff" : "#1d2939"
                                    },
                                },
                                plot_bgcolor: "rgba(0,0,0,0)",
                                paper_bgcolor: "rgba(0,0,0,0)",
                                hoverlabel: {
                                    bgcolor: "#1d2939",
                                    font: { color: "white", size: 12 },
                                },
                                dragmode: false,
                                hovermode: "closest",
                            }}
                            className="ap-chart"
                            useResizeHandler
                            style={{ width: '100%', height: '260px' }}
                            config={{
                                displayModeBar: false,
                                displaylogo: false,
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
                                    onClick={handleSortVendorCount}
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
                                    x: vendorCountData.map((v) => v.vendor),
                                    y: vendorCountData.map((v) => v.count),
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
                            }}
                            className="ap-chart"
                            useResizeHandler
                            config={{
                                displayModeBar: false,
                                displaylogo: false,
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
                                    onClick={handleSortVendorAmt}
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
                                    x: vendorAmountData.map((v) => v.vendor),
                                    y: vendorAmountData.map((v) => v.amount),
                                    type: "bar",
                                    marker: {
                                        color: vendorAmountColors,
                                        line: {
                                            color: 'rgba(16, 185, 129, 0.9)',
                                            width: 1.5
                                        },
                                    },
                                    hovertemplate: '<b>%{x}</b><br>%{y:.2f}<extra></extra>',
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
                                    title: "Amount",
                                    gridcolor: 'rgba(234, 236, 240, 0.5)',
                                    tickformat: '.0f',
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
                            }}
                            className="ap-chart"
                            useResizeHandler
                            config={{
                                displayModeBar: false,
                                displaylogo: false,
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
                                    onClick={handleSortTopVendor}
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
        // </div>
    );
};

export default ApDashboard;
