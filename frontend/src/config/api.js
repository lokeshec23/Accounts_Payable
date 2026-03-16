// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8014';

export const API_CONFIG = {
    BASE_URL: `${API_BASE_URL}/api`,
    ENDPOINTS: {
        LOGIN: "/auth/login",
        REGISTER: "/auth/register",

        INVOICES: "/invoices",
        CODING: "/coding",

        DASHBOARD: {
            SUMMARY: "/dashboard/summary",
            AGING: "/dashboard/aging",
            STATUS_BREAKDOWN: "/dashboard/status_breakdown",
            VENDORS: "/dashboard/vendors",
            TOP_VENDORS: "/dashboard/top_vendors",
            PAYMENTS: "/dashboard/payments",
        }
    }
};

export default API_CONFIG;