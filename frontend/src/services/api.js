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
    const token = sessionStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Add Entity header
    const entity = sessionStorage.getItem('selected_entity');
    if (entity) {
      config.headers['X-Entity'] = entity;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle token expiry and Trace Logging
api.interceptors.response.use(
  (response) => {

    let requestData = response.config.data;
    try {
      if (typeof requestData === 'string' && requestData.startsWith('{')) {
        requestData = JSON.parse(requestData);
      }
    } catch (e) { }

    const fullUrl = `${response.config.baseURL}${response.config.url}`;

    console.log(
      `[Trace] ${response.config.method.toUpperCase()} ${fullUrl} | Status: ${response.status}`,
      {
        request: requestData,
        response: response.data
      }
    );

    return response;
  }
);

// Add invoice service methods
export const invoiceService = {
  async uploadInvoices(files, taskId = null) {
    try {
      const formData = new FormData();
      files.forEach(f => formData.append("files", f));

      let url = "/invoices/upload";
      if (taskId) {
        url += `?task_id=${taskId}`;
      }

      const response = await api.post(url, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      return response.data;
    } catch (error) {
      console.error("uploadInvoices error:", error);
      throw error;
    }
  },

  async getInvoices(skip = 0, limit = 10) {
    try {
      const response = await api.get(`/invoices/?skip=${skip}&limit=${limit}`);
      return response.data;
    } catch (error) {
      console.error("getInvoices error:", error);
      throw error;
    }
  },

  async getInvoice(invoiceId) {
    try {
      const response = await api.get(`/invoices/${invoiceId}/`);
      return response.data;
    } catch (error) {
      console.error("getInvoice error:", error);
      throw error;
    }
  },

  async updateInvoiceStatus(invoiceId, status, comment = null) {
    try {
      console.log(`[api.js] updateInvoiceStatus called for ${invoiceId} with status ${status}`);
      const params = new URLSearchParams({ status });
      if (comment) {
        params.append('comment', comment);
      }
      const response = await api.put(`/invoices/${invoiceId}/status?${params.toString()}`);
      return response.data;
    } catch (error) {
      console.error("updateInvoiceStatus error:", error);
      throw error;
    }
  },

  async updateInvoice(invoiceId, data) {
    try {
      console.log(`Calling PUT /invoices/${invoiceId}`, data);
      const response = await api.put(`/invoices/${invoiceId}`, data);
      console.log('Update response:', response.data);
      return response.data;
    } catch (error) {
      console.error("updateInvoice error:", error);
      throw error;
    }
  },

  async deleteInvoice(invoiceId) {
    try {
      const response = await api.delete(`/invoices/${invoiceId}/`);
      return response.data;
    } catch (error) {
      console.error("deleteInvoice error:", error);
      throw error;
    }
  },

  getPdfUrl(invoiceId) {
    return `${API_BASE_URL}/invoices/${invoiceId}/file`;
  },

  async getPdfBlob(invoiceId) {
    try {
      const response = await api.get(`/invoices/${invoiceId}/file`, {
        responseType: 'blob'
      });
      return URL.createObjectURL(response.data);
    } catch (error) {
      console.error("getPdfBlob error:", error);
      throw error;
    }
  },

  async recallInvoice(invoiceId, comment = null) {
    return this.updateInvoiceStatus(invoiceId, 'waiting_coding', comment);
  },

  async checkDuplicate(data) {
    try {
      const response = await api.post('/invoices/check-duplicate', data);
      return response.data;
    } catch (error) {
      console.error("checkDuplicate error:", error);
      throw error;
    }
  },

  getUploadProgressUrl(taskId) {
    return `${API_BASE_URL}/invoices/upload-progress/${taskId}`;
  }
};

// Add coding service methods
export const codingService = {
  async saveCoding(codingData) {
    try {
      const response = await api.post('/coding/', codingData);
      return response.data;
    } catch (error) {
      console.error("saveCoding error:", error);
      throw error;
    }
  },

  async getCoding(invoiceId) {
    try {
      const response = await api.get(`/coding/${invoiceId}`);
      return response.data;
    } catch (error) {
      console.error("getCoding error:", error);
      throw error;
    }
  },

  async getSuggestions(invoiceId, vendorId = null) {
    try {
      const params = vendorId ? { vendor_id: vendorId } : {};
      const response = await api.get(`/coding/${invoiceId}/suggestions`, { params });
      return response.data;
    } catch (error) {
      console.error("getSuggestions error:", error);
      throw error;
    }
  },

  async deleteCoding(invoiceId) {
    try {
      const response = await api.delete(`/coding/${invoiceId}`);
      return response.data;
    } catch (error) {
      console.error("deleteCoding error:", error);
      throw error;
    }
  }
};

// ---------------------------------------------
// MASTER DATA SERVICE (Vendor Master, Codification)
// ---------------------------------------------
export const masterDataService = {

  // 1️⃣ Get all uploaded master files
  async getFiles() {
    try {
      const response = await api.get("/master/files");
      return response.data;
    } catch (error) {
      console.error("getFiles error:", error);
      throw error;
    }
  },

  // 3️⃣ Get sheet rows (merged from chunks)
  async getSheetData(collectionName, skip = 0, limit = 10, search = "") {
    try {
      let url = `/master/sheet/${collectionName}?skip=${skip}&limit=${limit}`;
      if (search) {
        url += `&search=${encodeURIComponent(search)}`;
      }
      const response = await api.get(url);
      return response.data;
    } catch (error) {
      console.error("getSheetData error:", error);
      throw error;
    }
  },

  // 4️⃣ Add row
  async addRow(collectionName, newRow) {
    try {
      const response = await api.post(`/master/sheet/${collectionName}/add`, { new_row: newRow });
      return response.data;
    } catch (error) {
      console.error("addRow error:", error);
      throw error;
    }
  },

  // 5️⃣ Edit row
  async editRow(collectionName, rowIndex, updatedRow) {
    try {
      const response = await api.patch(
        `/master/sheet/${collectionName}/edit`,
        { row_index: rowIndex, updated_row: updatedRow }
      );
      return response.data;
    } catch (error) {
      console.error("editRow error:", error);
      throw error;
    }
  },

  // 6️⃣ Delete row
  async deleteRow(collectionName, rowIndex) {
    try {
      const response = await api.delete(
        `/master/sheet/${collectionName}/delete`,
        { params: { row_index: rowIndex } }
      );
      return response.data;
    } catch (error) {
      console.error("deleteRow error:", error);
      throw error;
    }
  },

  async getEntities() {
    try {
      const response = await api.get("/master/entities");
      return response.data;
    } catch (error) {
      console.error("getEntities error:", error);
      throw error;
    }
  },

  // 7️⃣ Upload Excel file
  async uploadFile(tabName, file) {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await api.post(`/master/upload?tab_name=${tabName}`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      return response.data;
    } catch (error) {
      console.error("uploadFile error:", error);
      throw error;
    }
  },

  // 8️⃣ Delete data for a tab
  async deleteFile(tabName) {
    try {
      const response = await api.delete(`/master/files/${tabName}`);
      return response.data;
    } catch (error) {
      console.error("deleteFile error:", error);
      throw error;
    }
  },

  // 9️⃣ Embedding Search
  async searchVendor(vendorName, vendorAddress = null) {
    try {
      const response = await api.post("/master/search-vendor", {
        vendor_name: vendorName,
        vendor_address: vendorAddress
      });
      return response.data;
    } catch (error) {
      console.error("searchVendor error:", error);
      throw error;
    }
  },

};

// Workflow service methods
export const workflowService = {
  getWorkflowHistory: async (id, vendorId = null, vendorName = null) => {
    try {
      let url = `/workflow/${id}`;
      const params = new URLSearchParams();
      if (vendorId) params.append('preview_vendor_id', vendorId);
      if (vendorName) params.append('preview_vendor_name', vendorName);

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const response = await api.get(url);
      return response.data;
    } catch (error) {
      console.error("getWorkflowHistory error:", error);
      throw error;
    }
  },

  async createWorkflowStep(stepData) {
    try {
      const response = await api.post('/workflow/step', stepData);
      return response.data;
    } catch (error) {
      console.error("createWorkflowStep error:", error);
      throw error;
    }
  },

  async getApproverStatus(invoiceId) {
    try {
      const response = await api.get(`/workflow/approvers/${invoiceId}`);
      return response.data;
    } catch (error) {
      console.error("getApproverStatus error:", error);
      throw error;
    }
  }
};

// Approver configuration service methods


// Approval service methods
export const approvalService = {
  async sendToApproval(invoiceId) {
    try {
      const response = await api.post(`/approval/send-to-approval/${invoiceId}`);
      return response.data;
    } catch (error) {
      console.error("sendToApproval error:", error);
      throw error;
    }
  }
};

// Admin service methods
export const adminService = {
  async getAllUsers() {
    try {
      const response = await api.get('/users/');
      return response.data;
    } catch (error) {
      console.error("getAllUsers error:", error);
      throw error;
    }
  },

  async updateUserRole(userId, role, status) {
    try {
      const response = await api.put(`/users/${userId}/role`, { role, status });
      return response.data;
    } catch (error) {
      console.error("updateUserRole error:", error);
      throw error;
    }
  }
};

export const settingsService = {
  async getSettings() {
    try {
      const response = await api.get('/settings/');
      return response.data;
    } catch (error) {
      console.error("getSettings error:", error);
      throw error;
    }
  },

  async updateSettings(settings) {
    try {
      const response = await api.put('/settings/', settings);
      return response.data;
    } catch (error) {
      console.error("updateSettings error:", error);
      throw error;
    }
  }
};

export const currencyService = {
  async getCurrencies() {
    try {
      const response = await api.get('/currency/');
      return response.data;
    } catch (error) {
      console.error("getCurrencies error:", error);
      throw error;
    }
  },
  async createCurrency(data) {
    try {
      const response = await api.post('/currency/', data);
      return response.data;
    } catch (error) {
      console.error("createCurrency error:", error);
      throw error;
    }
  },
  async updateCurrency(id, data) {
    try {
      const response = await api.put(`/currency/${id}`, data);
      return response.data;
    } catch (error) {
      console.error("updateCurrency error:", error);
      throw error;
    }
  },
  async deleteCurrency(id) {
    try {
      const response = await api.delete(`/currency/${id}`);
      return response.data;
    } catch (error) {
      console.error("deleteCurrency error:", error);
      throw error;
    }
  }
};

// Workflow Configuration service methods
export const workflowConfigService = {
  // Vendor Workflow
  async getVendorWorkflows() {
    try {
      const response = await api.get('/workflow-config/vendor');
      return response.data;
    } catch (error) {
      console.error("getVendorWorkflows error:", error);
      throw error;
    }
  },
  async createVendorWorkflow(data) {
    try {
      const response = await api.post('/workflow-config/vendor', data);
      return response.data;
    } catch (error) {
      console.error("createVendorWorkflow error:", error);
      throw error;
    }
  },
  async updateVendorWorkflow(id, data) {
    try {
      const response = await api.put(`/workflow-config/vendor/${id}`, data);
      return response.data;
    } catch (error) {
      console.error("updateVendorWorkflow error:", error);
      throw error;
    }
  },
  async deleteVendorWorkflow(id) {
    try {
      const response = await api.delete(`/workflow-config/vendor/${id}`);
      return response.data;
    } catch (error) {
      console.error("deleteVendorWorkflow error:", error);
      throw error;
    }
  },
  async getWorkflowVendors() {
    try {
      const response = await api.get('/workflow-config/vendor/vendors');
      return response.data;
    } catch (error) {
      console.error("getWorkflowVendors error:", error);
      throw error;
    }
  },

  // Codification Workflow
  async getCodificationWorkflows() {
    try {
      const response = await api.get('/workflow-config/codification');
      return response.data;
    } catch (error) {
      console.error("getCodificationWorkflows error:", error);
      throw error;
    }
  },
  async createCodificationWorkflow(data) {
    try {
      const response = await api.post('/workflow-config/codification', data);
      return response.data;
    } catch (error) {
      console.error("createCodificationWorkflow error:", error);
      throw error;
    }
  },
  async updateCodificationWorkflow(id, data) {
    try {
      const response = await api.put(`/workflow-config/codification/${id}`, data);
      return response.data;
    } catch (error) {
      console.error("updateCodificationWorkflow error:", error);
      throw error;
    }
  },
  async deleteCodificationWorkflow(id) {
    try {
      const response = await api.delete(`/workflow-config/codification/${id}`);
      return response.data;
    } catch (error) {
      console.error("deleteCodificationWorkflow error:", error);
      throw error;
    }
  },
  async getLOBs() {
    try {
      const response = await api.get('/workflow-config/codification/lobs');
      return response.data;
    } catch (error) {
      console.error("getLOBs error:", error);
      throw error;
    }
  },
  async getDepartments() {
    try {
      const response = await api.get('/workflow-config/codification/departments');
      return response.data;
    } catch (error) {
      console.error("getDepartments error:", error);
      throw error;
    }
  },

  // Approvers
  async getApprovers() {
    try {
      const response = await api.get('/workflow-config/approvers');
      return response.data;
    } catch (error) {
      console.error("getApprovers error:", error);
      throw error;
    }
  },
};

export const delegationService = {
  async getDelegations() {
    try {
      const response = await api.get('/delegation/');
      return response.data;
    } catch (error) {
      console.error("getDelegations error:", error);
      throw error;
    }
  },
  async createDelegation(data) {
    try {
      const response = await api.post('/delegation/', data);
      return response.data;
    } catch (error) {
      console.error("createDelegation error:", error);
      throw error;
    }
  },
  async revertDelegation(id) {
    try {
      const response = await api.delete(`/delegation/${id}`);
      return response.data;
    } catch (error) {
      console.error("revertDelegation error:", error);
      throw error;
    }
  }
};

export const auditService = {
  async getAuditTrail(invoiceId) {
    try {
      const response = await api.get(`/audit/${invoiceId}`);
      return response.data;
    } catch (error) {
      console.error("getAuditTrail error:", error);
      throw error;
    }
  }
};

export default api;