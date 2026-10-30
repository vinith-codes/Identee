// utils/homeScene.js — which SCENE tees the home page shows, and in which colour (pages/Home.jsx).
// The client (30 Oct 2026): show the SCENE tees on the home page, with white tees too and fewer green ones.

// the colours the tees are shown in, first choice first, and how many of the cards each may take
export const SCENE_COLOURS = [
  ["White", 4],
  ["Black", 3],
  ["Navy", 2],
  ["Maroon", 2],
  ["Red", 2],
  ["Charcoal Melange", 2],
  ["Burgundy", 1],
  ["Olive", 1],
  ["Dark Brown", 1],
  ["Royal Blue", 1],
  ["Bottle Green", 2],
];

// cards: the shop's cards (featured first, then the newest). Oversized, men's and women's Round Neck take turns; each
// turn takes that group's tee that can show the best colour still with room (the first such tee on a tie), so the
// featured and newest come first. A design shows once (not as Oversized and Round Neck both). Returns up to `count`
// cards, each with `shownColour` ({ name, image }).
export function pickSceneTees(cards, count = 10) {
  const rank = (name) => SCENE_COLOURS.findIndex(([n]) => n === name) + 1 || 99;
  const used = {};
  const shown = new Set(); // designs already on a card
  const room = (name) => (used[name] || 0) < (SCENE_COLOURS.find(([n]) => n === name)?.[1] ?? 1);
  const colourFor = (p) => (p.colors || []).filter((c) => room(c.name)).sort((a, b) => rank(a.name) - rank(b.name))[0];
  const groups = Object.values(cards.reduce((m, p) => ((m[`${p.garmentStyle}|${p.gender}`] ||= []).push(p), m), {}));
  const picked = [];
  while (picked.length < count && groups.some((g) => g.length)) {
    for (const g of groups) {
      if (picked.length >= count) break;
      let best = -1;
      let bestColour = null;
      g.forEach((p, i) => {
        const c = shown.has(p.brandname) ? null : colourFor(p);
        if (c && (!bestColour || rank(c.name) < rank(bestColour.name))) [best, bestColour] = [i, c];
      });
      if (best === -1) {
        g.length = 0; // nothing in this group can be shown any more
        continue;
      }
      const [p] = g.splice(best, 1);
      used[bestColour.name] = (used[bestColour.name] || 0) + 1;
      shown.add(p.brandname);
      picked.push({ ...p, shownColour: bestColour });
    }
  }
  return picked;
}
