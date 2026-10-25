// studio/designFinish.js
//
// The Collection maker's finishing step (Admin → Collection maker, 25 Oct 2026), done in the admin's browser
// because it needs the real fonts: the words the server placed in a box ("slot") are fitted into it — as big as
// the box allows, never bigger than the layout's letter size — and the design room's print check is run.
import { measureText } from "./konvaRender";
import { checkDesign } from "./designCheck";
import { areaCm } from "./teeModel";

const PX_PER_CM = 24; // as the design room (DesignRoomPage.jsx)
const MIN_AREA_PX = 480;
const round2 = (n) => Math.round(n * 100) / 100;

// The pixel size an area is drawn at (the same rule as the design room's areaPx).
export function areaPx(pos, size) {
  const [w, h] = areaCm(pos, size);
  const pxPerCm = Math.max(PX_PER_CM, MIN_AREA_PX / Math.min(w, h));
  return { W: Math.round(w * pxPerCm), H: Math.round(h * pxPerCm), wCm: w, hCm: h };
}

const lum = (hex) => {
  const n = parseInt(String(hex || "#000000").slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};

/**
 * One text item fitted into its slot. A slot turned a quarter (rotation 90) runs down the area: the words' length
 * goes along the slot's height.
 * @returns the item with fontSizePct and its x / y / width / height (the measured box, centred in the slot)
 */
export function fitText(el, W, H) {
  const slot = el.slot;
  if (!slot) return el;
  const turned = Math.abs((slot.rotation || 0) % 180) === 90;
  // the room the words have, in px: along the line and across it
  const along = turned ? (slot.height / 100) * H : (slot.width / 100) * W;
  const across = turned ? (slot.width / 100) * W : (slot.height / 100) * H;
  let pct = el.fontSizePct || 15;
  for (let i = 0; i < 3; i++) {
    const m = measureText({ ...el, fontSizePct: pct }, H);
    const k = Math.min(along / m.w, across / m.h);
    if (k >= 0.995 && i > 0) break;
    pct = Math.min(el.fontSizePct || 15, pct * k * 0.98);
  }
  const m = measureText({ ...el, fontSizePct: pct }, H);
  const width = (m.w / W) * 100;
  const height = (m.h / H) * 100;
  const cx = slot.x + slot.width / 2;
  const cy = slot.y + slot.height / 2;
  const { slot: _drop, ...rest } = el; // eslint-disable-line no-unused-vars
  return { ...rest, fontSizePct: round2(pct), width: round2(width), height: round2(height), x: round2(cx - width / 2), y: round2(cy - height / 2), rotation: slot.rotation || 0 };
}

/**
 * Fits every slotted text and runs the print check. Fixes it can make safely (a colour that doesn't show, an
 * item over the edge) are made; the rest is returned as plain sentences for the admin.
 * @returns {{ elements, issues: string[] }}
 */
export function finishElements(elements, positions, { size, fabricHex }) {
  const byKey = Object.fromEntries(positions.map((p) => [p.key, p]));
  let els = elements.map((el, i) => {
    const pos = byKey[el.position];
    const base = { ...el, id: el.id || `el${i}` };
    if (el.type !== "text" || !pos) return base;
    const { W, H } = areaPx(pos, size);
    return fitText(base, W, H);
  });
  const inkDefault = lum(fabricHex) < 0.55 ? "#FFFFFF" : "#141110";
  const opts = { fabricHex, inkDefault, cmOf: (pos) => areaPx(pos, size) };
  // the safe fixes once, then what is left is reported
  for (const issue of checkDesign(els, positions, opts)) {
    if (issue.kind === "contrast" || (issue.kind === "outside" && !issue.measure)) {
      els = els.map((e) => (e.id === issue.elId ? { ...e, ...issue.patch } : e));
    }
  }
  const issues = checkDesign(els, positions, opts).map((i) => i.text);
  return { elements: els, issues };
}
