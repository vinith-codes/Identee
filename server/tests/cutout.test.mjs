// A cut-out piece should be only the artwork: the see-through space around it is dropped (8 Nov 2026 — a wide Grok
// picture with the heroes in the middle filled the print area with empty space, so "make it bigger" did nothing much).
import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { cleanCutEdge, cutOutPlainBackground, trimClearEdges } from "../services/cutoutService.js";

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

// a hole inside the drawing that shows the magenta background (slightly off-colour, as JPEG leaves it) is cleared too
test("an enclosed magenta hole is cleared, with a soft edge like the outside", async () => {
  const pic = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#ff00ff" } })
    .composite([
      { input: { create: { width: 200, height: 200, channels: 3, background: "#d02020" } }, left: 50, top: 50 },
      { input: { create: { width: 60, height: 60, channels: 3, background: "#f80cf8" } }, left: 120, top: 120 }, // the hole, JPEG-shifted magenta
    ])
    .png()
    .toBuffer();
  const cut = await cutOutPlainBackground(pic);
  const { data, info } = await sharp(cut.buffer).raw().toBuffer({ resolveWithObject: true });
  const alphaAt = (x, y) => data[(y * info.width + x) * 4 + 3];
  assert.equal(alphaAt(150, 150), 0, "the hole is see-through");
  assert.equal(alphaAt(100, 100), 255, "the drawing stays");
  assert.equal(alphaAt(10, 10), 0, "the outside is cleared");
});

test("on a white background a near-white enclosed spot stays (a highlight inside the drawing)", async () => {
  const pic = await sharp({ create: { width: 300, height: 300, channels: 3, background: "#ffffff" } })
    .composite([
      { input: { create: { width: 200, height: 200, channels: 3, background: "#d02020" } }, left: 50, top: 50 },
      { input: { create: { width: 60, height: 60, channels: 3, background: "#f4f4f4" } }, left: 120, top: 120 }, // a light-grey highlight, not the exact white
    ])
    .png()
    .toBuffer();
  const cut = await cutOutPlainBackground(pic);
  const { data, info } = await sharp(cut.buffer).raw().toBuffer({ resolveWithObject: true });
  assert.equal(data[(150 * info.width + 150) * 4 + 3], 255, "the highlight stays");
});

// Sharp, smooth edges (8 Nov 2026): the outline's pixels are part artwork, part background. They used to be kept or
// cleared whole, so the print file's vector cut line climbed in pixel steps. Each one now gets the see-through of its mix.
const discOn = (bg, ink) =>
  sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="${bg}"/><circle cx="150" cy="150" r="90.4" fill="${ink}"/></svg>`))
    .jpeg({ quality: 92 })
    .toBuffer();
const pixels = async (buf) => {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  return { at: (x, y) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)], data, w: info.width, h: info.height };
};

for (const [bg, name] of [["#ff00ff", "magenta"], ["#ffffff", "white"]]) {
  test(`a round shape on ${name} gets a smooth edge, in the shape's own colour`, async () => {
    const cut = await cutOutPlainBackground(await discOn(bg, "#101010"));
    const { at, data } = await pixels(cut.buffer);
    let soft = 0, tinted = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a > 10 && a < 245) {
        soft++;
        if (Math.min(data[i], data[i + 2]) - data[i + 1] > 25 || data[i] > 120) tinted++;
      }
    }
    assert.ok(soft > 300, `soft edge pixels ${soft}`); // a hard-cut circle of this size has none
    assert.ok(tinted < soft * 0.05, `${tinted} of ${soft} edge pixels carry the background colour`);
    assert.equal(at(150, 150)[3], 255, "the middle is solid");
    assert.equal(at(150, 62)[3], 255, "just inside the edge is solid");
    assert.equal(at(5, 5)[3], 0, "the background is cleared");
    // the clear pixels right next to the shape carry its colour, not the background's (an upscaler blends them in)
    const rim = at(150, 57);
    assert.equal(rim[3], 0, "outside the edge is clear");
    assert.ok(rim[0] < 80 && rim[1] < 80 && rim[2] < 80, `clear rim colour ${rim}`);
  });
}

test("a thin line of another ink beside the background is not faded away", async () => {
  const pic = await sharp({ create: { width: 200, height: 200, channels: 3, background: "#ff00ff" } })
    .composite([
      { input: { create: { width: 100, height: 100, channels: 3, background: "#101010" } }, left: 50, top: 50 },
      { input: { create: { width: 2, height: 100, channels: 3, background: "#ffd000" } }, left: 48, top: 50 }, // a yellow line on the black's edge
    ])
    .png()
    .toBuffer();
  const { at } = await pixels((await cutOutPlainBackground(pic)).buffer);
  assert.equal(at(48, 100)[3], 255, "the yellow line stays solid");
});

// An older cut-out (before 8 Nov 2026): the outline pixels are solid but half white, which printed as a dotted light rim
// (VF-2026-0024). Prepare for print cleans them: each keeps the artwork colour and only its artwork share of ink.
const oldCutOut = (ringColour = () => [255, 255, 255]) => {
  const w = 40, h = 40, px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inner = x >= 12 && x <= 27 && y >= 12 && y <= 27;
      const rim = !inner && x >= 11 && x <= 28 && y >= 11 && y <= 28;
      const c = inner ? [200, 30, 30] : rim ? [228, 143, 143] : ringColour(x, y); // rim = half red, half white
      px.set([...c, inner || rim ? 255 : 0], i);
    }
  return { px, w, h };
};

test("cleanCutEdge turns an old cut-out's light rim into a soft edge of the artwork colour", () => {
  const { px, w, h } = oldCutOut();
  const r = cleanCutEdge(px, w, h);
  assert.ok(r, "cleaned");
  assert.deepEqual(r.key, [255, 255, 255]);
  assert.ok(r.pixels >= 60, `pixels ${r.pixels}`);
  const at = (x, y) => [...px.subarray((y * w + x) * 4, (y * w + x) * 4 + 4)];
  const rim = at(20, 11);
  assert.deepEqual(rim.slice(0, 3), [200, 30, 30]); // no white left in it
  assert.ok(rim[3] > 100 && rim[3] < 160, `rim alpha ${rim[3]}`); // about half the ink
  assert.deepEqual(at(20, 20), [200, 30, 30, 255]); // the artwork itself is untouched
});

test("cleanCutEdge leaves a picture alone when the removed area is not one plain colour", () => {
  const { px, w, h } = oldCutOut((x, y) => [(x * 37) % 256, (y * 53) % 256, ((x + y) * 91) % 256]);
  const before = Buffer.from(px);
  assert.equal(cleanCutEdge(px, w, h), null);
  assert.ok(px.equals(before));
});

test("cleanCutEdge leaves a picture with nothing see-through alone (a photo, a JPEG)", () => {
  const px = Buffer.alloc(20 * 20 * 4, 255);
  const before = Buffer.from(px);
  assert.equal(cleanCutEdge(px, 20, 20), null);
  assert.ok(px.equals(before));
});
