// components/PriceTag.jsx
//
// A garment's price as customers see it (launch pricing, 16 Oct 2026): the "was" price struck through, the
// price, and — when a coupon is set to show on the site (Admin → Offers) — "Extra 10% off with code …".
import { useSiteOffer } from "../utils/sitePricing";

const rupees = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

/**
 * @param price    what it costs now (₹699)
 * @param was      the struck-out price (₹899); nothing struck when it isn't higher
 * @param from     "From ₹699" wording (cards)
 * @param offer    show the on-site coupon line under the price
 * @param tone     "light" (dark backgrounds) or "dark" (default)
 */
export default function PriceTag({ price, was = 0, from = false, offer = false, size = 15, tone = "dark" }) {
  const siteOffer = useSiteOffer();
  const ink = tone === "light" ? "#FFFFFF" : "#15130F";
  const muted = tone === "light" ? "rgba(255,255,255,.65)" : "#8A8172";
  const gold = tone === "light" ? "#F0D585" : "#8C6A1F";
  const struck = was > price;
  const off = struck ? Math.round(((was - price) / was) * 100) : 0;
  return (
    <span style={{ display: "inline-grid", gap: 2 }}>
      <span style={{ display: "inline-flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
        {from && <span style={{ fontSize: size * 0.82, color: muted }}>From</span>}
        {struck && <s style={{ fontSize: size * 0.85, color: muted }}>{rupees(was)}</s>}
        <b style={{ fontSize: size, color: ink, fontWeight: 800 }}>{rupees(price)}</b>
        {off > 0 && <span style={{ fontSize: size * 0.75, fontWeight: 700, color: gold }}>{off}% off</span>}
      </span>
      {offer && siteOffer && (
        <span style={{ fontSize: size * 0.75, fontWeight: 600, color: gold }}>
          + Extra {siteOffer.offerPercentage}% off with code <b>{siteOffer.code}</b>
        </span>
      )}
    </span>
  );
}
