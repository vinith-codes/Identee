// components/shop/TrendPhotoBox.jsx — "Your photo, GTA style" (23 Nov 2026)
// The owner: "The customer wants to know they can make the GTA version of their image." A trend's collection in Shop
// your IDENTEE ("GTA · …" tees, made in Admin → Trends) shows this box: the before / after example and one button.
//   - on the collection's page (CollectionPage): which tee to start from — Oversized, Round Neck Men or Women (each
//     opens that "Make your own" tee's page);
//   - on a tee's page (ReadyDesignPage): "Put my photo on it" — the customer's own copy opens in the design room with
//     the trend's assistant asking for the photo (the logo stays locked on the front).
import { Link } from "react-router-dom";
import { imageUrl } from "../../utils/imageUrl";

const ink = "#15130F";
const gold = "#C9A24B";

// the before → after pictures (the example alone when there is no "before")
function BeforeAfter({ trend, small }) {
  const h = small ? 92 : 150;
  const pic = { height: h, width: Math.round(h * 0.78), objectFit: "cover", borderRadius: 10, display: "block", background: "#2A2622" };
  if (!trend.example) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }} aria-hidden="true">
      {trend.before && (
        <>
          <span style={{ display: "grid", gap: 3, justifyItems: "center", fontSize: 11, fontWeight: 700, letterSpacing: ".08em" }}>
            <img src={imageUrl(trend.before, 300)} alt="" style={pic} loading="lazy" />
            YOUR PHOTO
          </span>
          <span style={{ fontSize: 22, fontWeight: 800, color: gold }}>→</span>
        </>
      )}
      <span style={{ display: "grid", gap: 3, justifyItems: "center", fontSize: 11, fontWeight: 700, letterSpacing: ".08em" }}>
        <img src={imageUrl(trend.example, 300)} alt="" style={pic} loading="lazy" />
        {trend.name.toUpperCase()}
      </span>
    </div>
  );
}

/**
 * trend: from useTrend. starts: on the collection page, [{ label, to }] — the "Make your own" tees to start from.
 * onGo / busy / addOn: on a tee's page, the button and the picture price.
 */
export default function TrendPhotoBox({ trend, starts = null, onGo = null, busy = false, addOn = 0, own = false }) {
  if (!trend) return null;
  const title = starts ? `Make your own ${trend.name} tee` : own ? "Put your photo on it" : "Want yourself on the back?";
  return (
    <section
      aria-label={title}
      style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, margin: starts ? "0 0 22px" : own ? "6px 0 16px" : "16px 0 0", padding: starts ? "18px 20px" : "14px 16px", borderRadius: 16, background: ink, color: "#fff" }}
    >
      <BeforeAfter trend={trend} small={!starts} />
      <div style={{ flex: "1 1 220px", minWidth: 0, display: "grid", gap: 8, justifyItems: "start" }}>
        <b style={{ fontSize: starts ? 20 : 16, lineHeight: 1.25 }}>📸 {title}</b>
        <span style={{ fontSize: 14, lineHeight: 1.5, color: "#E9E2D3" }}>
          Send a photo of you (or your friends). We redraw it in {trend.name} and show you three back designs to pick from. The logo stays on the
          front; you can still add your name or anything else.
          {addOn > 0 ? ` Your photo adds ₹${addOn}.` : ""}
        </span>
        {starts ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {starts.map((s) => (
              <Link key={s.to} to={s.to} style={{ padding: "11px 18px", borderRadius: 999, background: gold, color: ink, fontWeight: 800, fontSize: 14, textDecoration: "none" }}>
                {s.label}
              </Link>
            ))}
          </div>
        ) : (
          <button type="button" onClick={onGo} disabled={busy} style={{ padding: "11px 20px", borderRadius: 999, border: "none", background: gold, color: ink, fontWeight: 800, fontSize: 14, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
            {busy ? "Opening…" : "Put my photo on it"}
          </button>
        )}
      </div>
    </section>
  );
}
