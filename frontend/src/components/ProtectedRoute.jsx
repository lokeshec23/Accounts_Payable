import React from 'react';
import { Navigate } from 'react-router-dom';
import { authService } from '../services/auth';

const ProtectedRoute = ({ children }) => {
    const isAuthenticated = authService.isAuthenticated();

    if (!isAuthenticated) {
        console.log('User not authenticated, redirecting to login. Current path:', window.location.pathname);
    }

    return isAuthenticated ? children : <Navigate to="/" replace />;
};

export default ProtectedRoute;
