// The yellow "Test mode" band at the top of the shop (5 Nov 2026) — shown when a team account is in the shop through
// Admin → Design Studio → Test as a customer (the login carries testMode). Orders placed meanwhile are test orders.
import { adminHref } from "../utils/siteUrls";

export default function TestModeBand({ user }) {
  if (!user?.testMode) return null;
  const leave = () => {
    try {
      localStorage.removeItem("userInfo");
    } catch {
      /* nothing saved */
    }
    window.location.assign("/"); // a full reload: every page forgets the test login
  };
  return (
    <div role="status" style={{ background: "#F0C24C", color: "#141110", fontFamily: "'Inter', sans-serif", fontSize: 13, lineHeight: 1.4, padding: "8px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", borderBottom: "1px solid #D9A92E" }}>
      <b style={{ letterSpacing: "0.06em", textTransform: "uppercase", fontSize: 12 }}>Test mode</b>
      <span style={{ flex: "1 1 260px", minWidth: 0 }}>
        You're in the shop as <b>{user.name || "the team"}</b>. Orders you place are <b>test orders</b> — Cash on Delivery only, not counted in sales. AI pictures still cost real money.
      </span>
      <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <a href={adminHref("/admin/test-mode")} style={{ color: "#141110", fontWeight: 600, textDecoration: "underline" }}>Test orders</a>
        <button type="button" onClick={leave} style={{ background: "#141110", color: "#F0D585", border: "none", borderRadius: 999, padding: "6px 12px", fontWeight: 600, fontSize: 12.5, cursor: "pointer", minHeight: 32 }}>
          Leave test mode
        </button>
      </span>
    </div>
  );
}
