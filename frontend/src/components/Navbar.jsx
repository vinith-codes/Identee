// components/Navbar.jsx
import { useState, useEffect, useMemo } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import logo from "../assets/identee-logo.png"; // adjust path
import { THEME } from "../theme/theme";
import { getActiveOffer } from "../redux/slices/bannerSlice";
import { fetchFavorites, fetchCart } from "../redux/slices/cartWishlistSlice";
import { fetchPublicSettings } from "../redux/slices/publicSettingsSlice";

const BACKEND_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const slugify = (s) => s.toLowerCase().replace(/\s+/g, "-");

// ─── Static navigation links (Products is injected dynamically below) ─────
const STATIC_NAV_LINKS = [
  { to: "/", label: "Home" },
  { to: "/about-us", label: "About Us" },
  { to: "/contact-us", label: "Contact Us" },
];

// ── helpers ──────────────────────────────────────────────────────
const getUserInfo = () => {
  try {
    const raw = localStorage.getItem("userInfo");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed._id && parsed.token) return parsed;
    return null;
  } catch {
    return null;
  }
};

const getInitial = (user) => {
  if (!user) return "?";
  if (user.name) return user.name.charAt(0).toUpperCase();
  if (user.email) return user.email.charAt(0).toUpperCase();
  return "?";
};

