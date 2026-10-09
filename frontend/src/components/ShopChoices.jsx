// components/ShopChoices.jsx
//
// Home page: the two ways to shop, as two big cards.
//   Customizable → /customizable  (garments from Admin → Customizable)
//   Ready-made   → /ready-made    (categories from Admin → Storefront → Categories)
import { useNavigate } from "react-router-dom";
import { imageUrl } from "../utils/imageUrl";
import GarmentSilhouette from "./GarmentSilhouette";

const C = {
  ink: "#15130F",
  muted: "#71695B",
  gold: "#C9A24B",
  goldBright: "#F0D585",
  cream: "#F3F1EC",
};

function ChoiceCard({ to, eyebrow, title, text, meta, cta, image, dark, fallbackShapes }) {
  const navigate = useNavigate();
  return (
    <button type="button" className={`identee-choice${dark ? " dark" : ""}`} onClick={() => navigate(to)} aria-label={`${title} — ${cta}`}>
      <span className="identee-choice-media">
        {image ? (
          <img src={imageUrl(image, 760)} alt="" loading="lazy" />
        ) : (
          <span className="identee-choice-shapes" aria-hidden="true">
            {fallbackShapes.map((shape) => (
              <span key={shape}>
                <GarmentSilhouette shape={shape} color={dark ? "#6B5A38" : "#CBBE9C"} />
              </span>
            ))}
          </span>
        )}
      </span>
      <span className="identee-choice-body">
        <span className="identee-choice-eyebrow">{eyebrow}</span>
        <span className="identee-choice-title">{title}</span>
        <span className="identee-choice-text">{text}</span>
        {meta && <span className="identee-choice-meta">{meta}</span>}
        <span className="identee-choice-cta">{cta} →</span>
      </span>
    </button>
  );
}

/**
 * @param {object} customizable  { count, fromPrice, image }
 * @param {object} readyMade     { categoryCount, productCount, image }
 */
export default function ShopChoices({ customizable, readyMade }) {
  const custMeta = customizable.count
    ? `${customizable.count} garment${customizable.count === 1 ? "" : "s"}${customizable.fromPrice ? ` · from ₹${customizable.fromPrice}` : ""}`
    : "Coming soon";
  const readyMeta = readyMade.categoryCount
    ? `${readyMade.categoryCount} categor${readyMade.categoryCount === 1 ? "y" : "ies"}${readyMade.productCount ? ` · ${readyMade.productCount} products` : ""}`
    : "Coming soon";

  return (
    <div className="identee-choices">
      <ChoiceCard
        to="/customizable"
        eyebrow="Customizable"
        title="Design your own"
        text="Your text, photos or artwork on our tees — previewed true to size."
        meta={custMeta}
        cta="Start customizing"
        image={customizable.image}
        fallbackShapes={["tee-oversized"]}
      />
      <ChoiceCard
        to="/ready-made"
        eyebrow="Ready-made"
        title="Shop ready-made"
        text="Finished designs, ready to wear."
        meta={readyMeta}
        cta="Shop now"
        image={readyMade.image}
        dark
        fallbackShapes={["tee", "polo", "hoodie"]}
      />
      <style>{`
        .identee-choices { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px; }
        @media (max-width: 760px) { .identee-choices { grid-template-columns: minmax(0, 1fr); } }
        .identee-choice { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); text-align: left; padding: 0;
          border: 1px solid #ECE4D2; border-radius: 24px; overflow: hidden; cursor: pointer; background: #fff; color: ${C.ink};
          min-height: 320px; transition: transform .3s ease, box-shadow .3s ease; font: inherit; }
        .identee-choice:hover { transform: translateY(-4px); box-shadow: 0 22px 44px -22px rgba(21,19,15,.35); }
        .identee-choice:focus-visible { outline: 3px solid ${C.gold}; outline-offset: 3px; }
        .identee-choice.dark { background: ${C.ink}; color: #fff; border-color: ${C.ink}; }
        .identee-choice-media { position: relative; background: ${C.cream}; display: grid; place-items: center; overflow: hidden; }
        .identee-choice.dark .identee-choice-media { background: radial-gradient(circle at 50% 40%, #2A2620 0%, ${C.ink} 75%); }
        .identee-choice-media img { width: 100%; height: 100%; object-fit: contain; transition: transform .6s ease; }
        .identee-choice.dark .identee-choice-media img { object-fit: cover; } /* category photos fill the panel */
        .identee-choice:hover .identee-choice-media img { transform: scale(1.05); }
        .identee-choice-shapes { display: flex; gap: 6px; width: 86%; align-items: flex-end; }
        .identee-choice-shapes > span { flex: 1; aspect-ratio: 1 / 1.1; }
        .identee-choice-body { display: flex; flex-direction: column; justify-content: center; gap: 8px; padding: 28px 26px; }
        .identee-choice-eyebrow { font-size: 12px; letter-spacing: .2em; text-transform: uppercase; font-weight: 800; color: ${C.gold}; }
        .identee-choice-title { font-family: 'Bricolage Grotesque', 'Helvetica Neue', Arial, sans-serif; font-weight: 800;
          font-size: clamp(24px, 2.6vw, 32px); line-height: 1.1; letter-spacing: -.01em; }
        .identee-choice-text { font-size: 15px; line-height: 1.5; opacity: .8; }
        .identee-choice-meta { font-size: 13px; font-weight: 700; opacity: .7; }
        .identee-choice-cta { margin-top: 8px; align-self: flex-start; padding: 12px 20px; border-radius: 999px; font-weight: 800;
          font-size: 14px; background: linear-gradient(135deg, ${C.gold}, ${C.goldBright}); color: ${C.ink}; }
        @media (max-width: 460px) {
          .identee-choice { grid-template-columns: minmax(0, 1fr); }
          .identee-choice-media { aspect-ratio: 4 / 3; }
        }
      `}</style>
    </div>
  );
}
