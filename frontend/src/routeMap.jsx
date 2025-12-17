import DashboardPage from './pages/DashboardPage';
import InvoicePage from './pages/InvoicePage';
import InvoiceReviewPage from './pages/InvoiceReviewPage';
import CodingPage from './pages/CodingPage';
import CodingReviewPage from './pages/CodingReviewPage';
import ApprovalsPage from './pages/ApprovalsPage';
import MasterDataPage from './pages/MasterDataPage';
import SettingsPage from './pages/SettingsPage';
import AdminPage from './pages/AdminPage';


export const routeMap = {
  "/dashboard": <DashboardPage />,
  "/invoice": <InvoicePage />,
  "/coding": <CodingPage />,
  "/approvals": <ApprovalsPage />,
  "/master-data": <MasterDataPage />,
  "/settings": <SettingsPage />,
  "/admin": <AdminPage />,
};

