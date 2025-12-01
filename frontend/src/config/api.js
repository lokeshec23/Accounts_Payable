// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8004';

export const API_CONFIG = {
    BASE_URL: API_BASE_URL,
    ENDPOINTS: {
        // Auth
        LOGIN: `${API_BASE_URL}/api/auth/login`,
        REGISTER: `${API_BASE_URL}/api/auth/register`,

        // Invoices
        INVOICES: `${API_BASE_URL}/api/invoices`,

        // Coding
        CODING: `${API_BASE_URL}/api/coding`,

        // Dashboard
        DASHBOARD: {
            SUMMARY: `${API_BASE_URL}/api/dashboard/summary`,
            AGING: `${API_BASE_URL}/api/dashboard/aging`,
            STATUS_BREAKDOWN: `${API_BASE_URL}/api/dashboard/status_breakdown`,
            VENDORS: `${API_BASE_URL}/api/dashboard/vendors`,
            TOP_VENDORS: `${API_BASE_URL}/api/dashboard/top_vendors`,
            PAYMENTS: `${API_BASE_URL}/api/dashboard/payments`,
        }
    }
};

export default API_CONFIG;
