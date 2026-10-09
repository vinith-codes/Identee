// IDENTEE print positions and maximum print sizes (width x height, cm),
// from "IDENTEE_PRODUCT_DETAILS.pdf" -> Print Position & Size Guide.
//   - Standard sizes apply to M / L / XL
//   - XS / S are 4 cm smaller, 2XL / 3XL are 4 cm larger
// Only positions with sizes in the guide are offered for now. The guide
// also names Vertical Front, Front Right Vertical, Lower Left/Right,
// Full Front, Centre Back, Top Back, Lower Back and Vertical Back —
// add them here once their sizes are decided.
//
// Served to the customizer by GET /api/customizations/print-positions.

export const SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];

export const SIZE_GROUPS = [
  { key: "small", label: "XS – S", sizes: ["XS", "S"] },
  { key: "standard", label: "M – XL", sizes: ["M", "L", "XL"] },
  { key: "large", label: "2XL – 3XL", sizes: ["2XL", "3XL"] },
];

// cm: [width, height] per size group.
// main: the position that defines the print-area scale for its side
//       (its box is the one an admin can adjust in Admin → Garment Photos).
// "Left/Right" are from the wearer's point of view.
export const PRINT_POSITIONS = [
  {
    key: "centre-front",
    label: "Centre Front",
    side: "front",
    main: true,
    cm: { small: [24, 28], standard: [28, 32], large: [32, 36] },
  },
  {
    key: "left-chest",
    label: "Left Chest",
    side: "front",
    cm: { small: [8, 9], standard: [12, 13], large: [16, 17] },
  },
  {
    key: "right-chest",
    label: "Right Chest",
    side: "front",
    cm: { small: [8, 9], standard: [12, 13], large: [16, 17] },
  },
  {
    key: "full-back",
    label: "Full Back",
    side: "back",
    main: true,
    cm: { small: [34, 38], standard: [38, 42], large: [42, 46] },
  },
  {
    key: "left-sleeve",
    label: "Left Sleeve",
    side: "left",
    main: true,
    cm: { small: [5, 6], standard: [9, 10], large: [13, 14] },
  },
  {
    key: "right-sleeve",
    label: "Right Sleeve",
    side: "right",
    main: true,
    cm: { small: [5, 6], standard: [9, 10], large: [13, 14] },
  },
];

export const POSITION_BY_KEY = Object.fromEntries(PRINT_POSITIONS.map((p) => [p.key, p]));

export const sizeGroupOf = (size) =>
  SIZE_GROUPS.find((g) => g.sizes.includes(String(size).toUpperCase()))?.key || "standard";

// Physical print size (cm) of a position for a garment size.
export const printSizeCm = (positionKey, size) => {
  const p = POSITION_BY_KEY[positionKey];
  if (!p) return null;
  const [w, h] = p.cm[sizeGroupOf(size)];
  return { width: w, height: h };
};
