import axios from 'axios';

const API_BASE_URL = 'http://localhost:8014/api';

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

    // Add Entity header
    const entity = localStorage.getItem('selected_entity');
    if (entity) {
      config.headers['X-Entity'] = entity;
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
  },

  async recallInvoice(invoiceId, comment = null) {
    return this.updateInvoiceStatus(invoiceId, 'waiting_coding', comment);
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

  // No longer needed as we use fixed tabs


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
      { params: { row_index: rowIndex } }
    );
    return response.data;
  },

  async getEntities() {
    const response = await api.get("/master/entities");
    return response.data;
  },

  // 7️⃣ Upload Excel file
  async uploadFile(tabName, file) {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post(`/master/upload?tab_name=${tabName}`, formData, {
      headers: { "Content-Type": "multipart/form-data" }
    });
    return response.data;
  },

  // 8️⃣ Delete data for a tab
  async deleteFile(tabName) {
    const response = await api.delete(`/master/files/${tabName}`);
    return response.data;
  },

  // 9️⃣ Embedding Search
  async searchVendor(vendorName, vendorAddress = null) {
    const response = await api.post("/master/search-vendor", {
      vendor_name: vendorName,
      vendor_address: vendorAddress
    });
    return response.data;
  },

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


// Approval service methods
export const approvalService = {
  async sendToApproval(invoiceId) {
    const response = await api.post(`/approval/send-to-approval/${invoiceId}`);
    return response.data;
  }
};

// Admin service methods
export const adminService = {
  async getAllUsers() {
    const response = await api.get('/users/');
    return response.data;
  },

  async updateUserRole(userId, role, status) {
    const response = await api.put(`/users/${userId}/role`, { role, status });
    return response.data;
  }
};

export const settingsService = {
  async getSettings() {
    const response = await api.get('/settings/');
    return response.data;
  },

  async updateSettings(settings) {
    const response = await api.put('/settings/', settings);
    return response.data;
  }
};

export const currencyService = {
  async getCurrencies() {
    const response = await api.get('/currency/');
    return response.data;
  },
  async createCurrency(data) {
    const response = await api.post('/currency/', data);
    return response.data;
  },
  async updateCurrency(id, data) {
    const response = await api.put(`/currency/${id}`, data);
    return response.data;
  },
  async deleteCurrency(id) {
    const response = await api.delete(`/currency/${id}`);
    return response.data;
  }
};

// Workflow Configuration service methods
export const workflowConfigService = {
  // Vendor Workflow
  async getVendorWorkflows() {
    const response = await api.get('/workflow-config/vendor');
    return response.data;
  },
  async createVendorWorkflow(data) {
    const response = await api.post('/workflow-config/vendor', data);
    return response.data;
  },
  async updateVendorWorkflow(id, data) {
    const response = await api.put(`/workflow-config/vendor/${id}`, data);
    return response.data;
  },
  async deleteVendorWorkflow(id) {
    const response = await api.delete(`/workflow-config/vendor/${id}`);
    return response.data;
  },
  async getWorkflowVendors() {
    const response = await api.get('/workflow-config/vendor/vendors');
    return response.data;
  },

  // Codification Workflow
  async getCodificationWorkflows() {
    const response = await api.get('/workflow-config/codification');
    return response.data;
  },
  async createCodificationWorkflow(data) {
    const response = await api.post('/workflow-config/codification', data);
    return response.data;
  },
  async updateCodificationWorkflow(id, data) {
    const response = await api.put(`/workflow-config/codification/${id}`, data);
    return response.data;
  },
  async deleteCodificationWorkflow(id) {
    const response = await api.delete(`/workflow-config/codification/${id}`);
    return response.data;
  },
  async getLOBs() {
    const response = await api.get('/workflow-config/codification/lobs');
    return response.data;
  },
  async getDepartments() {
    const response = await api.get('/workflow-config/codification/departments');
    return response.data;
  },

  // Approvers
  async getApprovers() {
    const response = await api.get('/workflow-config/approvers');
    return response.data;
  },
};

export const delegationService = {
  async getDelegations() {
    const response = await api.get('/delegation/');
    return response.data;
  },
  async createDelegation(data) {
    const response = await api.post('/delegation/', data);
    return response.data;
  },
  async revertDelegation(id) {
    const response = await api.delete(`/delegation/${id}`);
    return response.data;
  }
};

export default api;