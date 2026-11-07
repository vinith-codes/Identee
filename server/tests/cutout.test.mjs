// A cut-out piece should be only the artwork: the see-through space around it is dropped (8 Nov 2026 — a wide Grok
// picture with the heroes in the middle filled the print area with empty space, so "make it bigger" did nothing much).
import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { cutOutPlainBackground, trimClearEdges } from "../services/cutoutService.js";

// a wide white picture with a red square in the middle, as an AI piece comes back
const widePicture = () =>
  sharp({ create: { width: 400, height: 200, channels: 3, background: "#ffffff" } })
    .composite([{ input: { create: { width: 60, height: 50, channels: 3, background: "#d02020" } }, left: 170, top: 75 }])
    .png()
    .toBuffer();

test("trimClearEdges keeps only the artwork of a cut-out", async () => {
  const cut = await cutOutPlainBackground(await widePicture());
  assert.equal(cut.cut, true);
  assert.deepEqual([cut.width, cut.height], [400, 200]);
  const t = await trimClearEdges(cut);
  assert.ok(t.width >= 58 && t.width <= 64, `width ${t.width}`);
  assert.ok(t.height >= 48 && t.height <= 54, `height ${t.height}`);
  const meta = await sharp(t.buffer).metadata();
  assert.deepEqual([meta.width, meta.height], [t.width, t.height]);
});

test("trimClearEdges leaves a picture that was not cut out alone", async () => {
  const c = { buffer: Buffer.from("x"), mime: "image/jpeg", width: 10, height: 10, cut: false };
  assert.equal(await trimClearEdges(c), c);
});

// The "green screen": the AI draws on magenta, so white (or black) parts of the drawing are not mistaken for background.
test("a white part of the drawing on a magenta background stays", async () => {
  const pic = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#ff00ff" } })
    .composite([
      { input: { create: { width: 120, height: 120, channels: 3, background: "#d02020" } }, left: 90, top: 90 },
      { input: { create: { width: 60, height: 40, channels: 3, background: "#ffffff" } }, left: 120, top: 130 }, // a white window inside
      { input: { create: { width: 20, height: 20, channels: 3, background: "#ffffff" } }, left: 0, top: 140 }, // white touching the outside
    ])
    .png()
    .toBuffer();
  const cut = await cutOutPlainBackground(pic);
  assert.equal(cut.cut, true);
  const { data, info } = await sharp(cut.buffer).raw().toBuffer({ resolveWithObject: true });
  const alphaAt = (x, y) => data[(y * info.width + x) * 4 + 3];
  assert.equal(alphaAt(150, 150), 255, "the white window stays");
  assert.equal(alphaAt(10, 150), 255, "white touching the edge stays too");
  assert.equal(alphaAt(5, 50), 0, "the magenta background is cleared");
  assert.equal(alphaAt(100, 100), 255, "the red drawing stays");
});
