// Swatch colour for a garment colour name ("Bottle Green" → #1C5A2B).
// Names from the client's product sheet first, then common extras; grey
// when unknown. Used by the shop and Admin → Ready-made.
import { SHEET_COLOURS } from "./productSheet";

const EXTRA = {
  grey: "#8E8E8E", gray: "#8E8E8E", charcoal: "#36454F", olive: "#6B6B2A", yellow: "#E8C547", mustard: "#C9A227",
  orange: "#E07A2E", pink: "#E59BB5", purple: "#6A3E9C", green: "#2E7D4F", blue: "#2F5DA8", "sky blue": "#87BCE6",
  brown: "#6B4423", khaki: "#B9A57A", peach: "#F2B79C", teal: "#1F7A7A", mint: "#A8DCC4", wine: "#5C1A2B",
};

export const colourHex = (name) => {
  const n = String(name || "").trim().toLowerCase();
  const exact = SHEET_COLOURS.find((c) => c.name.toLowerCase() === n)?.hex || EXTRA[n];
  if (exact) return exact;
  // "Black with beige" → black
  const first = Object.keys(EXTRA).concat(SHEET_COLOURS.map((c) => c.name.toLowerCase())).find((k) => n.startsWith(`${k} `));
  return (first && (EXTRA[first] || SHEET_COLOURS.find((c) => c.name.toLowerCase() === first)?.hex)) || "#CFC7B6";
};

// Light colours need a visible edge on white.
export const isLight = (hex) => {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || "");
  if (!m) return false;
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 200;
};
