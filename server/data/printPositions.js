// IDENTEE print positions and maximum print sizes (width x height, cm).
//
// Two ways an area gets its size:
//   1. `cm` — one size from "IDENTEE_PRODUCT_DETAILS.pdf" (Print Position &
//      Size Guide): the size is for M / L / XL; XS / S are 4 cm smaller,
//      2XL / 3XL are 4 cm larger. (Centre Front, the chests, Full Back, sleeves.)
//   2. `bySize` — the exact size for each garment size, from the print team's
//      measurement sheet of 10 Oct 2026 (their groups: S–M, L–XL, 2XL–3XL;
//      XS is not sold, it uses the S size if a garment has it).
//      (Full Front, Vertical Front, Front Right Vertical, Top Back, Centre
//      Back, Vertical Back.) Lower Left / Lower Right / Lower Back are not
//      printed: no size, so they can't be offered until the admin adds one.
//
// PRINT_AREA_CATALOG lists all 15 places in the guide. The admin turns areas
// on per garment and can change any size (Admin → Customizable → set-up
// wizard → Print areas). A garment with no saved print-area settings offers
// every area that has a size.
//
// `place` says where an area sits relative to its side's MAIN print
// (centre front / full back / sleeve), in cm at size M:
//   align: centre | wearer-left | wearer-right   (left/right = the wearer's)
//   gapCm: distance from the centre line to the print's inner edge
//   topCm: how far the print's top is below the main print's top
// These are estimates until the print team sends exact start distances
// (docs/print-requests/IDENTEE_Oversized_Measurement_Request.pdf).
//
// Served to the customizer by GET /api/customizations/print-positions.

export const SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];

export const SIZE_GROUPS = [
  { key: "small", label: "XS – S", sizes: ["XS", "S"] },
  { key: "standard", label: "M – XL", sizes: ["M", "L", "XL"] },
  { key: "large", label: "2XL – 3XL", sizes: ["2XL", "3XL"] },
];

const GROUP_STEP_CM = 4;
const MIN_CM = 2;

// The print team's sheet: [w, h] for S–M, L–XL, 2XL–3XL -> one entry per size.
const sheet = (sm, lxl, big) => ({ XS: sm, S: sm, M: sm, L: lxl, XL: lxl, "2XL": big, "3XL": big });

export const PRINT_AREA_CATALOG = [
  { key: "centre-front", label: "Centre Front", side: "front", main: true, cm: [28, 32], place: { align: "centre", topCm: 0 } },
  { key: "left-chest", label: "Left Chest", side: "front", cm: [12, 13], place: { align: "wearer-left", gapCm: 4, topCm: 0 } },
  { key: "right-chest", label: "Right Chest", side: "front", cm: [12, 13], place: { align: "wearer-right", gapCm: 4, topCm: 0 } },
  { key: "full-front", label: "Full Front", side: "front", cm: [35, 52], bySize: sheet([35, 52], [35, 52], [37, 54]), place: { align: "centre", topCm: 0 } },
  { key: "vertical-front", label: "Vertical Front", side: "front", cm: [10, 52], bySize: sheet([10, 52], [10, 52], [10, 54]), place: { align: "centre", topCm: 0 } },
  { key: "front-right-vertical", label: "Front Right Vertical", side: "front", cm: [10, 52], bySize: sheet([10, 52], [10, 52], [10, 54]), place: { align: "wearer-right", gapCm: 8, topCm: 0 } },
  { key: "lower-left", label: "Lower Left", side: "front", cm: null, place: { align: "wearer-left", gapCm: 8, topCm: 38 } },
  { key: "lower-right", label: "Lower Right", side: "front", cm: null, place: { align: "wearer-right", gapCm: 8, topCm: 38 } },
  { key: "full-back", label: "Full Back", side: "back", main: true, cm: [38, 42], place: { align: "centre", topCm: 0 } },
  { key: "top-back", label: "Top Back", side: "back", cm: [35, 10], bySize: sheet([35, 10], [35, 10], [37, 10]), place: { align: "centre", topCm: -6 } },
  { key: "centre-back", label: "Centre Back", side: "back", cm: [35, 52], bySize: sheet([35, 52], [35, 52], [37, 54]), place: { align: "centre", topCm: 4 } },
  { key: "lower-back", label: "Lower Back", side: "back", cm: null, place: { align: "centre", topCm: 40 } },
  { key: "vertical-back", label: "Vertical Back", side: "back", cm: [10, 51], bySize: sheet([10, 51], [10, 51], [10, 54]), place: { align: "centre", topCm: 0 } },
  { key: "left-sleeve", label: "Left Sleeve", side: "left", main: true, cm: [9, 10], place: { align: "centre", topCm: 0 } },
  { key: "right-sleeve", label: "Right Sleeve", side: "right", main: true, cm: [9, 10], place: { align: "centre", topCm: 0 } },
];

