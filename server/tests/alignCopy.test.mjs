// Putting an AI copy back in the picture's own shape (16 Nov 2026, Grok's VF-2026-0079 front and VF-2026-0080 back).
import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { fitCopyToSheet } from "../services/alignCopy.js";

// a sheet with shapes in known places (a red square's centre at 30% / 40% of the sheet)
const sheetSvg = (w, h, { dark = false } = {}) => Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${dark ? "#050505" : "#101010"}"/>
  <rect x="${0.3 * w - 0.06 * w}" y="${0.4 * h - 0.06 * w}" width="${0.12 * w}" height="${0.12 * w}" fill="${dark ? "#a01010" : "#ff3030"}"/>
  <circle cx="${0.7 * w}" cy="${0.25 * h}" r="${0.1 * w}" fill="${dark ? "#c0c0c0" : "#ffffff"}"/>
  <rect x="${0.1 * w}" y="${0.7 * h}" width="${0.8 * w}" height="${0.05 * h}" fill="${dark ? "#205090" : "#3080ff"}"/>
  <rect x="${0.55 * w}" y="${0.5 * h}" width="${0.08 * w}" height="${0.15 * h}" fill="${dark ? "#909020" : "#e0e040"}"/>
</svg>`);
const png = (svg) => sharp(svg).png().toBuffer();

// where the red square's centre is, as a share of the picture
async function redCentre(buffer) {
  const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const i = (y * info.width + x) * 3;
    if (data[i] > 120 && data[i + 1] < 60 && data[i + 2] < 60) { sx += x; sy += y; n++; }
  }
  return { x: sx / n / info.width, y: sy / n / info.height, w: info.width, h: info.height };
}

test("a Grok copy in a narrower frame (sides cut, colours darker) is put back in the sheet's shape, nothing moved", async () => {
  const sent = await png(sheetSvg(300, 500));
  // Grok: drawn 4.8x bigger, darker, and its frame 12% narrower (the sides left out)
  const W = 1440, H = 2400, cut = Math.round(W * 0.06);
  const copy = await sharp(await png(sheetSvg(W, H, { dark: true }))).extract({ left: cut, top: 0, width: W - 2 * cut, height: H }).png().toBuffer();
  const fit = await fitCopyToSheet({ sent, copy });
  assert.equal(fit.changed, true);
  assert.ok(fit.score > 0.8, `likeness ${fit.score}`);
  const c = await redCentre(fit.buffer);
  assert.ok(Math.abs(c.w / c.h - 300 / 500) < 0.005, `shape ${c.w}x${c.h}`);
  assert.ok(Math.abs(c.x - 0.3) < 0.01 && Math.abs(c.y - 0.4) < 0.01, `red square at ${c.x.toFixed(3)}, ${c.y.toFixed(3)}`);
  assert.ok(c.w >= W * 0.97, "not shrunk: it keeps the copy's own size");
});

test("a Grok copy zoomed in (top and bottom cut off) gets its shape back, the cut strips filled from the sheet", async () => {
  const sent = await png(sheetSvg(600, 500));
  const W = 2400, H = 2000, cut = Math.round(H * 0.05);
  const copy = await sharp(await png(sheetSvg(W, H, { dark: true }))).extract({ left: 0, top: cut, width: W, height: H - 2 * cut }).png().toBuffer();
  const fit = await fitCopyToSheet({ sent, copy });
  assert.equal(fit.changed, true);
  const c = await redCentre(fit.buffer);
  assert.ok(Math.abs(c.w / c.h - 600 / 500) < 0.005, `shape ${c.w}x${c.h}`);
  assert.ok(Math.abs(c.x - 0.3) < 0.01 && Math.abs(c.y - 0.4) < 0.01, `red square at ${c.x.toFixed(3)}, ${c.y.toFixed(3)}`);
  assert.ok(fit.filled > 0.07 && fit.filled < 0.13, `filled from the sheet: ${fit.filled}`);
  // the top strip is the sheet's own (light) background, not black and not empty
  const { data } = await sharp(fit.buffer).extract({ left: 10, top: 2, width: 20, height: 10 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.ok(data[0] >= 12 && data[0] <= 20, `top strip colour ${data[0]}`);
});

test("a copy of the sheet's own shape (Google) is left exactly as it is", async () => {
  const sent = await png(sheetSvg(300, 500));
  const copy = await png(sheetSvg(2400, 4000, { dark: true }));
  const fit = await fitCopyToSheet({ sent, copy });
  assert.equal(fit.changed, false);
  assert.equal(fit.buffer, copy);
});
