// studio/hangerBoxes.js — where each print sits on the garment's hanger photo (24 Nov 2026; hangerPhoto.js makes the
// pictures). Plain maths, no browser: true to size from the photo ruler, measured from the collar seam like the print
// team (panelModel.js areaBoxCm).
import { TEE_MODELS } from "./teeModel";
import { areaBoxCm } from "./panelModel";

// Where the collar seam is on the colour photos (the bottom of the rib at the centre line), % of the photo's height.
// Measured 24 Nov 2026 on the live photos (800 × 1000; every colour of a garment is made from the same photo, and the
// boys', girls' and kids' round necks share one): Oversized front 340 / back 288 px, Round Neck front 371 / back 339.
// A new photo for a garment needs these measured again.
export const PHOTO_SEAM = [
  { model: TEE_MODELS.oversized, front: 34.0, back: 28.8 },
  { model: TEE_MODELS.regular, front: 37.1, back: 33.9 },
];
export const seamOf = (model) => PHOTO_SEAM.find((s) => s.model === model) || null;
const SIDES = ["front", "back", "left", "right"];

/**
 * Where each print sits on the photo, in % of the photo (left / top / width / height, like a CSS box).
 * ruler: the garment's photoRuler { topPct, hemPct } (shoulder top and hem of the photo's tee); lengthIn: the size's
 * length (inches) — so 1 cm of the tee is (hemPct − topPct) ÷ length of the photo's height. aspect = width ÷ height.
 * zones: the colour photo's sleeve print zones ({ left: { x, y, width, height } } in %) — the side photos have no ruler
 * line, so a sleeve print is centred in its zone (at the same cm scale).
 * -> { [positionKey]: { side, left, top, width, height } } (only positions that can be placed)
 */
export function photoBoxes({ positions, size, garment, model, ruler, lengthIn, aspect = 0.8, zones = {} }) {
  const seam = seamOf(model);
  if (!seam || !ruler || !(ruler.hemPct > ruler.topPct) || !(lengthIn > 0)) return {};
  const perCmH = (ruler.hemPct - ruler.topPct) / (lengthIn * 2.54); // % of the height per cm
  const perCmW = perCmH / aspect; // % of the width per cm
  const out = {};
  for (const pos of positions || []) {
    if (!SIDES.includes(pos.side)) continue;
    const b = areaBoxCm(pos, size, garment);
    if (!(b.w > 0) || !(b.h > 0)) continue;
    const width = b.w * perCmW;
    const height = b.h * perCmH;
    if (pos.side === "front" || pos.side === "back") {
      // the wearer's left is on the viewer's right from the front, on the viewer's left from the back
      const across = (pos.side === "front" ? 1 : -1) * b.across * perCmW;
      out[pos.key] = { side: pos.side, left: 50 + across - width / 2, top: seam[pos.side] + b.down * perCmH, width, height };
      continue;
    }
    const z = zones[pos.side];
    if (!z) continue;
    out[pos.key] = { side: pos.side, left: z.x + z.width / 2 - width / 2, top: z.y + z.height / 2 - height / 2, width, height };
  }
  return out;
}
