// components/AdminSidebar.jsx
import { NavLink, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { logout } from "../redux/slices/authSlice";
import logo from "../assets/logo.png";
import { imageUrl } from "../utils/imageUrl";

const logoPath = logo;

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      {
        to: "/admin/dashboard",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
          </svg>
        ),
        label: "Dashboard",
      },
    ],
  },
  {
    label: "Catalogue",
    items: [
      {
        to: "/admin/products",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path
              fillRule="evenodd"
              d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4z"
              clipRule="evenodd"
            />
          </svg>
        ),
        label: "Products",
      },
      {
        to: "/admin/bulk-upload",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M3 3a1 1 0 000 2h14a1 1 0 100-2H3zm0 4a1 1 0 000 2h9a1 1 0 100-2H3zm0 4a1 1 0 100 2h6a1 1 0 100-2H3zm11 3a1 1 0 011-1h1V9a1 1 0 112 0v4h1a1 1 0 110 2h-1v4a1 1 0 11-2 0v-4h-1a1 1 0 01-1-1z" />
          </svg>
        ),
        label: "Bulk Upload",
      },
      {
        to: "/admin/art-bulk-upload",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M3 3a1 1 0 000 2h14a1 1 0 100-2H3zm0 4a1 1 0 000 2h9a1 1 0 100-2H3zm0 4a1 1 0 100 2h6a1 1 0 100-2H3zm11 3a1 1 0 011-1h1V9a1 1 0 112 0v4h1a1 1 0 110 2h-1v4a1 1 0 11-2 0v-4h-1a1 1 0 01-1-1z" />
          </svg>
        ),
        label: "Bulk Upload Art",
      },
      {
        to: "/admin/garment-photos",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm2 3a1 1 0 100 2 1 1 0 000-2zm10 7H4l3-4 2 2 3-4 4 6z" />
          </svg>
        ),
        label: "Garment Photos",
      },
      {
        to: "/admin/garment-types",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4z" />
          </svg>
        ),
        label: "Garment Types",
      },
      {
        to: "/admin/art-categories",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M4 4h12v12H4z" />
          </svg>
        ),
        label: "Art Categories",
      },
      {
        to: "/admin/art-designs",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M4 4h12v12H4z" />
          </svg>
        ),
        label: "Art Designs",
      },
      {
        to: "/admin/upload-product",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path
              fillRule="evenodd"
              d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z"
              clipRule="evenodd"
            />
          </svg>
        ),
        label: "Upload Product",
      },
      {
        to: "/admin/banners",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path
              fillRule="evenodd"
              d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 5 2-3 3 6z"
              clipRule="evenodd"
            />
          </svg>
        ),
        label: "Banners",
      },
    ],
  },
  {
    label: "Commerce",
    items: [
      {
        to: "/admin/orders",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
            <path
              fillRule="evenodd"
              d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z"
              clipRule="evenodd"
            />
          </svg>
        ),
        label: "Orders",
      },
      {
        to: "/admin/invoices",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path
              fillRule="evenodd"
              d="M4 2a2 2 0 00-2 2v14l3-2 3 2 3-2 3 2 3-2 3 2V4a2 2 0 00-2-2H4zm2 4h8a1 1 0 110 2H6a1 1 0 110-2zm0 4h8a1 1 0 110 2H6a1 1 0 110-2zm0 4h5a1 1 0 110 2H6a1 1 0 110-2z"
              clipRule="evenodd"
            />
          </svg>
        ),
        label: "Invoices",
      },
      {
        to: "/admin/transactions",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
            <path
              fillRule="evenodd"
              d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z"
              clipRule="evenodd"
            />
          </svg>
        ),
        label: "Transactions",
      },
      {
        to: "/admin/subscriptions",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path
              fillRule="evenodd"
              d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 00-2-2H5zm4.707 3.707a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L8.414 9H10a3 3 0 013 3v1a1 1 0 102 0v-1a5 5 0 00-5-5H8.414l1.293-1.293z"
              clipRule="evenodd"
            />
          </svg>
        ),
        label: "Subscriptions",
      },
      {
        to: "/admin/subscribers",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
          </svg>
        ),
        label: "Subscribers",
      },
    ],
  },
  {
    label: "Content",
    items: [
      {
        to: "/admin/offer-banner",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path
              fillRule="evenodd"
              d="M3 5a2 2 0 012-2h10a2 2 0 012 2v2a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm0 8a2 2 0 012-2h6a2 2 0 012 2v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2z"
              clipRule="evenodd"
            />
          </svg>
        ),
        label: "Offer Banner",
      },
      {
        to: "/admin/video-banner",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l3 1.5A1 1 0 0019 13.5v-7a1 1 0 00-1.447-.894l-3 1.5z" />
          </svg>
        ),
        label: "Video Banner",
      },
      {
        to: "/admin/categories",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path
              fillRule="evenodd"
              d="M3 4a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 1v2h2V5H5zM3 12a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H4a1 1 0 01-1-1v-4zm2 1v2h2v-2H5zM11 4a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V4zm2 1v2h2V5h-2zM11 12a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4zm2 1v2h2v-2h-2z"
              clipRule="evenodd"
            />
          </svg>
        ),
        label: "Categories",
      },
      {
        to: "/admin/reviews",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ),
        label: "Reviews",
      },
      {
        to: "/admin/enquiries",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
        ),
        label: "Enquiries",
      },
    ],
  },
  {
    label: "Users",
    items: [
      {
        to: "/admin/users",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
          </svg>
        ),
        label: "All Users",
      },
      {
        to: "/admin/sellers",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path
              fillRule="evenodd"
              d="M6 6V5a3 3 0 013-3h2a3 3 0 013 3v1h2a2 2 0 012 2v3.57A22.952 22.952 0 0110 13a22.95 22.95 0 01-8-1.43V8a2 2 0 012-2h2zm2-1a1 1 0 011-1h2a1 1 0 011 1v1H8V5zm1 5a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z"
              clipRule="evenodd"
            />
            <path d="M2 13.692V16a2 2 0 002 2h12a2 2 0 002-2v-2.308A24.974 24.974 0 0110 15c-2.796 0-5.487-.46-8-1.308z" />
          </svg>
        ),
        label: "Sellers",
      },
    ],
  },
  {
    label: "Logistics",
    items: [
      {
        to: "/admin/delivery",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
            <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" />
          </svg>
        ),
        label: "Delivery",
      },
      {
        to: "/admin/shipping",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path
              fillRule="evenodd"
              d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
              clipRule="evenodd"
            />
          </svg>
        ),
        label: "Shipping",
      },
      {
        to: "/admin/offers",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path
              fillRule="evenodd"
              d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
        ),
        label: "Offers",
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        to: "/admin/settings",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path
              fillRule="evenodd"
              d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
              clipRule="evenodd"
            />
          </svg>
        ),
        label: "Settings",
      },
    ],
  },
];

