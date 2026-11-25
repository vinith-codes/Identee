// apps/common.jsx — what the shop and the admin websites both use: the loading dot and the login checks.
/* eslint-disable react-refresh/only-export-components -- a list of pages, not a page: editing it reloads the page in dev */
import { lazy } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { APP } from "../utils/siteUrls";

// a page that loads when it is opened, and that mends itself when its download fails (24 Nov 2026 — the owner: "in the
// admin if i click the design studio the endpoint is changed ... but the page is not changed. If i click reload it is
// changing"): a broken download (a network blip, or a tab opened before a new release) reloads the page once — the
// same as pressing Reload — instead of leaving the old page on screen. A second failure in a row shows the error.
const RELOADED = "identee-page-reload";
export const lazyPage = (load) =>
  lazy(() =>
    load().then(
      (page) => {
        try {
          sessionStorage.removeItem(RELOADED);
        } catch {
          /* private mode: nothing kept */
        }
        return page;
      },
      (err) => {
        const again = (() => {
          try {
            if (sessionStorage.getItem(RELOADED) === "1") return true;
            sessionStorage.setItem(RELOADED, "1");
            return false;
          } catch {
            return true; // (can't remember: don't risk reloading for ever)
          }
        })();
        if (again) throw err;
        window.location.reload();
        return new Promise(() => {}); // (the page is going away)
      },
    ),
  );

// While a page downloads (each page loads only when it is opened — the first download stays small for phones)
export const PageLoading = () => (
  <div role="status" aria-label="Loading" style={{ minHeight: "70vh", display: "grid", placeItems: "center" }}>
    <span className="page-loading-dot" />
  </div>
);

// ── Auth helpers ──────────────────────────────────────────────────────────
export const getUserInfo = () => {
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

// where a logged-in person without the access goes: the admin website has nothing else to show them
const NOT_ALLOWED = APP === "admin" ? "/no-access" : "/";

export const AdminRoute = ({ children }) => {
  const user = getUserInfo();
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isAdmin) return <Navigate to={NOT_ALLOWED} replace />;
  return children;
};

export const SellerRoute = ({ children }) => {
  const user = getUserInfo();
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isSeller) return <Navigate to={NOT_ALLOWED} replace />;
  return children;
};

// Logged-in customers only — checkout/order pages need an authenticated user
export const PrivateRoute = ({ children }) => {
  const user = getUserInfo();
  const location = useLocation();
  // Remember where they were going; LoginPage sends them back after OTP.
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
};
