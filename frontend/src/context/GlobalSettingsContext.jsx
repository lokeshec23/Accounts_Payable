import React, { createContext, useContext, useState, useEffect } from "react";
import { settingsService } from "../services/api";
import { routeMap } from "../routeMap";

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

    const formatLabel = (path) => {
        // /invoice/review -> Invoice Review
        return path
            .replace(/^\//, '')
            .split('/')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    };

    const syncRoutesWithSettings = async (currentSettings) => {
        if (!currentSettings || !currentSettings.navigation) return currentSettings;

        const existingPaths = new Set(currentSettings.navigation.map(n => n.path));
        const newRoutes = [];

        Object.keys(routeMap).forEach(path => {
            if (!existingPaths.has(path)) {
                newRoutes.push({
                    label: formatLabel(path),
                    path: path,
                    roles: ['admin'] // Default visibility
                });
            }
        });

        if (newRoutes.length > 0) {
            console.log("Syncing new routes to Global Settings:", newRoutes);
            const updatedSettings = {
                ...currentSettings,
                navigation: [...currentSettings.navigation, ...newRoutes]
            };
            try {
                await settingsService.updateSettings(updatedSettings);
                return updatedSettings;
            } catch (error) {
                console.error("Failed to sync routes:", error);
                return currentSettings;
            }
        }

        return currentSettings;
    };

    const fetchSettings = async () => {
        try {
            const data = await settingsService.getSettings();
            
            // Auto-sync routes from codebase to settings
            const syncedSettings = await syncRoutesWithSettings(data);
            
            setSettings(syncedSettings);
        } catch (error) {
            console.error("Failed to fetch global settings:", error);
            // Fallback to defaults is handled by initial state
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
