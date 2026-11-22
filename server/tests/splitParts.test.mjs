// A laid-out side cut into its separate parts (21 Nov 2026, option A): found by the empty space between them, each cut
// straight out of the picture at full size (nothing redrawn or shrunk); parts closer than the gap stay one print.
import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { splitParts, mergeNear, dropFrame } from "../services/splitParts.js";
import { SPLIT_GAP_CM } from "../controllers/assistantController.js";

// a see-through picture W × H with solid squares { x, y, w, h } (px)
async function picture(W, H, blocks) {
  const data = Buffer.alloc(W * H * 4);
  for (const b of blocks)
    for (let y = b.y; y < b.y + b.h; y++)
      for (let x = b.x; x < b.x + b.w; x++) {
        const i = (y * W + x) * 4;
        data[i] = 250;
        data[i + 1] = 200;
        data[i + 2] = 10;
        data[i + 3] = 255;
      }
  return sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
}
// 35 cm wide at 1400 px: 40 px a cm
const W = 1400;
const H = 2080;

test("a chest logo, a tall stroke and a hem tag come out as three parts, in reading order", async () => {
  const buf = await picture(W, H, [
    { x: 900, y: 300, w: 280, h: 240 }, // logo
    { x: 0, y: 600, w: 500, h: 1400 }, // strokes
    { x: 1200, y: 1900, w: 120, h: 140 }, // tag
  ]);
  const r = await splitParts(buf, { widthCm: 35, gapCm: 2 });
  assert.equal(r.parts.length, 3);
  const [logo, strokes, tag] = r.parts;
  assert.ok(Math.abs(logo.x * W - 900) <= 3 && Math.abs(logo.y * H - 300) <= 3, "logo place");
  assert.ok(Math.abs(logo.width - 280) <= 5 && Math.abs(logo.height - 240) <= 5, "logo at full size");
  assert.ok(Math.abs(strokes.h * H - 1400) <= 5, "strokes height");
  assert.ok(tag.y > 0.9, "tag low");
  // each part is a real picture of its own, the same pixels
  const meta = await sharp(logo.buffer).metadata();
  assert.equal(meta.width, logo.width);
  assert.equal(meta.hasAlpha, true);
  const px = await sharp(logo.buffer).ensureAlpha().raw().toBuffer();
  const mid = ((Math.floor(logo.height / 2) * logo.width + Math.floor(logo.width / 2)) * 4);
  assert.deepEqual([...px.subarray(mid, mid + 4)], [250, 200, 10, 255]);
});

test("words 1 cm from the strokes stay with them (pressed as one print anyway)", async () => {
  const buf = await picture(W, H, [
    { x: 0, y: 600, w: 400, h: 1200 },
    { x: 440, y: 900, w: 200, h: 300 }, // 1 cm away
    { x: 1000, y: 300, w: 200, h: 200 },
  ]);
  const r = await splitParts(buf, { widthCm: 35, gapCm: SPLIT_GAP_CM });
  assert.equal(r.parts.length, 2);
  assert.ok(Math.abs(r.parts[1].w * W - 640) <= 5, "strokes + words one part");
});

test("one part, or nothing at all: the picture stays whole (null)", async () => {
  assert.equal(await splitParts(await picture(W, H, [{ x: 100, y: 100, w: 1000, h: 1500 }]), { widthCm: 35 }), null);
  assert.equal(await splitParts(await picture(200, 300, []), { widthCm: 35 }), null);
});

test("a lone speck of noise is not a print of its own; a real small mark is", async () => {
  const buf = await picture(W, H, [
    { x: 100, y: 100, w: 400, h: 400 },
    { x: 1000, y: 1500, w: 300, h: 300 },
    { x: 700, y: 1000, w: 3, h: 3 }, // a stray dot, far from both
    { x: 1250, y: 300, w: 40, h: 40 }, // a 1 cm mark
  ]);
  const r = await splitParts(buf, { widthCm: 35, gapCm: 2 });
  assert.equal(r.parts.length, 3);
  assert.equal(r.dropped, 1);
});

test("more parts than free places: the gap widens so they fit, or the picture stays whole", async () => {
  const dots = Array.from({ length: 6 }, (_, i) => ({ x: 100 + i * 200, y: 200, w: 60, h: 60 })); // 3.5 cm apart
  const buf = await picture(W, H, dots);
  assert.equal((await splitParts(buf, { widthCm: 35, gapCm: 2, maxParts: 8 })).parts.length, 6);
  const fewer = await splitParts(buf, { widthCm: 35, gapCm: 2, maxParts: 3 });
  assert.ok(!fewer || fewer.parts.length <= 3);
  assert.equal(await splitParts(buf, { widthCm: 35, gapCm: 2, maxParts: 1 }), null);
});

test("mergeNear joins boxes within the gap, again and again", () => {
  const out = mergeNear(
    [
      { x0: 0, y0: 0, x1: 10, y1: 10, ink: 1 },
      { x0: 13, y0: 0, x1: 20, y1: 10, ink: 1 },
      { x0: 23, y0: 0, x1: 30, y1: 10, ink: 1 },
      { x0: 100, y0: 100, x1: 110, y1: 110, ink: 1 },
    ],
    3,
  );
  assert.equal(out.length, 2);
  assert.deepEqual([out[0].x0, out[0].x1, out[0].ink], [0, 30, 3]);
});

test("minParts 1: a side with one print still comes back as its one part, cut to its edges (placed as on the mockup)", async () => {
  const r = await splitParts(await picture(1200, 1800, [{ x: 500, y: 200, w: 200, h: 1300 }]), { widthCm: 35, minParts: 1 });
  assert.equal(r.parts.length, 1);
  assert.ok(Math.abs(r.parts[0].x * 1200 - 500) <= 4 && Math.abs(r.parts[0].w * 1200 - 200) <= 6, "its own edges");
  assert.equal(await splitParts(await picture(200, 300, []), { widthCm: 35, minParts: 1 }), null, "nothing: still null");
});

test("dropFrame: a thin frame line round a laid-out picture is taken out, so its parts split; art along an edge stays", async () => {
  const W0 = 1200, H0 = 1800;
  const frame = [{ x: 20, y: 20, w: 1160, h: 4 }, { x: 20, y: 1776, w: 1160, h: 4 }, { x: 20, y: 20, w: 4, h: 1760 }, { x: 1176, y: 20, w: 4, h: 1760 }];
  const art = [{ x: 800, y: 300, w: 200, h: 150 }, { x: 40, y: 700, w: 400, h: 1000 }];
  const buf = await picture(W0, H0, [...frame, ...art]);
  assert.equal((await splitParts(buf, { widthCm: 35, minParts: 1 })).parts.length, 1, "the frame joins everything");
  const c = await dropFrame({ buffer: buf, mime: "image/png", width: W0, height: H0, cut: true });
  assert.equal((await splitParts(c.buffer, { widthCm: 35, minParts: 1 })).parts.length, 2, "without it: the two prints");
  // a thick band along the bottom is art: kept
  const band = await picture(W0, H0, [{ x: 0, y: 1500, w: 1200, h: 200 }, ...art]);
  const kept = await dropFrame({ buffer: band, mime: "image/png", width: W0, height: H0, cut: true });
  assert.equal(kept.buffer, band, "nothing taken out");
});
