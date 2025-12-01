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
    if (error.response?.status === 401) {
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

  async updateInvoiceStatus(invoiceId, status) {
    const response = await api.put(`/invoices/${invoiceId}/status?status=${status}`);
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

export default api;