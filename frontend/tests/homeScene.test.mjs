// The SCENE tees on the home page (utils/homeScene.js) — the client, 30 Oct 2026: white tees too, fewer green ones,
// and the newly added tees first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickSceneTees } from "../src/utils/homeScene.js";

const tee = (name, style, gender, colours) => ({
  brandname: `SCENE · ${name}`,
  garmentStyle: style,
  gender,
  colors: colours.map((c) => ({ name: c, image: `https://x/${name}-${c}.jpg` })),
});
// like the live shop's list: the newest first
const cards = [
  tee("New Black 1", "Oversized", "Unisex", ["Black"]),
  tee("New White 1", "Oversized", "Unisex", ["White"]),
  tee("New Black 2", "Oversized", "Unisex", ["Black"]),
  tee("New Black 3", "Oversized", "Unisex", ["Black"]),
  tee("New White 2", "Oversized", "Unisex", ["White"]),
  ...["A", "B", "C"].map((n) => tee(`${n} · Green Edition`, "Oversized", "Unisex", ["Bottle Green"])),
  tee("Crown Collage", "Round Neck", "Men", ["White"]),
  tee("Crown Collage", "Round Neck", "Women", ["White"]),
  tee("Not Born Good", "Round Neck", "Women", ["Navy", "Black"]),
  tee("The Profile", "Round Neck", "Men", ["Black", "White"]),
];

test("the newest designs come first", () => {
  const names = pickSceneTees(cards, 5).map((p) => p.brandname.replace("SCENE · ", ""));
  assert.deepEqual(new Set(names), new Set(["New Black 1", "New White 1", "New Black 2", "New Black 3", "New White 2"]));
});

test("White first, then White and dark in turn", () => {
  const out = pickSceneTees(cards, 5).map((p) => p.shownColour.name);
  assert.deepEqual(out, ["White", "Black", "White", "Black", "Black"]);
});

test("at most two green; each design once, in a colour it is sold in", () => {
  const out = pickSceneTees(cards);
  assert.ok(out.filter((p) => p.shownColour.name === "Bottle Green").length <= 2);
  assert.equal(new Set(out.map((p) => p.brandname)).size, out.length);
  for (const p of out) assert.ok(p.colors.some((c) => c.name === p.shownColour.name));
  assert.equal(out.find((p) => p.brandname.endsWith("The Profile")).shownColour.name, "White");
});

test("never more than asked for, and nothing from nothing", () => {
  assert.equal(pickSceneTees(cards, 4).length, 4);
  assert.equal(pickSceneTees(cards).length, 10);
  assert.deepEqual(pickSceneTees([]), []);
});
