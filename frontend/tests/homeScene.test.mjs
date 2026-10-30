// The SCENE tees on the home page (utils/homeScene.js) — the client, 30 Oct 2026: white tees too, fewer green ones.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickSceneTees } from "../src/utils/homeScene.js";

const tee = (name, style, gender, colours) => ({
  brandname: `SCENE · ${name}`,
  garmentStyle: style,
  gender,
  colors: colours.map((c) => ({ name: c, image: `https://x/${name}-${c}.jpg` })),
});
// like the live shop: Oversized mostly Green Edition, a few in White and Black; Round Neck for men and for women
const cards = [
  ...["A", "B", "C", "D", "E"].map((n) => tee(`${n} · Green Edition`, "Oversized", "Unisex", ["Bottle Green"])),
  tee("Composition", "Oversized", "Unisex", ["White"]),
  tee("They Just Choose", "Oversized", "Unisex", ["Black"]),
  tee("Crown Collage", "Round Neck", "Men", ["White"]),
  tee("Crown Collage", "Round Neck", "Women", ["White"]),
  tee("The Profile", "Round Neck", "Men", ["Black", "White"]),
  tee("Not Born Good", "Round Neck", "Women", ["Navy", "Black"]),
  tee("The Bad One", "Round Neck", "Women", ["White"]),
  tee("Never Leave You", "Round Neck", "Men", ["White"]),
];

test("at most two green tees, White first", () => {
  const out = pickSceneTees(cards);
  const by = (c) => out.filter((p) => p.shownColour.name === c).length;
  assert.ok(by("Bottle Green") <= 2);
  assert.equal(by("White"), 4);
  assert.equal(out[0].shownColour.name, "White");
});

test("each design shows once, in a colour it is sold in", () => {
  const out = pickSceneTees(cards);
  assert.equal(new Set(out.map((p) => p.brandname)).size, out.length);
  for (const p of out) assert.ok(p.colors.some((c) => c.name === p.shownColour.name));
});

test("Oversized, men's and women's Round Neck all show", () => {
  const out = pickSceneTees(cards);
  for (const [style, gender] of [["Oversized", "Unisex"], ["Round Neck", "Men"], ["Round Neck", "Women"]]) {
    assert.ok(out.some((p) => p.garmentStyle === style && p.gender === gender), `${style} ${gender}`);
  }
});

test("never more than asked for, and nothing from nothing", () => {
  assert.equal(pickSceneTees(cards, 4).length, 4);
  assert.deepEqual(pickSceneTees([]), []);
});
