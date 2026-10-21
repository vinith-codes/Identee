// App.jsx — the shop AND the admin as one website (the laptop: `npm run dev`, `npm run build`).
// The live site is two websites (vite.config.js): apps/ShopApp.jsx (identee.co.in) and apps/AdminApp.jsx
// (admin.identee.co.in). The pages themselves are listed once, in apps/shopRoutes.jsx and apps/adminRoutes.jsx.
import { Suspense } from "react";
import { BrowserRouter as Router, Routes, Navigate } from "react-router-dom";
import { BrandFavicon } from "./utils/brandLogo";
import { PageLoading, getUserInfo } from "./apps/common";
import { shopRoutes } from "./apps/shopRoutes";
import { adminRoutes } from "./apps/adminRoutes";

// Guests only — already-logged-in users get bounced to their dashboard
const GuestRoute = ({ children }) => {
  const user = getUserInfo();
  if (!user) return children;
  if (user.isAdmin) return <Navigate to="/admin/dashboard" replace />;
  if (user.isSeller) return <Navigate to="/seller/dashboard" replace />;
  return <Navigate to="/" replace />;
};

export default function App() {
  return (
    <Router>
      <BrandFavicon />
      <Suspense fallback={<PageLoading />}>
        <Routes>
          {shopRoutes({ Guest: GuestRoute })}
          {adminRoutes()}
        </Routes>
      </Suspense>
    </Router>
  );
}
