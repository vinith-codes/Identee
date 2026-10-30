// utils/homeScene.js — which SCENE tees the home page shows, and in which colour (pages/Home.jsx).
// The client (30 Oct 2026): show the SCENE tees on the home page, with white tees too and fewer green ones; then, the
// same night: the newly added tees go on the home page — so the newest designs come first. 31 Oct 2026 (the user):
// Oversized and Round Neck together, one Oversized card, then one Round Neck, and so on; Black, White and other
// colours mixed, not in a fixed order.

// the colours a tee is shown in when it is sold in several, first choice first (when the row needs no other)
export const SCENE_COLOURS = ["White", "Black", "Navy", "Maroon", "Red", "Charcoal Melange", "Burgundy", "Olive", "Dark Brown", "Royal Blue", "Bottle Green"];
const MAX_GREEN = 2;
const STYLES = ["Oversized", "Round Neck"]; // the order the cards take turns in
const LATER = 0.1; // how much a tee further down the newest-first list counts against it

// cards: the shop's cards, featured first, then the newest. The cards take turns — Oversized, Round Neck,
// Oversized… — each design once. For each place the tee is chosen from that style's list: the newest one, unless an
// older one brings a colour the row has less of (a colour already on the row counts against a tee, more so when the
// card before is in it), so Black, White and other colours mix. At most two green. When one style runs out the other
// fills the row. A design sold for men and for women is one card (the men's tee, marked "Men & Women").
// Returns up to `count` cards, each with `shownColour` ({ name, image }).
export function pickSceneTees(cards, count = 10) {
  const rank = (name) => SCENE_COLOURS.indexOf(name) + 1 || 99;
  const styleOf = (p) => (STYLES.includes(p.garmentStyle) ? p.garmentStyle : STYLES[0]);
  const id = (p) => `${p.brandname}|${styleOf(p)}`;
  const men = new Map(cards.filter((p) => p.gender === "Men").map((p) => [id(p), p]));
  const both = new Set(cards.filter((p) => p.gender === "Women" && men.has(id(p))).map(id));
  const asCard = (p) => (both.has(id(p)) ? { ...men.get(id(p)), gender: "Men & Women" } : p);
  const queues = STYLES.map((s) => cards.filter((p) => styleOf(p) === s).map(asCard));

  const shown = new Set(); // designs already on a card
  const used = new Map(); // colour name -> cards in it so far
  const out = [];
  const cost = (name) => (used.get(name) || 0) + (out.length && out[out.length - 1].shownColour.name === name ? 2 : 0);
  // the best card of a style for the next place, or null
  const next = (queue) => {
    let best = null;
    const seen = new Set();
    queue.forEach((p) => {
      if (shown.has(p.brandname) || seen.has(p.brandname)) return;
      seen.add(p.brandname);
      const green = out.filter((c) => c.shownColour.name === "Bottle Green").length;
      const colours = (p.colors || []).filter((c) => c.name !== "Bottle Green" || green < MAX_GREEN);
      const colour = colours.sort((a, b) => cost(a.name) - cost(b.name) || rank(a.name) - rank(b.name))[0];
      if (!colour) return;
      const score = cost(colour.name) + seen.size * LATER;
      if (!best || score < best.score) best = { score, card: { ...p, shownColour: colour } };
    });
    return best?.card || null;
  };
  for (let turn = 0; out.length < count; turn += 1) {
    const card = next(queues[turn % STYLES.length]) || next(queues[(turn + 1) % STYLES.length]);
    if (!card) break;
    shown.add(card.brandname);
    used.set(card.shownColour.name, (used.get(card.shownColour.name) || 0) + 1);
    out.push(card);
  }
  return out;
}
