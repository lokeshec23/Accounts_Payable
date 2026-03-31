// import { Suspense, lazy, useEffect, useState } from 'react';
// import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
// import { ConfigProvider, message } from 'antd';
// import Header from './components/Header';
// import { EntityProvider } from './context/EntityContext';
// import { GlobalSettingsProvider } from './context/GlobalSettingsContext';
// import ProtectedRoute from './components/ProtectedRoute';
// import { FormSkeleton } from './components/SkeletonLoader';
// import './styles/message-override.css';
// import './styles/table-headers.css';
// import './styles/global-table-styles.css';
// import { routeMap } from './routeMap';

// const LoginPage = lazy(() => import('./pages/LoginPage'));
// const RegisterPage = lazy(() => import('./pages/RegisterPage'));
// const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
// const DesignSystemPage = lazy(() => import('./pages/DesignSystemPage'));
// const SelectEntity = lazy(() => import('./pages/SelectEntity'));

// const AppContent = () => {
//   const location = useLocation();
//   const hideHeader = location.pathname === '/' || location.pathname === '/register' || location.pathname === '/select-entity' || location.pathname === '/forgot-password';
//   const [isHeaderShow, setIsHeaderShow] = useState(false);

//   useEffect(() => {
//     setIsHeaderShow(!hideHeader);
//   }, [hideHeader]);

//   // Configure message to appear in bottom right
//   useEffect(() => {
//     message.config({
//       top: undefined,
//       bottom: 50,
//       duration: 3,
//       maxCount: 3,
//       rtl: false,
//       prefixCls: 'ant-message',
//     });
//   }, []);

//   return (
//     <>
//       {isHeaderShow && <Header />}
//       <Suspense fallback={<FormSkeleton />}>
//         <Routes>
//           <Route path="/" element={<LoginPage />} />
//           <Route path="/register" element={<RegisterPage />} />
//           <Route path="/forgot-password" element={<ForgotPasswordPage />} />
//           <Route
//             path="/select-entity"
//             element={
//               <Suspense fallback={<FormSkeleton />}>
//                 <ProtectedRoute>
//                   <SelectEntity />
//                 </ProtectedRoute>
//               </Suspense>
//             }
//           />
//           <Route
//             path="/design-system"
//             element={
//               <Suspense fallback={<FormSkeleton />}>
//                 <ProtectedRoute>
//                   <DesignSystemPage />
//                 </ProtectedRoute>
//               </Suspense>
//             }
//           />


//           {/* Dynamic Routes from routeMap - Drivers of the application */}
//           {Object.entries(routeMap).map(([path, component]) => (
//             <Route
//               key={path}
//               path={path}
//               element={
//                 <ProtectedRoute>
//                   {component}
//                 </ProtectedRoute>
//               }
//             />
//           ))}

//         </Routes>
//       </Suspense>
//     </>
//   );
// };

// const App = () => {
//   return (
//     <ConfigProvider
//       theme={{
//         token: {
//           colorPrimary: '#1890ff',
//         },
//       }}
//     >
//       <EntityProvider>
//         <GlobalSettingsProvider>
//           <BrowserRouter>
//             <AppContent />
//           </BrowserRouter>
//         </GlobalSettingsProvider>
//       </EntityProvider>
//     </ConfigProvider>
//   );
// };

// export default App;



import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Outlet, Navigate } from 'react-router-dom';
// import { ConfigProvider, message } from 'antd';


import { ConfigProvider, message, theme, App as AntdApp } from 'antd';
import { ThemeProvider, useTheme } from './context/ThemeContext';
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

/** No Header here */
const AuthLayout = () => (
  <Suspense fallback={<FormSkeleton />}>
    <Outlet />
  </Suspense>
);

/** Header always present here */
const MainLayout = () => (
  <>
    <Header />
    <Suspense fallback={<FormSkeleton />}>
      <Outlet />
    </Suspense>
  </>
);

const AppRoutes = () => {
  // Configure antd message once
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
    <Routes>
      {/* Auth routes (NO header) */}
      <Route element={<AuthLayout />}>
        <Route path="/" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      </Route>

      {/* Protected routes (WITH header) */}
      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/select-entity" element={<SelectEntity />} />
        <Route path="/design-system" element={<DesignSystemPage />} />

        {/* Dynamic Routes from routeMap */}
        {Object.entries(routeMap).map(([path, component]) => (
          <Route key={path} path={path} element={component} />
        ))}
      </Route>

      {/* Optional fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

const AppConfigProvider = ({ children }) => {
  const { isDarkMode } = useTheme();

  return (
    <ConfigProvider
      theme={{
        algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1890ff',
        },
      }}
    >
      <AntdApp>
        {children}
      </AntdApp>
    </ConfigProvider>
  );
};

const App = () => {
  return (
    <ThemeProvider>
      <AppConfigProvider>
        <EntityProvider>
          <GlobalSettingsProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </GlobalSettingsProvider>
        </EntityProvider>
      </AppConfigProvider>
    </ThemeProvider>
  );
};

export default App;