export const CATALOG_BY_KEY = Object.fromEntries(PRINT_AREA_CATALOG.map((a) => [a.key, a]));

// [w, h] for M–XL -> one entry per size (the guide's ±4 cm rule)
const ruleSizes = ([w, h]) => {
  const small = [Math.max(MIN_CM, w - GROUP_STEP_CM), Math.max(MIN_CM, h - GROUP_STEP_CM)];
  const large = [w + GROUP_STEP_CM, h + GROUP_STEP_CM];
  return { XS: small, S: small, M: [w, h], L: [w, h], XL: [w, h], "2XL": large, "3XL": large };
};

const validCm = (cm) =>
  Array.isArray(cm) && cm.length === 2 && cm.every((n) => Number.isFinite(n) && n >= MIN_CM && n <= 80);

// A complete, valid { size: [w, h] } map, or null. Sizes left out take the
// nearest size that has one.
export const cleanBySize = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const given = {};
  for (const size of SIZES) {
    const v = raw[size];
    const cm = Array.isArray(v) ? v.map(Number) : v && typeof v === "object" ? [Number(v.width ?? v.w), Number(v.height ?? v.h)] : null;
    if (validCm(cm)) given[size] = cm;
  }
  if (!Object.keys(given).length) return null;
  const out = {};
  SIZES.forEach((size, i) => {
    if (given[size]) {
      out[size] = given[size];
      return;
    }
    const near = SIZES.map((s, j) => [Math.abs(i - j), s])
      .sort((a, b) => a[0] - b[0])
      .find(([, s]) => given[s]);
    out[size] = given[near[1]];
  });
  return out;
};

// The garment's saved setting for one area, if any.
const overrideFor = (garment, key) => garment?.printAreas?.find((p) => p.key === key);

// { cmBySize, exact } for one area on this garment, or null when it has no
// size. Order: the garment's own exact sizes → its single size (±4 rule) →
// the catalog's exact sizes → the catalog's single size.
const sizesFor = (area, garment) => {
  const o = overrideFor(garment, area.key);
  const exact = cleanBySize(o?.bySize);
  if (exact) return { cmBySize: exact, exact: true };
  if (o && validCm([Number(o.width), Number(o.height)])) {
    return { cmBySize: ruleSizes([Number(o.width), Number(o.height)]), exact: false };
  }
  if (area.bySize) return { cmBySize: area.bySize, exact: true };
  return validCm(area.cm) ? { cmBySize: ruleSizes(area.cm), exact: false } : null;
};

// `cm` keeps the older three-group shape for code that still reads it.
const groupsOf = (cmBySize) => ({ small: cmBySize.S, standard: cmBySize.L, large: cmBySize["2XL"] });

const toPosition = (area, sized) => ({
  key: area.key,
  label: area.label,
  side: area.side,
  main: !!area.main,
  place: area.place,
  cmBySize: sized.cmBySize,
  exact: sized.exact,
  cm: groupsOf(sized.cmBySize),
});

