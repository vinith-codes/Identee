// The job card measures to the ink, not to a picture's empty frame (VF-2026-0076, 9 Nov 2026).
import test from "node:test";
import assert from "node:assert/strict";
import { alphaBox, insideFrame } from "../src/studio/inkBox.js";

const area = (W, H, paint) => {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (paint(x, y)) px[(y * W + x) * 4 + 3] = 255;
  return px;
};

test("alphaBox finds the ink, not the empty space above it", () => {
  // a 100 x 100 area: ink only from row 30 to 89, columns 20 to 79
  const b = alphaBox(area(100, 100, (x, y) => y >= 30 && y < 90 && x >= 20 && x < 80), 100, 100);
  assert.deepEqual(b, { x0: 19, y0: 29, x1: 81, y1: 91 }); // one pixel of room each side
});

test("alphaBox ignores faint pixels and says null for an empty area", () => {
  const px = area(50, 50, () => false);
  px[(10 * 50 + 10) * 4 + 3] = 20; // a faint smudge, under the line
  assert.equal(alphaBox(px, 50, 50), null);
});

test("alphaBox keeps a faint thin line (a print's soft edge)", () => {
  const px = area(50, 50, () => false);
  for (let x = 5; x < 45; x++) px[(3 * 50 + x) * 4 + 3] = 60;
  assert.equal(alphaBox(px, 50, 50).y0, 4);
});

test("insideFrame never lets the ink box grow past the artwork's frames", () => {
  const frame = { x0: 10, y0: 0, x1: 90, y1: 100 };
  assert.deepEqual(insideFrame({ x0: 5, y0: 16, x1: 95, y1: 96 }, frame), { x0: 10, y0: 16, x1: 90, y1: 96 });
  assert.equal(insideFrame(null, frame), frame);
  assert.deepEqual(insideFrame({ x0: 1, y0: 1, x1: 2, y1: 2 }, { x0: 50, y0: 50, x1: 60, y1: 60 }), { x0: 50, y0: 50, x1: 60, y1: 60 });
});
