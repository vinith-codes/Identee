// The print team's needs (8 Nov 2026): the picture back from its packed stream (day sheets), the tiny-detail count,
// dropping specks, knock-out, "is this tee really black/white", the sheet PNG with its vector edge, the ship-by date.
import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import sharp from "sharp";
import { inkStats, paethFilter, runRecipe, unPaeth } from "../services/printRecipe.js";
import { sheetPng, teeIs } from "../controllers/printFileController.js";
import { shipByOf } from "../controllers/customizationController.js";

test("unPaeth gives back exactly what paethFilter packed", () => {
  const W = 37, H = 23;
  const rgb = Buffer.alloc(W * H * 3);
  for (let i = 0; i < rgb.length; i++) rgb[i] = (i * 7919 + (i >> 5) * 31) & 255;
  const back = unPaeth(paethFilter(rgb, W, H), W, H);
  assert.ok(back.equals(rgb));
  // and through zlib, as stored on disk
  assert.ok(unPaeth(zlib.inflateSync(zlib.deflateSync(paethFilter(rgb, W, H))), W, H).equals(rgb));
});

test("inkStats counts specks under 0.1 mm² and thin lines", () => {
  const W = 600, H = 600, dpi = 600; // 1 px = 0.042 mm
  const ink = new Uint8Array(W * H);
  // a big solid block (not a speck, not thin)
  for (let y = 50; y < 250; y++) for (let x = 50; x < 250; x++) ink[y * W + x] = 1;
  // 5 specks of 4×4 px (0.03 mm²)
  for (let k = 0; k < 5; k++) for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) ink[(400 + y) * W + 40 + k * 40 + x] = 1;
  let s = inkStats(ink, W, H, dpi);
  assert.equal(s.specks, 5);
  assert.ok(s.thinPct < 5, `block is not thin (${s.thinPct}%)`);
  // a long 3 px (0.13 mm) line: thin
  for (let x = 300; x < 590; x++) for (let y = 500; y < 503; y++) ink[y * W + x] = 1;
  s = inkStats(ink, W, H, dpi);
  assert.ok(s.thinPct > 1, `the line counts as thin (${s.thinPct}%)`);
});

// a dark disc with a scatter of tiny dots on a black tee, as the recipe gets it
function scene(W = 400, H = 400) {
  const rgb = Buffer.alloc(W * H * 3);
  const alpha = Buffer.alloc(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const d = Math.hypot(x - 200, y - 200);
      if (d < 120) {
        alpha[i] = 255;
        // the outer ring is near-black (knock-out takes it), the middle is red
        const v = d < 70 ? [220, 30, 30] : [12, 12, 12];
        rgb.set(v, i * 3);
      }
    }
  // specks: 6×6 px white dots far from the disc (0.065 mm² at 600 DPI: printed by default, under the 0.1 mm² limit)
  for (let k = 0; k < 12; k++) {
    const x0 = 20 + k * 30, y0 = 370;
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) { const i = (y0 + y) * W + x0 + x; alpha[i] = 255; rgb.set([255, 255, 255], i * 3); }
  }
  return { rgb, alpha, W, H };
}
const pathArea = (clip) => (clip.match(/M/g) || []).length;

test("dropSpecks leaves the tiny dots out of the vector edge and says how many", async () => {
  const s = scene();
  const keep = await runRecipe({ ...s, tee: "black", dpi: 600 });
  const drop = await runRecipe({ ...s, tee: "black", dpi: 600, dropSpecks: true });
  assert.ok(keep.stats.specks >= 10, `specks counted (${keep.stats.specks})`);
  assert.equal(keep.stats.specksDropped, 0);
  assert.equal(drop.stats.specks, 0);
  assert.equal(drop.stats.specksDropped, keep.stats.specks);
  assert.ok(pathArea(drop.clip) < pathArea(keep.clip), `fewer shapes when dropped (${pathArea(drop.clip)} vs ${pathArea(keep.clip)})`);
});

test("knock-out leaves near-black out on a black tee", async () => {
  const s = scene();
  const plain = await runRecipe({ ...s, tee: "black", dpi: 600 });
  const ko = await runRecipe({ ...s, tee: "black", dpi: 600, knockout: true });
  assert.equal(ko.stats.knockout, true);
  // the clip of the knock-out version covers less: render both and count inked pixels
  const inked = async (clip) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><path fill="#fff" fill-rule="evenodd" d="${clip}"/></svg>`;
    const a = await sharp(Buffer.from(svg)).ensureAlpha().extractChannel(3).raw().toBuffer();
    let n = 0;
    for (const v of a) if (v > 127) n++;
    return n;
  };
  const nPlain = await inked(plain.clip), nKo = await inked(ko.clip);
  assert.ok(nKo < nPlain * 0.6, `knock-out prints less (${nKo} vs ${nPlain})`);
  assert.ok(nKo > 3.14 * 60 * 60, `the red middle still prints (${nKo})`);
});

test("teeIs: only a really black or white tee counts", () => {
  assert.equal(teeIs("#000000", "black"), true);
  assert.equal(teeIs("#1C1C1C", "black"), true);
  assert.equal(teeIs("#1F2A44", "black"), false); // navy
  assert.equal(teeIs("#FFFFFF", "white"), true);
  assert.equal(teeIs("#F3E9D2", "white"), false); // cream
  assert.equal(teeIs("", "black"), false);
});

test("sheetPng: the picture, see-through outside its vector edge", async () => {
  const w = 40, h = 20;
  const rgb = Buffer.alloc(w * h * 3, 200);
  // the edge: the left half only, given in the picture's own pixels (80 × 40)
  const meta = { width: 80, height: 40, clip: "M 0 0 L 40 0 L 40 40 L 0 40 Z" };
  const png = await sharp(await sheetPng(rgb, w, h, meta)).raw().toBuffer({ resolveWithObject: true });
  assert.equal(png.info.channels, 4);
  const a = (x, y) => png.data[(y * w + x) * 4 + 3];
  assert.equal(a(5, 10), 255);
  assert.equal(a(35, 10), 0);
});

test("shipByOf skips Sundays and counts in India's time", () => {
  // Sat 7 Nov 2026 22:00 IST = Sun 8 Nov? no: 16:30 UTC is 22:00 IST Saturday
  assert.equal(shipByOf("2026-11-07T16:30:00Z", 4), "2026-11-12"); // Sat -> Mon Tue Wed Thu
  assert.equal(shipByOf("2026-11-07T20:00:00Z", 4), "2026-11-12"); // already Sunday in India -> Mon..Thu
  assert.equal(shipByOf("2026-11-12T05:00:00Z", 4), "2026-11-17"); // Thu -> Fri Sat (Sun) Mon Tue
  assert.equal(shipByOf("bad", 4), null);
});
