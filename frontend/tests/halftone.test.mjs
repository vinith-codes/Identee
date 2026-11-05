// Print files: every pixel solid or clear, soft parts as dots, thin edges clean (studio/halftone.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { halftoneAlpha } from "../src/studio/halftone.js";

const picture = (W, H, alphaAt) => {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      data[i] = 200;
      data[i + 1] = 90;
      data[i + 2] = 30;
      data[i + 3] = alphaAt(x, y);
    }
  }
  return data;
};
const alphas = (data) => data.filter((_, i) => i % 4 === 3);
const covered = (data) => alphas(data).reduce((n, a) => n + (a === 255 ? 1 : 0), 0) / (data.length / 4);

test("a print with nothing soft is left exactly as it was", () => {
  const data = picture(40, 40, (x) => (x < 20 ? 0 : 255));
  const before = data.slice();
  assert.deepEqual(halftoneAlpha(data, 40, 40), { dots: 0, edges: 0 });
  assert.deepEqual(data, before);
});

test("after it, every pixel is fully solid or fully clear", () => {
  const data = picture(300, 300, (x) => Math.round((x / 299) * 255));
  halftoneAlpha(data, 300, 300);
  assert.ok(alphas(data).every((a) => a === 0 || a === 255));
});

test("the area covered in dots follows how see-through the part was", () => {
  for (const alpha of [26, 64, 128, 191, 230]) {
    const data = picture(240, 240, () => alpha);
    const { dots } = halftoneAlpha(data, 240, 240);
    assert.equal(dots, 240 * 240);
    assert.ok(Math.abs(covered(data) - alpha / 255) < 0.02, `alpha ${alpha}: covered ${covered(data)}`);
  }
});

test("the dots repeat evenly, 8.5 px apart at 45°", () => {
  const data = picture(120, 120, () => 40);
  halftoneAlpha(data, 120, 120);
  const on = (x, y) => data[(y * 120 + x) * 4 + 3] === 255;
  for (let y = 0; y < 100; y++) {
    for (let x = 0; x < 100; x++) {
      assert.equal(on(x, y), on(x + 12, y));
      assert.equal(on(x, y), on(x, y + 12));
    }
  }
  const dots = [];
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) if (on(x, y)) dots.push([x, y]);
  assert.ok(dots.length > 0 && dots.length < 30, "separate dots, not a solid block");
});

test("a thin soft edge is cut clean: no dots on an outline", () => {
  // a solid block whose edge fades over 3 px
  const data = picture(200, 200, (x) => (x < 100 ? 255 : x === 100 ? 190 : x === 101 ? 128 : x === 102 ? 60 : 0));
  const { dots, edges } = halftoneAlpha(data, 200, 200);
  assert.equal(dots, 0);
  assert.equal(edges, 3 * 200);
  for (let y = 0; y < 200; y++) {
    assert.equal(data[(y * 200 + 100) * 4 + 3], 255);
    assert.equal(data[(y * 200 + 101) * 4 + 3], 255);
    assert.equal(data[(y * 200 + 102) * 4 + 3], 0);
  }
});

test("a faint halo goes clear and a nearly solid part goes solid", () => {
  const faint = picture(60, 60, () => 8);
  halftoneAlpha(faint, 60, 60);
  assert.equal(covered(faint), 0);
  const nearly = picture(60, 60, () => 250);
  halftoneAlpha(nearly, 60, 60);
  assert.equal(covered(nearly), 1);
});

test("the colours are not touched", () => {
  const data = picture(100, 100, () => 128);
  halftoneAlpha(data, 100, 100);
  for (let i = 0; i < data.length; i += 4) assert.deepEqual([data[i], data[i + 1], data[i + 2]], [200, 90, 30]);
});
