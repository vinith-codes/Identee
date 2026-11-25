// The shop's styles set by the admin (25 Nov 2026, utils/shopStyles.js): until the admin saves a style, the shop must
// show exactly what it showed before (the old rule: only dark colours and White, no Royal Blue on Round Neck).
import { test } from "node:test";
import assert from "node:assert/strict";
import { rulesFor, styleOf } from "../utils/shopStyles.js";
import { SHOWN_IN_SHOP, shownInShop } from "../utils/shopRules.js";
import { cleanStyle } from "../controllers/shopStylesController.js";

// the laptop copy's colours of the three shop garments (the same 12 on each)
const COLOURS = [
  ["maroon", "Maroon"], ["lavender", "Lavender"], ["black", "Black"], ["white", "White"], ["red", "Red"], ["beige", "Beige"],
  ["royal-blue", "Royal Blue"], ["cool-blue", "Cool Blue"], ["coffee-brown", "Coffee Brown"], ["navy", "Navy"], ["cream", "Cream"], ["bottle-green", "Bottle Green"],
].map(([slug, name]) => ({ slug, name, hex: "#111111" }));
const garment = (key, label, shop) => ({ key, label, fit: /oversized/.test(key) ? "oversized" : "regular", colors: COLOURS, ...(shop ? { shop } : {}) });
const THREE = [garment("oversized-tee", "Oversized Tee"), garment("boys-round-neck", "Boys Round Neck T-Shirt"), garment("girls-round-neck", "Girls Round Neck T-Shirt")];
const listOf = (gs) => gs.map((g) => ({ ...styleOf(g), colourList: g.colors.map((c) => ({ slug: c.slug, name: c.name })) }));

// a small stand-in for MongoDB's matching of the { $nor: [...] } rule (regex $in / $nin on string fields)
const fieldOk = (value, cond) => {
  const v = value == null ? null : String(value);
  if (cond.$in) return v != null && cond.$in.some((re) => re.test(v));
  if (cond.$nin) return v == null || !cond.$nin.some((re) => re.test(v));
  throw new Error("unknown condition");
};
const get = (doc, path) => path.split(".").reduce((o, k) => o?.[k], doc);
const passes = (doc, query) => !query.$nor.some((clause) => Object.entries(clause).every(([path, cond]) => fieldOk(get(doc, path), cond)));

const NAMES = [...COLOURS.map((c) => c.name), "Grey", "Pink", "Sky Blue", "Olive", "black ", "ROYAL BLUE"];
const STYLES = ["Oversized", "Round Neck", "round neck", "Polo", ""];
const GENDERS = ["Men", "Women", "Unisex", ""];

test("day one: the colour rule shows exactly what the old rule showed (in memory and as a database match)", () => {
  const rules = rulesFor(listOf(THREE));
  for (const name of NAMES)
    for (const style of STYLES)
      for (const gender of GENDERS) {
        const old = shownInShop(name, style);
        assert.equal(rules.colourShown(name, style, gender), old, `${name} / ${style} / ${gender}`);
        const doc = { productdetails: { color: name, garmentStyle: style, gender } };
        assert.equal(passes(doc, rules.query), passes(doc, SHOWN_IN_SHOP), `query ${name} / ${style} / ${gender}`);
      }
});

test("day one: the built-in settings (Oversized first, front and back only; Round Neck Men's + Women's)", () => {
  const [o, m, w] = THREE.map(styleOf);
  assert.deepEqual([o.style, o.wearer, o.order, o.sides, o.category], ["Oversized", "Unisex", 1, "front-back", "t-shirts"]);
  assert.deepEqual([m.style, m.wearer, m.order, m.sides], ["Round Neck", "Men", 2, "all"]);
  assert.deepEqual([w.style, w.wearer, w.category], ["Round Neck", "Women", "womens-t-shirts"]);
  assert.ok(!m.colours.includes("royal-blue") && o.colours.includes("royal-blue"));
  assert.ok(!o.colours.includes("lavender") && !o.colours.includes("cream") && o.colours.includes("white"));
  const rules = rulesFor(listOf(THREE));
  assert.deepEqual(rules.sortStyles(["Round Neck", "Oversized"]), ["Oversized", "Round Neck"]);
  // an old product's style never set up (a Polo added by hand): the old A–Z order, as before (laptop copy, 25 Nov)
  assert.deepEqual(rules.sortStyles(["V-Neck", "Round Neck", "Polo", "Oversized", "Sweatshirt"]), ["Oversized", "Polo", "Round Neck", "Sweatshirt", "V-Neck"]);
  assert.equal(rules.sidesOf("Oversized"), "front-back");
});

