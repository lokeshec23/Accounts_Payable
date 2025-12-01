// src/components/MainLayout.jsx
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Table,
  Button,
  Tag,
  Space,
  Modal,
  Spin,
  message,
  Input,
  Tabs,
} from "antd";
import {
  PlusOutlined,
  EyeOutlined,
  DeleteOutlined,
  FolderOpenOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";

import InvoiceUpload from "./InvoiceUpload";
import { invoiceService } from "../services/api";
import ApDashboard from "../pages/ApDashboard"; // 👈 IMPORTANT IMPORT
import "../styles/MainLayout.css";

const { confirm } = Modal;

const MainLayout = () => {
  const navigate = useNavigate();
  const [allInvoices, setAllInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFieldsModalOpen, setIsFieldsModalOpen] = useState(false);
  const [viewFilesData, setViewFilesData] = useState([]);

  // Global search
  const [searchTerm, setSearchTerm] = useState("");
  const [fieldsSearchTerm, setFieldsSearchTerm] = useState("");

  // ------------ FETCH INVOICES --------------
  const fetchInvoices = async () => {
    try {
      setLoading(true);

      const response = await invoiceService.getInvoices(0, 1000);
      const invoicesArray = Array.isArray(response) ? response : [];

      const transformedData = invoicesArray.map((invoice) => {
        const extracted = invoice.extracted_data || {};
        const vendorInfo = extracted.vendor_info || {};
        const invoiceDetails = extracted.invoice_details || {};
        const validation = invoice.validation_results || {};

        const getValue = (obj) =>
          obj && obj.value !== undefined ? obj.value : "";

        return {
          key: invoice._id || invoice.id,
          id: invoice._id || invoice.id,
          filename: invoice.original_filename || invoice.filename || "N/A",
          vendorName: getValue(vendorInfo.name) || "N/A",
          invoiceId: getValue(invoiceDetails.invoice_number) || "N/A",
          lastUpdated: new Date(
            invoice.processed_at || invoice.uploaded_at
          ).toLocaleString(),
          uploadedBy: invoice.uploaded_by || "Unknown",
          status: invoice.status || "waiting_approval",
          approverName: validation.approver_name || "",
          approvalTime: validation.approval_timestamp
            ? new Date(validation.approval_timestamp).toLocaleString()
            : "",
          rawData: invoice,
        };
      });

      setAllInvoices(transformedData);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      message.error("Failed to load invoices.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  // ------------ GLOBAL SEARCH --------------
  const filteredInvoices = useMemo(() => {
    if (!searchTerm) return allInvoices;

    const q = searchTerm.toLowerCase();
    return allInvoices.filter((inv) =>
      [inv.filename, inv.vendorName, inv.invoiceId, inv.uploadedBy, inv.status]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [allInvoices, searchTerm]);

  // ------------ TABLE COLUMNS --------------
  const columns = [
    {
      title: "S.No",
      width: 70,
      render: (_, r, i) => i + 1,
    },
    {
      title: "File Name",
      dataIndex: "filename",
      sorter: (a, b) => a.filename.localeCompare(b.filename),
    },
    {
      title: "Vendor Name",
      dataIndex: "vendorName",
      sorter: (a, b) => a.vendorName.localeCompare(b.vendorName),
    },
    {
      title: "Invoice ID",
      dataIndex: "invoiceId",
      sorter: (a, b) => a.invoiceId.localeCompare(b.invoiceId),
    },
    {
      title: "Last Updated",
      dataIndex: "lastUpdated",
      sorter: (a, b) => new Date(a.lastUpdated) - new Date(b.lastUpdated),
    },
    {
      title: "Uploaded By",
      dataIndex: "uploadedBy",
    },
    {
      title: "Status",
      dataIndex: "status",
      render: (s) => {
        let color = "default";
        if (s === "approved") color = "success";
        else if (s === "rejected") color = "error";
        else if (s === "waiting_approval") color = "warning";

        return <Tag color={color}>{s}</Tag>;
      },
    },
    {
      title: "Actions",
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => navigate("/invoice/review", { state: { invoice: record } })}
          >
            View
          </Button>

          <Button
            type="link"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record)}
          >
            Delete
          </Button>
        </Space>
      ),
    },
  ];

  // ------------ DELETE HANDLER --------------
  const handleDelete = (record) => {
    confirm({
      title: "Delete this invoice?",
      icon: <ExclamationCircleOutlined />,
      okText: "Delete",
      okType: "danger",
      async onOk() {
        try {
          await invoiceService.deleteInvoice(record.id);
          message.success("Invoice deleted.");
          fetchInvoices();
        } catch {
          message.error("Delete failed.");
        }
      },
    });
  };

  // ------------ VIEW FILES FETCH --------------
  const handleViewFiles = async () => {
    try {
      setLoading(true);
      const response = await invoiceService.getInvoices(0, 1000);
      setViewFilesData(response);
      setIsFieldsModalOpen(true);
    } catch {
      message.error("Failed loading files.");
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  //            ⭐ ⭐  TABS INTEGRATION ⭐ ⭐
  // =====================================================

  const tabItems = [
    {
      key: "invoices",
      label: "📄 Invoices",
      children: (
        <>
          <div className="layout-header">
            <h1 className="layout-title">Invoices</h1>
            <div className="layout-actions">
              <Button
                type="default"
                icon={<FolderOpenOutlined />}
                onClick={handleViewFiles}
              >
                View Files
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setIsModalOpen(true)}
              >
                Add Invoice
              </Button>
            </div>
          </div>

          <div className="table-toolbar">
            <Input
              placeholder="Search invoices..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              allowClear
            />
          </div>

          <Spin spinning={loading}>
            <Table
              columns={columns}
              dataSource={filteredInvoices}
              pagination={{ pageSize: 10 }}
              scroll={{ x: 1200 }}
            />
          </Spin>
        </>
      ),
    },

    {
      key: "dashboard",
      label: "📊 Dashboard",
      children: (
        <div style={{ padding: "10px" }}>
          <ApDashboard /> {/* 👈 CHARTS RENDER HERE */}
        </div>
      ),
    },
  ];

  // =====================================================

  return (
    <div className="main-layout">
      <Tabs defaultActiveKey="invoices" items={tabItems} />

      {/* UPLOAD MODAL */}
      <Modal
        title="Upload Invoice"
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
        width={700}
      >
        <InvoiceUpload
          onUploadSuccess={(file) => {
            setIsModalOpen(false);
            navigate("/invoice/review", { state: { invoice: file } });
          }}
        />
      </Modal>

      {/* VIEW FILES MODAL */}
      <Modal
        title="Invoice Fields"
        open={isFieldsModalOpen}
        onCancel={() => setIsFieldsModalOpen(false)}
        footer={null}
        width="95%"
      >
        <Input
          placeholder="Search fields..."
          value={fieldsSearchTerm}
          onChange={(e) => setFieldsSearchTerm(e.target.value)}
          allowClear
        />

        <Table
          dataSource={viewFilesData}
          rowKey={(r, i) => i}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 2000 }}
        />
      </Modal>
    </div>
  );
};

export default MainLayout;
