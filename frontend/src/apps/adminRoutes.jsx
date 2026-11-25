// apps/adminRoutes.jsx — the team's pages (admin.identee.co.in): /admin/* and /seller/*.
// Used by the admin website (apps/AdminApp.jsx) and by the both-together website on the laptop (App.jsx), so a page
// is added in one place only. adminRoutes() returns <Route> elements to put inside <Routes>.
/* eslint-disable react-refresh/only-export-components -- a list of pages, not a page: editing it reloads the page in dev */
import { Route, Navigate } from "react-router-dom";
import { AdminRoute, SellerRoute, lazyPage } from "./common";

const AdminLayout = lazyPage(() => import("../layouts/AdminLayout"));
const AdminDashboard = lazyPage(() => import("../pages/admin/AdminDashboard"));
const AdminHome = lazyPage(() => import("../pages/admin/AdminHome"));
const CustomizableListPage = lazyPage(() => import("../pages/admin/CustomizableListPage"));
const GarmentSetupWizard = lazyPage(() => import("../pages/admin/GarmentSetupWizard"));
const ProductWizard = lazyPage(() => import("../pages/admin/readymade/ProductWizard"));
const ProductsPage = lazyPage(() => import("../pages/admin/readymade/ProductsPage"));
const OfferBannerPage = lazyPage(() => import("../pages/admin/OfferBannerPage"));
const VideoBannerPage = lazyPage(() => import("../pages/admin/VideoBannerPage"));
const CategoryBannerPage = lazyPage(() => import("../pages/admin/CategoryBannerPage"));
const CategoriesPage = lazyPage(() => import("../pages/admin/CategoriesPage"));
const AdminUsersPage = lazyPage(() => import("../pages/admin/AdminUserPage"));
const AdminEditUserPage = lazyPage(() => import("../pages/admin/AdminEditUserPage"));
const AdminUserDetailsPage = lazyPage(() => import("../pages/admin/AdminUserDetailsPage"));
const AdminShippingPage = lazyPage(() => import("../pages/admin/AdminShippingPage"));
const OffersPage = lazyPage(() => import("../pages/admin/OffersPage"));
const SubscriptionPlansPage = lazyPage(() => import("../pages/admin/SubscriptionPlansPage"));
const SubscribersPage = lazyPage(() => import("../pages/admin/SubscribersPage"));
const WaitlistPage = lazyPage(() => import("../pages/admin/WaitlistPage"));
const ArtCategoriesPage = lazyPage(() => import("../pages/admin/ArtCategoriesPage"));
const ArtDesignsPage = lazyPage(() => import("../pages/admin/ArtDesignsPage"));
const AdminInvoicesPage = lazyPage(() => import("../pages/admin/AdminInvoicesPage"));
const PrintSheetsPage = lazyPage(() => import("../pages/admin/PrintSheetsPage"));
const InvoicePreviewPage = lazyPage(() => import("../pages/admin/InvoicePreviewPage"));
const AdminOrdersPage = lazyPage(() => import("../pages/admin/AdminOrdersPage"));
const ProductBulkUploadPage = lazyPage(() => import("../pages/admin/ProductBulkUploadPage"));
const ArtBulkUploadPage = lazyPage(() => import("../pages/admin/ArtBulkUploadPage"));
// (the Collection maker page, pages/admin/CollectionMakerPage.jsx, is parked since 25 Oct 2026 — not routed, not built)
// Shop your IDENTEE: the Studio — one tee designed by hand, AI pictures on request (25 Oct 2026)
const StudioPage = lazyPage(() => import("../pages/admin/studio/StudioPage"));
const TestModePage = lazyPage(() => import("../pages/admin/TestModePage")); // Design Studio → Test as a customer (5 Nov 2026)
const DesignHelpPage = lazyPage(() => import("../pages/admin/DesignHelpPage")); // Design Studio → Help requests (8 Nov 2026)
const TrendsPage = lazyPage(() => import("../pages/admin/TrendsPage")); // Design Studio → Trends (23 Nov 2026)
const ShopManagePage = lazyPage(() => import("../pages/admin/ShopManagePage")); // Shop your IDENTEE → Manage the shop (24 Nov 2026)
// Review moderation
const AdminReviewsPage = lazyPage(() => import("../pages/admin/AdminReviewsPage"));
// Settings module
const SettingsLayout = lazyPage(() => import("../pages/admin/settings/SettingsLayout"));

