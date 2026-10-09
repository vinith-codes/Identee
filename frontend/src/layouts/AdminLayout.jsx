// layouts/AdminLayout.jsx
import { useState } from "react";
import { Outlet } from "react-router-dom";
import AdminSidebar from "../components/AdminSidebar";
import AdminTopbar from "../components/AdminTopbar";

export default function AdminLayout() {
  // Start with the menu folded on small screens so the page has room.
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 900,
  );

  return (
    <div style={{ minHeight: "100vh", background: "#141110" }}>
      <AdminSidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />
      <main
        style={{
          marginLeft: collapsed ? 68 : 240,
          transition: "margin-left 0.22s cubic-bezier(.4,0,.2,1)",
          minHeight: "100vh",
          background: "#F6F2E9",
        }}
      >
        <AdminTopbar />
        <div style={{ padding: 24 }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
