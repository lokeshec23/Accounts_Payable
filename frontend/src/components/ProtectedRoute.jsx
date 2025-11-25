import React from 'react';
import { Navigate } from 'react-router-dom';
import { authService } from '../services/auth';

const ProtectedRoute = ({ children }) => {
    const isAuthenticated = authService.isAuthenticated();

    return isAuthenticated ? children : <Navigate to="/" replace />;
};

export default ProtectedRoute;