function PlaceholderAdminPage({ title, desc }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0B0B0C",
        color: "#F3EFE6",
        padding: "32px 40px",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#C9A24B",
        }}
      >
        Admin
      </p>
      <h1
        style={{
          margin: "4px 0 0",
          fontSize: 26,
          fontWeight: 600,
          fontFamily: "'Bricolage Grotesque', 'Helvetica Neue', Arial, sans-serif",
        }}
      >
        {title}
      </h1>
      <p style={{ margin: "10px 0 0", fontSize: 14, color: "#8A877F" }}>{desc}</p>
    </div>
  );
}

const TransactionsPage = () => <PlaceholderAdminPage title="Transactions" desc="Wire your transactions API + table here." />;
const SellersPage = () => <PlaceholderAdminPage title="Sellers" desc="Wire your sellers API + table here." />;

const SellerDashboard = () => (
  <div className="min-h-screen flex items-center justify-center" style={{ background: "#0B0B0C", color: "#8A877F" }}>
    <p className="text-lg font-medium">📦 Seller Dashboard — wire your component here</p>
  </div>
);

export function adminRoutes() {
  return (
    <>
      {/* Admin routes — AdminSidebar layout wraps every /admin/* page */}
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminLayout />
          </AdminRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AdminHome />} />
        {/* The old dashboard (charts) now lives under Home → "See sales report" */}
        <Route path="reports" element={<AdminDashboard />} />
        <Route path="settings" element={<SettingsLayout />} />
        <Route path="upload-product" element={<ProductWizard />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="products/:groupId/edit" element={<ProductWizard key="edit" />} />
        <Route path="offer-banner" element={<OfferBannerPage />} />
        <Route path="video-banner" element={<VideoBannerPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        {/* Legacy page, replaced by Categories — kept reachable by URL for now */}
        <Route path="category-banner" element={<CategoryBannerPage />} />
        <Route path="art-categories" element={<ArtCategoriesPage />} />
        <Route path="art-designs" element={<ArtDesignsPage />} />
        <Route path="customizable" element={<CustomizableListPage />} />
        <Route path="customizable/:key" element={<GarmentSetupWizard />} />
        <Route path="orders" element={<AdminOrdersPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="users/:id" element={<AdminUserDetailsPage />} />
        <Route path="users/:id/edit" element={<AdminEditUserPage />} />
        <Route path="sellers" element={<SellersPage />} />
        <Route path="shipping" element={<AdminShippingPage />} />
        <Route path="/admin/offers" element={<OffersPage />} />
        <Route path="/admin/bulk-upload" element={<ProductBulkUploadPage />} />
        <Route path="/admin/art-bulk-upload" element={<ArtBulkUploadPage />} />
        <Route path="invoices" element={<AdminInvoicesPage />} />
        <Route path="print-sheets" element={<PrintSheetsPage />} />
        <Route path="collection-maker" element={<Navigate to="/admin/studio" replace />} />
        <Route path="studio" element={<StudioPage />} />
        <Route path="studio/:id" element={<StudioPage />} />
        <Route path="test-mode" element={<TestModePage />} />
        <Route path="shop-manage" element={<ShopManagePage />} />
        <Route path="design-help" element={<DesignHelpPage />} />
        <Route path="trends" element={<TrendsPage />} />
        <Route path="invoices/:orderId" element={<InvoicePreviewPage />} />
        <Route path="/admin/subscriptions" element={<SubscriptionPlansPage />} />
        <Route path="/admin/subscribers" element={<SubscribersPage />} />
        <Route path="/admin/waitlist" element={<WaitlistPage />} />
        {/* Review moderation */}
        <Route path="reviews" element={<AdminReviewsPage />} />
      </Route>

      {/* Seller routes */}
      <Route
        path="/seller/dashboard"
        element={
          <SellerRoute>
            <SellerDashboard />
          </SellerRoute>
        }
      />
    </>
  );
}
