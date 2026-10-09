// components/CustomizableGarments.jsx
//
// Home page → "Design your own": one card per live customizable garment
// (Admin → Customizable; drafts never show). Tap a colour dot to preview it,
// then "Start designing" opens the customizer in that colour.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { imageUrl } from "../utils/imageUrl";

const C = {
  ink: "#15130F",
  muted: "#6B6559",
  gold: "#C9A24B",
  goldBright: "#F0D585",
  border: "#EAE3CF",
  cream: "#FBF7EE",
};

const sizeRange = (sizes) => (sizes?.length ? (sizes.length > 1 ? `${sizes[0]}–${sizes[sizes.length - 1]}` : sizes[0]) : "");

function GarmentCard({ garment, photos }) {
  const navigate = useNavigate();
  // colours that have a front photo first, so the card never shows a blank
  const colours = garment.colors || [];
  const photoFor = (slug) => photos.find((p) => p.colorSlug === slug)?.front?.imageUrl;
  const firstWithPhoto = colours.find((c) => photoFor(c.slug)) || colours[0];
  const [picked, setPicked] = useState(firstWithPhoto?.slug);
  const colour = colours.find((c) => c.slug === picked) || firstWithPhoto;
  const photo = colour && (photoFor(colour.slug) || photoFor(firstWithPhoto?.slug));
  const start = () => navigate(`/customize/${garment.key}${colour ? `?color=${colour.slug}` : ""}`);

  const facts = [
    garment.basePrice > 0 && `From ₹${garment.basePrice}`,
    sizeRange(garment.sizes),
    (garment.fabrics || []).map((f) => f.name).join(" · "),
  ].filter(Boolean);

  return (
    <article className="identee-cust-card">
      <button type="button" onClick={start} className="identee-cust-photo" aria-label={`Design your own ${garment.label}`}>
        {photo ? (
          <img src={imageUrl(photo, 640)} alt={`${garment.label} in ${colour?.name || ""}`} loading="lazy" />
        ) : (
          <span style={{ color: C.muted, fontSize: 13 }}>{garment.label}</span>
        )}
        <span className="identee-cust-badge">Customizable</span>
      </button>

      <div style={{ padding: "16px 18px 18px" }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.ink }}>{garment.label}</h3>
        {facts.length > 0 && (
          <p style={{ margin: "4px 0 0", fontSize: 13, color: C.muted }}>{facts.join("  ·  ")}</p>
        )}

        {colours.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 }} role="radiogroup" aria-label="Colour">
            {colours.map((c) => (
              <button
                key={c.slug}
                type="button"
                role="radio"
                aria-checked={c.slug === colour?.slug}
                title={c.name}
                aria-label={c.name}
                onClick={() => setPicked(c.slug)}
                className={`identee-cust-dot${c.slug === colour?.slug ? " on" : ""}`}
                style={{ background: c.hex }}
              />
            ))}
          </div>
        )}
        {colour && <p style={{ margin: "6px 0 0", fontSize: 12, color: C.muted }}>{colour.name}</p>}

        <button type="button" onClick={start} className="identee-cust-cta">
          Start designing →
        </button>
      </div>
    </article>
  );
}

// Only garments that are ready to sell: a price, and at least one colour
// with a front photo. (Old test garments without these stay off the home page.)
const isSellable = (g, images) =>
  g.basePrice > 0 &&
  (g.colors || []).some((c) =>
    images.some((p) => p.garmentType === g.key && p.colorSlug === c.slug && p.front?.imageUrl),
  );

export default function CustomizableGarments({ garments: all, images, loading }) {
  const garments = all.filter((g) => isSellable(g, images));
  if (loading && !garments.length) {
    return (
      <div className="identee-cust-grid">
        {[0, 1].map((i) => (
          <div key={i} style={{ aspectRatio: "4 / 5", borderRadius: 20, background: "#F1ECE0" }} />
        ))}
        <Styles />
      </div>
    );
  }
  if (!garments.length) {
    return <p style={{ color: C.muted, margin: 0 }}>Customizable garments are coming soon.</p>;
  }
  return (
    <div className="identee-cust-grid">
      {garments.map((g) => (
        <GarmentCard key={g._id} garment={g} photos={images.filter((p) => p.garmentType === g.key)} />
      ))}
      <HowItWorks />
      <Styles />
    </div>
  );
}

