// components/CustomizableGarments.jsx
//
// /customizable: one card per live customizable garment (Admin →
// Customizable; drafts never show). "Start designing" opens the 3D design
// room, where the customer picks the colour and size.
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

const sizeRange = (sizes) => (sizes?.length ? (sizes.length > 1 ? `${sizes[0]}–${sizes[sizes.length - 1]}` : sizes[0]) : "");

function GarmentCard({ garment, photos }) {
  const navigate = useNavigate();
  // Colour is picked in the design room's first step — the card shows the
  // white tee (or the first colour with a photo) and opens the room in it.
  const colour = defaultColour(garment, photos);
  const photo = colour && photos.find((p) => p.colorSlug === colour.slug)?.front?.imageUrl;
  const start = () => navigate(`/customize/${garment.key}${colour ? `?color=${colour.slug}` : ""}`);

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
    `}</style>
  );
}
