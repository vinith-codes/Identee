// apps/adminRoutes.jsx — the team's pages (admin.identee.co.in): /admin/* and /seller/*.
// Used by the admin website (apps/AdminApp.jsx) and by the both-together website on the laptop (App.jsx), so a page
// is added in one place only. adminRoutes() returns <Route> elements to put inside <Routes>.
/* eslint-disable react-refresh/only-export-components -- a list of pages, not a page: editing it reloads the page in dev */
import { lazy } from "react";
import { Route, Navigate } from "react-router-dom";
import { AdminRoute, SellerRoute } from "./common";

const AdminLayout = lazy(() => import("../layouts/AdminLayout"));
const AdminDashboard = lazy(() => import("../pages/admin/AdminDashboard"));
const AdminHome = lazy(() => import("../pages/admin/AdminHome"));
const CustomizableListPage = lazy(() => import("../pages/admin/CustomizableListPage"));
const GarmentSetupWizard = lazy(() => import("../pages/admin/GarmentSetupWizard"));
const ProductWizard = lazy(() => import("../pages/admin/readymade/ProductWizard"));
const ProductsPage = lazy(() => import("../pages/admin/readymade/ProductsPage"));
const OfferBannerPage = lazy(() => import("../pages/admin/OfferBannerPage"));
const VideoBannerPage = lazy(() => import("../pages/admin/VideoBannerPage"));
const CategoryBannerPage = lazy(() => import("../pages/admin/CategoryBannerPage"));
const CategoriesPage = lazy(() => import("../pages/admin/CategoriesPage"));
const AdminUsersPage = lazy(() => import("../pages/admin/AdminUserPage"));
const AdminEditUserPage = lazy(() => import("../pages/admin/AdminEditUserPage"));
const AdminUserDetailsPage = lazy(() => import("../pages/admin/AdminUserDetailsPage"));
const AdminShippingPage = lazy(() => import("../pages/admin/AdminShippingPage"));
const OffersPage = lazy(() => import("../pages/admin/OffersPage"));
const SubscriptionPlansPage = lazy(() => import("../pages/admin/SubscriptionPlansPage"));
const SubscribersPage = lazy(() => import("../pages/admin/SubscribersPage"));
const GarmentPhotosPage = lazy(() => import("../pages/admin/GarmentPhotosPage"));
const GarmentTypesPage = lazy(() => import("../pages/admin/GarmentTypesPage"));
const ArtCategoriesPage = lazy(() => import("../pages/admin/ArtCategoriesPage"));
const ArtDesignsPage = lazy(() => import("../pages/admin/ArtDesignsPage"));
const AdminInvoicesPage = lazy(() => import("../pages/admin/AdminInvoicesPage"));
const PrintSheetsPage = lazy(() => import("../pages/admin/PrintSheetsPage"));
const InvoicePreviewPage = lazy(() => import("../pages/admin/InvoicePreviewPage"));
const AdminOrdersPage = lazy(() => import("../pages/admin/AdminOrdersPage"));
const ProductBulkUploadPage = lazy(() => import("../pages/admin/ProductBulkUploadPage"));
const ArtBulkUploadPage = lazy(() => import("../pages/admin/ArtBulkUploadPage"));
// Review moderation
const AdminReviewsPage = lazy(() => import("../pages/admin/AdminReviewsPage"));
// Settings module
const SettingsLayout = lazy(() => import("../pages/admin/settings/SettingsLayout"));

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
        <Route path="garment-types" element={<GarmentTypesPage />} />
        <Route path="garment-photos" element={<GarmentPhotosPage />} />
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
        <Route path="invoices/:orderId" element={<InvoicePreviewPage />} />
        <Route path="/admin/subscriptions" element={<SubscriptionPlansPage />} />
        <Route path="/admin/subscribers" element={<SubscribersPage />} />
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
