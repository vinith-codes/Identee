import { lazy, Suspense } from "react";
// App.jsx
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
  useSearchParams,
} from "react-router-dom";

import LoginPage from "./pages/LoginPage";
import Navbar from "./components/Navbar";
import AdminLayout from "./layouts/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminHome from "./pages/admin/AdminHome";
import CustomizableListPage from "./pages/admin/CustomizableListPage";
import GarmentSetupWizard from "./pages/admin/GarmentSetupWizard";
import ProductWizard from "./pages/admin/readymade/ProductWizard";
import ProductsPage from "./pages/admin/readymade/ProductsPage";
import OfferBannerPage from "./pages/admin/OfferBannerPage";
import VideoBannerPage from "./pages/admin/VideoBannerPage";
import CategoryBannerPage from "./pages/admin/CategoryBannerPage";
import CategoriesPage from "./pages/admin/CategoriesPage";
import Home from "./pages/Home";
import CategoryProductsPage from "./pages/CategoryProductsPage";
import SingleProductPage from "./pages/SingleProductPage";
// The design studio (3D + editor libraries) loads only when it is opened.
const StudioRoute = lazy(() => import("./studio/StudioRoute"));
import AdminUsersPage from "./pages/admin/AdminUserPage";
import AdminEditUserPage from "./pages/admin/AdminEditUserPage";
import AdminUserDetailsPage from "./pages/admin/AdminUserDetailsPage";
import BuyNowPage from "./pages/BuyNowPage";
import FavoritesPage from "./pages/FavoritesPage";
import CartPage from "./pages/CartPage";
import AllProductsPage from "./pages/AllProductsPage";
import Account from "./pages/Account";
import CustomizablePage from "./pages/CustomizablePage";
import ReadyMadePage from "./pages/ReadyMadePage";
import ChooseColorPage from "./pages/ChooseColorPage";
import AdminShippingPage from "./pages/admin/AdminShippingPage";
import OffersPage from "./pages/admin/OffersPage";
import SubscriptionPlansPage from "./pages/admin/SubscriptionPlansPage";
import SubscribersPage from "./pages/admin/SubscribersPage";

// ── NEW: Checkout flow ──────────────────────────────────────────────────
import CheckoutPage from "./pages/CheckoutPage";
import OrderSuccessPage from "./pages/OrderSuccessPage";
import MyOrdersPage from "./pages/MyOrderPage";
import MyDesignsPage from "./pages/MyDesignsPage";
// ──────────────────────────────────────────────────────────────────────────
import GarmentPhotosPage from "./pages/admin/GarmentPhotosPage";
import GarmentTypesPage from "./pages/admin/GarmentTypesPage";
import ArtCategoriesPage from "./pages/admin/ArtCategoriesPage";
import ArtDesignsPage from "./pages/admin/ArtDesignsPage";

import AdminInvoicesPage from "./pages/admin/AdminInvoicesPage";
import InvoicePreviewPage from "./pages/admin/InvoicePreviewPage";
import AdminOrdersPage from "./pages/admin/AdminOrdersPage";
import ProductBulkUploadPage from "./pages/admin/ProductBulkUploadPage";
import ArtBulkUploadPage from "./pages/admin/ArtBulkUploadPage";
// ✅ NEW: Review moderation admin page
import AdminReviewsPage from "./pages/admin/AdminReviewsPage";
// ✅ NEW: Settings module
import SettingsLayout from "./pages/admin/settings/SettingsLayout";
import AboutUs from "./pages/AboutUs";
import ContactUs from "./pages/ContactUs";

const OrdersPage = () => (
  <PlaceholderAdminPage
    title="Orders"
    desc="Wire your orders API + table here."
  />
);

const TransactionsPage = () => (
  <PlaceholderAdminPage
    title="Transactions"
    desc="Wire your transactions API + table here."
  />
);

const SellersPage = () => (
  <PlaceholderAdminPage
    title="Sellers"
    desc="Wire your sellers API + table here."
  />
);

// /customize/choose-product?category=x  →  /customizable?category=x
function LegacyChooseProduct() {
  const [params] = useSearchParams();
  const category = params.get("category");
  return <Navigate to={`/customizable${category ? `?category=${encodeURIComponent(category)}` : ""}`} replace />;
}

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
          fontFamily: "'Cormorant Garamond', serif",
        }}
      >
        {title}
      </h1>
      <p style={{ margin: "10px 0 0", fontSize: 14, color: "#8A877F" }}>
        {desc}
      </p>
    </div>
  );
}

const SellerDashboard = () => (
  <div
    className="min-h-screen flex items-center justify-center"
    style={{ background: "#0B0B0C", color: "#8A877F" }}
  >
    <p className="text-lg font-medium">
      📦 Seller Dashboard — wire your component here
    </p>
  </div>
);

