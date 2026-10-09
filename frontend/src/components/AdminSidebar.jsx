// components/AdminSidebar.jsx
//
// The admin menu: 8 plain-language sections (as in the admin prototype).
// Each section opens to show its pages; the section that holds the
// current page stays open. Old URLs keep working — only the menu changed.
import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import axios from "axios";
import { logout } from "../redux/slices/authSlice";
import logo from "../assets/logo.png";
import { imageUrl } from "../utils/imageUrl";
import { ADMIN_MENU, findMenuSection } from "../utils/adminMenu";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const C = {
  bg: "#141110",
  hover: "#26211B",
  border: "#2B2620",
  text: "#D9D3C4",
  muted: "#8F887A",
  gold: "#C9A24B",
  ink: "#141110",
  white: "#FFFFFF",
};

const ICONS = {
  home: "M10.7 2.3a1 1 0 00-1.4 0l-7 7A1 1 0 003 11h1v6a1 1 0 001 1h3v-4h4v4h3a1 1 0 001-1v-6h1a1 1 0 00.7-1.7l-7-7z",
  orders:
    "M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4h6v2H7V9zm0 4h6v2H7v-2z",
  customizable:
    "M7 2l-5 3 2 4 2-1v10h8V8l2 1 2-4-5-3c-.5 1.2-1.7 2-3 2S7.5 3.2 7 2z",
  readymade:
    "M10 2a4 4 0 00-4 4v1H5a1 1 0 00-1 .9l-1 9A1 1 0 004 18h12a1 1 0 001-1.1l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4z",
  library:
    "M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm2 3a1 1 0 100 2 1 1 0 000-2zm10 7H4l3-4 2 2 3-4 4 6z",
  storefront:
    "M3 3h14l1 5a3 3 0 01-5 2 3 3 0 01-6 0 3 3 0 01-5-2l1-5zm1 9.5V17h12v-4.5a5 5 0 01-3-.9 5 5 0 01-6 0 5 5 0 01-3 .9z",
  customers:
    "M9 6a3 3 0 11-6 0 3 3 0 016 0zm8 0a3 3 0 11-6 0 3 3 0 016 0zm-4.1 11c.1-.3.1-.7.1-1a7 7 0 00-1.5-4.3A5 5 0 0119 16v1h-6.1zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z",
  settings:
    "M11.5 3.2c-.4-1.6-2.6-1.6-3 0a1.5 1.5 0 01-2.3.9c-1.4-.8-2.9.7-2.1 2.1.5.9.1 2-.9 2.3-1.6.4-1.6 2.6 0 3a1.5 1.5 0 01.9 2.3c-.8 1.4.7 2.9 2.1 2.1a1.5 1.5 0 012.3.9c.4 1.6 2.6 1.6 3 0a1.5 1.5 0 012.3-.9c1.4.8 2.9-.7 2.1-2.1a1.5 1.5 0 01.9-2.3c1.6-.4 1.6-2.6 0-3a1.5 1.5 0 01-.9-2.3c.8-1.4-.7-2.9-2.1-2.1a1.5 1.5 0 01-2.3-.9zM10 13a3 3 0 100-6 3 3 0 000 6z",
};

function Icon({ name }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width={18} height={18}>
      <path fillRule="evenodd" clipRule="evenodd" d={ICONS[name]} />
    </svg>
  );
}