const STEPS = [
  ["Pick a garment & colour", "Choose your tee and one of its colours."],
  ["Choose your size", "The preview is drawn true to size, so you see exactly how big your print will be."],
  ["Add your design", "Upload a photo or logo, add text, or pick from our art library — front, back or sleeves."],
  ["Order", "Pay online or cash on delivery. We print and ship it to you."],
];

function HowItWorks() {
  return (
    <aside className="identee-cust-how">
      <p style={{ margin: 0, fontSize: 12, letterSpacing: ".18em", textTransform: "uppercase", fontWeight: 800, color: C.goldBright }}>
        How it works
      </p>
      <ol style={{ listStyle: "none", padding: 0, margin: "16px 0 0", display: "grid", gap: 16 }}>
        {STEPS.map(([title, text], i) => (
          <li key={title} style={{ display: "flex", gap: 14 }}>
            <span
              style={{
                flexShrink: 0,
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: C.gold,
                color: C.ink,
                fontWeight: 800,
                display: "grid",
                placeItems: "center",
              }}
            >
              {i + 1}
            </span>
            <span>
              <b style={{ display: "block", fontSize: 16 }}>{title}</b>
              <span style={{ fontSize: 14, opacity: 0.8, lineHeight: 1.5 }}>{text}</span>
            </span>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function Styles() {
  return (
    <style>{`
      .identee-cust-grid { display: flex; flex-wrap: wrap; gap: 20px; align-items: stretch; }
      .identee-cust-grid > .identee-cust-card { flex: 0 1 320px; }
      .identee-cust-how { flex: 1 1 300px; background: ${C.ink}; color: #fff; border-radius: 20px; padding: 28px;
        display: flex; flex-direction: column; justify-content: center; }
      @media (max-width: 700px) { .identee-cust-grid > .identee-cust-card { flex: 1 1 100%; } }
      .identee-cust-card { background: #fff; border: 1px solid ${C.border}; border-radius: 20px; overflow: hidden;
        transition: transform .3s ease, box-shadow .3s ease; }
      .identee-cust-card:hover { transform: translateY(-4px); box-shadow: 0 18px 36px -18px rgba(21,19,15,.3); }
      .identee-cust-photo { position: relative; display: grid; place-items: center; width: 100%; aspect-ratio: 4 / 5;
        background: #F3F1EC; border: none; padding: 0; cursor: pointer; }
      .identee-cust-photo img { width: 100%; height: 100%; object-fit: contain; transition: transform .6s ease; }
      .identee-cust-card:hover .identee-cust-photo img { transform: scale(1.04); }
      .identee-cust-badge { position: absolute; top: 12px; left: 12px; background: ${C.ink}; color: ${C.goldBright};
        font-size: 10px; font-weight: 800; letter-spacing: .08em; padding: 4px 9px; border-radius: 999px; text-transform: uppercase; }
      .identee-cust-dot { width: 24px; height: 24px; border-radius: 50%; border: 1px solid rgba(0,0,0,.18); cursor: pointer; padding: 0; }
      .identee-cust-dot.on { box-shadow: 0 0 0 2px #fff, 0 0 0 4px ${C.ink}; }
      .identee-cust-dot:focus-visible { outline: 3px solid ${C.gold}; outline-offset: 3px; }
      .identee-cust-cta { margin-top: 14px; width: 100%; min-height: 46px; border: none; border-radius: 999px; cursor: pointer;
        background: linear-gradient(135deg, ${C.gold}, ${C.goldBright}); color: ${C.ink}; font-weight: 800; font-size: 14px; }
      .identee-cust-cta:hover { filter: brightness(1.04); }
    `}</style>
  );
}
