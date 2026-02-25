import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ConfigProvider, message } from 'antd';
import Header from './components/Header';
import { EntityProvider } from './context/EntityContext';
import { GlobalSettingsProvider } from './context/GlobalSettingsContext';
import ProtectedRoute from './components/ProtectedRoute';
import { FormSkeleton } from './components/SkeletonLoader';
import './styles/message-override.css';
import './styles/table-headers.css';
import './styles/global-table-styles.css';
import { routeMap } from './routeMap';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const DesignSystemPage = lazy(() => import('./pages/DesignSystemPage'));
const SelectEntity = lazy(() => import('./pages/SelectEntity'));

const AppContent = () => {
  const location = useLocation();
  const hideHeader = location.pathname === '/' || location.pathname === '/register' || location.pathname === '/select-entity' || location.pathname === '/forgot-password';

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
      <Suspense fallback={<FormSkeleton />}>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route
            path="/select-entity"
            element={
              <Suspense fallback={<FormSkeleton />}>
                <ProtectedRoute>
                  <SelectEntity />
                </ProtectedRoute>
              </Suspense>
            }
          />
          <Route
            path="/design-system"
            element={
              <Suspense fallback={<FormSkeleton />}>
                <ProtectedRoute>
                  <DesignSystemPage />
                </ProtectedRoute>
              </Suspense>
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
      </Suspense>
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