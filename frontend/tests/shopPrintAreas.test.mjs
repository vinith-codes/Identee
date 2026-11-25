// Add a tee / Add many tees: every print area in "Where it prints", and a sleeve picture (26 Nov 2026 — the owner: "we
// can add many print areas in where they print"). src/studio/shopTeeBuilder.js + pages/admin/shop/shopAddUtils.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { PRINT_AREA_CATALOG, positionsForGarment } from "../../server/data/printPositions.js";
import { BACK_SPOTS, FRONT_SPOTS, SLEEVE_SPOTS, buildShopTee, picturesOf, shopTeeBody, spotNote } from "../src/studio/shopTeeBuilder.js";
import { pairPictures, sideOf, teeNameOf } from "../src/pages/admin/shop/shopAddUtils.js";

// a garment with every front, back and sleeve area switched on (as the live Oversized Tee: 20 areas)
const printAreas = PRINT_AREA_CATALOG.filter((a) => ["front", "back", "left", "right"].includes(a.side)).map((a) => ({ key: a.key, offered: true, width: (a.cm || [10, 30])[0], height: (a.cm || [10, 30])[1] }));
const all = positionsForGarment({ key: "oversized-tee", printAreas }).positions;
const without = (...keys) => all.filter((p) => !keys.includes(p.key));
const pic = (name) => ({ url: `/uploads/designs/${name}.png`, w: 3000, h: 3000 });
const garment = (key, style, wearer, positions) => ({ key, label: key, sizes: ["S", "M", "L"], positions, shop: { style, wearer, colours: ["black"] } });
const oversized = garment("oversized-tee", "Oversized", "Unisex", all);
const menRN = garment("boys-round-neck", "Round Neck", "Men", without("full-front", "vertical-front", "front-right-vertical", "vertical-back"));
const womenRN = garment("girls-round-neck", "Round Neck", "Women", without("full-front", "vertical-front", "front-right-vertical", "vertical-back", "centre-back"));

test("every choice is a real print area of the garment (plus 'nothing')", () => {
  const keys = new Set(all.map((p) => p.key));
  for (const s of [...FRONT_SPOTS, ...BACK_SPOTS]) if (s.key !== "none") assert.ok(keys.has(s.key), `${s.key} is a print area`);
  assert.equal(FRONT_SPOTS.length, 12);
  assert.equal(BACK_SPOTS.length, 8);
  assert.deepEqual(SLEEVE_SPOTS.map((s) => s.key), ["left-sleeve", "right-sleeve", "both-sleeves", "none"]);
});

test("each new spot prints on its own area, on the side it belongs to", () => {
  for (const s of FRONT_SPOTS.filter((x) => x.key !== "none")) {
    const tee = buildShopTee({ garment: oversized, catalog: all, front: pic("f"), frontSpot: s.key, backSpot: "none" });
    assert.deepEqual([tee.elements[0].position, tee.elements[0].side, tee.notes.length], [s.key, "front", 0], s.key);
  }
  for (const s of BACK_SPOTS.filter((x) => x.key !== "none")) {
    const tee = buildShopTee({ garment: oversized, catalog: all, back: pic("b"), frontSpot: "none", backSpot: s.key });
    // (the big back has always been a free place just under the collar: trendTee.js putBigBack)
    const where = s.key === "full-back" && /^spot-/.test(tee.elements[0].position) ? "full-back" : tee.elements[0].position;
    assert.deepEqual([where, tee.elements[0].side, tee.notes.length], [s.key, "back", 0], s.key);
  }
});

test("a sleeve picture goes on one arm or both; nothing else changes", () => {
  const base = { garment: oversized, catalog: all, front: pic("f"), back: pic("b"), frontSpot: "centre-front", backSpot: "full-back" };
  const plain = buildShopTee(base);
  const both = buildShopTee({ ...base, sleeve: pic("s"), sleeveSpot: "both-sleeves" });
  const left = buildShopTee({ ...base, sleeve: pic("s"), sleeveSpot: "left-sleeve" });
  const none = buildShopTee({ ...base, sleeve: pic("s"), sleeveSpot: "none" });
  assert.deepEqual(both.elements.filter((e) => e.src.endsWith("s.png")).map((e) => [e.position, e.side]), [["left-sleeve", "left"], ["right-sleeve", "right"]]);
  assert.deepEqual(left.elements.filter((e) => e.src.endsWith("s.png")).map((e) => e.side), ["left"]);
  assert.equal(none.elements.length, plain.elements.length);
  assert.deepEqual(both.elements.slice(0, plain.elements.length), plain.elements);
  const sleeve = both.elements.find((e) => e.side === "left");
  assert.ok(sleeve.width > 0 && sleeve.width <= 100 && sleeve.height > 0 && sleeve.height <= 100, "fits inside the sleeve area");
});

