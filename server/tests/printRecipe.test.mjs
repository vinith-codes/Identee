// The print-file recipe's small helpers (services/printRecipe.js): the pieces that are easy to get subtly wrong.
import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { bleedEdges, fixDiagonals, maxFilter, paethFilter, svgToClip, recipePdf } from "../services/printRecipe.js";

test("maxFilter grows a dot into a square of the right size", () => {
  const W = 9, H = 9;
  const p = new Uint8Array(W * H);
  p[4 * W + 4] = 1;
  const out = maxFilter(p, W, H, 2);
  let n = 0;
  for (const v of out) n += v;
  assert.equal(n, 25); // (2·2+1)²
  assert.equal(out[1 * W + 1], 0);
  assert.equal(out[2 * W + 2], 1);
});

test("fixDiagonals joins two pixels that touch only at a corner", () => {
  const W = 4, H = 4;
  const p = new Uint8Array(W * H);
  p[1 * W + 1] = 1;
  p[2 * W + 2] = 1;
  const joined = fixDiagonals(p, W, H);
  assert.equal(joined, 1);
  // now the two are connected through a side
  assert.ok(p[1 * W + 2] === 1 || p[2 * W + 1] === 1);
});

test("svgToClip turns vtracer's absolute path into picture-pixel commands", () => {
  const svg = '<svg><path d="M10,20C11,21,12,22,13,23L15,25Z" transform="translate(1,2)"/></svg>';
  const { clip, shapes, steps } = svgToClip(svg);
  assert.equal(shapes, 1);
  assert.equal(steps, 4);
  assert.equal(clip, "M11 22 C12 23 13 24 14 25 L16 27 Z");
});

test("bleedEdges paints only the fully see-through pixels, with their nearest visible colour", () => {
  const W = 6, H = 1;
  // a gold pixel, then a half-see-through grey pixel, then see-through black
  const rgba = Buffer.from([200, 160, 80, 255, 90, 90, 90, 120, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  bleedEdges(rgba, W, H, 2);
  assert.deepEqual([...rgba.subarray(4, 8)], [90, 90, 90, 120]); // a pixel with some see-through keeps its own colour
  assert.deepEqual([...rgba.subarray(8, 11)], [90, 90, 90]); // the see-through next to it takes that colour
  assert.deepEqual([...rgba.subarray(12, 15)], [90, 90, 90]); // and the next one (reach 2)
  assert.deepEqual([...rgba.subarray(16, 19)], [0, 0, 0]); // beyond reach: left alone
});

test("paethFilter + Flate round-trips through a PNG-style predictor", () => {
  const W = 3, H = 2;
  const rgb = Buffer.from([10, 20, 30, 40, 50, 60, 70, 80, 90, 15, 25, 35, 45, 55, 65, 75, 85, 95]);
  const filtered = paethFilter(rgb, W, H);
  assert.equal(filtered.length, (W * 3 + 1) * H);
  assert.equal(filtered[0], 4); // every row says "Paeth"
  // undo the filter the way a PDF reader does
  const out = Buffer.alloc(W * 3 * H);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W * 3; x++) {
      const a = x >= 3 ? out[y * W * 3 + x - 3] : 0;
      const b = y > 0 ? out[(y - 1) * W * 3 + x] : 0;
      const c = x >= 3 && y > 0 ? out[(y - 1) * W * 3 + x - 3] : 0;
      out[y * W * 3 + x] = (filtered[y * (W * 3 + 1) + 1 + x] + paeth(a, b, c)) & 255;
    }
  }
  assert.deepEqual([...out], [...rgb]);
  assert.ok(zlib.inflateSync(zlib.deflateSync(filtered)).equals(filtered));
});

test("recipePdf writes a one-page PDF with the picture and an even-odd clip", () => {
  const W = 2, H = 2;
  const rgb = Buffer.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);
  const pdf = recipePdf({ W, H, flate: zlib.deflateSync(paethFilter(rgb, W, H)), clip: "M0 0 L2 0 L2 2 L0 2 Z" });
  const text = pdf.toString("latin1");
  assert.ok(text.startsWith("%PDF-1.7"));
  assert.ok(text.includes("/Predictor 15"));
  assert.ok(text.includes("W* n"));
  assert.ok(text.includes("/Im0 Do"));
  assert.ok(text.endsWith("%%EOF\n"));
  // the page is W x H pixels at 600 DPI
  assert.ok(text.includes(`/MediaBox [0 0 ${((W * 72) / 600).toFixed(4)} ${((H * 72) / 600).toFixed(4)}]`));
});