function useNewOrderCount() {
  const [count, setCount] = useState(0);
  const { pathname } = useLocation();
  useEffect(() => {
    let token;
    try {
      token = JSON.parse(localStorage.getItem("userInfo") || "{}").token;
    } catch {
      token = null;
    }
    if (!token) return;
    axios
      .get(`${BACKEND_URL}/api/admin/badges`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((r) => setCount(r.data.newOrders || 0))
      .catch(() => {});
  }, [pathname]); // refresh as the admin moves around
  return count;
}

export default function AdminSidebar({ collapsed, onToggle }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useSelector((state) => state.auth);
  const newOrders = useNewOrderCount();
  // The section holding the current page is the open one; clicking a
  // section goes to its first page, so it opens too.
  const current = findMenuSection(pathname);
  const open = current?.key;

  const handleLogout = () => {
    localStorage.removeItem("userInfo");
    dispatch(logout());
    window.dispatchEvent(new Event("storage"));
    navigate("/login", { replace: true });
  };

  const onSection = (section) => navigate(section.to);

  return (
    <aside
      style={{
        width: collapsed ? 68 : 240,
        height: "100vh",
        background: C.bg,
        display: "flex",
        flexDirection: "column",
        transition: "width 0.22s cubic-bezier(.4,0,.2,1)",
        overflow: "hidden",
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 50,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          padding: collapsed ? "16px 0" : "16px 14px 16px 18px",
          borderBottom: `1px solid ${C.border}`,
          minHeight: 64,
        }}
      >
        {!collapsed && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img
              src={logo}
              alt=""
              style={{ height: 34, width: 34, objectFit: "contain" }}
            />
            <div style={{ lineHeight: 1.1 }}>
              <div style={{ color: C.white, fontWeight: 800, letterSpacing: "0.12em", fontSize: 14 }}>
                IDENTEE
              </div>
              <div style={{ color: C.muted, fontSize: 11 }}>Admin</div>
            </div>
          </div>
        )}
        <button
          onClick={onToggle}
          type="button"
          className="adm-iconbtn"
          title={collapsed ? "Show menu" : "Hide menu"}
          aria-label={collapsed ? "Show menu" : "Hide menu"}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" width={16} height={16}>
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm1 4a1 1 0 100 2h12a1 1 0 100-2H4z"
            />
          </svg>
        </button>
      </div>

      <nav className="adm-nav" style={{ flex: 1, overflowY: "auto", padding: "10px 10px" }}>
        {ADMIN_MENU.map((section) => {
          const isCurrent = current?.key === section.key;
          const isOpen = !collapsed && open === section.key && section.children;
          const badge = section.key === "orders" && newOrders > 0 ? newOrders : null;
          return (
            <div key={section.key} style={{ marginBottom: 2 }}>
              <button
                type="button"
                onClick={() => onSection(section)}
                title={collapsed ? section.label : undefined}
                className={`adm-section${isCurrent ? " on" : ""}`}
                style={{ justifyContent: collapsed ? "center" : "flex-start" }}
              >
                <Icon name={section.icon} />
                {!collapsed && <span style={{ flex: 1, textAlign: "left" }}>{section.label}</span>}
                {badge && (
                  <span
                    className="adm-badge"
                    style={collapsed ? { position: "absolute", top: 4, right: 8 } : undefined}
                  >
                    {badge}
                  </span>
                )}
              </button>
              {isOpen && (
                <div style={{ margin: "4px 0 8px 22px", borderLeft: `1px solid ${C.border}` }}>
                  {section.children.map((child) => (
                    <NavLink
                      key={child.to}
                      to={child.to}
                      end
                      className={({ isActive }) => `adm-sub${isActive ? " on" : ""}`}
                    >
                      {child.label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div
        style={{
          borderTop: `1px solid ${C.border}`,
          padding: collapsed ? "12px 0" : "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          justifyContent: collapsed ? "center" : "flex-start",
        }}
      >
        {user?.profilePicture ? (
          <img
            src={imageUrl(user.profilePicture.replace(/^\//, ""))}
            alt=""
            style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
          />
        ) : (
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: C.gold,
              color: C.ink,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            {user?.name?.[0]?.toUpperCase() || "A"}
          </div>
        )}
        {!collapsed && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 700,
                color: C.white,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user?.name || "Admin"}
            </p>
            <button onClick={handleLogout} type="button" className="adm-signout">
              Sign out
            </button>
          </div>
        )}
      </div>

      <style>{`
        .adm-nav { scrollbar-width: none; }
        .adm-nav::-webkit-scrollbar { display: none; }
        .adm-iconbtn { background: none; border: none; cursor: pointer; color: ${C.muted};
          padding: 8px; border-radius: 8px; display: flex; }
        .adm-iconbtn:hover { background: ${C.hover}; color: ${C.white}; }
        .adm-section { position: relative; width: 100%; display: flex; align-items: center; gap: 12px;
          padding: 11px 14px; min-height: 44px; border: none; border-radius: 10px; cursor: pointer;
          background: transparent; color: ${C.text}; font: 600 14px 'Inter', sans-serif; }
        .adm-section:hover { background: ${C.hover}; color: ${C.white}; }
        .adm-section.on { background: ${C.gold}; color: ${C.ink}; }
        .adm-badge { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 999px;
          background: #E8553F; color: #fff; font-size: 11px; font-weight: 800;
          display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; }
        .adm-sub { display: block; padding: 8px 12px; margin-left: 6px; border-radius: 8px;
          color: ${C.muted}; text-decoration: none; font-size: 13px; }
        .adm-sub:hover { color: ${C.white}; background: ${C.hover}; }
        .adm-sub.on { color: ${C.gold}; font-weight: 700; }
        .adm-signout { background: none; border: none; padding: 0; cursor: pointer;
          font-size: 12px; color: ${C.muted}; }
        .adm-signout:hover { color: ${C.white}; text-decoration: underline; }
      `}</style>
    </aside>
  );
}
