// studio/AreaThumb.jsx
//
// A small tee drawing with ONE print area's box on it — the Design Room
// shows one per print area instead of text buttons, so customers pick an
// area by where it is on the tee. The box follows the area's real size for
// the chosen garment size and the same placement rules as the 3D tee
// (place.align / gapCm / topCm from server/data/printPositions.js).
import { areaCm } from "./teeModel";

const UNITS_PER_CM = 1.7; // on the 200 × 170 drawing the body is 100 wide ≈ a 58 cm chest
const FRONT = "M62 14 L84 6 Q100 22 116 6 L138 14 L186 46 L166 76 L150 66 L150 162 L50 162 L50 66 L34 76 L14 46 Z";
const BACK = "M62 14 L84 6 Q100 12 116 6 L138 14 L186 46 L166 76 L150 66 L150 162 L50 162 L50 66 L34 76 L14 46 Z";
const MAIN_TOP = { front: 50, back: 48 }; // where a side's main print starts on the drawing

// The area's box on the drawing: { x, y, w, h }.
function boxOf(position, size) {
  const [wCm, hCm] = areaCm(position, size);
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
  const leftIsRight = position.side === "front";
  let x = 100 - w / 2;
  if (place.align === "wearer-left") x = leftIsRight ? 100 + gap : 100 - gap - w;
  if (place.align === "wearer-right") x = leftIsRight ? 100 - gap - w : 100 + gap;
  return { x, y: MAIN_TOP[position.side] + (place.topCm || 0) * UNITS_PER_CM, w, h };
}

export default function AreaThumb({ position, size }) {
  const b = boxOf(position, size);
  return (
    <svg className="dr-thumb" viewBox="0 0 200 170" aria-hidden="true" focusable="false">
      <path className="tee" d={position.side === "back" ? BACK : FRONT} />
      <rect className="box" x={b.x} y={b.y} width={b.w} height={b.h} rx="2" />
    </svg>
  );
}
