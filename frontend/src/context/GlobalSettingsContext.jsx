import React, { createContext, useContext, useState, useEffect } from "react";
import { settingsService } from "../services/api";

const GlobalSettingsContext = createContext();

export const useGlobalSettings = () => {
    const context = useContext(GlobalSettingsContext);
    if (!context) {
        throw new Error("useGlobalSettings must be used within a GlobalSettingsProvider");
    }
    return context;
};

export const GlobalSettingsProvider = ({ children }) => {
    const [settings, setSettings] = useState({
        roles: ["admin", "coder", "approver"],
        statuses: ["active", "pending", "rejected"],
        navigation: []
    });
    const [loading, setLoading] = useState(true);

    const fetchSettings = async () => {
        try {
            const data = await settingsService.getSettings();
            setSettings(data);
        } catch (error) {
            console.error("Failed to fetch global settings:", error);
            // Fallback to defaults is handled by initial state, but backend should return defaults
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    const updateSettings = async (newSettings) => {
        try {
            await settingsService.updateSettings(newSettings);
            setSettings(newSettings);
            return true;
        } catch (error) {
            console.error("Failed to update settings:", error);
            return false;
        }
    };

    return (
        <GlobalSettingsContext.Provider value={{ settings, loading, updateSettings, fetchSettings }}>
            {children}
        </GlobalSettingsContext.Provider>
    );
};
