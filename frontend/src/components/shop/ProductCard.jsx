// components/shop/ProductCard.jsx
//
// One ready-made product in a shop grid: photo (second photo on hover),
// discount / out-of-stock badge, "Customizable" tag (a Studio tee), name,
// style, who it is for, colour dots (tap one to see that colour) and price. Opens the product page in the chosen colour;
// `from` ({ to, label }) is the page it was opened from, so the product
// page's back link returns there (e.g. Men's T-shirts · Oversized).
import { useState } from "react";
import { Link } from "react-router-dom";
import { imageUrl } from "../../utils/imageUrl";
import { colourHex, isLight } from "../../utils/colours";
import { money } from "../../utils/money";
import { wearerFor } from "../../utils/wearerFor";

const MAX_DOTS = 5;

export default function ProductCard({ p, from = null }) {
  const [pick, setPick] = useState(null); // colour chosen on the card
  const colour = pick || p.colors?.find((c) => c._id === p._id) || null;
  const photo = pick?.image || p.images?.[0];
  const hoverPhoto = !pick && p.images?.[1];
  const price = p.subscriptionPrice && p.subscriptionPrice < p.price ? p.subscriptionPrice : p.price;
  const showOld = p.oldPrice > price;
  const off = showOld ? Math.round(((p.oldPrice - price) / p.oldPrice) * 100) : 0;
  // a Studio tee (printed to order) opens the design's own page (sizes, colours, Edit this design)
  // (the category's wearer goes along, so the design page shows a man's photos from the men's category, a woman's
  // from the women's)
  const who = p.readyDesignSlug ? wearerFor(`${p.category?.name || ""} ${p.category?.slug || ""}`) : null;
  const href = p.readyDesignSlug ? `/ready-made/design/${p.readyDesignSlug}${who ? `?for=${who}` : ""}` : `/product/${colour?._id || p._id}`;
  const label = `${p.brandname}${colour?.name ? `, ${colour.name}` : ""}, ${money(price)}`;

  return (
    <article className={`sh-card${p.inStock ? "" : " is-out"}`}>
      <Link to={href} state={from ? { from } : undefined} className="sh-card-img" aria-label={label}>
        {photo ? (
          <>
            <img src={imageUrl(photo, 600)} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
            {hoverPhoto && <img className="sh-card-alt" src={imageUrl(hoverPhoto, 600)} alt="" loading="lazy" />}
          </>
        ) : (
          <span className="sh-card-nophoto">IDENTEE</span>
        )}
        {!p.inStock ? <span className="sh-badge dark">Out of stock</span> : off >= 5 ? <span className="sh-badge gold">{off}% off</span> : null}
        {/* a Studio tee can be changed in the design room (the client, 30 Oct 2026: they should know they can) */}
        {p.customisable && <span className="sh-tag">✎ Customizable</span>}
      </Link>
      <div className="sh-card-body">
        <Link to={href} state={from ? { from } : undefined} className="sh-card-name">
          {p.brandname}
        </Link>
        <p className="sh-card-sub">{[p.garmentStyle, p.gender, p.colors?.length > 1 ? `${p.colors.length} colours` : colour?.name].filter(Boolean).join(" · ")}</p>
        {p.colors?.length > 1 && (
          <div className="sh-dots" role="group" aria-label="Colours">
            {p.colors.slice(0, MAX_DOTS).map((c) => {
              const hex = colourHex(c.name);
              const on = (colour?._id || p._id) === c._id;
              return (
                <button
                  key={c._id}
                  type="button"
                  className={`sh-dot${on ? " on" : ""}${isLight(hex) ? " light" : ""}`}
                  style={{ background: hex }}
                  title={c.name}
                  aria-label={`Show ${c.name}`}
                  aria-pressed={on}
                  onClick={() => setPick(c)}
                />
              );
            })}
            {p.colors.length > MAX_DOTS && <span className="sh-more">+{p.colors.length - MAX_DOTS}</span>}
          </div>
        )}
        <p className="sh-price">
          <b>{money(price)}</b>
          {showOld && <s>{money(p.oldPrice)}</s>}
          {price < p.price && <span className="sh-member">Member price</span>}
        </p>
      </div>
    </article>
  );
}
