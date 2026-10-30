// utils/homeScene.js — which SCENE tees the home page shows, and in which colour (pages/Home.jsx).
// The client (30 Oct 2026): show the SCENE tees on the home page, with white tees too and fewer green ones; then, the
// same night: the newly added tees go on the home page — so the newest designs come first.

// the colours a tee is shown in when it is sold in several, first choice first
export const SCENE_COLOURS = ["White", "Black", "Navy", "Maroon", "Red", "Charcoal Melange", "Burgundy", "Olive", "Dark Brown", "Royal Blue", "Bottle Green"];
const MAX_GREEN = 2;

// cards: the shop's cards, featured first, then the newest. Takes them in that order — each design once (not as
// Oversized and Round Neck both), in its best colour, at most two green — then lays them out White and dark in turn
// (White first). Returns up to `count` cards, each with `shownColour` ({ name, image }).
export function pickSceneTees(cards, count = 10) {
  const rank = (name) => SCENE_COLOURS.indexOf(name) + 1 || 99;
  const shown = new Set(); // designs already on a card
  let green = 0;
  const picked = [];
  for (const p of cards) {
    if (picked.length >= count) break;
    if (shown.has(p.brandname)) continue;
    const colour = (p.colors || []).filter((c) => c.name !== "Bottle Green" || green < MAX_GREEN).sort((a, b) => rank(a.name) - rank(b.name))[0];
    if (!colour) continue;
    if (colour.name === "Bottle Green") green += 1;
    shown.add(p.brandname);
    picked.push({ ...p, shownColour: colour });
  }
  const light = picked.filter((p) => p.shownColour.name === "White");
  const dark = picked.filter((p) => p.shownColour.name !== "White");
  const out = [];
  while (light.length || dark.length) {
    if (light.length) out.push(light.shift());
    if (dark.length) out.push(dark.shift());
  }
  return out;
}
