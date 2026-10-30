// utils/shopRules.js — Shop your IDENTEE's collections (the client, 30 Oct 2026). The server groups the tees by the
// first part of their name ("SCENE · The One" → scene) and decides the shop's other rules (only dark colours and
// White, garment prices, free shipping) in server/utils/shopRules.js.

// a collection's name and words on its card (a collection not listed here shows its own name, e.g. "SCENE")
const COLLECTIONS = {
  scene: { name: "SCENE Movie Products", text: "Tees made from movie scenes and posters." },
  none: { name: "More IDENTEE tees", text: "Finished designs, ready to wear." },
};
export const collectionInfo = (key, ownName = "") => COLLECTIONS[key] || { name: ownName || key, text: "" };
export const collectionLink = (key) => `/ready-made/${key}`;
