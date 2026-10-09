// Where each print position sits on the garment photo in the customizer.
//
// The editor stage is a 4:5 box with the garment photo contained in it —
// the same frame as Admin → Garment Photos, so an admin's "print area"
// (x / y / width / height in % of that frame) can be used directly.
//
// For each side, the MAIN position (centre-front, full-back, sleeves) uses
// the admin's print area when one has been set, otherwise a sensible
// default. Its real size in cm gives the side's cm-per-% scale, and the
// other positions on that side (left/right chest) are placed and sized
// from that scale, so their proportions always match the real print sizes.

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

/**
 * @param {Array} positions  from GET /api/customizations/print-positions
 * @param {object} colorDoc  garment colour photo doc (front/back/left/right.printArea)
 * @returns {Object<string, {left, top, width, height}>} stage-% box per position key
 */
export const resolvePrintBoxes = (positions, colorDoc) => {
  const boxes = {};
  const bySide = {};
  for (const p of positions || []) (bySide[p.side] ||= []).push(p);

  for (const [side, list] of Object.entries(bySide)) {
    const main = list.find((p) => p.main) || list[0];
    const [mw, mh] = main.cm.standard;
    const adminArea = colorDoc?.[side]?.printArea;
    const area = isUnsetArea(adminArea)
      ? DEFAULT_MAIN_BOX[side] || DEFAULT_MAIN_BOX.front
      : { left: adminArea.x, top: adminArea.y, width: adminArea.width, height: adminArea.height };
    const mainBox = fitAspect(area, mw, mh);
    boxes[main.key] = mainBox;

    // stage-width % per cm on this side
    const perCm = mainBox.width / mw;
    const centreX = mainBox.left + mainBox.width / 2;
    for (const p of list) {
      if (p === main) continue;
      const [w, h] = p.cm.standard;
      const width = w * perCm;
      const height = h * perCm * H_PER_W;
      // Chest prints: 4 cm either side of the centre line, level with the top
      // of the main print. Wearer's LEFT chest appears on the viewer's RIGHT.
      const gap = 4 * perCm;
      const left = p.key.startsWith("left") ? centreX + gap : centreX - gap - width;
      boxes[p.key] = { left, top: mainBox.top, width, height };
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
