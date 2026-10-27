// Which person a category's photos show (27 Oct 2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { photosFor, wearerFor } from "../src/utils/wearerFor.js";

test("the category's name or slug says who wears it", () => {
  assert.equal(wearerFor("MEN'S T-SHIRTS t-shirts"), "man");
  assert.equal(wearerFor("WOMEN'S T-SHIRTS womens-t-shirts"), "woman");
  assert.equal(wearerFor("Boys Wear boys-wear"), "man");
  assert.equal(wearerFor("Girls Wear girls-wear"), "woman");
  assert.equal(wearerFor("Hoodies hoodies"), null);
  assert.equal(wearerFor("Unisex & Kids Wear"), null);
});

test("photos of that person come first; none are dropped", () => {
  const photos = [{ wearer: "man", side: "front" }, { wearer: "woman", side: "front" }, { wearer: "man", side: "back" }];
  assert.deepEqual(photosFor(photos, "woman").map((p) => p.wearer), ["woman", "man", "man"]);
  assert.deepEqual(photosFor(photos, null), photos);
});