test("a new style switched on by the admin: its colours, its place, its sides — no code", () => {
  const polo = garment("polo", "Polo T-Shirt", { saved: true, on: true, style: "Polo", wearer: "Unisex", order: 2, category: "polos", colours: ["black", "navy"], sides: "all", fitText: "Regular fit" });
  const oversized = garment("oversized-tee", "Oversized Tee", { saved: true, on: true, style: "Oversized", wearer: "Unisex", order: 1, category: "t-shirts", colours: ["black", "white", "lavender"], sides: "front-back" });
  const rules = rulesFor(listOf([oversized, polo, THREE[1], THREE[2]]));
  assert.equal(rules.colourShown("Black", "Polo"), true);
  assert.equal(rules.colourShown("Maroon", "Polo"), false);
  assert.equal(rules.colourShown("Lavender", "Oversized"), true, "the admin ticked a light colour");
  assert.equal(rules.colourShown("Maroon", "Oversized"), false);
  assert.deepEqual(rules.sortStyles(["Round Neck", "Polo", "Oversized"]), ["Oversized", "Polo", "Round Neck"]);
  const doc = (color, garmentStyle) => ({ productdetails: { color, garmentStyle } });
  assert.equal(passes(doc("Navy", "Polo"), rules.query), true);
  assert.equal(passes(doc("Red", "Polo"), rules.query), false);
  assert.equal(passes(doc("Lavender", "Oversized"), rules.query), true);
});

test("Men's and Women's of one style with different colours: each by its own gender", () => {
  const men = garment("boys-round-neck", "Boys Round Neck T-Shirt", { saved: true, on: true, style: "Round Neck", wearer: "Men", order: 2, category: "t-shirts", colours: ["black"], sides: "all" });
  const women = garment("girls-round-neck", "Girls Round Neck T-Shirt", { saved: true, on: true, style: "Round Neck", wearer: "Women", order: 2, category: "womens-t-shirts", colours: ["black", "maroon"], sides: "all" });
  const rules = rulesFor(listOf([men, women]));
  assert.equal(rules.colourShown("Maroon", "Round Neck", "Women"), true);
  assert.equal(rules.colourShown("Maroon", "Round Neck", "Men"), false);
  const doc = (gender) => ({ productdetails: { color: "Maroon", garmentStyle: "Round Neck", gender } });
  assert.equal(passes(doc("Women"), rules.query), true);
  assert.equal(passes(doc("Men"), rules.query), false);
  assert.equal(passes(doc("Unisex"), rules.query), false, "neither: hidden if any of them hides it");
});

test("cleanStyle: the admin's settings are checked", () => {
  const g = garment("polo", "Polo T-Shirt");
  const ok = { on: true, style: " Polo ", wearer: "Unisex", order: 3, category: "polos", colours: ["black", "nope"], sides: "all", fitText: "Regular fit" };
  assert.deepEqual(cleanStyle(ok, g, ["polos"]).shop, { saved: true, on: true, style: "Polo", wearer: "Unisex", order: 3, category: "polos", colours: ["black"], sides: "all", fitText: "Regular fit" });
  assert.match(cleanStyle({ ...ok, style: "" }, g, ["polos"]).error, /name/);
  assert.match(cleanStyle({ ...ok, wearer: "Kids" }, g, ["polos"]).error, /Unisex/);
  assert.match(cleanStyle({ ...ok, category: "x" }, g, ["polos"]).error, /category/);
  assert.match(cleanStyle({ ...ok, colours: [] }, g, ["polos"]).error, /colour/);
  assert.equal(cleanStyle({ ...ok, on: false, colours: [] }, g, ["polos"]).error, undefined, "off may have no colours");
  assert.match(cleanStyle({ ...ok, sides: "x" }, g, ["polos"]).error, /sides/);
});

test("a garment never set up: off, with a name guessed from its label (Kids stays Kids)", () => {
  const kids = styleOf(garment("kids-round-neck", "Kids Round Neck T-Shirt"));
  assert.equal(kids.on, false);
  assert.equal(kids.style, "Kids Round Neck"); // (laptop test 25 Nov: it was guessed "Round Neck", the grown-ups' style)
  assert.equal(styleOf(garment("girls-crop-top-collar", "Crop Top with Collar")).wearer, "Women");
  assert.equal(styleOf(garment("polo", "Men's Polo T-Shirt")).style, "Polo");
  assert.equal(styleOf(garment("polo", "Men's Polo T-Shirt")).wearer, "Men");
});
