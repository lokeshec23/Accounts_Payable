import { Suspense, lazy } from 'react';
import Loader from './components/Loader';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const InvoicePage = lazy(() => import('./pages/InvoicePage'));
const InvoiceReviewPage = lazy(() => import('./pages/InvoiceReviewPage'));
const CodingPage = lazy(() => import('./pages/CodingPage'));
const CodingReviewPage = lazy(() => import('./pages/CodingReviewPage'));
const ApprovalsPage = lazy(() => import('./pages/ApprovalsPage'));
const MasterDataPage = lazy(() => import('./pages/MasterDataPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));


export const routeMap = {
  "/dashboard": <Suspense fallback={<Loader />}> <DashboardPage /> </Suspense>,
  "/invoice": <Suspense fallback={<Loader />}> <InvoicePage /> </Suspense>,
  "/coding": <Suspense fallback={<Loader />}> <CodingPage /> </Suspense>,
  "/approvals": <Suspense fallback={<Loader />}> <ApprovalsPage /> </Suspense>,
  "/master-data": <Suspense fallback={<Loader />}> <MasterDataPage /> </Suspense>,
  "/settings": <Suspense fallback={<Loader />}> <SettingsPage /> </Suspense>,
  "/admin": <Suspense fallback={<Loader />}> <AdminPage /> </Suspense>,
};

