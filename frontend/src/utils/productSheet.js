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

export const ALL_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];

// inches: [chest, shoulder, length]
const CHARTS = {
  oversized: {
    XS: [42, 21, 28], S: [44, 22, 29], M: [46, 23, 30], L: [48, 24, 31],
    XL: [50, 25, 32], "2XL": [52, 26, 33], "3XL": [54, 27, 34],
  },
  regular: {
    XS: [36, 15, 26], S: [38, 16, 27], M: [40, 17, 28], L: [42, 18, 29],
    XL: [44, 19, 30], "2XL": [46, 20, 31], "3XL": [48, 21, 32],
  },
};

export const sheetSizeChart = (fit) =>
  ALL_SIZES.map((size) => {
    const [chest, shoulder, length] = CHARTS[fit === "oversized" ? "oversized" : "regular"][size];
    return { size, chest, shoulder, length };
  });

export const SHEET_DESCRIPTION = {
  oversized:
    "Relaxed drop-shoulder oversized tee with a ribbed crewneck collar and tagless neck label.",
  regular: "Classic regular-fit tee with a ribbed crewneck collar.",
};
