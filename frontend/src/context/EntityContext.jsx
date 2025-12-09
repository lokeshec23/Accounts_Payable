import React, { createContext, useState, useContext, useEffect } from 'react';

const EntityContext = createContext();

export const EntityProvider = ({ children }) => {
    // Default to 'Consolidated Analytics Inc' if nothing in localStorage
    const [entity, setEntity] = useState(() => {
        return localStorage.getItem('selected_entity') || 'Consolidated Analytics Inc';
    });

    useEffect(() => {
        localStorage.setItem('selected_entity', entity);
    }, [entity]);

    return (
        <EntityContext.Provider value={{ entity, setEntity }}>
            {children}
        </EntityContext.Provider>
    );
};

export const useEntity = () => {
    const context = useContext(EntityContext);
    if (!context) {
        throw new Error('useEntity must be used within an EntityProvider');
    }
    return context;
};
