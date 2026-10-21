// apps/shopRoutes.jsx — the shop's pages (identee.co.in): the customer side of IDENTEE.
// Used by the shop website (apps/ShopApp.jsx) and by the both-together website on the laptop (App.jsx), so a page
// is added in one place only. shopRoutes() returns <Route> elements to put inside <Routes>.
/* eslint-disable react-refresh/only-export-components -- a list of pages, not a page: editing it reloads the page in dev */
import { lazy, Suspense, useEffect } from "react";
import { Route, Navigate, Link, Outlet, useSearchParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import SiteFooter from "../components/SiteFooter";
import MobileTabBar from "../components/MobileTabBar";
import ScrollToTop from "../components/ScrollToTop";
import Home from "../pages/Home";
import { PageLoading, PrivateRoute } from "./common";

const LoginPage = lazy(() => import("../pages/LoginPage"));
const CategoryProductsPage = lazy(() => import("../pages/CategoryProductsPage"));
const SingleProductPage = lazy(() => import("../pages/SingleProductPage"));
// The design studio (3D + editor libraries) loads only when it is opened.
// (the design room is big — about 360 KB to download — so the shop pages fetch it in the background, below:
// tapping "Start designing" then opens it at once instead of leaving the old page on screen while it downloads)
const loadStudio = () => import("../studio/StudioRoute");
const StudioRoute = lazy(loadStudio);
const BuyNowPage = lazy(() => import("../pages/BuyNowPage"));
const FavoritesPage = lazy(() => import("../pages/FavoritesPage"));
const CartPage = lazy(() => import("../pages/CartPage"));
const Account = lazy(() => import("../pages/Account"));
const CustomizablePage = lazy(() => import("../pages/CustomizablePage"));
const ReadyMadePage = lazy(() => import("../pages/ReadyMadePage"));
const TeamOrdersPage = lazy(() => import("../pages/TeamOrdersPage"));
const ChooseColorPage = lazy(() => import("../pages/ChooseColorPage"));
const CheckoutPage = lazy(() => import("../pages/CheckoutPage"));
const OrderSuccessPage = lazy(() => import("../pages/OrderSuccessPage"));
const MyOrdersPage = lazy(() => import("../pages/MyOrderPage"));
const MyDesignsPage = lazy(() => import("../pages/MyDesignsPage"));
const AboutUs = lazy(() => import("../pages/AboutUs"));
const PolicyPage = lazy(() => import("../pages/PolicyPage"));
const ContactUs = lazy(() => import("../pages/ContactUs"));

// On the home page, the light customer pages download quietly in the background, so the first tap is instant.
// (Only small pages: the Design Room downloads when it is opened.)
const preloadCustomerPages = () => {
  const go = () => {
    import("../pages/CustomizablePage");
    import("../pages/ChooseColorPage");
    import("../pages/TeamOrdersPage");
    import("../pages/CartPage");
    import("../pages/LoginPage");
  };
  if ("requestIdleCallback" in window) window.requestIdleCallback(go, { timeout: 4000 });
  else setTimeout(go, 2500);
};
if (typeof window !== "undefined") {
  if (document.readyState === "complete") preloadCustomerPages();
  else window.addEventListener("load", preloadCustomerPages, { once: true });
}

// /customize/choose-product?category=x  →  /customizable?category=x
function LegacyChooseProduct() {
  const [params] = useSearchParams();
  const category = params.get("category");
  return <Navigate to={`/customizable${category ? `?category=${encodeURIComponent(category)}` : ""}`} replace />;
}

// old "All products" address → the ready-made categories
function ToReadyMade() {
  return <Navigate to="/ready-made" replace />;
}

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

/**
 * The shop's routes.
 * @param Guest  wraps the login page: what a person who is already logged in sees there (it differs per website)
 */
export function shopRoutes({ Guest }) {
  return (
    <>
      {/* Public: auth pages (only for guests) */}
      <Route
        path="/login"
        element={
          <Guest>
            <LoginPage />
          </Guest>
        }
      />
      {/* Login is OTP-only: sign-up and password reset happen on /login */}
      <Route path="/register" element={<Navigate to="/login" replace />} />
      <Route path="/forgot-password" element={<Navigate to="/login" replace />} />
      <Route path="/reset-password" element={<Navigate to="/login" replace />} />

      {/* The 3D Design Room is full-screen (its own top bar); falls back to the flat studio */}
      <Route
        path="/customize/:type"
        element={
          <Suspense fallback={<div style={{ minHeight: "60vh", display: "grid", placeItems: "center", color: "#7A7062" }}>Opening the design room…</div>}>
            <StudioRoute />
          </Suspense>
        }
      />
      {/* Everything with the Navbar — Home is PUBLIC (no login required) */}
      <Route element={<CustomerLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/about-us" element={<AboutUs />} />
        {/* the policy pages (Razorpay checks these before live payments) */}
        <Route path="/terms" element={<PolicyPage />} />
        <Route path="/privacy-policy" element={<PolicyPage />} />
        <Route path="/refund-policy" element={<PolicyPage />} />
        <Route path="/shipping-policy" element={<PolicyPage />} />
        <Route path="/contact-us" element={<ContactUs />} />
        <Route path="/category/:categoryName" element={<CategoryProductsPage />} />
        <Route path="/customizable" element={<CustomizablePage />} />
        <Route path="/ready-made" element={<ReadyMadePage />} />
        <Route path="/team-orders" element={<TeamOrdersPage />} />
        {/* old address of the customizable list */}
        <Route path="/customize/choose-product" element={<LegacyChooseProduct />} />
        <Route path="/customize/choose-color/:type" element={<ChooseColorPage />} />
        <Route path="/product/:id" element={<SingleProductPage />} />
        <Route path="/buy-now/:id" element={<BuyNowPage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        {/* old "All products" address → the ready-made categories */}
        <Route path="/products" element={<ToReadyMade />} />
        <Route path="/account" element={<Account />} />
        <Route path="/cart" element={<CartPage />} />

        {/* Checkout flow — must be logged in */}
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
    </>
  );
}
