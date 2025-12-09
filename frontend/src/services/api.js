import axios from 'axios';

const API_BASE_URL = 'http://localhost:8004/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle token expiry
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !error.config.url.endsWith('/auth/login')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

// Add invoice service methods
export const invoiceService = {
  async uploadInvoices(files) {
    const formData = new FormData();
    files.forEach(f => formData.append("files", f));

    const response = await api.post("/invoices/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" }
    });
    return response.data;
  },

  async getInvoices(skip = 0, limit = 10) {
    const response = await api.get(`/invoices/?skip=${skip}&limit=${limit}`);
    return response.data;
  },

  async getInvoice(invoiceId) {
    const response = await api.get(`/invoices/${invoiceId}/`);
    return response.data;
  },

  async updateInvoiceStatus(invoiceId, status, comment = null) {
    console.log(`[api.js] updateInvoiceStatus called for ${invoiceId} with status ${status}`);
    const params = new URLSearchParams({ status });
    if (comment) {
      params.append('comment', comment);
    }
    const response = await api.put(`/invoices/${invoiceId}/status?${params.toString()}`);
    return response.data;
  },

  async updateInvoice(invoiceId, data) {
    console.log(`Calling PUT /invoices/${invoiceId}`, data);

    // This should use PUT to update existing record
    const response = await api.put(`/invoices/${invoiceId}`, data);

    console.log('Update response:', response.data);
    return response.data;
  },

  async deleteInvoice(invoiceId) {
    const response = await api.delete(`/invoices/${invoiceId}/`);
    return response.data;
  },

  getPdfUrl(invoiceId) {
    return `${API_BASE_URL}/invoices/${invoiceId}/pdf`;
  },

  async getPdfBlob(invoiceId) {
    const response = await api.get(`/invoices/${invoiceId}/pdf`, {
      responseType: 'blob'
    });
    return URL.createObjectURL(response.data);
  }
};

// Add coding service methods
export const codingService = {
  async saveCoding(codingData) {
    const response = await api.post('/coding/', codingData);
    return response.data;
  },

  async getCoding(invoiceId) {
    const response = await api.get(`/coding/${invoiceId}`);
    return response.data;
  },

  async deleteCoding(invoiceId) {
    const response = await api.delete(`/coding/${invoiceId}`);
    return response.data;
  }
};

// ---------------------------------------------
// MASTER DATA SERVICE (Vendor Master, Codification)
// ---------------------------------------------
export const masterDataService = {

  // 1️⃣ Get all uploaded master files
  async getFiles() {
    const response = await api.get("/master/files");
    return response.data;
  },

  // 2️⃣ Get all sheets for a selected file
  async getSheets(fileId) {
    const response = await api.get(`/master/${fileId}/sheets`);
    return response.data;
  },

  // 3️⃣ Get sheet rows (merged from chunks)
  async getSheetData(collectionName) {
    const response = await api.get(`/master/sheet/${collectionName}`);
    return response.data;
  },

  // 4️⃣ Add row
  async addRow(collectionName, newRow) {
    const response = await api.post(`/master/sheet/${collectionName}/add`, { new_row: newRow });
    return response.data;
  },

  // 5️⃣ Edit row
  async editRow(collectionName, rowIndex, updatedRow) {
    const response = await api.patch(
      `/master/sheet/${collectionName}/edit`,
      { row_index: rowIndex, updated_row: updatedRow }
    );
    return response.data;
  },

  // 6️⃣ Delete row
  async deleteRow(collectionName, rowIndex) {
    const response = await api.delete(
      `/master/sheet/${collectionName}/delete`,
      { data: { row_index: rowIndex } }
    );
    return response.data;
  }
};

// Workflow service methods
export const workflowService = {
  async getWorkflowHistory(invoiceId) {
    const response = await api.get(`/workflow/${invoiceId}`);
    return response.data;
  },

  async createWorkflowStep(stepData) {
    const response = await api.post('/workflow/step', stepData);
    return response.data;
  },

  async getApproverStatus(invoiceId) {
    const response = await api.get(`/workflow/approvers/${invoiceId}`);
    return response.data;
  }
};

// Approver configuration service methods
export const approverConfigService = {
  async getAllConfigs() {
    const response = await api.get('/approver-config/');
    return response.data;
  },

  async getConfig(vendorName) {
    const response = await api.get(`/approver-config/vendor/${vendorName}`);
    return response.data;
  },

  async getApproverCount(vendorName) {
    const response = await api.get(`/approver-config/count/${vendorName}`);
    return response.data;
  },

  async createOrUpdateConfig(configData) {
    const response = await api.post('/approver-config/', configData);
    return response.data;
  },

  async deleteConfig(vendorName) {
    const response = await api.delete(`/approver-config/${vendorName}`);
    return response.data;
  },

  // Amount Rules
  async getAmountRules() {
    const response = await api.get('/approver-config/rules/amount');
    return response.data;
  },

  async createAmountRule(ruleData) {
    const response = await api.post('/approver-config/rules/amount', ruleData);
    return response.data;
  },

  async deleteAmountRule(ruleId) {
    const response = await api.delete(`/approver-config/rules/amount/${ruleId}`);
    return response.data;
  },

  // GL Rules
  async getGLRules() {
    const response = await api.get('/approver-config/rules/gl');
    return response.data;
  },

  async createGLRule(ruleData) {
    const response = await api.post('/approver-config/rules/gl', ruleData);
    return response.data;
  },

  async deleteGLRule(glCode) {
    const response = await api.delete(`/approver-config/rules/gl/${glCode}`);
    return response.data;
  },

  // Default Config
  async getDefaultConfig() {
    const response = await api.get('/approver-config/default');
    return response.data;
  },

  async createOrUpdateDefaultConfig(configData) {
    const response = await api.post('/approver-config/default', configData);
    return response.data;
  }
};

// Approval service methods
export const approvalService = {
  async sendToApproval(invoiceId) {
    const response = await api.post(`/approval/send-to-approval/${invoiceId}`);
    return response.data;
  }
};

export default api;