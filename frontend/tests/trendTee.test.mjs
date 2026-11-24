// A trend's shop tee (23 Nov 2026, GTA in Shop your IDENTEE — src/studio/trendTee.js): the logo locked on the front,
// a ready back printed big; the design room keeps the locked logo whatever the customer changes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { maxPrintBySize, positionsForGarment } from "../../server/data/printPositions.js";
import * as pm from "../src/studio/panelModel.js";
import { keepFixed, trendShopTee } from "../src/studio/trendTee.js";

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
const { garment } = JSON.parse(readFileSync(new URL("../../server/tests/fixtures/threeSpotDesign.json", import.meta.url), "utf8"));
const catalog = positionsForGarment(garment).positions;
const maxPrint = maxPrintBySize(garment);
const logo = { url: "/uploads/trends/logo.png", w: 1200, h: 600 };
const back = { url: "/uploads/trends/back31.jpg", w: 900, h: 1600 };

test("a GTA shop tee: the logo locked on Centre Front, the ready back big in a print of its own", () => {
  const tee = trendShopTee({ garment, catalog, maxPrint, size: "M", logo, back });
  const [front, big] = tee.elements;
  assert.equal(front.position, "centre-front");
  assert.equal(front.fixed, true, "the logo is locked");
  near(front.width, 92, 0.01, "a wide logo fills 92 % of the area's width");
  near(front.x + front.width / 2, 50, 0.01, "centred");
  assert.equal(big.src, back.url);
  assert.equal(big.aiLayout, "back", "a ready back: swapped when the customer picks another or makes their own");
  assert.ok(pm.isSpotKey(big.position), "a print of its own");
  assert.ok(!big.fixed, "the back is the customer's to change");
  near(big.spot.hCm, 52, 0.11, "as tall as the print team's biggest back print (9:16 on M)");
  assert.ok(tee.positions.some((p) => p.key === big.position), "the mockup camera gets the free place too");
});

test("the Make your own tee has only the locked logo", () => {
  const tee = trendShopTee({ garment, catalog, maxPrint, size: "M", logo, back: null });
  assert.equal(tee.elements.length, 1);
  assert.equal(tee.elements[0].fixed, true);
  assert.equal(trendShopTee({ garment, catalog, maxPrint, logo: null, back }), null, "no logo: no tee");
});

test("the design room keeps a locked logo as it was: moved, resized or removed, it comes back", () => {
  const logoEl = { id: "L", type: "image", src: logo.url, position: "centre-front", side: "front", x: 4, y: 20, width: 92, height: 46, fixed: true };
  const mine = { id: "T", type: "text", text: "ARUN", position: "left-sleeve", side: "left", x: 10, y: 10, width: 80, height: 20 };
  const prev = [logoEl, mine];
  assert.deepEqual(keepFixed([{ ...logoEl, x: 30, width: 40 }, mine], prev), prev, "moved / resized → as it was");
  assert.deepEqual(keepFixed([mine], prev), [mine, logoEl], "removed → back");
  assert.deepEqual(keepFixed([logoEl, { ...mine, x: 20 }], prev)[1].x, 20, "the customer's own things change as usual");
  const copied = keepFixed([logoEl, mine, { ...logoEl, id: "L2", position: "full-back", side: "back" }], prev);
  assert.equal(copied[2].fixed, undefined, "a copy of the logo is the customer's own, not locked");
  const plain = [mine];
  assert.equal(keepFixed(plain, [mine]), plain, "a tee without a locked thing is not touched");
});
