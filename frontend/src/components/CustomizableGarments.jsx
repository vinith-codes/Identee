// components/CustomizableGarments.jsx
//
// /customizable: one card per live customizable garment (Admin →
// Customizable). "Start designing" opens the 3D design room, where the
// customer picks the colour and size. Drafts announced as "coming soon"
// (soon) get the same card with their catalogue photo and a greyed-out button.
import { useNavigate } from "react-router-dom";
import { imageUrl } from "../utils/imageUrl";
import { defaultColour, isSellable } from "../utils/garments";

const C = {
  ink: "#15130F",
  muted: "#6B6559",
  gold: "#C9A24B",
  goldBright: "#F0D585",
  border: "#EAE3CF",
  cream: "#FBF7EE",
};

const span = (list) => (list.length > 1 ? `${list[0]}–${list[list.length - 1]}` : list[0] || "");
// "S–3XL"; with kids' age sizes too: "Ages 4–14 · XS–5XL"
const sizeRange = (sizes) => {
  if (!sizes?.length) return "";
  const isAge = (s) => /^\d+(-\d+)?$/.test(String(s).trim()); // "4-6", "11" — not "2XL"
  const kids = sizes.filter(isAge);
  const adults = sizes.filter((s) => !isAge(s));
  const ages = kids.length ? `Ages ${String(kids[0]).split("-")[0]}–${String(kids[kids.length - 1]).split("-").pop()}` : "";
  return [ages, span(adults)].filter(Boolean).join(" · ");
};

function GarmentCard({ garment, photos }) {
  const navigate = useNavigate();
  // Colour is picked in the design room's first step — the card shows the
  // white tee (or the first colour with a photo) and opens the room in it.
  const colour = defaultColour(garment, photos);
  const photo = colour && photos.find((p) => p.colorSlug === colour.slug)?.front?.imageUrl;
  // new=1: always start an empty design (an unfinished one is offered inside)
  const start = () => navigate(`/customize/${garment.key}?new=1${colour ? `&color=${colour.slug}` : ""}`);

  const colourCount = garment.colors?.length || 0;
  const facts = [
    garment.basePrice > 0 && `From ₹${garment.basePrice}`,
    sizeRange(garment.sizes),
    colourCount > 1 && `${colourCount} colours`,
    (garment.fabrics || []).map((f) => f.name).join(" · "),
  ].filter(Boolean);

  return (
    <article className="identee-cust-card">
      <button type="button" onClick={start} className="identee-cust-photo" aria-label={`Design your own ${garment.label}`}>
        {photo ? (
          <img src={imageUrl(photo, 640)} alt={garment.label} loading="lazy" />
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
        <button type="button" onClick={start} className="identee-cust-cta">
          Start designing →
        </button>
      </div>
    </article>
  );
}

// A product that is coming soon: the same card, with its catalogue photo and nothing to click into yet.
function ComingSoonCard({ garment }) {
  const facts = [
    garment.basePrice > 0 && `From ₹${garment.basePrice}`,
    sizeRange(garment.sizes),
    garment.colourCount > 1 && `${garment.colourCount} colours`,
    (garment.fabrics || []).map((f) => f.name).join(" · "),
  ].filter(Boolean);
  return (
    <article className="identee-cust-card is-soon">
      <div className="identee-cust-photo">
        {garment.catalogueImage ? (
          <img src={imageUrl(garment.catalogueImage, 640)} alt={garment.label} loading="lazy" style={{ objectFit: "cover" }} />
        ) : (
          <span style={{ color: C.muted, fontSize: 13 }}>{garment.label}</span>
        )}
        <span className="identee-cust-badge">Coming soon</span>
      </div>
      <div style={{ padding: "16px 18px 18px" }}>
        <h3 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.ink }}>{garment.label}</h3>
        {facts.length > 0 && <p style={{ margin: "4px 0 0", fontSize: 13, color: C.muted }}>{facts.join("  ·  ")}</p>}
        <button type="button" className="identee-cust-cta is-soon" disabled>
          Coming soon
        </button>
      </div>
    </article>
  );
}

export default function CustomizableGarments({ garments: all, images, loading, soon = [] }) {
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
  if (!garments.length && !soon.length) {
    return <p style={{ color: C.muted, margin: 0 }}>Customizable garments are coming soon.</p>;
  }
  return (
    <div className="identee-cust-grid">
      {garments.map((g) => (
        <GarmentCard key={g._id} garment={g} photos={images.filter((p) => p.garmentType === g.key)} />
      ))}
      {soon.map((g) => (
        <ComingSoonCard key={g._id || g.key} garment={g} />
      ))}
      <Styles />
    </div>
  );
}

function Styles() {
  return (
    <style>{`
      .identee-cust-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 320px)); gap: 20px; }
      @media (max-width: 700px) { .identee-cust-grid { grid-template-columns: minmax(0, 1fr); } }
      .identee-cust-card { background: #fff; border: 1px solid ${C.border}; border-radius: 20px; overflow: hidden;
        transition: transform .3s ease, box-shadow .3s ease; }
      .identee-cust-card:hover { transform: translateY(-4px); box-shadow: 0 18px 36px -18px rgba(21,19,15,.3); }
      .identee-cust-photo { position: relative; display: grid; place-items: center; width: 100%; aspect-ratio: 4 / 5;
        background: #F3F1EC; border: none; padding: 0; cursor: pointer; }
      .identee-cust-photo img { width: 100%; height: 100%; object-fit: contain; transition: transform .6s ease; }
      .identee-cust-card:hover .identee-cust-photo img { transform: scale(1.04); }
      .identee-cust-badge { position: absolute; top: 12px; left: 12px; background: ${C.ink}; color: ${C.goldBright};
        font-size: 10px; font-weight: 800; letter-spacing: .08em; padding: 4px 9px; border-radius: 999px; text-transform: uppercase; }
      .identee-cust-cta { margin-top: 14px; width: 100%; min-height: 46px; border: none; border-radius: 999px; cursor: pointer;
        background: linear-gradient(135deg, ${C.gold}, ${C.goldBright}); color: ${C.ink}; font-weight: 800; font-size: 14px; }
      .identee-cust-cta:hover { filter: brightness(1.04); }
      .identee-cust-card.is-soon .identee-cust-photo { cursor: default; }
      .identee-cust-cta.is-soon { background: #EFEAE0; color: ${C.muted}; cursor: default; }
      .identee-cust-cta.is-soon:hover { filter: none; }
    `}</style>
  );
}
