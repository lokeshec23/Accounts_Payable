import React from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import InvoicePage from './pages/InvoicePage';
import InvoiceReviewPage from './pages/InvoiceReviewPage';
import CodingPage from './pages/CodingPage';
import ApprovalsPage from './pages/ApprovalsPage';
import Header from './components/Header';
import ProtectedRoute from './components/ProtectedRoute';

const AppContent = () => {
  const location = useLocation();
  const hideHeader = location.pathname === '/' ||
    location.pathname === '/register' ||
    location.pathname === '/invoice/review';

  return (
    <>
      {!hideHeader && <Header />}
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/dashboard" element={<ProtectedRoute>
          <DashboardPage />
        </ProtectedRoute>} />
        <Route path="/invoice" element={<ProtectedRoute>
          <InvoicePage />
        </ProtectedRoute>} />
        <Route path="/invoice/review" element={<ProtectedRoute>
          <InvoiceReviewPage />
        </ProtectedRoute>} />
        <Route path="/coding" element={<ProtectedRoute>
          <CodingPage />
        </ProtectedRoute>} />
        <Route path="/approvals" element={<ProtectedRoute>
          <ApprovalsPage />
        </ProtectedRoute>} />
      </Routes>
    </>
  );
};

const App = () => {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
};

export default App;