const NotFound = () => (
  <div
    className="min-h-screen flex items-center justify-center"
    style={{ background: "#0B0B0C", color: "#8A877F" }}
  >
    <p className="text-lg">404 — Page not found</p>
  </div>
);
// ──────────────────────────────────────────────────────────────────────────

// ── Customer layout: Navbar + page content ──────────────────────────────
const CustomerLayout = () => (
  <>
    <Navbar />
    <Outlet />
  </>
);

// ── Auth helpers ──────────────────────────────────────────────────────────
const getUserInfo = () => {
  try {
    const raw = localStorage.getItem("userInfo");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // email OR phone users — the token is what matters
    if (parsed && parsed._id && parsed.token) return parsed;
    return null;
  } catch {
    return null;
  }
};

const AdminRoute = ({ children }) => {
  const user = getUserInfo();
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isAdmin) return <Navigate to="/" replace />;
  return children;
};

const SellerRoute = ({ children }) => {
  const user = getUserInfo();
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isSeller) return <Navigate to="/" replace />;
  return children;
};

// Guests only — already-logged-in users get bounced to their dashboard
const GuestRoute = ({ children }) => {
  const user = getUserInfo();
  if (!user) return children;
  if (user.isAdmin) return <Navigate to="/admin/dashboard" replace />;
  if (user.isSeller) return <Navigate to="/seller/dashboard" replace />;
  return <Navigate to="/" replace />;
};

// ✅ NEW: Logged-in customers only — checkout/order pages need an authenticated user
const PrivateRoute = ({ children }) => {
  const user = getUserInfo();
  const location = useLocation();
  // Remember where they were going; LoginPage sends them back after OTP.
  if (!user)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
};
// ──────────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Public: auth pages (only for guests) */}
        <Route
          path="/login"
          element={
            <GuestRoute>
              <LoginPage />
            </GuestRoute>
          }
        />
        {/* Login is OTP-only: sign-up and password reset happen on /login */}
        <Route path="/register" element={<Navigate to="/login" replace />} />
        <Route
          path="/forgot-password"
          element={<Navigate to="/login" replace />}
        />
        <Route
          path="/reset-password"
          element={<Navigate to="/login" replace />}
        />

        {/* Everything with the Navbar — Home is PUBLIC (no login required) */}
        {/* The 3D Design Room is full-screen (its own top bar); falls back to the flat studio */}
        <Route
          path="/customize/:type"
          element={
            <Suspense fallback={<div style={{ minHeight: "60vh", display: "grid", placeItems: "center", color: "#7A7062" }}>Opening the design room…</div>}>
              <StudioRoute />
            </Suspense>
          }
        />
        <Route element={<CustomerLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/about-us" element={<AboutUs />} />
          <Route path="/contact-us" element={<ContactUs />} />
          <Route
            path="/category/:categoryName"
            element={<CategoryProductsPage />}
          />
          <Route path="/customizable" element={<CustomizablePage />} />
          <Route path="/ready-made" element={<ReadyMadePage />} />
          {/* old address of the customizable list */}
          <Route path="/customize/choose-product" element={<LegacyChooseProduct />} />
          <Route
            path="/customize/choose-color/:type"
            element={<ChooseColorPage />}
          />
          <Route path="/product/:id" element={<SingleProductPage />} />
          <Route path="/buy-now/:id" element={<BuyNowPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/products" element={<AllProductsPage />} />
          <Route path="/account" element={<Account />} />
          <Route path="/cart" element={<CartPage />} />

          {/* ✅ NEW: Checkout flow — must be logged in */}
          <Route
            path="/checkout"
            element={
              <PrivateRoute>
                <CheckoutPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/order-success/:id"
            element={
              <PrivateRoute>
                <OrderSuccessPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/orders"
            element={
              <PrivateRoute>
                <MyOrdersPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/my-designs"
            element={
              <PrivateRoute>
                <MyDesignsPage />
              </PrivateRoute>
            }
          />
        </Route>

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
          <Route
            path="/admin/bulk-upload"
            element={<ProductBulkUploadPage />}
          />
          <Route
            path="/admin/art-bulk-upload"
            element={<ArtBulkUploadPage />}
          />
          <Route path="invoices" element={<AdminInvoicesPage />} />
          <Route path="invoices/:orderId" element={<InvoicePreviewPage />} />
          <Route
            path="/admin/subscriptions"
            element={<SubscriptionPlansPage />}
          />
          <Route path="/admin/subscribers" element={<SubscribersPage />} />
          {/* ✅ NEW: Review moderation */}
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

        {/* Fallback */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}
