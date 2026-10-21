// components/AdminTopbar.jsx
//
// Shows where you are ("Orders › Invoices") plus Back and View website.
// Sign out lives at the bottom of the menu.
import { useLocation, useNavigate } from "react-router-dom";
import { backTarget, findMenuPage } from "../utils/adminMenu";
import { useUnsavedChanges } from "../utils/unsavedChanges";
import { shopHref } from "../utils/siteUrls";


export default function AdminTopbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname } = location;
  const where = findMenuPage(pathname);
  const isHome = where?.section.key === "home";
  const { confirmLeave } = useUnsavedChanges();
  // an invoice opened from Orders (its "View invoice" / "Generate invoice" button) goes back to Orders — with the
  // filters set there, by the browser's own back step — like the invoice's "Back to Orders" button
  const fromOrders = location.state?.from === "orders";
  const target = fromOrders ? "/admin/orders" : backTarget(pathname);
  // (asks first when a page has unsaved changes, like the menu does)
  const goBack = () => {
    if (!confirmLeave()) return;
    if (fromOrders && location.key !== "default") navigate(-1);
    else navigate(target);
  };

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "14px 28px",
        borderBottom: "1px solid #E7DFCC",
        background: "#FFFFFF",
        fontFamily: "'Inter', sans-serif",
        position: "sticky",
        top: 0,
        zIndex: 40,
      }}
    >
      <div style={{ fontSize: 14, color: "#6B6559", minWidth: 0 }}>
        {where && (
          <>
            <span style={{ fontWeight: where.page ? 500 : 700, color: where.page ? "#6B6559" : "#141110" }}>
              {where.section.label}
            </span>
            {where.page && (
              <>
                <span style={{ margin: "0 8px", color: "#A39C8C" }}>›</span>
                <span style={{ fontWeight: 700, color: "#141110" }}>{where.page.label}</span>
              </>
            )}
          </>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {!isHome && (
          <button type="button" onClick={goBack} style={btn(false)} title={target === "/admin/dashboard" ? "Back to the admin Home" : fromOrders ? "Back to Orders" : "Back to the list"}>
            ← Back
          </button>
        )}
        <button
          type="button"
          onClick={() => window.open(shopHref("/"), "_blank", "noopener,noreferrer")}
          style={btn(true)}
        >
          View website ↗
        </button>
      </div>
    </header>
  );
}

const btn = (dark) => ({
  background: dark ? "#141110" : "#FFFFFF",
  color: dark ? "#FFFFFF" : "#141110",
  border: `1px solid ${dark ? "#141110" : "#D7CCB3"}`,
  borderRadius: 999,
  padding: "8px 16px",
  minHeight: 36,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "'Inter', sans-serif",
});
