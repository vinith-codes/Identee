// layouts/AdminLayout.jsx
import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import AdminSidebar from "../components/AdminSidebar";
import AdminTopbar from "../components/AdminTopbar";
import UnsavedChangesProvider from "./UnsavedChangesProvider";

// The admin area knows when the open page has unsaved changes (utils/unsavedChanges.js): the sidebar, the
// settings tabs and Back links ask before leaving, and so does a reload.
export default function AdminLayout() {
  return (
    <UnsavedChangesProvider>
      <AdminLayoutInner />
    </UnsavedChangesProvider>
  );
}

// phones (and narrow tablets): the menu is folded to icons and, when opened, lies OVER the page (dimmed behind it)
// instead of squeezing the page into a strip beside it; choosing a page folds it again
const PHONE = "(max-width: 760px)";
const isPhone = () => typeof window !== "undefined" && window.matchMedia?.(PHONE).matches;

function AdminLayoutInner() {
  // Start with the menu folded on small screens so the page has room.
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 900,
  );
  const [phone, setPhone] = useState(isPhone);
  // (the screen becoming phone-sized — a tablet turned, a window made narrow — folds the menu too)
  useEffect(() => {
    const mq = window.matchMedia?.(PHONE);
    if (!mq) return undefined;
    const change = () => {
      setPhone(mq.matches);
      if (mq.matches) setCollapsed(true);
    };
    mq.addEventListener("change", change);
    return () => mq.removeEventListener("change", change);
  }, []);
  const open = !collapsed;

  return (
    <div style={{ minHeight: "100vh", background: "#141110" }}>
      <AdminSidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        // on a phone, choosing a page folds the menu again (the page is what the admin wants to see)
        onNavigate={() => phone && setCollapsed(true)}
      />
      {phone && open && (
        <div
          aria-hidden="true"
          onClick={() => setCollapsed(true)}
          style={{ position: "fixed", inset: 0, zIndex: 45, background: "rgba(20, 17, 16, .45)" }}
        />
      )}
      <main
        style={{
          marginLeft: phone || collapsed ? 68 : 240,
          transition: "margin-left 0.22s cubic-bezier(.4,0,.2,1)",
          minHeight: "100vh",
          background: "#F6F2E9",
        }}
      >
        <AdminTopbar />
        {/* a phone: less space around the page, so forms and tables get the width (see index.css) */}
        <div className="adm-content" style={{ padding: phone ? 12 : 24 }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
