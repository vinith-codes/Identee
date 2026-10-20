import { lazy, Suspense, useEffect } from "react";
// App.jsx
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Link,
  Outlet,
  useLocation,
  useSearchParams,
} from "react-router-dom";

const LoginPage = lazy(() => import("./pages/LoginPage"));
import Navbar from "./components/Navbar";
import SiteFooter from "./components/SiteFooter";
const AdminLayout = lazy(() => import("./layouts/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminHome = lazy(() => import("./pages/admin/AdminHome"));
const CustomizableListPage = lazy(() => import("./pages/admin/CustomizableListPage"));
const GarmentSetupWizard = lazy(() => import("./pages/admin/GarmentSetupWizard"));
const ProductWizard = lazy(() => import("./pages/admin/readymade/ProductWizard"));
const ProductsPage = lazy(() => import("./pages/admin/readymade/ProductsPage"));
const OfferBannerPage = lazy(() => import("./pages/admin/OfferBannerPage"));
const VideoBannerPage = lazy(() => import("./pages/admin/VideoBannerPage"));
const CategoryBannerPage = lazy(() => import("./pages/admin/CategoryBannerPage"));
const CategoriesPage = lazy(() => import("./pages/admin/CategoriesPage"));
import Home from "./pages/Home";
const CategoryProductsPage = lazy(() => import("./pages/CategoryProductsPage"));
const SingleProductPage = lazy(() => import("./pages/SingleProductPage"));
// The design studio (3D + editor libraries) loads only when it is opened.
// (the design room is big — about 360 KB to download — so the shop pages fetch it in the background, below:
// tapping "Start designing" then opens it at once instead of leaving the old page on screen while it downloads)
const loadStudio = () => import("./studio/StudioRoute");
const StudioRoute = lazy(loadStudio);
const AdminUsersPage = lazy(() => import("./pages/admin/AdminUserPage"));
const AdminEditUserPage = lazy(() => import("./pages/admin/AdminEditUserPage"));
const AdminUserDetailsPage = lazy(() => import("./pages/admin/AdminUserDetailsPage"));
const BuyNowPage = lazy(() => import("./pages/BuyNowPage"));
const FavoritesPage = lazy(() => import("./pages/FavoritesPage"));
const CartPage = lazy(() => import("./pages/CartPage"));
const Account = lazy(() => import("./pages/Account"));
const CustomizablePage = lazy(() => import("./pages/CustomizablePage"));
const ReadyMadePage = lazy(() => import("./pages/ReadyMadePage"));
const TeamOrdersPage = lazy(() => import("./pages/TeamOrdersPage"));
import MobileTabBar from "./components/MobileTabBar";
import ScrollToTop from "./components/ScrollToTop";
import { BrandFavicon } from "./utils/brandLogo";
const ChooseColorPage = lazy(() => import("./pages/ChooseColorPage"));
const AdminShippingPage = lazy(() => import("./pages/admin/AdminShippingPage"));
const OffersPage = lazy(() => import("./pages/admin/OffersPage"));
const SubscriptionPlansPage = lazy(() => import("./pages/admin/SubscriptionPlansPage"));
const SubscribersPage = lazy(() => import("./pages/admin/SubscribersPage"));

// ── NEW: Checkout flow ──────────────────────────────────────────────────
const CheckoutPage = lazy(() => import("./pages/CheckoutPage"));
const OrderSuccessPage = lazy(() => import("./pages/OrderSuccessPage"));
const MyOrdersPage = lazy(() => import("./pages/MyOrderPage"));
const MyDesignsPage = lazy(() => import("./pages/MyDesignsPage"));
// ──────────────────────────────────────────────────────────────────────────
const GarmentPhotosPage = lazy(() => import("./pages/admin/GarmentPhotosPage"));
const GarmentTypesPage = lazy(() => import("./pages/admin/GarmentTypesPage"));
const ArtCategoriesPage = lazy(() => import("./pages/admin/ArtCategoriesPage"));
const ArtDesignsPage = lazy(() => import("./pages/admin/ArtDesignsPage"));

const AdminInvoicesPage = lazy(() => import("./pages/admin/AdminInvoicesPage"));
const PrintSheetsPage = lazy(() => import("./pages/admin/PrintSheetsPage"));
const InvoicePreviewPage = lazy(() => import("./pages/admin/InvoicePreviewPage"));
const AdminOrdersPage = lazy(() => import("./pages/admin/AdminOrdersPage"));
const ProductBulkUploadPage = lazy(() => import("./pages/admin/ProductBulkUploadPage"));
const ArtBulkUploadPage = lazy(() => import("./pages/admin/ArtBulkUploadPage"));
// ✅ NEW: Review moderation admin page
const AdminReviewsPage = lazy(() => import("./pages/admin/AdminReviewsPage"));
// ✅ NEW: Settings module
const SettingsLayout = lazy(() => import("./pages/admin/settings/SettingsLayout"));
const AboutUs = lazy(() => import("./pages/AboutUs"));
const PolicyPage = lazy(() => import("./pages/PolicyPage"));
const ContactUs = lazy(() => import("./pages/ContactUs"));

// While a page downloads (each page loads only when it is opened — the first download stays small for phones)
const PageLoading = () => (
  <div role="status" aria-label="Loading" style={{ minHeight: "70vh", display: "grid", placeItems: "center" }}>
    <span className="page-loading-dot" />
  </div>
);

// On the home page, the light customer pages download quietly in the background, so the first tap is instant.
// (Only small pages: the Design Room downloads when it is opened.)
const preloadCustomerPages = () => {
  const go = () => {
    import("./pages/CustomizablePage");
    import("./pages/ChooseColorPage");
    import("./pages/TeamOrdersPage");
    import("./pages/CartPage");
    import("./pages/LoginPage");
  };
  if ("requestIdleCallback" in window) window.requestIdleCallback(go, { timeout: 4000 });
  else setTimeout(go, 2500);
};
if (typeof window !== "undefined") {
  if (document.readyState === "complete") preloadCustomerPages();
  else window.addEventListener("load", preloadCustomerPages, { once: true });
}

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
          fontFamily: "'Bricolage Grotesque', 'Helvetica Neue', Arial, sans-serif",
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

// An address that doesn't exist: shown inside the shop's menu and footer, with a way on (never a dead end)
const NotFound = () => (
  <main style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: "56px 24px", background: "#FBF8F1", fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", color: "#15130F" }}>
    <div style={{ maxWidth: 460, textAlign: "center" }}>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.22em", color: "#9C7A22", textTransform: "uppercase" }}>Page not found</p>
      <h1 style={{ margin: "12px 0 0", fontFamily: "'Bricolage Grotesque', 'Helvetica Neue', Arial, sans-serif", fontWeight: 800, fontSize: "clamp(26px, 6vw, 36px)", lineHeight: 1.12, textWrap: "balance" }}>
        We can’t find that page
      </h1>
      <p style={{ margin: "12px 0 0", fontSize: 15, lineHeight: 1.6, color: "#6F6A60" }}>
        The link may be old or mistyped. Everything is still here — pick where to go next.
      </p>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 24 }}>
        <Link to="/" style={{ padding: "12px 22px", borderRadius: 999, background: "#15130F", color: "#fff", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>Go to the home page</Link>
        <Link to="/customizable" style={{ padding: "12px 22px", borderRadius: 999, border: "1.5px solid #15130F", color: "#15130F", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>Create your IDENTEE</Link>
      </div>
    </div>
  </main>
);
// ──────────────────────────────────────────────────────────────────────────

// ── Customer layout: Navbar + page content (+ the phones' bottom bar) ──────
// a few seconds after a shop page has loaded (and the phone is idle), the design room is fetched in the background
const usePreloadStudio = () => {
  useEffect(() => {
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1));
    const timer = setTimeout(() => idle(() => loadStudio().catch(() => {})), 2500);
    return () => clearTimeout(timer);
  }, []);
};

const CustomerLayout = () => {
  usePreloadStudio();
  return (
    <>
      <ScrollToTop />
      <Navbar />
      <Suspense fallback={<PageLoading />}>
        <Outlet />
      </Suspense>
      <SiteFooter />
      <MobileTabBar />
    </>
  );
};

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
      <BrandFavicon />
      <Suspense fallback={<PageLoading />}>
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
          {/* the policy pages (Razorpay checks these before live payments) */}
          <Route path="/terms" element={<PolicyPage />} />
          <Route path="/privacy-policy" element={<PolicyPage />} />
          <Route path="/refund-policy" element={<PolicyPage />} />
          <Route path="/shipping-policy" element={<PolicyPage />} />
          <Route path="/contact-us" element={<ContactUs />} />
          <Route
            path="/category/:categoryName"
            element={<CategoryProductsPage />}
          />
          <Route path="/customizable" element={<CustomizablePage />} />
          <Route path="/ready-made" element={<ReadyMadePage />} />
          <Route path="/team-orders" element={<TeamOrdersPage />} />
          {/* old address of the customizable list */}
          <Route path="/customize/choose-product" element={<LegacyChooseProduct />} />
          <Route
            path="/customize/choose-color/:type"
            element={<ChooseColorPage />}
          />
          <Route path="/product/:id" element={<SingleProductPage />} />
          <Route path="/buy-now/:id" element={<BuyNowPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          {/* old "All products" address → the ready-made categories */}
          <Route path="/products" element={<ToReadyMade />} />
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
          {/* any other address: "page not found", with the menu and footer */}
          <Route path="*" element={<NotFound />} />
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
          <Route path="print-sheets" element={<PrintSheetsPage />} />
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

      </Routes>
      </Suspense>
    </Router>
  );
}

// old "All products" address → the ready-made categories
function ToReadyMade() {
  return <Navigate to="/ready-made" replace />;
}
