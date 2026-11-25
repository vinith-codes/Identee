// utils/shopTwins.js — one design, many tees (25 Nov 2026)
//
// The owner: "in shop your identee remove all styles it confuses like repeating the same design". A collection design
// (Ayyappa · Darshanam) is made as three tees with one name: Oversized (Unisex), Round Neck Men's and Round Neck
// Women's. The shop shows a Men's + Women's pair of one style as ONE card (on every page — the shop used to join them
// only when both landed on the same page of 48), and the tee's page offers its other versions: Oversized / Round Neck,
// and Men / Women next to the sizes.

const norm = (s) => String(s || "").trim().toLowerCase();

// who a design is for, from the wearers of the categories it is listed in ("man" / "woman"): both or none = Unisex
export function genderLabel(wearers) {
  const set = wearers instanceof Set ? wearers : new Set(wearers || []);
  if (set.size === 1) return set.has("man") ? "Men" : "Women";
  return "Unisex";
}

// entries: [{ id, name, style, gender }] (one per design). A name + style with exactly one Men's design and one Women's
// design is a pair: both ids get the same card key. Anything else (Unisex, one gender only, two Men's designs with one
// name) stays a card of its own.
export function twinKeys(entries = []) {
  const halves = new Map(); // name|style → { Men: Set, Women: Set }
  for (const e of entries) {
    if (!e?.id || (e.gender !== "Men" && e.gender !== "Women")) continue;
    const k = `${norm(e.name)}|${norm(e.style)}`;
    if (!halves.has(k)) halves.set(k, { Men: new Set(), Women: new Set() });
    halves.get(k)[e.gender].add(String(e.id));
  }
  const out = new Map();
  for (const [k, h] of halves) {
    if (h.Men.size !== 1 || h.Women.size !== 1) continue;
    for (const id of [...h.Men, ...h.Women]) out.set(id, `pair:${k}`);
  }
  return out;
}

const STYLE_ORDER = ["oversized", "round neck"];
const GENDER_ORDER = ["Unisex", "Men", "Women"];
const at = (list, v) => {
  const i = list.indexOf(v);
  return i < 0 ? list.length : i;
};

// rows: [{ id, slug, style, gender, createdAt }] — the live designs with the tee's name. One per style + gender (the
// tee itself wins, else the newest), Oversized first, then Men before Women.
export function pickVersions(rows = [], currentId = null) {
  const best = new Map();
  for (const r of rows) {
    if (!r?.slug || !r.style) continue;
    const k = `${norm(r.style)}|${r.gender}`;
    const had = best.get(k);
    const mine = String(r.id) === String(currentId);
    if (!had || mine || (String(had.id) !== String(currentId) && new Date(r.createdAt || 0) > new Date(had.createdAt || 0))) best.set(k, r);
  }
  return [...best.values()]
    .sort((a, b) => at(STYLE_ORDER, norm(a.style)) - at(STYLE_ORDER, norm(b.style)) || norm(a.style).localeCompare(norm(b.style)) || at(GENDER_ORDER, a.gender) - at(GENDER_ORDER, b.gender))
    .map((r) => ({ slug: r.slug, style: r.style, gender: r.gender }));
}
