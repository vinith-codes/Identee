// utils/shopStyles.js — Shop your IDENTEE's styles, set by the admin (Admin → Shop your IDENTEE → Styles, 25 Nov 2026)
//
// The owner: "every time when we add new style we want to develop it. We should make it different but not complex".
// The shop's style rules used to be written in the code (only dark colours and White, no Royal Blue on Round Neck,
// Oversized first, Oversized shows its front and back only, Men before Women). Now each garment carries its own shop
// settings (GarmentType.shop), and the shop reads them:
//
//   on        sold in Shop your IDENTEE (a style tab, a choice on the tee page, a tick in Add a tee)
//   style     the name the shop shows ("Oversized", "Round Neck") — two garments may share one (Men's + Women's)
//   wearer    "Unisex" | "Men" | "Women" — who the garment is for
//   order     its place among the styles (1 first)
//   category  the shop category its tees are listed in ("t-shirts", "womens-t-shirts")
//   colours   the colour slugs sold in the shop (the others stay on the garment, not shown)
//   sides     "front-back" (the tee page shows the front and back only) | "all" (front, back and both sides)
//   fitText   a few words for the tee's description ("Oversized fit")
//
// Until the admin saves a garment's settings, it gets the same rules as before (BUILT_IN + the old colour rule), so
// nothing on the website changes on the day this goes live.
import GarmentType from "../models/garmentTypeModel.js";
import { LIGHT_COLOURS, shownInShop as oldColourRule } from "./shopRules.js";

const norm = (s) => String(s || "").trim().toLowerCase();

// the three garments the shop sold before the admin could set this (shop/shopTeeMaker.js GARMENTS, 24 Nov 2026)
export const BUILT_IN = {
  "oversized-tee": { on: true, style: "Oversized", wearer: "Unisex", order: 1, category: "t-shirts", sides: "front-back", fitText: "Oversized fit" },
  "boys-round-neck": { on: true, style: "Round Neck", wearer: "Men", order: 2, category: "t-shirts", sides: "all", fitText: "Regular round-neck fit" },
  "girls-round-neck": { on: true, style: "Round Neck", wearer: "Women", order: 2, category: "womens-t-shirts", sides: "all", fitText: "Regular round-neck fit" },
};
export const WEARERS = ["Unisex", "Men", "Women"];
export const SIDES = ["front-back", "all"];

// a garment never set up for the shop: off, with sensible words ready for when the admin turns it on
function guessed(garment) {
  const text = norm(`${garment.key} ${garment.label} ${garment.category}`);
  const wearer = /girl|women|woman|ladies/.test(text) ? "Women" : /\bboy|\bmen\b|\bman\b/.test(text) ? "Men" : "Unisex";
  const style = garment.fit === "oversized" && !/crop/.test(text) ? "Oversized" : String(garment.label || garment.key).replace(/^(boys|girls|men'?s|women'?s)\s+/i, "") /* ("Kids" stays: "Kids Round Neck" is not the grown-ups' Round Neck) */.replace(/\s*t-?shirt$/i, "").trim() || garment.key;
  return { on: false, style, wearer, order: 9, category: wearer === "Women" ? "womens-t-shirts" : "t-shirts", sides: "all", fitText: garment.fit === "oversized" ? "Oversized fit" : "Regular fit" };
}

/** A garment's shop settings: the admin's own once saved, else the built-in ones (the same rules as before). */
export function styleOf(garment) {
  if (!garment) return null;
  const base = BUILT_IN[garment.key] || guessed(garment);
  const own = garment.shop?.saved ? garment.shop : null;
  const all = (garment.colors || garment.colours || []).map((c) => c.slug);
  const style = String(own?.style || base.style).trim().slice(0, 40) || base.style;
  // the colours: the admin's ticks; before that, the old rule (dark ones and White, no Royal Blue on Round Neck)
  const colours = own
    ? (own.colours || []).filter((s) => all.includes(s))
    : (garment.colors || garment.colours || []).filter((c) => oldColourRule(c.name, `${style} ${garment.label || ""}`)).map((c) => c.slug);
  return {
    key: garment.key,
    label: garment.label,
    on: own ? Boolean(own.on) : base.on,
    style,
    wearer: WEARERS.includes(own?.wearer) ? own.wearer : base.wearer,
    order: Number.isFinite(Number(own?.order)) && Number(own.order) > 0 ? Math.round(Number(own.order)) : base.order,
    category: String(own?.category || base.category),
    colours,
    sides: SIDES.includes(own?.sides) ? own.sides : base.sides,
    fitText: String(own?.fitText || base.fitText).slice(0, 60),
    saved: Boolean(own),
  };
}

