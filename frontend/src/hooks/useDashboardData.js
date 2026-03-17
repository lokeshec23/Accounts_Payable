import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import API_CONFIG from '../config/api';

export const useDashboardData = () => {
    const [data, setData] = useState({
        summary: null,
        aging: null,
        statusBreakdown: null,
        vendorData: null,
        topVendors: [],
        payments: null,
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [
                summaryRes,
                agingRes,
                statusRes,
                vendorsRes,
                topRes,
                paymentsRes,
            ] = await Promise.all([
                api.get(API_CONFIG.ENDPOINTS.DASHBOARD.SUMMARY),
                api.get(API_CONFIG.ENDPOINTS.DASHBOARD.AGING),
                api.get(API_CONFIG.ENDPOINTS.DASHBOARD.STATUS_BREAKDOWN),
                api.get(API_CONFIG.ENDPOINTS.DASHBOARD.VENDORS),
                api.get(API_CONFIG.ENDPOINTS.DASHBOARD.TOP_VENDORS),
                api.get(API_CONFIG.ENDPOINTS.DASHBOARD.PAYMENTS),
            ]);

            setData({
                summary: summaryRes.data,
                aging: agingRes.data,
                statusBreakdown: statusRes.data,
                vendorData: vendorsRes.data,
                topVendors: topRes.data,
                payments: paymentsRes.data,
            });
        } catch (err) {
            console.error("Dashboard data fetch error:", err);
            setError(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    return { ...data, loading, error, refresh: loadData };
};
