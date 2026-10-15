// studio/AreaThumb.jsx
//
// A small tee drawing with ONE print area's box on it — the Design Room
// shows one per print area instead of text buttons, so customers pick an
// area by where it is on the tee. The box follows the area's real size for
// the chosen garment size and the same placement rules as the 3D tee
// (place.align / gapCm / topCm from server/data/printPositions.js).
import { areaCm } from "./teeModel";

const TEE_UNITS_PER_CM = 1.7; // on the 200 × 170 drawing the body is 100 wide ≈ a 58 cm chest
const FRONT = "M62 14 L84 6 Q100 22 116 6 L138 14 L186 46 L166 76 L150 66 L150 162 L50 162 L50 66 L34 76 L14 46 Z";
const BACK = "M62 14 L84 6 Q100 12 116 6 L138 14 L186 46 L166 76 L150 66 L150 162 L50 162 L50 66 L34 76 L14 46 Z";
// the co-ord set's shorts, from the front (waistband at the top, the two legs below)
const SHORTS = "M46 16 L154 16 L163 156 L108 156 L100 100 L92 156 L37 156 Z";
const SHORTS_UNITS_PER_CM = 3; // the drawing's 140 units of length ≈ 44 cm of shorts at M
const MAIN_TOP = { front: 50, back: 48, shorts: 16 + 25 * SHORTS_UNITS_PER_CM }; // where a side's main print starts on the drawing

// The area's box on the drawing: { x, y, w, h }.
function boxOf(position, size) {
  const [wCm, hCm] = areaCm(position, size);
  const UNITS_PER_CM = position.side === "shorts" ? SHORTS_UNITS_PER_CM : TEE_UNITS_PER_CM;
  const w = wCm * UNITS_PER_CM;
  const h = hCm * UNITS_PER_CM;
  if (position.side === "left" || position.side === "right") {
    // the wearer's left sleeve is on the viewer's right
    const cx = position.side === "left" ? 160 : 40;
    return { x: cx - w / 2, y: 47 - h / 2, w, h };
  }
  const place = position.place || { align: "centre", topCm: 0 };
  const gap = (place.gapCm || 0) * UNITS_PER_CM;
  // wearer's left = viewer's right on the front, viewer's left on the back
  const leftIsRight = position.side === "front" || position.side === "shorts";
  let x = 100 - w / 2;
  if (place.align === "wearer-left") x = leftIsRight ? 100 + gap : 100 - gap - w;
  if (place.align === "wearer-right") x = leftIsRight ? 100 - gap - w : 100 + gap;
  return { x, y: MAIN_TOP[position.side] + (place.topCm || 0) * UNITS_PER_CM, w, h };
}

// How light a colour is, 0 (black) to 1 (white).
const lightness = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return 1;
  const n = parseInt(m[1], 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};

// fabric: the tee's colour — the drawing is in that colour, like the tee being designed.
// print: a small picture of what is on this area (a data URL), shown in the box.
export default function AreaThumb({ position, size, print, fabric }) {
  const b = boxOf(position, size);
  const dark = fabric ? lightness(fabric) < 0.5 : false; // a dark tee gets a light box and outline
  return (
    <svg className={`dr-thumb${print ? " has-print" : ""}${dark ? " on-dark" : ""}`} viewBox="0 0 200 170" aria-hidden="true" focusable="false">
      <path className="tee" d={position.side === "shorts" ? SHORTS : position.side === "back" ? BACK : FRONT} style={fabric ? { fill: fabric } : undefined} />
      {print ? <image href={print} x={b.x} y={b.y} width={b.w} height={b.h} preserveAspectRatio="none" /> : <rect className="box" x={b.x} y={b.y} width={b.w} height={b.h} rx="2" />}
    </svg>
  );
}
