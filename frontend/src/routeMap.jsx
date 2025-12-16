import DashboardPage from './pages/DashboardPage';
import InvoicePage from './pages/InvoicePage';
import InvoiceReviewPage from './pages/InvoiceReviewPage';
import CodingPage from './pages/CodingPage';
import CodingReviewPage from './pages/CodingReviewPage';
import ApprovalsPage from './pages/ApprovalsPage';
import MasterDataPage from './pages/MasterDataPage';
import SettingsPage from './pages/SettingsPage';
import AdminPage from './pages/AdminPage';
import DesignSystemPage from './pages/DesignSystemPage';
import SelectEntity from './pages/SelectEntity';

export const routeMap = {
    '/dashboard': <DashboardPage />,
    '/invoice': <InvoicePage />,
    '/invoice/review': <InvoiceReviewPage />,
    '/coding': <CodingPage />,
    '/coding/review': <CodingReviewPage />,
    '/approvals': <ApprovalsPage />,
    '/master-data': <MasterDataPage />,
    '/settings': <SettingsPage />,
    '/admin': <AdminPage />,
    '/design-system': <DesignSystemPage />,
    '/select-entity': <SelectEntity />
};
