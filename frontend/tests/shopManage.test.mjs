// Manage Shop your IDENTEE (utils/shopManage.js, 24 Nov 2026): the switches' counts, filters, prices and collections.
import { test } from "node:test";
import assert from "node:assert/strict";
import { chunks, collectionRows, collectionsBody, colourGroups, filterTees, groupBy, inScope, priceGroups } from "../src/utils/shopManage.js";

const tee = (id, collection, style, gender, inShop, colours, price = 699, oldPrice = 899) => ({
  _id: id,
  name: `${collection.toUpperCase()} · Tee ${id}`,
  collection,
  collectionName: collection.toUpperCase(),
  inShop,
  style,
  gender,
  colours: colours.map(([slug, hidden]) => ({ slug, name: slug[0].toUpperCase() + slug.slice(1), hex: "#000", hidden: Boolean(hidden) })),
  price,
  oldPrice,
  picture: `/p/${id}.png`,
});
const TEES = [
  tee("1", "ayyappa", "Oversized", "Unisex", true, [["black"], ["white", 1]]),
  tee("2", "ayyappa", "Round Neck", "Men", true, [["black"]], 499, 699),
  tee("3", "ayyappa", "Round Neck", "Women", false, [["black"]], 499, 699),
  tee("4", "gta", "Oversized", "Unisex", true, [["black"], ["white"]]),
];

test("groupBy: a style's tees in the shop and taken out", () => {
  const styles = groupBy(inScope(TEES, "ayyappa"), "style");
  assert.deepEqual(styles.map((g) => [g.name, g.inShop, g.out, g.ids.length]), [["Oversized", 1, 0, 1], ["Round Neck", 1, 1, 2]]);
  assert.deepEqual(groupBy(TEES, "gender").map((g) => g.name), ["Men", "Unisex", "Women"]);
});

test("colourGroups: on sale / taken out per colour, the commonest first", () => {
  const c = colourGroups(TEES);
  assert.equal(c[0].slug, "black");
  assert.deepEqual([c[0].shown, c[0].hidden], [4, 0]);
  assert.deepEqual([c[1].slug, c[1].shown, c[1].hidden], ["white", 1, 1]);
});

test("filterTees: words, style, colour, in / out", () => {
  assert.deepEqual(filterTees(TEES, { status: "out" }).map((t) => t._id), ["3"]);
  assert.deepEqual(filterTees(TEES, { colour: "white", style: "Oversized" }).map((t) => t._id), ["1", "4"]);
  assert.deepEqual(filterTees(TEES, { q: "gta tee" }).map((t) => t._id), ["4"]);
  assert.equal(filterTees(TEES, {}).length, 4);
});

test("priceGroups: the commonest price first", () => {
  assert.deepEqual(priceGroups(TEES), [{ price: 699, oldPrice: 899, count: 2 }, { price: 499, oldPrice: 699, count: 2 }]);
});

test("collectionRows: saved order, settings, home default; the body to save", () => {
  const rows = collectionRows(TEES, { order: ["gta"], items: { gta: { name: "GTA", text: "", home: false } } }, ["ayyappa"]);
  assert.deepEqual(rows.map((r) => [r.key, r.inShop, r.out, r.home]), [["gta", 1, 0, false], ["ayyappa", 2, 1, true]]);
  assert.equal(rows[1].picture, "/p/1.png");
  const body = collectionsBody(rows.map((r) => ({ ...r, name: ` ${r.name} ` })));
  assert.deepEqual(body.order, ["gta", "ayyappa"]);
  assert.deepEqual(body.items.gta, { name: "GTA", text: "", home: false });
});

test("chunks: many ids a few at a time", () => {
  assert.deepEqual(chunks([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunks([], 2), []);
});
