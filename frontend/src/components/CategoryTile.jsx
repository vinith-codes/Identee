import { useNavigate } from "react-router-dom";
import GarmentSilhouette from "./GarmentSilhouette";
import { imageUrl } from "../utils/imageUrl";

const C = {
  ink: "#15130F",
  gold: "#C9A24B",
  goldBright: "#F0D585",
  cream: "#FBF7EE",
};

// Garment outline used when a category has no photo yet.
const SHAPE_BY_SLUG = {
  "t-shirts": "tee",
  polos: "polo",
  hoodies: "hoodie",
  sweatshirts: "sweatshirt",
  "kids-wear": "tee",
};
const placeholderShape = (category) =>
  SHAPE_BY_SLUG[category.slug] ||
  (/hood/i.test(category.name) ? "hoodie" : /polo/i.test(category.name) ? "polo" : "tee");

const btn = (primary) => ({
  flex: 1,
  padding: "8px 10px",
  borderRadius: 999,
  border: primary ? "none" : "1px solid rgba(255,255,255,0.7)",
  background: primary ? `linear-gradient(135deg, ${C.gold}, ${C.goldBright})` : "rgba(0,0,0,0.25)",
  color: primary ? C.ink : "#fff",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
  backdropFilter: "blur(4px)",
});

// Home-page "Ready-made" category tile (portrait 4:5). Image fills the tile
// with a dark gradient for readable text; categories without a photo show a
// branded garment outline instead of a broken image. Customizing lives in
// its own home-page section (CustomizableGarments), not on these tiles.
export default function CategoryTile({ category }) {
  const navigate = useNavigate();
  const disabled = category.comingSoon;
  const shopUrl = `/category/${category.slug}`;
  const count = category.productCount;

  return (
    <div
      className="identee-cat-tile"
      role={disabled ? undefined : "link"}
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && navigate(shopUrl)}
      onKeyDown={(e) => !disabled && e.key === "Enter" && navigate(shopUrl)}
      aria-label={disabled ? `${category.name} — coming soon` : `Shop ${category.name}`}
      style={{
        position: "relative",
        aspectRatio: "4 / 5",
        borderRadius: 18,
        overflow: "hidden",
        cursor: disabled ? "default" : "pointer",
        background: `radial-gradient(circle at 50% 35%, #2A2620 0%, ${C.ink} 75%)`,
        filter: disabled ? "grayscale(0.6)" : "none",
        opacity: disabled ? 0.75 : 1,
      }}
    >
      {category.image ? (
        <img
          className="identee-cat-tile-img"
          src={imageUrl(category.image, 600)}
          alt={category.name}
          loading="lazy"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <div
          aria-hidden="true"
          className="identee-cat-tile-img"
          style={{ position: "absolute", inset: "14% 14% 38%", opacity: 0.55 }}
        >
          <GarmentSilhouette shape={placeholderShape(category)} color="#6B5A38" />
        </div>
      )}

      {/* readable-text gradient */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.78) 100%)",
        }}
      />

      {disabled && (
        <span
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            background: C.cream,
            color: C.ink,
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.08em",
            padding: "4px 8px",
            borderRadius: 999,
          }}
        >
          COMING SOON
        </span>
      )}

      <div style={{ position: "absolute", left: 14, right: 14, bottom: 14, color: "#fff" }}>
        <p style={{ margin: 0, fontSize: 19, fontWeight: 800, lineHeight: 1.15 }}>
          {category.name}
        </p>
        {!disabled && count !== undefined && (
          <p style={{ margin: "3px 0 0", fontSize: 12, opacity: 0.85 }}>
            {count > 0 ? `${count} product${count === 1 ? "" : "s"}` : "New styles coming"}
          </p>
        )}
        {!disabled && (
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <button
              type="button"
              style={btn(true)}
              onClick={(e) => {
                e.stopPropagation();
                navigate(shopUrl);
              }}
            >
              Shop now
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Responsive grid: 5 across on desktop, 3 on tablet, 2 on phones.
export function CategoryGrid({ categories, loading }) {
  if (loading && !categories.length) {
    return (
      <div className="identee-cat-grid">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            style={{ aspectRatio: "4 / 5", borderRadius: 18, background: "#F1ECE0" }}
          />
        ))}
        <CategoryGridStyles />
      </div>
    );
  }
  if (!categories.length) return null;
  return (
    <div className="identee-cat-grid">
      {categories.map((c) => (
        <CategoryTile key={c._id} category={c} />
      ))}
      <CategoryGridStyles />
    </div>
  );
}

function CategoryGridStyles() {
  return (
    <style>{`
      .identee-cat-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; }
      @media (max-width: 1024px) { .identee-cat-grid { grid-template-columns: repeat(3, 1fr); } }
      @media (max-width: 640px)  { .identee-cat-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; } }
      .identee-cat-tile { transition: transform .3s ease, box-shadow .3s ease; }
      .identee-cat-tile:hover { transform: translateY(-4px); box-shadow: 0 18px 36px -18px rgba(21,19,15,.35); }
      .identee-cat-tile .identee-cat-tile-img { transition: transform .6s ease; }
      .identee-cat-tile:hover .identee-cat-tile-img { transform: scale(1.06); }
      .identee-cat-tile:focus-visible { outline: 3px solid #C9A24B; outline-offset: 2px; }
    `}</style>
  );
}
