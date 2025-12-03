import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ConfigProvider, message } from 'antd';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import InvoicePage from './pages/InvoicePage';
import InvoiceReviewPage from './pages/InvoiceReviewPage';
import CodingPage from './pages/CodingPage';
import CodingReviewPage from './pages/CodingReviewPage';
import ApprovalsPage from './pages/ApprovalsPage';
import MasterDataPage from './pages/MasterDataPage';
import SettingsPage from './pages/SettingsPage';
import Header from './components/Header';
import ProtectedRoute from './components/ProtectedRoute';
import './styles/message-override.css';
import './styles/table-headers.css';

const AppContent = () => {
  const location = useLocation();
  const hideHeader = location.pathname === '/' || location.pathname === '/register';

  // Configure message to appear in bottom right
  useEffect(() => {
    message.config({
      top: undefined,
      bottom: 50,
      duration: 3,
      maxCount: 3,
      rtl: false,
      prefixCls: 'ant-message',
    });
  }, []);

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
        <Route path="/coding/review" element={<ProtectedRoute>
          <CodingReviewPage />
        </ProtectedRoute>} />
        <Route path="/approvals" element={<ProtectedRoute>
          <ApprovalsPage />
        </ProtectedRoute>} />
        <Route path="/master-data" element={<ProtectedRoute>
          <MasterDataPage />
        </ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute>
          <SettingsPage />
        </ProtectedRoute>} />
      </Routes>
    </>
  );
};

const App = () => {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1890ff',
        },
      }}
    >
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </ConfigProvider>
  );
};

export default App;