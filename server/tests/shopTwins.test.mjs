// One design, many tees (25 Nov 2026): a Men's + Women's pair is one shop card; a tee's page lists its versions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { genderLabel, twinKeys, pickVersions } from "../utils/shopTwins.js";

test("genderLabel: one wearer is Men or Women, both or none is Unisex", () => {
  assert.equal(genderLabel(new Set(["man"])), "Men");
  assert.equal(genderLabel(["woman"]), "Women");
  assert.equal(genderLabel(["man", "woman"]), "Unisex");
  assert.equal(genderLabel([]), "Unisex");
});

test("twinKeys: one Men's + one Women's design of a name and style share a key; nothing else does", () => {
  const keys = twinKeys([
    { id: "o", name: "AYYAPPA · Darshanam", style: "Oversized", gender: "Unisex" },
    { id: "m", name: "AYYAPPA · Darshanam", style: "Round Neck", gender: "Men" },
    { id: "w", name: "Ayyappa · Darshanam ", style: "round neck", gender: "Women" },
    { id: "m2", name: "GTA · 31", style: "Round Neck", gender: "Men" }, // no Women's
    { id: "a", name: "SCENE · Twice", style: "Round Neck", gender: "Men" },
    { id: "b", name: "SCENE · Twice", style: "Round Neck", gender: "Men" }, // two Men's with one name: not a pair
    { id: "c", name: "SCENE · Twice", style: "Round Neck", gender: "Women" },
  ]);
  assert.equal(keys.get("m"), keys.get("w"));
  assert.ok(keys.get("m"));
  assert.equal(keys.has("o"), false);
  assert.equal(keys.has("m2"), false);
  assert.equal(keys.has("a") || keys.has("b") || keys.has("c"), false);
});

test("pickVersions: Oversized first, Men before Women, one per style + gender (the tee itself wins)", () => {
  const v = pickVersions(
    [
      { id: "w", slug: "rn-w", style: "Round Neck", gender: "Women", createdAt: "2026-11-20" },
      { id: "m", slug: "rn-m", style: "Round Neck", gender: "Men", createdAt: "2026-11-20" },
      { id: "m-new", slug: "rn-m-new", style: "Round Neck", gender: "Men", createdAt: "2026-11-24" },
      { id: "o", slug: "ov", style: "Oversized", gender: "Unisex", createdAt: "2026-11-20" },
      { id: "x", slug: "", style: "Oversized", gender: "Unisex" }, // no page: left out
    ],
    "m",
  );
  assert.deepEqual(v, [
    { slug: "ov", style: "Oversized", gender: "Unisex" },
    { slug: "rn-m", style: "Round Neck", gender: "Men" },
    { slug: "rn-w", style: "Round Neck", gender: "Women" },
  ]);
  // not the tee itself: the newest of two
  assert.equal(pickVersions([{ id: "m", slug: "a", style: "Round Neck", gender: "Men", createdAt: "2026-11-01" }, { id: "n", slug: "b", style: "Round Neck", gender: "Men", createdAt: "2026-11-02" }], "z")[0].slug, "b");
});