test("a style without the chosen area uses the nearest one and says so", () => {
  const tee = buildShopTee({ garment: womenRN, catalog: womenRN.positions, back: pic("b"), frontSpot: "none", backSpot: "centre-back" });
  assert.equal(tee.elements[0].position, "mid-back");
  assert.match(tee.notes[0], /Back: Round Neck has no “Centre of the back” area — printed on .* instead\./);
  const tall = buildShopTee({ garment: menRN, catalog: menRN.positions, front: pic("f"), frontSpot: "front-right-vertical", backSpot: "none" });
  assert.equal(tall.elements[0].position, "front-left-vertical");
});

test("the small note under a choice names the ticked styles that haven't got it", () => {
  const three = [oversized, menRN, womenRN];
  assert.equal(spotNote("centre-front", three), "");
  assert.equal(spotNote("vertical-front", three), "Oversized only");
  assert.equal(spotNote("centre-back", three), "not on Round Neck · Women");
  assert.equal(spotNote("vertical-front", [oversized, menRN]), "not on Round Neck · Men");
  assert.equal(spotNote("both-sleeves", three), "");
  assert.equal(spotNote("none", three), "");
  assert.equal(spotNote("vertical-front", [menRN]), "no ticked style has it");
});

test("+ Add to a style reads the places back, sleeves included", () => {
  const tee = buildShopTee({ garment: oversized, catalog: all, front: pic("f"), back: pic("b"), sleeve: pic("s"), frontSpot: "chest-line", backSpot: "lower-back", sleeveSpot: "both-sleeves", lockFront: true });
  const p = picturesOf({ elements: tee.elements });
  assert.deepEqual([p.frontSpot, p.backSpot, p.sleeveSpot, p.lockFront, p.left, p.sleeve.url], ["chest-line", "lower-back", "both-sleeves", true, 0, pic("s").url]);
  const old = picturesOf({ elements: [{ type: "image", src: "a.png", side: "front", position: "left-chest" }, { type: "image", src: "b.png", side: "back", position: "full-back" }] });
  assert.deepEqual([old.frontSpot, old.backSpot, old.sleeveSpot, old.sleeve], ["left-chest", "full-back", "none", null]);
});

test("the tee's description names the sleeve", () => {
  const tee = buildShopTee({ garment: oversized, catalog: all, front: pic("f"), sleeve: pic("s"), frontSpot: "centre-front", backSpot: "none", sleeveSpot: "right-sleeve" });
  const body = shopTeeBody({ name: "X · Tiger", label: "Tiger", frontSpot: "centre-front", backSpot: "none", sleeveSpot: "right-sleeve", hasFront: true, hasBack: false, hasSleeve: true }, { ...oversized, sizes: ["M"], shop: { ...oversized.shop, fitText: "Oversized fit" } }, tee, [{ slug: "black", mockups: {} }]);
  assert.match(body.product.description, /Front: centre of the chest\. Back: plain\. Sleeve: right sleeve\. Oversized fit/);
});

test("Add many tees: name-sleeve files join their tee", () => {
  const f = (name) => ({ file: { name } });
  const { rows, loose } = pairPictures([f("tiger-front.png"), f("Tiger_sleeve.png"), f("tiger-back.png"), f("lotus-front.png"), f("feedback.png"), f("tiger sleeve.webp")]);
  assert.deepEqual(rows.map((r) => [r.name, Boolean(r.front), Boolean(r.back), Boolean(r.sleeve)]), [["Tiger", true, true, true], ["Lotus", true, false, false]]);
  assert.deepEqual(loose.map((p) => p.file.name), ["feedback.png", "tiger sleeve.webp"]);
  assert.equal(sideOf("om-sleeve.png"), "sleeve");
  assert.equal(teeNameOf("om_namah-sleeve.png"), "Om Namah");
});
