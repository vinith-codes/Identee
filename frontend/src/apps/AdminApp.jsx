// apps/AdminApp.jsx — the admin website (admin.identee.co.in, `npm run build:admin`): the team's pages only.
// It has its own login (a browser keeps logins per website): the team logs in here with the same email code.
// The shop's pages are a separate website (apps/ShopApp.jsx): none of their code is in this one.
import { lazy, Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { BrandFavicon } from "../utils/brandLogo";
import { shopHref } from "../utils/siteUrls";
import { logout } from "../redux/slices/authSlice";
import { PageLoading, getUserInfo } from "./common";
import { adminRoutes } from "./adminRoutes";

const LoginPage = lazy(() => import("../pages/LoginPage"));

// the login page is for people who aren't logged in: the team goes to its pages, a customer to "no access"
const TeamGuest = ({ children }) => {
  const user = getUserInfo();
  if (!user) return children;
  if (user.isAdmin) return <Navigate to="/admin/dashboard" replace />;
  if (user.isSeller) return <Navigate to="/seller/dashboard" replace />;
  return <Navigate to="/no-access" replace />;
};

// a logged-in customer (not on the team) who opened the admin website
function NoAccess() {
  const dispatch = useDispatch();
  const user = getUserInfo();
  if (!user) return <Navigate to="/login" replace />;
  if (user.isAdmin) return <Navigate to="/admin/dashboard" replace />;
  if (user.isSeller) return <Navigate to="/seller/dashboard" replace />;

  const signOut = () => {
    localStorage.removeItem("userInfo");
    dispatch(logout());
    window.dispatchEvent(new Event("storage"));
    window.location.replace("/login");
  };

  const who = user.email || user.phone || user.name;
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "40px 16px", background: "#0B0B0C", color: "#F3EFE6", fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.22em", color: "#C9A24B", textTransform: "uppercase" }}>IDENTEE Admin</p>
        <h1 style={{ margin: "12px 0 0", fontFamily: "'Bricolage Grotesque', 'Helvetica Neue', Arial, sans-serif", fontWeight: 700, fontSize: "clamp(24px, 6vw, 30px)", lineHeight: 1.15, textWrap: "balance" }}>
          This area is only for the IDENTEE team
        </h1>
        <p style={{ margin: "12px 0 0", fontSize: 15, lineHeight: 1.6, color: "#8A877F", overflowWrap: "anywhere" }}>
          You’re logged in as <strong style={{ color: "#F3EFE6" }}>{who}</strong>, which isn’t on the team list. If you
          should have access, ask an admin to add this email (Customers → Add an admin).
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 24 }}>
          <button type="button" onClick={signOut} style={{ padding: "12px 22px", borderRadius: 999, border: 0, background: "#C9A24B", color: "#0B0B0C", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
            Log in with another email
          </button>
          <a href={shopHref("/")} style={{ padding: "12px 22px", borderRadius: 999, border: "1.5px solid #3A3833", color: "#F3EFE6", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
            Go to the shop
          </a>
        </div>
      </div>
    </main>
  );
}

export default function AdminApp() {
  return (
    <Router>
      <BrandFavicon />
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route
            path="/login"
            element={
              <TeamGuest>
                <LoginPage />
              </TeamGuest>
            }
          />
          <Route path="/register" element={<Navigate to="/login" replace />} />
          <Route path="/no-access" element={<NoAccess />} />
          <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
          {adminRoutes()}
          {/* any other address (a shop link pasted here, an old bookmark): the team's home page */}
          <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
        </Routes>
      </Suspense>
    </Router>
  );
}
