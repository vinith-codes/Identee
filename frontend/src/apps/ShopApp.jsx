// apps/ShopApp.jsx — the shop website (identee.co.in, `npm run build:shop`): the customer pages only.
// The team's pages are a separate website (apps/AdminApp.jsx): none of their code is in this one, and an old
// /admin/... or /seller/... link is sent there.
import { Suspense } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { BrandFavicon } from "../utils/brandLogo";
import { ADMIN_URL } from "../utils/siteUrls";
import { PageLoading, getUserInfo } from "./common";
import { shopRoutes } from "./shopRoutes";

// Guests only — a logged-in person goes to the home page (an admin too: the admin website has its own login)
const GuestRoute = ({ children }) => (getUserInfo() ? <Navigate to="/" replace /> : children);

// an old team link (a bookmark, an email) → the same page on the admin website
function ToAdminWebsite() {
  if (ADMIN_URL) window.location.replace(`${ADMIN_URL}${window.location.pathname}${window.location.search}`);
  else return <Navigate to="/" replace />;
  return <PageLoading />;
}

export default function ShopApp() {
  return (
    <Router>
      <BrandFavicon />
      <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/admin/*" element={<ToAdminWebsite />} />
          <Route path="/seller/*" element={<ToAdminWebsite />} />
          {shopRoutes({ Guest: GuestRoute })}
        </Routes>
      </Suspense>
    </Router>
  );
}
