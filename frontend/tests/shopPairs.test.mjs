// One shop card for a design sold for men and women (utils/shopPairs.js) — the client, 31 Oct 2026: in Round Neck → All
// the same tee showed twice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pairMenWomen } from "../src/utils/shopPairs.js";

const tee = (id, name, style, gender) => ({ _id: id, groupId: id, brandname: `SCENE · ${name}`, garmentStyle: style, gender });

test("a design for men and women shows once, where the first of the two was, with both versions", () => {
  const items = [tee("w1", "Not Born Good", "Round Neck", "Women"), tee("x", "Crown Collage", "Round Neck", "Men"), tee("m1", "Not Born Good", "Round Neck", "Men")];
  const out = pairMenWomen(items);
  assert.deepEqual(out.map((p) => p._id), ["m1", "x"]);
  assert.deepEqual(out[0].pair.map((v) => [v.gender, v.p._id]), [["Men", "m1"], ["Women", "w1"]]);
  assert.equal(out[1].pair, undefined);
});

test("Unisex tees, one-gender tees and the same name in another style stay as they are", () => {
  const items = [tee("u", "The Bad One", "Oversized", "Unisex"), tee("m", "The Bad One", "Round Neck", "Men"), tee("o", "The Profile", "Oversized", "Unisex"), tee("w", "The Profile", "Round Neck", "Women")];
  assert.deepEqual(pairMenWomen(items).map((p) => p._id), ["u", "m", "o", "w"]);
  assert.ok(pairMenWomen(items).every((p) => !p.pair));
});

test("nothing from nothing", () => {
  assert.deepEqual(pairMenWomen([]), []);
  assert.deepEqual(pairMenWomen(), []);
});
