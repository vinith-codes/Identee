// The shop pictures on the hanger photo (24 Nov 2026): where each print sits on the photo.
import test from "node:test";
import assert from "node:assert/strict";
import { photoBoxes, seamOf, PHOTO_SEAM } from "../src/studio/hangerBoxes.js";
import { TEE_MODELS } from "../src/studio/teeModel.js";

const garment = { key: "oversized-tee", sizeChart: [{ size: "M", chest: 49, length: 28.5 }] };
const ruler = { topPct: 27.29, hemPct: 87.6 };
const perCmH = (87.6 - 27.29) / (28.5 * 2.54);
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, `${msg}: ${a} vs ${b}`);

test("the collar seam is known for the Oversized and Round Neck photos only", () => {
  assert.equal(seamOf(TEE_MODELS.oversized).front, 34.0);
  assert.equal(seamOf(TEE_MODELS.regular).back, 33.9);
  assert.equal(seamOf(TEE_MODELS.collarCrop), null);
  assert.equal(PHOTO_SEAM.length, 2);
});

test("a centre front print starts 8 cm under the front collar seam, centred, true to size", () => {
  const positions = [{ key: "centre-front", side: "front", main: true, cm: { standard: [28, 32] } }];
  const b = photoBoxes({ positions, size: "M", garment, model: TEE_MODELS.oversized, ruler, lengthIn: 28.5 })["centre-front"];
  close(b.top, 34.0 + 8 * perCmH, "top");
  close(b.height, 32 * perCmH, "height");
  close(b.width, (28 * perCmH) / 0.8, "width (4:5 photo)");
  close(b.left + b.width / 2, 50, "centre");
});

test("the back starts 7 cm under the back seam; the wearer's left is on the viewer's right only from the front", () => {
  const positions = [
    { key: "full-back", side: "back", main: true, cm: { standard: [30, 40] } },
    { key: "left-chest", side: "front", cm: { standard: [10, 10] }, place: { align: "wearer-left", gapCm: 4, topCm: 0 } },
    { key: "spot-1", side: "back", spot: true, cm: { standard: [10, 10] }, collarCm: { M: 3 }, place: { align: "wearer-left", gapCm: 4 } },
  ];
  const boxes = photoBoxes({ positions, size: "M", garment, model: TEE_MODELS.oversized, ruler, lengthIn: 28.5 });
  close(boxes["full-back"].top, 28.8 + 7 * perCmH, "back top");
  assert.ok(boxes["left-chest"].left > 50, "left chest is on the viewer's right from the front");
  assert.ok(boxes["spot-1"].left + boxes["spot-1"].width < 50, "a back print on the wearer's left is on the viewer's left");
  close(boxes["spot-1"].top, 28.8 + 3 * perCmH, "collarCm is measured from the seam");
});

test("a bigger size makes the same print smaller on the photo; no ruler or no seam = nothing", () => {
  const positions = [{ key: "centre-front", side: "front", main: true, cm: { standard: [28, 32] } }];
  const m = photoBoxes({ positions, size: "M", garment, model: TEE_MODELS.oversized, ruler, lengthIn: 28.5 })["centre-front"];
  const big = photoBoxes({ positions, size: "M", garment, model: TEE_MODELS.oversized, ruler, lengthIn: 31.5 })["centre-front"];
  assert.ok(big.width < m.width);
  assert.deepEqual(photoBoxes({ positions, size: "M", garment, model: TEE_MODELS.oversized, ruler: null, lengthIn: 28.5 }), {});
  assert.deepEqual(photoBoxes({ positions, size: "M", garment, model: TEE_MODELS.collarCrop, ruler, lengthIn: 28.5 }), {});
});

test("a sleeve print is centred in the side photo's sleeve zone", () => {
  const positions = [{ key: "left-sleeve", side: "left", main: true, cm: { standard: [8, 8] } }];
  const zones = { left: { x: 38.6, y: 39.8, width: 9.5, height: 8.4 } };
  const b = photoBoxes({ positions, size: "M", garment, model: TEE_MODELS.oversized, ruler, lengthIn: 28.5, zones })["left-sleeve"];
  close(b.left + b.width / 2, 38.6 + 9.5 / 2, "centre x");
  close(b.top + b.height / 2, 39.8 + 8.4 / 2, "centre y");
});
