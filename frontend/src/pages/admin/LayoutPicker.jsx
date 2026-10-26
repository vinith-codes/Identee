// Admin → Collection maker: the layouts, each drawn on a small tee (front and back), to pick from (25 Oct 2026).
// A gold box is a picture, a dark box with lines is words. Only layouts that fit the chosen products are shown.

// Where each print area sits on the sketch (a 100 × 110 tee). Front: the wearer's left is on the viewer's right.
const AREAS = {
  front: {
    "centre-front": [34, 22, 32, 34],
    "full-front": [28, 18, 44, 66],
    "left-chest": [56, 20, 14, 14],
    "right-chest": [30, 20, 14, 14],
    "vertical-front": [45, 18, 10, 66],
    "front-right-vertical": [28, 18, 10, 66],
    "left-sleeve": [80, 19, 11, 11],
    "right-sleeve": [9, 19, 11, 11],
  },
  back: {
    "full-back": [28, 20, 44, 48],
    "top-back": [29, 12, 42, 10],
    "centre-back": [29, 14, 42, 66],
    "vertical-back": [45, 14, 10, 66],
  },
};
const TEE = (neck) => `M30 8 L42 4 Q50 ${neck} 58 4 L70 8 L95 22 L86 38 L76 32 L76 104 L24 104 L24 32 L14 38 L5 22 Z`;

function Sketch({ parts, places, side, x }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <path d={TEE(side === "front" ? 13 : 8)} fill="#F4EFE4" stroke="#C9BFA8" strokeWidth="1.2" strokeLinejoin="round" />
      {parts.map((p, i) => {
        const area = AREAS[side][p.area];
        if (!area) return null;
        const box = places[p.place] || places.full;
        const [ax, ay, aw, ah] = area;
        const rx = ax + (box.x / 100) * aw;
        const ry = ay + (box.y / 100) * ah;
        const rw = (box.width / 100) * aw;
        const rh = (box.height / 100) * ah;
        if (p.kind === "words") {
          const down = rw < rh * 0.5; // a strip: the words run down it
          const lines = [0.35, 0.65].map((t) =>
            down ? (
              <line key={t} x1={rx + rw * t} y1={ry + 2} x2={rx + rw * t} y2={ry + rh - 2} stroke="#F4EFE4" strokeWidth="1" />
            ) : (
              <line key={t} x1={rx + 2} y1={ry + rh * t} x2={rx + rw - 2} y2={ry + rh * t} stroke="#F4EFE4" strokeWidth="1" />
            ),
          );
          return (
            <g key={i}>
              <rect x={rx} y={ry} width={rw} height={rh} rx="1.5" fill="#2B2620" />
              {lines}
            </g>
          );
        }
        return <rect key={i} x={rx} y={ry} width={rw} height={rh} rx="1.5" fill="#C9A24B" stroke="#9C7A2E" strokeWidth="0.8" />;
      })}
    </g>
  );
}

// One layout on a front and a back tee.
export function LayoutSketch({ layout, places }) {
  return (
    <svg viewBox="0 0 210 112" role="img" aria-label={layout.label} style={{ width: "100%", height: "auto", display: "block" }}>
      <Sketch parts={layout.parts} places={places} side="front" x={0} />
      <Sketch parts={layout.parts} places={places} side="back" x={108} />
      <text x="50" y="111" textAnchor="middle" fontSize="7" fill="#8A877F" fontFamily="Inter, sans-serif">
        Front
      </text>
      <text x="158" y="111" textAnchor="middle" fontSize="7" fill="#8A877F" fontFamily="Inter, sans-serif">
        Back
      </text>
    </svg>
  );
}

/**
 * The layouts that fit at least one of the chosen products, to tick.
 * @param garments  the chosen product keys (all products' layouts while none is chosen)
 */
export default function LayoutPicker({ setup, garments, value, onChange }) {
  const chosen = setup.garments.filter((g) => !garments.length || garments.includes(g.key));
  const fitsOf = (key) => chosen.filter((g) => g.layouts.some((l) => l.key === key));
  const layouts = setup.layouts.filter((l) => fitsOf(l.key).length);
  const toggle = (key) => onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  return (
    <div className="cm-lcards">
      {layouts.map((l) => {
        const fits = fitsOf(l.key);
        return (
          <button key={l.key} type="button" className="cm-lcard" aria-pressed={value.includes(l.key)} onClick={() => toggle(l.key)}>
            <LayoutSketch layout={l} places={setup.places} />
            <span className="cm-lcard-name">{l.label}</span>
            <span className="cm-lcard-fit">{fits.length === chosen.length ? `Suits: ${l.suits}` : `Only on: ${fits.map((g) => g.label).join(", ")}`}</span>
          </button>
        );
      })}
    </div>
  );
}
