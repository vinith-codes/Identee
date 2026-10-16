// The thin strip at the very top of every customer page: the live offers, read from Admin — the coupon shown on the
// site (Admin → Storefront → Coupons, "show on site"), free shipping (Admin → Orders → Shipping rates) — a promise,
// and the text from Admin → Storefront → Offer banner when one is live. One line on wide screens; on phones the
// messages take turns.
import { useEffect, useState } from "react";
import { useShippingRule, useSiteOffer } from "../utils/sitePricing";

const css = `
  .ofs { background: #15130F; color: #fff; text-align: center; padding: 9px 16px; font: 600 13px/1.4 Inter, "Helvetica Neue", Arial, sans-serif; letter-spacing: .02em; }
  .ofs em { font-style: normal; color: #F0D585; }
  .ofs .sep { color: #6F6A60; margin: 0 12px; }
  .ofs .one { display: none; }
  @media (max-width: 760px) {
    .ofs { font-size: 12px; padding: 8px 12px; min-height: 34px; }
    .ofs .all { display: none; }
    .ofs .one { display: inline; animation: ofs-in .45s ease both; }
  }
  @keyframes ofs-in { from { opacity: 0; transform: translateY(4px); } }
  @media (prefers-reduced-motion: reduce) { .ofs .one { animation: none; } }
`;

export default function OfferStrip({ adminText }) {
  const offer = useSiteOffer();
  const ship = useShippingRule();
  const [turn, setTurn] = useState(0);

  const messages = [
    offer?.code && offer?.offerPercentage ? (
      <>Extra {offer.offerPercentage}% off with code <em>{offer.code}</em></>
    ) : null,
    ship?.freeFrom ? <>Free shipping from {ship.freeFrom} tees</> : null,
    <>Printed true to your size</>,
    adminText ? <>{adminText}</> : null,
  ].filter(Boolean);

  // phones: one message at a time
  useEffect(() => {
    if (messages.length < 2) return;
    const t = setInterval(() => setTurn((n) => n + 1), 3800);
    return () => clearInterval(t);
  }, [messages.length]);

  if (!messages.length) return null;
  const now = turn % messages.length;
  return (
    <div className="ofs" role="note" aria-label="Offers">
      <style>{css}</style>
      <span className="all">
        {messages.map((m, i) => (
          <span key={i}>
            {i > 0 && <span className="sep" aria-hidden="true">·</span>}
            {m}
          </span>
        ))}
      </span>
      <span className="one" key={now} aria-hidden="true">{messages[now]}</span>
    </div>
  );
}
