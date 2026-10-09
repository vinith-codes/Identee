// IDENTEE print positions and maximum print sizes (width x height, cm),
// from "IDENTEE_PRODUCT_DETAILS.pdf" -> Print Position & Size Guide.
//   - The size entered is for M / L / XL
//   - XS / S are 4 cm smaller, 2XL / 3XL are 4 cm larger
//
// PRINT_AREA_CATALOG lists all 15 places in the guide. Only 6 have sizes
// in the guide; the admin can give the others a size and turn them on per
// garment (Admin → Customizable → set-up wizard → Print areas). A garment
// with no saved print-area settings offers the 6 sized ones.
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

export const PRINT_AREA_CATALOG = [
  { key: "centre-front", label: "Centre Front", side: "front", main: true, cm: [28, 32], place: { align: "centre", topCm: 0 } },
  { key: "left-chest", label: "Left Chest", side: "front", cm: [12, 13], place: { align: "wearer-left", gapCm: 4, topCm: 0 } },
  { key: "right-chest", label: "Right Chest", side: "front", cm: [12, 13], place: { align: "wearer-right", gapCm: 4, topCm: 0 } },
  { key: "full-front", label: "Full Front", side: "front", cm: null, place: { align: "centre", topCm: 0 } },
  { key: "vertical-front", label: "Vertical Front", side: "front", cm: null, place: { align: "centre", topCm: 0 } },
  { key: "front-right-vertical", label: "Front Right Vertical", side: "front", cm: null, place: { align: "wearer-right", gapCm: 8, topCm: 0 } },
  { key: "lower-left", label: "Lower Left", side: "front", cm: null, place: { align: "wearer-left", gapCm: 8, topCm: 38 } },
  { key: "lower-right", label: "Lower Right", side: "front", cm: null, place: { align: "wearer-right", gapCm: 8, topCm: 38 } },
  { key: "full-back", label: "Full Back", side: "back", main: true, cm: [38, 42], place: { align: "centre", topCm: 0 } },
  { key: "top-back", label: "Top Back", side: "back", cm: null, place: { align: "centre", topCm: -6 } },
  { key: "centre-back", label: "Centre Back", side: "back", cm: null, place: { align: "centre", topCm: 4 } },
  { key: "lower-back", label: "Lower Back", side: "back", cm: null, place: { align: "centre", topCm: 40 } },
  { key: "vertical-back", label: "Vertical Back", side: "back", cm: null, place: { align: "centre", topCm: 0 } },
  { key: "left-sleeve", label: "Left Sleeve", side: "left", main: true, cm: [9, 10], place: { align: "centre", topCm: 0 } },
  { key: "right-sleeve", label: "Right Sleeve", side: "right", main: true, cm: [9, 10], place: { align: "centre", topCm: 0 } },
];

export const CATALOG_BY_KEY = Object.fromEntries(PRINT_AREA_CATALOG.map((a) => [a.key, a]));

// [w, h] for M–XL -> { small, standard, large }
const groupSizes = ([w, h]) => ({
  small: [Math.max(MIN_CM, w - GROUP_STEP_CM), Math.max(MIN_CM, h - GROUP_STEP_CM)],
  standard: [w, h],
  large: [w + GROUP_STEP_CM, h + GROUP_STEP_CM],
});

const validCm = (cm) =>
  Array.isArray(cm) && cm.length === 2 && cm.every((n) => Number.isFinite(n) && n >= MIN_CM && n <= 80);

const toPosition = (area, cm) => ({
  key: area.key,
  label: area.label,
  side: area.side,
  main: !!area.main,
  place: area.place,
  cm: groupSizes(cm),
});

// The garment's saved setting for one area, if any.
const overrideFor = (garment, key) => garment?.printAreas?.find((p) => p.key === key);

const cmFor = (area, garment) => {
  const o = overrideFor(garment, area.key);
  const cm = o && Number(o.width) && Number(o.height) ? [Number(o.width), Number(o.height)] : area.cm;
  return validCm(cm) ? cm : null;
};

// The 6 areas offered when a garment has no saved print-area settings.
const DEFAULT_OFFERED = PRINT_AREA_CATALOG.filter((a) => a.cm).map((a) => a.key);

/**
 * Print positions a customer can use on this garment.
 * @returns {{ positions: object[], scales: Object<string, number[]> }}
 *   positions — offered areas with cm per size group
 *   scales    — per side, the main print's M–XL cm, which sets the
 *               cm-to-photo scale even when the main print isn't offered
 */
export const positionsForGarment = (garment) => {
  const configured = Array.isArray(garment?.printAreas) && garment.printAreas.length > 0;
  const positions = [];
  const scales = {};
  for (const area of PRINT_AREA_CATALOG) {
    const cm = cmFor(area, garment);
    if (area.main && cm) scales[area.side] = cm;
    const offered = configured ? !!overrideFor(garment, area.key)?.offered : DEFAULT_OFFERED.includes(area.key);
    if (offered && cm) positions.push(toPosition(area, cm));
  }
  return { positions, scales };
};

// Every catalog area with this garment's settings — for the admin wizard.
export const catalogForGarment = (garment) => {
  const configured = Array.isArray(garment?.printAreas) && garment.printAreas.length > 0;
  return PRINT_AREA_CATALOG.map((area) => {
    const cm = cmFor(area, garment);
    return {
      ...toPosition(area, cm || [0, 0]),
      cm: cm ? groupSizes(cm) : null,
      guideCm: area.cm,
      offered: configured ? !!overrideFor(garment, area.key)?.offered : DEFAULT_OFFERED.includes(area.key),
    };
  });
};

// Back-compat: the 6 sized positions (used when no garment is given).
export const PRINT_POSITIONS = positionsForGarment(null).positions;
export const POSITION_BY_KEY = Object.fromEntries(PRINT_POSITIONS.map((p) => [p.key, p]));

export const sizeGroupOf = (size) =>
  SIZE_GROUPS.find((g) => g.sizes.includes(String(size).toUpperCase()))?.key || "standard";

// Physical print size (cm) of a position for a garment size.
export const printSizeCm = (positionKey, size, garment = null) => {
  const p = positionsForGarment(garment).positions.find((x) => x.key === positionKey);
  if (!p) return null;
  const [w, h] = p.cm[sizeGroupOf(size)];
  return { width: w, height: h };
};