// ── Main Navbar ──────────────────────────────────────────────────
export default function Navbar({ phone = "+91 636 652 6449" }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileProductsOpen, setMobileProductsOpen] = useState(false);
  const [mobileItemOpen, setMobileItemOpen] = useState(null); // which sub-item's subcategories are expanded (mobile)
  const [user, setUser] = useState(getUserInfo());
  const [categoryMap, setCategoryMap] = useState({}); // { "Round Neck": ["Oversized", ...], ... } — live from backend
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { activeOffer } = useSelector((s) => s.banner);
  const { favorites, cartItems } = useSelector((s) => s.cartWishlist);
  const wishlistCount = favorites.length;
  const cartCount = cartItems.length;
  const { values: publicSettings, isLoaded: settingsLoaded } = useSelector(
    (s) => s.publicSettings,
  );

  useEffect(() => {
    const handleStorage = () => setUser(getUserInfo());
    window.addEventListener("storage", handleStorage);
    setUser(getUserInfo());
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    dispatch(getActiveOffer());
  }, [dispatch]);

  useEffect(() => {
    if (user?.token) {
      dispatch(fetchFavorites(user.token));
      dispatch(fetchCart(user.token));
    }
  }, [dispatch, user]);

  useEffect(() => {
    if (!settingsLoaded) dispatch(fetchPublicSettings());
  }, [dispatch, settingsLoaded]);

  const displayPhone = publicSettings["general.phoneNumber"] || phone;

  // ── Fetch live categories from the backend — updates whenever an admin
  // creates a new category/product, no code changes needed on the frontend.
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/products/categories`);
        if (!res.ok) return;
        const data = await res.json();
        setCategoryMap(data || {});
      } catch (err) {
        console.error("Failed to load categories for navbar:", err);
      }
    };
    fetchCategories();
  }, []);

  // Build the "Products" mega-dropdown from live category data.
  // Each top-level category becomes a clickable item; its subcategories
  // (if any) show in the hover flyout that used to list sizes.
  const productCategoryItems = useMemo(
    () =>
      Object.entries(categoryMap).map(([category, subcategories]) => ({
        label: category,
        to: `/category/${encodeURIComponent(category)}`,
        subcategories: subcategories || [],
      })),
    [categoryMap],
  );

  const NAV_LINKS = useMemo(() => {
    const links = [STATIC_NAV_LINKS[0]]; // Home
    links.push({
      to: "/products",
      label: "Products",
      subLinks:
        productCategoryItems.length > 0
          ? [{ category: "Shop by Category", items: productCategoryItems }]
          : [],
    });
    links.push(STATIC_NAV_LINKS[1], STATIC_NAV_LINKS[2]); // About / Contact
    return links;
  }, [productCategoryItems]);

  const handleLogout = () => {
    localStorage.removeItem("userInfo");
    setUser(null);
    navigate("/");
  };

  const initial = getInitial(user);

  return (
    <>
      {/* ─── Announcement Bar — text is admin-managed, see /admin/offer-banner ─── */}
      {activeOffer?.offerText && (
        <div
          style={{
            background: THEME.ink,
            color: "#FFFFFF",
            textAlign: "center",
            padding: "10px 16px",
            fontSize: 15,
            fontWeight: 600,
            fontFamily: THEME.fontBody,
          }}
        >
          {activeOffer.offerText}
        </div>
      )}

      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: THEME.bg,
          fontFamily: THEME.fontBody,
        }}
      >
        {/* ─── Row 1: phone/chat — logo — search/shop/cart/signin ─── */}
        <div
          className="navbar-row1"
          style={{
            maxWidth: 1440,
            margin: "0 auto",
            padding: "14px 32px",
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            alignItems: "center",
            gap: 16,
          }}
        >
          {/* Left: phone + chat */}
          <div
            className="navbar-left"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              justifySelf: "start",
              color: THEME.ink,
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            <a
              href={`tel:${displayPhone.split(" ").join("")}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: THEME.ink,
                textDecoration: "none",
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                width={18}
                height={18}
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              {displayPhone}
            </a>
            <span style={{ color: THEME.border }}>|</span>
            <Link
              to="/chat"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: THEME.ink,
                textDecoration: "none",
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                width={18}
                height={18}
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              CHAT WITH US
            </Link>
          </div>

          {/* Centre: Logo */}
          <Link
            to="/"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gridColumn: "2",
            }}
          >
            <img
              className="navbar-logo"
              src={logo}
              alt="IDENTEE"
              style={{ height: 100, width: 150, objectFit: "contain" }}
            />
          </Link>

          {/* Right: search, shop link, cart, sign in */}
          <div
            className="navbar-right"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 26,
              justifySelf: "end",
              fontSize: 15,
              fontWeight: 600,
              color: THEME.ink,
            }}
          >
            <button
              aria-label="Search"
              data-tooltip="Search"
              className="navbar-icon"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: THEME.ink,
                padding: 0,
                display: "flex",
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                width={20}
                height={20}
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="17" y1="17" x2="23" y2="23" />
              </svg>
            </button>

            {/* Account icon */}
            <Link
              to={user ? "/account" : "/login"}
              aria-label="Account"
              data-tooltip={user ? "Account" : "Sign In"}
              className="navbar-icon"
              style={{ color: THEME.ink, display: "flex" }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                width={20}
                height={20}
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </Link>

            {/* Orders icon — only when logged in */}
            {user && (
              <Link
                to="/orders"
                aria-label="My Orders"
                data-tooltip="My Orders"
                className="navbar-icon"
                style={{
                  color: THEME.ink,
                  display: "flex",
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  width={20}
                  height={20}
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 8L12 3 3 8v8l9 5 9-5V8z" />
                  <path d="M3 8l9 5 9-5" strokeLinejoin="round" />
                  <path d="M12 13v8" />
                </svg>
              </Link>
            )}

            {/* Wishlist icon */}
            <Link
              to="/favorites"
              aria-label="Wishlist"
              data-tooltip="Wishlist"
              className="navbar-icon"
              style={{
                position: "relative",
                color: THEME.ink,
                display: "flex",
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                width={20}
                height={20}
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
              </svg>
              {wishlistCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -4,
                    background: "#F4511E",
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    border: `1.5px solid ${THEME.bg}`,
                  }}
                />
              )}
            </Link>

            <Link
              to="/cart"
              aria-label="Cart"
              data-tooltip="Cart"
              className="navbar-icon"
              style={{
                position: "relative",
                color: THEME.ink,
                display: "flex",
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                width={20}
                height={20}
                stroke="currentColor"
                strokeWidth="2.2"
              >
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <path d="M3 6h18" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
              {cartCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: -8,
                    right: -8,
                    background: THEME.goldBright,
                    color: THEME.ink,
                    fontSize: 10,
                    fontWeight: 700,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {cartCount}
                </span>
              )}
            </Link>

            {user ? (
              <div
                className="navbar-auth-block"
                style={{ display: "flex", alignItems: "center", gap: 10 }}
              >
                <div
                  className="avatar-initial"
                  style={{
                    width: 32,
                    height: 32,
                    fontSize: 14,
                    overflow: "hidden",
                  }}
                >
                  {user?.profilePicture ? (
                    <img
                      src={`${BACKEND_URL}${user.profilePicture}`}
                      alt="avatar"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    initial
                  )}
                </div>
                <button
                  onClick={handleLogout}
                  style={{
                    background: "none",
                    border: "none",
                    color: THEME.ink,
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  LOGOUT
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="navbar-auth-block"
                style={{
                  color: THEME.ink,
                  textDecoration: "none",
                  letterSpacing: "0.04em",
                }}
              >
                SIGN IN
              </Link>
            )}

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="navbar-burger"
              style={{
                display: "none",
                background: "none",
                border: "none",
                color: THEME.ink,
                cursor: "pointer",
              }}
              aria-label="Menu"
            >
              <svg
                viewBox="0 0 28 28"
                fill="currentColor"
                width={26}
                height={26}
              >
                {mobileOpen ? (
                  <path
                    fillRule="evenodd"
                    d="M5.293 5.293a1 1 0 011.414 0L10 8.586l3.293-3.293a1 1 0 111.414 1.414L11.414 10l3.293 3.293a1 1 0 01-1.414 1.414L10 11.414l-3.293 3.293a1 1 0 01-1.414-1.414L8.586 10 5.293 6.707a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                ) : (
                  <path
                    fillRule="evenodd"
                    d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                    clipRule="evenodd"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* ─── Row 2: nav links, centered (Products has mega dropdown) ─── */}
        <nav
          className="nav-desktop"
          style={{
            borderTop: `1px solid ${THEME.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 40,
            padding: "12px 32px",
            maxWidth: 1440,
            margin: "0 auto",
          }}
        >
          {NAV_LINKS.map((link) => {
            if (link.subLinks) {
              return (
                <div key={link.to} className="nav-dropdown-wrapper">
                  <NavLink
                    to={link.to}
                    className={({ isActive }) =>
                      `nav-link ${isActive ? "active" : ""}`
                    }
                  >
                    {link.label}
                  </NavLink>
                  {link.subLinks.length > 0 && (
                    <div className="mega-dropdown">
                      <div className="mega-grid mega-grid-single">
                        {link.subLinks.map((group) => (
                          <div key={group.category} className="mega-group">
                            <div className="mega-category">
                              {group.category}
                            </div>
                            {group.items.map((item) => (
                              <div
                                key={item.to}
                                className="mega-subitem-wrapper"
                              >
                                <NavLink to={item.to} className="dropdown-item">
                                  {item.label}
                                  {item.subcategories.length > 0 && (
                                    <span className="chev">›</span>
                                  )}
                                </NavLink>
                                {item.subcategories.length > 0 && (
                                  <div className="size-flyout">
                                    <div className="size-flyout-title">
                                      Subcategories
                                    </div>
                                    <div className="size-grid">
                                      {item.subcategories.map((sub) => (
                                        <NavLink
                                          key={sub}
                                          to={`${item.to}?subcategory=${encodeURIComponent(sub)}`}
                                          className="size-chip"
                                        >
                                          {sub}
                                        </NavLink>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            }
            return (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `nav-link ${isActive ? "active" : ""}`
                }
              >
                {link.label}
              </NavLink>
            );
          })}
        </nav>

        {/* ─── Mobile dropdown ─── */}
        {mobileOpen && (
          <div
            className="nav-mobile-menu"
            style={{
              borderTop: `1px solid ${THEME.border}`,
              padding: "12px 32px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              background: THEME.bg,
            }}
          >
            {NAV_LINKS.map((link) => {
              if (link.subLinks) {
                return (
                  <div key={link.to}>
                    <button
                      onClick={() => setMobileProductsOpen((v) => !v)}
                      style={{
                        display: "flex",
                        width: "100%",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: "none",
                        border: "none",
                        padding: "14px 0",
                        borderBottom: `1px solid ${THEME.border}`,
                        fontSize: 17,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        color: THEME.ink,
                        cursor: "pointer",
                      }}
                    >
                      {link.label}
                      <span>{mobileProductsOpen ? "−" : "+"}</span>
                    </button>

                    {mobileProductsOpen && (
                      <div style={{ paddingLeft: 12, marginBottom: 8 }}>
                        {link.subLinks.length === 0 && (
                          <p
                            style={{
                              fontSize: 13,
                              color: THEME.muted,
                              padding: "10px 0",
                            }}
                          >
                            No categories yet.
                          </p>
                        )}
                        {link.subLinks.map((group) => (
                          <div
                            key={group.category}
                            style={{ marginBottom: 10 }}
                          >
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 700,
                                letterSpacing: "0.08em",
                                color: THEME.muted,
                                textTransform: "uppercase",
                                padding: "10px 0 4px 0",
                              }}
                            >
                              {group.category}
                            </div>
                            {group.items.map((item) => {
                              const key = `${group.category}-${item.label}`;
                              const isOpen = mobileItemOpen === key;
                              return (
                                <div key={item.to}>
                                  <button
                                    onClick={() =>
                                      setMobileItemOpen(isOpen ? null : key)
                                    }
                                    style={{
                                      display: "flex",
                                      width: "100%",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      background: "none",
                                      border: "none",
                                      padding: "8px 0",
                                      fontSize: 15,
                                      fontWeight: 500,
                                      color: THEME.ink,
                                      borderBottom: `1px solid ${THEME.border}`,
                                      cursor: "pointer",
                                    }}
                                  >
                                    <Link
                                      to={item.to}
                                      onClick={(e) => {
                                        // let the label itself navigate; only the
                                        // caret toggles the subcategory list
                                        if (item.subcategories.length === 0) {
                                          setMobileOpen(false);
                                        } else {
                                          e.preventDefault();
                                          setMobileItemOpen(
                                            isOpen ? null : key,
                                          );
                                        }
                                      }}
                                      style={{
                                        color: THEME.ink,
                                        textDecoration: "none",
                                      }}
                                    >
                                      {item.label}
                                    </Link>
                                    {item.subcategories.length > 0 && (
                                      <span>{isOpen ? "−" : "+"}</span>
                                    )}
                                  </button>
                                  {isOpen && item.subcategories.length > 0 && (
                                    <div
                                      style={{
                                        display: "flex",
                                        flexWrap: "wrap",
                                        gap: 6,
                                        padding: "8px 0 10px",
                                      }}
                                    >
                                      {item.subcategories.map((sub) => (
                                        <Link
                                          key={sub}
                                          to={`${item.to}?subcategory=${encodeURIComponent(sub)}`}
                                          onClick={() => {
                                            setMobileOpen(false);
                                            setMobileItemOpen(null);
                                            setMobileProductsOpen(false);
                                          }}
                                          style={{
                                            border: `1px solid ${THEME.border}`,
                                            borderRadius: 6,
                                            padding: "5px 10px",
                                            fontSize: 13,
                                            fontWeight: 600,
                                            color: THEME.ink,
                                            textDecoration: "none",
                                          }}
                                        >
                                          {sub}
                                        </Link>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `nav-link ${isActive ? "active" : ""}`
                  }
                  style={{
                    display: "block",
                    padding: "14px 0",
                    borderBottom: `1px solid ${THEME.border}`,
                    fontSize: 17,
                  }}
                >
                  {link.label}
                </NavLink>
              );
            })}

            {/* My Orders — mobile menu (only when logged in) */}
            {user && (
              <Link
                to="/orders"
                onClick={() => setMobileOpen(false)}
                style={{
                  display: "block",
                  padding: "14px 0",
                  borderBottom: `1px solid ${THEME.border}`,
                  fontSize: 17,
                  fontWeight: 600,
                  color: THEME.ink,
                  textDecoration: "none",
                }}
              >
                My Orders
              </Link>
            )}

            {!user ? (
              <Link
                to="/login"
                onClick={() => setMobileOpen(false)}
                style={{
                  padding: "14px 0",
                  color: THEME.ink,
                  fontSize: 17,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                Sign In
              </Link>
            ) : (
              <button
                onClick={() => {
                  handleLogout();
                  setMobileOpen(false);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: THEME.ink,
                  padding: "14px 0",
                  textAlign: "left",
                  fontSize: 17,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Logout
              </button>
            )}
          </div>
        )}
      </header>

      <style>{`
       .nav-link {
  text-decoration: none;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: ${THEME.ink};
  padding: 4px 0;
}
        .nav-link:hover { color: ${THEME.goldDeep}; }
        .nav-link.active { color: ${THEME.goldDeep}; }

        .avatar-initial {
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          text-transform: uppercase;
          background: linear-gradient(135deg, ${THEME.gold}, ${THEME.goldBright});
          color: ${THEME.ink};
          flex-shrink: 0;
          user-select: none;
        }

        /* ── Icon hover tooltips ── */
        .navbar-icon {
          position: relative;
        }
        .navbar-icon::after {
          content: attr(data-tooltip);
          position: absolute;
          top: calc(100% + 10px);
          left: 50%;
          transform: translateX(-50%) translateY(4px);
          background: ${THEME.ink};
          color: #FFFFFF;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          white-space: nowrap;
          padding: 5px 10px;
          border-radius: 6px;
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s;
          z-index: 220;
        }
        .navbar-icon::before {
          content: "";
          position: absolute;
          top: calc(100% + 5px);
          left: 50%;
          transform: translateX(-50%);
          border: 5px solid transparent;
          border-bottom-color: ${THEME.ink};
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transition: opacity 0.15s ease, visibility 0.15s;
          z-index: 220;
        }
        .navbar-icon:hover::after,
        .navbar-icon:hover::before {
          opacity: 1;
          visibility: visible;
        }
        .navbar-icon:hover::after {
          transform: translateX(-50%) translateY(0);
        }

        /* ── Mega dropdown ── */
        .nav-dropdown-wrapper { position: relative; }
        .mega-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          left: 50%;
          transform: translateX(-50%) translateY(6px);
          background: ${THEME.bg};
          border-radius: 14px;
          box-shadow: 0 16px 48px rgba(0,0,0,0.14);
          border: 1px solid ${THEME.border};
          padding: 22px 28px;
          min-width: 420px;
          max-width: 480px;
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transition: opacity 0.2s ease, transform 0.2s ease, visibility 0.2s;
          z-index: 200;
        }
        .nav-dropdown-wrapper:hover .mega-dropdown {
          opacity: 1;
          visibility: visible;
          transform: translateX(-50%) translateY(0);
          pointer-events: auto;
        }
        .mega-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px 24px;
        }
        .mega-grid-single {
          grid-template-columns: 1fr;
        }
        .mega-group { display: flex; flex-direction: column; }
        .mega-category {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: ${THEME.muted};
          padding-bottom: 6px;
          border-bottom: 1px solid ${THEME.border};
          margin-bottom: 8px;
        }

        /* ── Sub-item (dynamic category) with subcategory flyout ── */
        .mega-subitem-wrapper { position: relative; }
        .dropdown-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 6px 0;
          font-size: 15px;
          font-weight: 500;
          color: ${THEME.ink};
          text-decoration: none;
          transition: color 0.15s, padding-left 0.15s;
        }
        .dropdown-item:hover {
          color: ${THEME.goldDeep};
          padding-left: 4px;
        }
        .dropdown-item .chev {
          font-size: 13px;
          opacity: 0.5;
        }

        .size-flyout {
          position: absolute;
          top: -10px;
          left: 100%;
          margin-left: 10px;
          background: ${THEME.bg};
          border: 1px solid ${THEME.border};
          border-radius: 12px;
          box-shadow: 0 12px 36px rgba(0,0,0,0.14);
          padding: 14px 16px;
          width: 220px;
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transform: translateX(-6px);
          transition: opacity 0.18s ease, transform 0.18s ease, visibility 0.18s;
          z-index: 210;
        }
        .mega-subitem-wrapper:hover .size-flyout {
          opacity: 1;
          visibility: visible;
          pointer-events: auto;
          transform: translateX(0);
        }
        .size-flyout-title {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: ${THEME.muted};
          margin-bottom: 8px;
        }
        .size-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .size-chip {
          border: 1px solid ${THEME.border};
          border-radius: 6px;
          padding: 5px 9px;
          font-size: 13px;
          font-weight: 600;
          color: ${THEME.ink};
          text-decoration: none;
          transition: background 0.15s, color 0.15s, border-color 0.15s;
        }
        .size-chip:hover {
          background: ${THEME.ink};
          color: #FFFFFF;
          border-color: ${THEME.ink};
        }

              /* ==================== TABLET/MOBILE (≤900px) ==================== */
        @media (max-width: 900px) {
          .nav-desktop { display: none !important; }
          .navbar-burger { display: flex !important; }
          .navbar-left { display: none !important; }

          .navbar-row1 {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            padding: 12px 20px !important;
            gap: 12px !important;
          }
                  .navbar-logo { height: 56px !important; width: auto !important; }
          .navbar-right { gap: 16px !important; font-size: 13px !important; }
          .navbar-auth-block { display: none !important; }
        }

        @media (min-width: 901px) {
          .nav-mobile-menu { display: none !important; }
          .navbar-burger { display: none !important; }
        }

        /* ==================== MOBILE (≤600px) ==================== */
        @media (max-width: 600px) {
          .navbar-row1 { padding: 10px 14px !important; gap: 8px !important; }
          .navbar-logo { height: 44px !important; }
          .navbar-right { gap: 12px !important; font-size: 12px !important; }
          .nav-mobile-menu { padding: 12px 18px 20px !important; }
        }

        /* ==================== SMALL MOBILE (≤380px) ==================== */
        @media (max-width: 380px) {
          .navbar-right { gap: 8px !important; }
          .navbar-icon svg { width: 18px !important; height: 18px !important; }
          .navbar-logo { height: 38px !important; }
        }
      `}</style>
    </>
  );
}