/* ---------- overlaps ---------- */
// Where an area lies on its side, in cm: x from the centre line (wearer's
// left is +), y down from the side's main print top. Uses the largest size.
const rectOf = (pos) => {
  const [w, h] = pos.cmBySize["3XL"];
  const place = pos.place || { align: "centre", topCm: 0 };
  const gap = place.gapCm || 0;
  const x0 = place.align === "wearer-left" ? gap : place.align === "wearer-right" ? -(gap + w) : -w / 2;
  const y0 = place.topCm || 0;
  return { x0, x1: x0 + w, y0, y1: y0 + h };
};
const OVERLAP_CM = 1; // areas that only touch (1 cm or less) don't count
const overlap = (a, b) => {
  if (a.side !== b.side) return false;
  const ra = rectOf(a);
  const rb = rectOf(b);
  return (
    Math.min(ra.x1, rb.x1) - Math.max(ra.x0, rb.x0) > OVERLAP_CM &&
    Math.min(ra.y1, rb.y1) - Math.max(ra.y0, rb.y0) > OVERLAP_CM
  );
};
// Adds `conflicts` (keys of the offered areas each one overlaps): only one
// area of an overlapping set can carry a print.
const withConflicts = (positions) =>
  positions.map((p) => ({
    ...p,
    conflicts: positions.filter((q) => q.key !== p.key && overlap(p, q)).map((q) => q.key),
  }));

// [[labelA, labelB], …] for used areas that overlap (empty = fine).
export const overlappingPairs = (usedKeys, positions) => {
  const used = positions.filter((p) => usedKeys.includes(p.key));
  const pairs = [];
  used.forEach((p, i) =>
    used.slice(i + 1).forEach((q) => {
      if (p.conflicts?.includes(q.key)) pairs.push([p.label, q.label]);
    }),
  );
  return pairs;
};

// The areas offered when a garment has no saved print-area settings.
const DEFAULT_OFFERED = PRINT_AREA_CATALOG.filter((a) => a.cm).map((a) => a.key);

/**
 * Print positions a customer can use on this garment.
 * @returns {{ positions: object[], scales: Object<string, number[]> }}
 *   positions — offered areas: cmBySize ({ size: [w, h] }) and conflicts
 *   scales    — per side, the main print's M–XL cm, which sets the
 *               cm-to-photo scale even when the main print isn't offered
 */
export const positionsForGarment = (garment) => {
  const configured = Array.isArray(garment?.printAreas) && garment.printAreas.length > 0;
  const positions = [];
  const scales = {};
  for (const area of PRINT_AREA_CATALOG) {
    const sized = sizesFor(area, garment);
    if (area.main && sized) scales[area.side] = sized.cmBySize.L;
    const offered = configured ? !!overrideFor(garment, area.key)?.offered : DEFAULT_OFFERED.includes(area.key);
    if (offered && sized) positions.push(toPosition(area, sized));
  }
  return { positions: withConflicts(positions), scales };
};

// Every catalog area with this garment's settings — for the admin wizard.
export const catalogForGarment = (garment) => {
  const configured = Array.isArray(garment?.printAreas) && garment.printAreas.length > 0;
  return PRINT_AREA_CATALOG.map((area) => {
    const sized = sizesFor(area, garment);
    return {
      key: area.key,
      label: area.label,
      side: area.side,
      main: !!area.main,
      place: area.place,
      cm: sized ? groupsOf(sized.cmBySize) : null,
      cmBySize: sized ? sized.cmBySize : null,
      exact: sized ? sized.exact : false,
      guideCm: area.cm,
      guideBySize: area.bySize || null,
      offered: configured ? !!overrideFor(garment, area.key)?.offered : DEFAULT_OFFERED.includes(area.key),
    };
  });
};

// Back-compat: the positions offered when no garment is given.
export const PRINT_POSITIONS = positionsForGarment(null).positions;
export const POSITION_BY_KEY = Object.fromEntries(PRINT_POSITIONS.map((p) => [p.key, p]));

export const sizeGroupOf = (size) =>
  SIZE_GROUPS.find((g) => g.sizes.includes(String(size).toUpperCase()))?.key || "standard";

// Physical print size (cm) of a position for a garment size.
export const printSizeCm = (positionKey, size, garment = null) => {
  const p = positionsForGarment(garment).positions.find((x) => x.key === positionKey);
  if (!p) return null;
  const [w, h] = p.cmBySize[String(size).toUpperCase()] || p.cmBySize.L;
  return { width: w, height: h };
};
