import { Suspense, lazy } from 'react';
import { DashboardSkeleton, TableSkeleton, FormSkeleton, ReviewPageSkeleton } from './components/SkeletonLoader';

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
  "/dashboard": <Suspense fallback={<DashboardSkeleton />}> <DashboardPage /> </Suspense>,
  "/invoice": <Suspense fallback={<FormSkeleton />}> <InvoicePage /> </Suspense>,
  "/invoices": <Suspense fallback={<FormSkeleton />}> <InvoicePage /> </Suspense>,
  "/coding": <Suspense fallback={<TableSkeleton />}> <CodingPage /> </Suspense>,
  "/approvals": <Suspense fallback={<TableSkeleton />}> <ApprovalsPage /> </Suspense>,
  "/master-data": <Suspense fallback={<TableSkeleton />}> <MasterDataPage /> </Suspense>,
  "/settings": <Suspense fallback={<TableSkeleton />}> <SettingsPage /> </Suspense>,
  "/admin": <Suspense fallback={<TableSkeleton />}> <AdminPage /> </Suspense>,
  "/coding/review": <Suspense fallback={<FormSkeleton />}> <CodingReviewPage /> </Suspense>,
  "/invoice/review": <Suspense fallback={<ReviewPageSkeleton />}> <InvoiceReviewPage /> </Suspense>,
};

