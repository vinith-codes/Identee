// utils/shopRules.js — Shop your IDENTEE's collections (the client, 30 Oct 2026). The server groups the tees by the
// first part of their name ("SCENE · The One" → scene) and decides the shop's other rules (only dark colours and
// White, garment prices, free shipping) in server/utils/shopRules.js.

// a collection's name and words on its card (a collection not listed here shows its own name, e.g. "SCENE")
const COLLECTIONS = {
  scene: { name: "SCENE Movie Products", text: "Tees made from movie scenes and posters." },
  // (23 Nov 2026, the owner: GTA moves from the home page into Shop your IDENTEE — the logo fixed on the front, the back
  // one of our designs or the customer's own photo in the GTA look; the tees are made in Admin → Trends)
  gta: { name: "GTA Style", text: "The GTA logo on the front. On the back, one of our designs — or your own photo, redrawn in the GTA look." },
  // (24 Nov 2026, the owner's Ayyappa pictures: a card of its own; the tees are made in Admin → Studio from a list)
  ayyappa: { name: "Ayyappa", text: "Swamiye Saranam Ayyappa — the words big on the front, Ayyappa printed big on the back." },
  none: { name: "More IDENTEE tees", text: "Finished designs, ready to wear." },
};
export const collectionInfo = (key, ownName = "") => COLLECTIONS[key] || { name: ownName || key, text: "" };
export const collectionLink = (key) => `/ready-made/${key}`;
// "GTA · Vinewood" → "gta" (the same as the server's collectionOf): a tee's collection, from its name
export const collectionOf = (name) => {
  const parts = String(name || "").split(" · ");
  return parts.length > 1 ? parts[0].trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "";
};
