import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ConfigProvider, message } from 'antd';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import Header from './components/Header';
import { EntityProvider } from './context/EntityContext';
import { GlobalSettingsProvider } from './context/GlobalSettingsContext';
import ProtectedRoute from './components/ProtectedRoute';
import './styles/message-override.css';
import './styles/table-headers.css';
import './styles/global-table-styles.css';
import { routeMap } from './routeMap';
import DesignSystemPage from './pages/DesignSystemPage';
import SelectEntity from './pages/SelectEntity';
import InvoiceReview from './pages/InvoiceReviewPage';
import CodingReview from './pages/CodingReviewPage';

const AppContent = () => {
  const location = useLocation();
  const hideHeader = location.pathname === '/' || location.pathname === '/register' || location.pathname === '/select-entity';

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
         <Route
    path="/select-entity"
    element={
      <ProtectedRoute>
        <SelectEntity />
      </ProtectedRoute>
    }
  />
   <Route
    path="/design-system"
    element={
      <ProtectedRoute>
        <DesignSystemPage />
      </ProtectedRoute>
    }
  />
   <Route
    path="/invoice/review"
    element={
      <ProtectedRoute>
        <InvoiceReview />
      </ProtectedRoute>
    }
  />
   <Route
    path="/coding/review"
    element={
      <ProtectedRoute>
        <CodingReview />
      </ProtectedRoute>
    }
  />
        
        {/* Dynamic Routes from routeMap - Drivers of the application */}
        {Object.entries(routeMap).map(([path, component]) => (
          <Route 
            key={path} 
            path={path} 
            element={
              <ProtectedRoute>
                {component}
              </ProtectedRoute>
            } 
          />
        ))}

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
      <EntityProvider>
        <GlobalSettingsProvider>
          <BrowserRouter>
            <AppContent />
          </BrowserRouter>
        </GlobalSettingsProvider>
      </EntityProvider>
    </ConfigProvider>
  );
};

export default App;