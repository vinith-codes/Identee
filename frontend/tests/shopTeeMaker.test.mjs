// "Make shop tees from a list" (24 Nov 2026, the Ayyappa collection — src/studio/shopTeeMaker.js): the list file is
// checked before anything is made, each tee is made on each garment in its colours, a tee already made is skipped; the
// front logo goes big at the top of the chest (src/studio/trendTee.js logoAt / fill).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { maxPrintBySize, positionsForGarment } from "../../server/data/printPositions.js";
import { coloursOn, listingOf, readTeeList, teesToMake } from "../src/studio/shopTeeMaker.js";
import { trendShopTee } from "../src/studio/trendTee.js";

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
const black = { slug: "black", name: "Black", hex: "#111111" };
const white = { slug: "white", name: "White", hex: "#ffffff" };
const garments = [
  { key: "oversized-tee", label: "Oversized Tee", colours: [black, white, { slug: "navy", name: "Navy", hex: "#1f2a44" }] },
  { key: "boys-round-neck", label: "Round Neck Men", colours: [black] },
];
const LIST = {
  collection: "Ayyappa",
  about: "Ayyappa",
  frontAt: "top",
  garments: ["oversized-tee", "boys-round-neck", "girls-round-neck"],
  tees: [
    { name: "Sun Rider – Tiger Saranam", front: "front-09.png", back: "back-11.png", colours: ["Black", "White"] },
    { name: "Thathwamasi White", front: "front-02-white.png", colours: ["White"] },
  ],
};
const FILES = ["front-09.png", "BACK-11.png", "front-02-white.png"];

test("a good list: the collection name in capitals before each tee, the logo at the top", () => {
  const list = readTeeList(JSON.stringify(LIST), FILES);
  assert.deepEqual(list.problems, []);
  assert.equal(list.prefix, "AYYAPPA");
  assert.equal(list.logoAt, "top");
  assert.equal(list.tees[0].name, "AYYAPPA · Sun Rider – Tiger Saranam");
  assert.equal(list.tees[0].label, "Sun Rider – Tiger Saranam");
  assert.equal(list.tees[1].back, null, "a tee with only the front logo");
});

test("a list with mistakes makes nothing and says what is wrong", () => {
  const bad = { ...LIST, garments: ["polo"], tees: [...LIST.tees, { name: "Sun Rider – Tiger Saranam", front: "x.gif", colours: [] }, { name: "A".repeat(60), front: "front-09.png", colours: ["Black"] }] };
  const { problems } = readTeeList(JSON.stringify(bad), ["front-09.png"]);
  const all = problems.join(" | ");
  for (const bit of ["Unknown garment “polo”", "in the list twice", "x.gif is not a PNG", "back-11.png was not picked", "has no colours", "too long"]) assert.ok(all.includes(bit), `says: ${bit} — ${all}`);
  assert.ok(readTeeList("{ not json", []).problems[0].includes("not proper JSON"));
  assert.ok(readTeeList(JSON.stringify({ ...LIST, collection: "gta" }), FILES).problems.some((p) => p.includes("made elsewhere")));
});

test("each tee on each live garment, in the colours that garment has; already-made tees skipped", () => {
  const list = readTeeList(LIST, FILES);
  const first = teesToMake(list, garments, []);
  assert.deepEqual(first.todo.map((t) => `${t.garment.key}|${t.label}|${t.colours.map((c) => c.slug).join("+")}`), [
    "oversized-tee|Sun Rider – Tiger Saranam|black+white",
    "oversized-tee|Thathwamasi White|white",
    "boys-round-neck|Sun Rider – Tiger Saranam|black",
  ]);
  assert.ok(first.skipped.some((s) => s.includes("girls-round-neck is not a live product")));
  assert.ok(first.skipped.some((s) => s.includes("Thathwamasi White (Round Neck Men): no White")));
  const again = teesToMake(list, garments, [{ garmentType: "oversized-tee", name: "AYYAPPA · sun rider – tiger saranam" }]);
  assert.equal(again.made, 1);
  assert.equal(again.todo.length, 2);
  assert.deepEqual(coloursOn(garments[0].colours, ["white", "Black", "WHITE"]).map((c) => c.slug), ["white", "black"]);
});

test("the owner's real Ayyappa list reads clean", () => {
  let real;
  try {
    real = readFileSync("E:/AI CUSTOMIZATION/ayyappa-designs/shop-upload/ayyappa-tees.json", "utf8");
  } catch {
    return; // only on the laptop that has the pictures
  }
  const files = [...new Set(JSON.parse(real).tees.flatMap((t) => [t.front, t.back]).filter(Boolean))];
  const list = readTeeList(real, files);
  assert.deepEqual(list.problems, []);
  assert.equal(list.tees.length, 38);
});

test("listed like the SCENE tees of that garment, else a GTA one, else the defaults", () => {
  const plan = { key: "oversized-tee", listings: [{ category: "t-shirts", style: "Oversized" }], gender: "Unisex" };
  const gta = { garmentType: "oversized-tee", status: "published", name: "GTA · Vinewood", product: { listings: [{ category: "t-shirts", style: "Oversized", extra: 1 }], fabric: "240 GSM cotton" } };
  assert.equal(listingOf([gta], plan).fabric, "240 GSM cotton");
  assert.deepEqual(listingOf([gta], plan).listings, [{ category: "t-shirts", style: "Oversized" }]);
  assert.equal(listingOf([], plan).fabric, "100% Cotton");
});

test("the Ayyappa front: the logo locked, as wide as the area, at its top; the back big", () => {
  const { garment } = JSON.parse(readFileSync(new URL("../../server/tests/fixtures/threeSpotDesign.json", import.meta.url), "utf8"));
  const catalog = positionsForGarment(garment).positions;
  const logo = { url: "/uploads/trends/a.png", w: 1600, h: 500 };
  const back = { url: "/uploads/trends/b.png", w: 1000, h: 1200 };
  const tee = trendShopTee({ garment, catalog, maxPrint: maxPrintBySize(garment), size: "M", logo, back, logoAt: "top", fill: 100 });
  const [front, big] = tee.elements;
  assert.equal(front.fixed, true);
  near(front.width, 100, 0.01, "the whole width");
  assert.equal(front.y, 0, "at the top");
  assert.equal(big.side, "back");
  const middle = trendShopTee({ garment, catalog, size: "M", logo, back: null }).elements[0];
  near(middle.y + middle.height / 2, 50, 0.01, "the GTA logo stays in the middle");
  near(middle.width, 92, 0.01, "and at 92 %");
});
