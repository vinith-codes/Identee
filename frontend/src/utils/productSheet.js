// utils/productSheet.js
//
// Values from the client's IDENTEE_PRODUCT_DETAILS.pdf (see
// docs/PRODUCT_SPEC.md). The admin set-up wizard offers these as one-click
// starting points; the admin can change anything afterwards.

export const SHEET_COLOURS = [
  { name: "Maroon", slug: "maroon", hex: "#6E1C22" },
  { name: "Lavender", slug: "lavender", hex: "#B7A2E0" },
  { name: "Black", slug: "black", hex: "#1C1C1D" },
  { name: "White", slug: "white", hex: "#F4F3EF" },
  { name: "Red", slug: "red", hex: "#C2352C" },
  { name: "Beige", slug: "beige", hex: "#D4C49B" },
  { name: "Royal Blue", slug: "royal-blue", hex: "#2441B5" },
  { name: "Cool Blue", slug: "cool-blue", hex: "#8DC1EC" },
  { name: "Coffee Brown", slug: "coffee-brown", hex: "#573216" },
  { name: "Navy", slug: "navy", hex: "#202759" },
  { name: "Cream", slug: "cream", hex: "#E7E3CF" },
  { name: "Bottle Green", slug: "bottle-green", hex: "#1C5A2B" },
];

export const SHEET_FABRICS = [
  { key: "cotton-240", name: "240 GSM Cotton", detail: "100% cotton jersey" },
  { key: "french-terry", name: "French Terry", detail: "240–260 GSM, 60% cotton / 40% polyester, brushed back" },
];

// XS → 5XL, as the live garments are sold (19 Nov 2026). A size missing here was dropped from the chart when
// the Sizes step was saved.
export const ALL_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];

// inches: [chest, length] — the client's measurement sheet of 19 Nov 2026 (MEASURMENTS.xlsx), as live.
// The sheet gives the chest laid flat (pit to pit); the site keeps the chest all round, so flat × 2.
// No shoulder: the sheet has none and it isn't needed (only Find my size's drawing uses it, and guesses without).
const CHARTS = {
  oversized: {
    XS: [47, 26.5], S: [48, 27.5], M: [49, 28.5], L: [50, 29.5], XL: [51, 30.5],
    "2XL": [52, 31.5], "3XL": [53, 32.5], "4XL": [54, 33.5], "5XL": [55, 34.5],
  },
  regular: {
    XS: [43, 25.5], S: [44, 26.5], M: [45, 27.5], L: [46, 28.5], XL: [47, 29.5],
    "2XL": [48, 30.5], "3XL": [49, 31.5], "4XL": [50, 32.5], "5XL": [51, 33.5],
  },
};

export const sheetSizeChart = (fit) =>
  ALL_SIZES.map((size) => {
    const [chest, length] = CHARTS[fit === "oversized" ? "oversized" : "regular"][size];
    return { size, chest, shoulder: "", length };
  });

export const SHEET_DESCRIPTION = {
  oversized:
    "Relaxed drop-shoulder oversized tee with a ribbed crewneck collar and tagless neck label.",
  regular: "Classic regular-fit tee with a ribbed crewneck collar.",
};