/* ---------- every garment's settings, kept for a short while (the shop pages ask often) ---------- */
let cache = null;
let cachedAt = 0;
const KEEP_MS = 30 * 1000;
export async function loadShopStyles() {
  if (cache && Date.now() - cachedAt < KEEP_MS) return cache;
  const garments = await GarmentType.find({}).select("key label category fit colors shop isActive").lean();
  const list = garments.map((g) => ({ ...styleOf(g), active: g.isActive !== false, colourList: (g.colors || []).map((c) => ({ slug: c.slug, name: c.name, hex: c.hex })) }));
  cache = { list, rules: rulesFor(list) };
  cachedAt = Date.now();
  return cache;
}
export const forgetShopStyles = () => {
  cache = null;
};

/**
 * The rules the shop pages use, from every garment's settings (list: styleOf(...) + colourList).
 *   colourShown(colourName, style, gender?)  a product's colour is on sale in the shop
 *   styleRank(style)                          the style's place (Oversized before Round Neck before a new one)
 *   sortStyles(styles)                        styles in the admin's order
 *   sidesOf(style)                            "front-back" | "all"
 *   query                                     the same colour rule as a Product match ({ $nor: [...] })
 */
export function rulesFor(list) {
  const on = list.filter((s) => s.on);
  // the garments of each shop style name (Round Neck: Men's + Women's)
  const byStyle = new Map();
  for (const s of list) {
    const k = norm(s.style);
    if (!byStyle.has(k)) byStyle.set(k, []);
    byStyle.get(k).push(s);
  }
  const pick = (style, gender) => {
    const all = byStyle.get(norm(style)) || [];
    if (all.length < 2) return all;
    const mine = all.filter((s) => norm(s.wearer) === norm(gender));
    return mine.length ? mine : all;
  };
  // a colour by its name: hidden when one of the style's garments has that colour and didn't tick it; a colour none of
  // them has (an old or renamed one) and a style no garment has (an old product) keep the old rule
  const colourShown = (colourName, style, gender) => {
    const garments = pick(style, gender);
    const named = garments.filter((g) => g.colourList.some((c) => norm(c.name) === norm(colourName)));
    if (!named.length) return oldColourRule(colourName, style);
    return named.some((g) => g.colours.includes(g.colourList.find((c) => norm(c.name) === norm(colourName)).slug));
  };
  const ranked = [...on].sort((a, b) => a.order - b.order || a.style.localeCompare(b.style));
  const styleRank = (style) => {
    const i = ranked.findIndex((s) => norm(s.style) === norm(style));
    return i < 0 ? ranked.length : i;
  };
  // the admin's order when every style in the list is a shop style; otherwise (old products of a style never set up,
  // e.g. a Polo product added by hand) the old A–Z order, so nothing moves until the admin sets that style up
  const sortStyles = (styles = []) =>
    styles.every((s) => styleRank(s) < ranked.length) ? [...styles].sort((a, b) => styleRank(a) - styleRank(b) || String(a).localeCompare(String(b))) : [...styles].sort();
  const sidesOf = (style) => (byStyle.get(norm(style)) || [])[0]?.sides || "all";

  // the colour rule as a database match: for each style (and, when its garments differ, each Men's / Women's of it)
  // the colour names not on sale; a product of any other style keeps the old light-colours rule
  const named = (names) => ({ $in: names.map((n) => new RegExp(`^\\s*${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i")) });
  const hiddenOf = (g) => {
    const mine = g.colourList.filter((c) => !g.colours.includes(c.slug)).map((c) => c.name);
    const known = new Set(g.colourList.map((c) => norm(c.name)));
    return [...mine, ...LIGHT_COLOURS.filter((n) => !known.has(norm(n)))];
  };
  const nor = [];
  const styles = [...byStyle.keys()];
  for (const [k, garments] of byStyle) {
    const style = garments[0].style;
    const sets = garments.map((g) => [...new Set(hiddenOf(g).map(norm))].sort().join("|"));
    if (new Set(sets).size === 1) {
      const names = hiddenOf(garments[0]);
      if (names.length) nor.push({ "productdetails.garmentStyle": named([style]), "productdetails.color": named(names) });
      continue;
    }
    // Men's and Women's differ: each by its gender, and a product of neither gender hides what any of them hides
    for (const g of garments) {
      const names = hiddenOf(g);
      if (names.length) nor.push({ "productdetails.garmentStyle": named([style]), "productdetails.gender": named([g.wearer]), "productdetails.color": named(names) });
    }
    const all = [...new Set(garments.flatMap(hiddenOf))];
    nor.push({ "productdetails.garmentStyle": named([style]), "productdetails.gender": { $nin: named(garments.map((g) => g.wearer)).$in }, "productdetails.color": named(all) });
    void k;
  }
  nor.push({ "productdetails.garmentStyle": { $nin: named(styles.map((k) => byStyle.get(k)[0].style)).$in }, "productdetails.color": named(LIGHT_COLOURS) });
  return { colourShown, styleRank, sortStyles, sidesOf, query: { $nor: nor } };
}

/** The shop's rules now (see rulesFor). */
export const shopRulesNow = async () => (await loadShopStyles()).rules;