const C = {
  bg: "#0B0B0C",
  bgHover: "#1F1F24",
  border: "#2B2B30",
  activeBar: "#C9A24B",
  activeBg: "#C9A24B14",
  activeText: "#F0D585",
  mutedText: "#8A877F",
  groupLabel: "#5A5852",
  logoText: "#F3EFE6",
};

export default function AdminSidebar({ collapsed, onToggle }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);

  const handleLogout = () => {
    localStorage.removeItem("userInfo");
    dispatch(logout());
    window.dispatchEvent(new Event("storage"));
    navigate("/login", { replace: true });
  };

  return (
    <aside
      style={{
        width: collapsed ? "64px" : "220px",
        height: "100vh",
        background: C.bg,
        borderRight: `1px solid ${C.border}`,
        display: "flex",
        flexDirection: "column",
        transition: "width 0.22s cubic-bezier(.4,0,.2,1)",
        overflow: "hidden",
        position: "fixed",
        top: 0,
        left: 0,
        zIndex: 50,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "space-between",
          padding: collapsed ? "18px 0" : "18px 16px",
          borderBottom: `1px solid ${C.border}`,
          minHeight: 60,
        }}
      >
        {!collapsed &&
          (user?.profilePicture ? (
            <img
              src={imageUrl(user.profilePicture.replace(/^\//, ""))}
              alt=""
              style={{
                height: 44,
                width: 44,
                borderRadius: "50%",
                objectFit: "cover",
              }}
            />
          ) : (
            <img
              src={logoPath}
              alt="IDENTEE"
              style={{ height: 44, width: "auto", objectFit: "contain" }}
            />
          ))}
        <button
          onClick={onToggle}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: C.mutedText,
            padding: 4,
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
          }}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" width={16} height={16}>
            {collapsed ? (
              <path
                fillRule="evenodd"
                d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                clipRule="evenodd"
              />
            ) : (
              <path
                fillRule="evenodd"
                d="M15.707 15.707a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 010 1.414zm-6 0a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 011.414 1.414L5.414 10l4.293 4.293a1 1 0 010 1.414z"
                clipRule="evenodd"
              />
            )}
          </svg>
        </button>
      </div>

      <nav
        style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}
        className="sidebar-nav"
      >
        {NAV_GROUPS.map((group) => (
          <div key={group.label} style={{ marginBottom: 4 }}>
            {!collapsed && (
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  color: C.groupLabel,
                  textTransform: "uppercase",
                  padding: "10px 16px 4px",
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                {group.label}
              </p>
            )}
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                style={({ isActive }) => ({
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: collapsed ? "9px 0" : "9px 16px",
                  justifyContent: collapsed ? "center" : "flex-start",
                  textDecoration: "none",
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                  fontFamily: "'Inter', sans-serif",
                  color: isActive ? C.activeText : C.mutedText,
                  background: isActive ? C.activeBg : "transparent",
                  borderLeft: isActive
                    ? `2px solid ${C.activeBar}`
                    : "2px solid transparent",
                  transition: "background 0.12s, color 0.12s",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                })}
              >
                <span
                  style={{
                    flexShrink: 0,
                    color: "inherit",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {item.icon}
                </span>
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            ))}
          </div>
        ))}
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
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              objectFit: "cover",
              border: "1px solid #C9A24B55",
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: "#C9A24B20",
              border: "1px solid #C9A24B55",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              fontSize: 12,
              fontWeight: 700,
              color: C.activeText,
              fontFamily: "'Inter', sans-serif",
            }}
          >
            {user?.name?.[0]?.toUpperCase() || "A"}
          </div>
        )}
        {!collapsed ? (
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                fontWeight: 600,
                color: "#D9D5C9",
                fontFamily: "'Inter', sans-serif",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {user?.name || "Admin"}
            </p>
            <button
              onClick={handleLogout}
              type="button"
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontSize: 11,
                color: C.mutedText,
                fontFamily: "'Inter', sans-serif",
              }}
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            onClick={handleLogout}
            type="button"
            title="Sign out"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: C.mutedText,
              padding: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg viewBox="0 0 20 20" fill="currentColor" width={16} height={16}>
              <path
                fillRule="evenodd"
                d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h6a1 1 0 100-2H4V5h5a1 1 0 100-2H3zm10.293 4.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L14.586 11H8a1 1 0 110-2h6.586l-1.293-1.293a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
      </div>

      <style>{`
        .sidebar-nav { scrollbar-width: none; -ms-overflow-style: none; }
        .sidebar-nav::-webkit-scrollbar { display: none; }
        .sidebar-nav a:hover { background: #1F1F2480 !important; color: #D9D5C9 !important; }
      `}</style>
    </aside>
  );
}
