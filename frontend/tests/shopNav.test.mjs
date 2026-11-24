// Finding your way round Shop your IDENTEE (utils/shopNav.js, 24 Nov 2026): the grid a tee came from, ‹ 3 of 45 ›,
// and More from the collection.
import { test } from "node:test";
import assert from "node:assert/strict";
import { gridQuery, moreFrom, neighbours, teeHref, walkList, isOwnTee } from "../src/utils/shopNav.js";

const card = (slug, extra = {}) => ({ _id: `id-${slug}`, groupId: `g-${slug}`, brandname: `AYYAPPA · ${slug}`, garmentStyle: "Oversized", gender: "Unisex", readyDesignSlug: slug, ...extra });

test("gridQuery: a collection's page with its filters; other pages none", () => {
  assert.deepEqual(gridQuery("/ready-made/ayyappa?style=Oversized&gender=men&page=3"), { collection: "ayyappa", style: "Oversized", gender: "men" });
  assert.deepEqual(gridQuery("/ready-made/gta"), { collection: "gta" });
  assert.equal(gridQuery("/ready-made"), null);
  assert.equal(gridQuery("/ready-made/design/abc"), null);
  assert.equal(gridQuery("/category/mens"), null);
  assert.equal(gridQuery(undefined), null);
});

test("neighbours: n of N, going round at both ends", () => {
  const cards = ["a", "b", "c"].map((s) => card(s));
  assert.deepEqual(
    (({ index, total, prev, next }) => [index, total, prev.readyDesignSlug, next.readyDesignSlug])(neighbours(cards, "a")),
    [0, 3, "c", "b"],
  );
  assert.equal(neighbours(cards, "c").next.readyDesignSlug, "a");
  assert.equal(neighbours(cards, "zzz").index, -1);
  assert.equal(neighbours(cards, "zzz").prev, null);
  assert.equal(neighbours([card("a")], "a").next, null); // one tee: nothing to walk to
});

test("walkList: a Men's + Women's pair is one card (either half is found); Make your own left out", () => {
  const men = card("m", { brandname: "GTA · Vinewood", garmentStyle: "Round Neck", gender: "Men" });
  const women = card("w", { brandname: "GTA · Vinewood", garmentStyle: "Round Neck", gender: "Women" });
  const own = card("own", { brandname: "GTA · Make your own" });
  const cards = walkList([own, men, card("x"), women]);
  assert.equal(cards.length, 2);
  assert.equal(neighbours(cards, "w").index, 0); // the Women's half is the pair's card
  assert.equal(walkList([own, men], { keepOwn: true }).length, 2);
  assert.ok(isOwnTee({ name: "GTA · Make your own" }));
});

test("moreFrom: the next tees, never this one, each picture once first", () => {
  const cards = [card("a", { art: "1" }), card("b", { art: "1" }), card("c", { art: "2" }), card("d", { art: "3" }), card("e")];
  assert.deepEqual(moreFrom(cards, "a", 3).map((c) => c.readyDesignSlug), ["c", "d", "e"]); // b has a's picture
  assert.deepEqual(moreFrom(cards, "d", 8).map((c) => c.readyDesignSlug), ["e", "a", "c", "b"]); // the repeat last
  assert.equal(moreFrom([card("a")], "a").length, 0);
});

test("teeHref: a Studio tee opens its design page, an old product its product page", () => {
  assert.equal(teeHref(card("a")), "/ready-made/design/a");
  assert.equal(teeHref({ _id: "p1", readyDesignSlug: null }, { _id: "p2" }), "/product/p2");
});
