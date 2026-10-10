// Where each print position sits on the garment photo in the customizer.
//
// The editor stage is a 4:5 box with the garment photo contained in it —
// the same frame as Admin → Garment Photos, so an admin's "print area"
// (x / y / width / height in % of that frame) can be used directly.
//
// For each side, the MAIN position (centre-front, full-back, sleeves) uses
// the admin's print zone when one has been set, otherwise a sensible
// default. The zone fixes WHERE the main print sits (its centre line and
// top edge); the other positions on that side are placed from it.
//
// HOW BIG things are comes from the scale (stage-width % per cm):
//   - Size-accurate (garment has a photo ruler + size chart): the ruler
//     marks the shoulder top and hem on the photo, so for the chosen size
//     perCm = ruler height / that size's length. A 3XL (34") is longer
//     than an M (30"), so the same print looks smaller on it — as in real
//     life. Print sizes also change per size range (XS–S / M–XL / 2XL–3XL).
//   - Otherwise: the main print's M–XL size fitted into the zone.

const STAGE_ASPECT = 4 / 5; // width / height
// % of stage height per 1% of stage width (to work in square units)
const H_PER_W = STAGE_ASPECT;

// Default main boxes (stage %), used until an admin sets a print area.
const DEFAULT_MAIN_BOX = {
  front: { left: 36, top: 27, width: 28, height: 25.6 }, // ≈ 28 × 32 cm
  back: { left: 31, top: 24, width: 38, height: 33.6 }, // ≈ 38 × 42 cm
  left: { left: 44, top: 30, width: 12, height: 10.7 }, // ≈ 9 × 10 cm
  right: { left: 44, top: 30, width: 12, height: 10.7 },
};

// The admin page's untouched default box — treat as "not set".
const isUnsetArea = (a) =>
  !a || (Math.round(a.x) === 22 && Math.round(a.y) === 27 && Math.round(a.width) === 56 && Math.round(a.height) === 58);

// Largest box with the given cm aspect that fits inside `area`, centred.
const fitAspect = (area, wCm, hCm) => {
  // convert to square units (1 unit = 1% of stage width)
  const aw = area.width;
  const ah = area.height / H_PER_W;
  const target = wCm / hCm;
  let w = aw;
  let h = aw / target;
  if (h > ah) {
    h = ah;
    w = ah * target;
  }
  return {
    left: area.left + (aw - w) / 2,
    top: area.top + ((ah - h) / 2) * H_PER_W,
    width: w,
    height: h * H_PER_W,
  };
};

const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

const CM_PER_INCH = 2.54;

/**
 * Stage-width % per cm for a garment size, from the photo ruler.
 * @param {{topPct:number, hemPct:number}} ruler  shoulder top / hem, % of stage height
 * @param {number} lengthIn  the size's length from the size chart (inches)
 */
export const rulerPerCm = (ruler, lengthIn) => {
  if (!ruler || !(ruler.hemPct > ruler.topPct) || !(lengthIn > 0)) return null;
  // stage height = stage width / STAGE_ASPECT
  return ((ruler.hemPct - ruler.topPct) / STAGE_ASPECT) / (lengthIn * CM_PER_INCH);
};

/**
 * @param {Array} positions  from GET /api/customizations/print-positions
 * @param {object} colorDoc  garment colour photo doc (front/back/left/right.printArea)
 * @param {object} [scales]  per side, the main print's M–XL cm (same endpoint)
 * @param {object} [opts]
 * @param {string} [opts.group]     size range: small | standard | large (default standard)
 * @param {string} [opts.size]      garment size ("M"): uses the area's exact size for it when known
 * @param {number} [opts.perCm]     size-accurate scale from rulerPerCm(); omit to use the zone
 * @returns {Object<string, {left, top, width, height}>} stage-% box per position key
 */
export const resolvePrintBoxes = (positions, colorDoc, scales = {}, opts = {}) => {
  const group = opts.group || "standard";
  const boxes = {};
  const bySide = {};
  for (const p of positions || []) (bySide[p.side] ||= []).push(p);

  for (const [side, list] of Object.entries(bySide)) {
    // The main print (centre front / full back / sleeve) anchors the side,
    // even when it isn't offered on this garment.
    const main = list.find((p) => p.main);
    const [mw, mh] = scales[side] || main?.cm.standard || list[0].cm.standard;
    const adminArea = colorDoc?.[side]?.printArea;
    const area = isUnsetArea(adminArea)
      ? DEFAULT_MAIN_BOX[side] || DEFAULT_MAIN_BOX.front
      : { left: adminArea.x, top: adminArea.y, width: adminArea.width, height: adminArea.height };
    const anchor = fitAspect(area, mw, mh); // where the M–XL main print sits
    const perCm = opts.perCm || anchor.width / mw;
    const centreX = anchor.left + anchor.width / 2;
    const anchorTop = anchor.top;

    for (const p of list) {
      const [w, h] = (opts.size && p.cmBySize?.[opts.size]) || p.cm[group] || p.cm.standard;
      const width = w * perCm;
      const height = h * perCm * H_PER_W;
      if (p.main) {
        boxes[p.key] = {
          left: clamp(centreX - width / 2, 0, Math.max(0, 100 - width)),
          top: clamp(anchorTop, 0, Math.max(0, 100 - height)),
          width,
          height,
        };
        continue;
      }
      const place = p.place || { align: p.key.startsWith("left") ? "wearer-left" : "wearer-right", gapCm: 4, topCm: 0 };
      const gap = (place.gapCm || 0) * perCm;
      // Wearer's LEFT appears on the viewer's RIGHT.
      const left =
        place.align === "wearer-left"
          ? centreX + gap
          : place.align === "wearer-right"
            ? centreX - gap - width
            : centreX - width / 2;
      const top = anchorTop + (place.topCm || 0) * perCm * H_PER_W;
      boxes[p.key] = {
        left: clamp(left, 0, Math.max(0, 100 - width)),
        top: clamp(top, 0, Math.max(0, 100 - height)),
        width,
        height,
      };
    }
  }
  return boxes;
};

// Element (box-relative %) -> stage-relative %, e.g. for the 3D preview.
export const elementToStage = (el, box) => ({
  ...el,
  x: box.left + (el.x / 100) * box.width,
  y: box.top + (el.y / 100) * box.height,
  width: (el.width / 100) * box.width,
  height: ((el.height || 0) / 100) * box.height,
  fontSizePct: ((el.fontSizePct || 0) / 100) * box.height,
});

export const sizeLabel = (position, groupKey = "standard") => {
  const [w, h] = position?.cm?.[groupKey] || [];
  return w ? `${w} × ${h} cm` : "";
};
