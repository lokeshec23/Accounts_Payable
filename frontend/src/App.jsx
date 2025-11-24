import React from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import InvoicePage from './pages/InvoicePage';
import CodingPage from './pages/CodingPage';
import ApprovalsPage from './pages/ApprovalsPage';
import Header from './components/Header';

const AppContent = () => {
  const location = useLocation();
  const hideHeader = location.pathname === '/' || location.pathname === '/register';

  return (
    <>
      {!hideHeader && <Header />}
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/invoice" element={<InvoicePage />} />
        <Route path="/coding" element={<CodingPage />} />
        <Route path="/approvals" element={<ApprovalsPage />} />
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