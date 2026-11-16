// The AI's 4K copy before Topaz (16 Nov 2026): when Prepare for print makes it, the "nothing changed" wording, the
// magenta check for customer cut-outs, and the setting. No real calls, nothing paid, no database.
import test from "node:test";
import assert from "node:assert/strict";
import Setting from "../models/settingModel.js";
import { aiCopyPlan, askPictureKind, FOUR_K } from "../controllers/printFileController.js";
import sharp from "sharp";
import { hasKeyColour, readSettings, saveAiAdmin } from "../controllers/aiController.js";
import { printPrompt } from "../services/aiImageService.js";

test("4K copy: any picture that is not 4K gets one (logo or photo); a 4K one, the setting off or the admin's 'no' do not", () => {
  assert.equal(FOUR_K, 3840);
  // the user's two logos (117 x 122 and 360 x 187) and a 1199 x 1101 photo
  assert.deepEqual(aiCopyPlan({ on: true, off: false, width: 117, height: 122 }), { copy: true, why: "", grokOk: true, noGrokWhy: "" }); // (16 Nov 2026: Grok allowed when Google refuses — it is under 2K)
  assert.equal(aiCopyPlan({ on: true, off: false, width: 360, height: 187 }).copy, true);
  assert.equal(aiCopyPlan({ on: true, off: false, width: 1199, height: 1101 }).copy, true);
  assert.equal(aiCopyPlan({ on: true, off: false, width: 3839, height: 2000 }).copy, true);
  // 4K: the longest side counts (the AI's own 4K designs are 3584 x 4800)
  const big = aiCopyPlan({ on: true, off: false, width: 3584, height: 4800 });
  assert.equal(big.copy, false);
  assert.match(big.why, /Already 4K \(3584×4800\)/);
  assert.equal(aiCopyPlan({ on: true, off: false, width: 3840, height: 2160 }).copy, false);
  assert.equal(aiCopyPlan({ on: false, off: false, width: 117, height: 122 }).copy, false);
  const off = aiCopyPlan({ on: true, off: true, width: 117, height: 122 });
  assert.equal(off.copy, false);
  assert.match(off.why, /uploaded picture/);
  // not measured: no copy, nothing said
  assert.deepEqual(aiCopyPlan({ on: true, off: false, width: undefined, height: undefined }), { copy: false, why: "" });
});

test("4K copy prompt: no redraw, no invented detail, nothing moved — and the key background when asked", () => {
  const t = printPrompt({ dark: false, plain: true, key: true });
  assert.match(t, /Do not redraw or redesign it/);
  assert.match(t, /no added bevels, 3D edges/);
  assert.match(t, /higher-resolution scan of the very same artwork/);
  assert.match(t, /pure magenta/);
  assert.match(printPrompt({ dark: true, plain: true }), /flat pure black/);
});

const rgba = (pixels) => Buffer.from(pixels.flat());
test("magenta check: a logo with pink in it can't go on the magenta 'green screen'; blue, gold, white and see-through can", () => {
  const blue = [40, 50, 160, 255], gold = [240, 190, 40, 255], white = [255, 255, 255, 255], clear = [255, 0, 255, 0];
  const plain = Array.from({ length: 1000 }, (_, i) => [blue, gold, white, clear][i % 4]);
  assert.equal(hasKeyColour(rgba(plain)), false); // see-through magenta does not count
  const pink = plain.map((p, i) => (i < 40 ? [230, 40, 220, 255] : p));
  assert.equal(hasKeyColour(rgba(pink)), true);
  const speck = plain.map((p, i) => (i < 3 ? [230, 40, 220, 255] : p)); // a few stray pixels are not "pink in it"
  assert.equal(hasKeyColour(rgba(speck)), false);
});

test("photo or art (for Topaz's setting): a design-maker cut-out is art without asking the AI; no AI = the pixel rule", async () => {
  const saved = { a: process.env.IDENTEE_GEMINI_API_KEY, b: process.env.GEMINI_API_KEY };
  process.env.IDENTEE_GEMINI_API_KEY = " ";
  process.env.GEMINI_API_KEY = " ";
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => (calls++, new Response("{}", { status: 500 }));
  try {
    const cut = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 0 } } }).png().toBuffer();
    assert.equal(await askPictureKind({ src: "/uploads/ai-designs/x.png", data: cut }), "art");
    const flat = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#2244aa" } }).png().toBuffer();
    assert.equal(await askPictureKind({ src: "/uploads/designs/y.png", data: flat }), "art"); // one flat colour
    assert.equal(calls, 0); // the AI is not set up here: never asked
  } finally {
    globalThis.fetch = realFetch;
    if (saved.a === undefined) delete process.env.IDENTEE_GEMINI_API_KEY; else process.env.IDENTEE_GEMINI_API_KEY = saved.a;
    if (saved.b === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = saved.b;
  }
});

const stubSettings = (rows) => {
  Setting.find = () => ({ select: () => ({ lean: async () => rows }) });
};
test("setting: the 4K copy is on unless the admin turned it off; it saves as true/false", async () => {
  stubSettings([]);
  assert.equal((await readSettings()).printAiCopy, true);
  stubSettings([{ key: "print.aiCopy", value: false }]);
  assert.equal((await readSettings()).printAiCopy, false);
  const saved = [];
  Setting.findOneAndUpdate = async (q, u) => saved.push([q.key, u.$set.value]);
  stubSettings([]);
  const res = { statusCode: 200 };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  await new Promise((resolve, reject) => {
    saveAiAdmin({ body: { printAiCopy: 0 }, user: { _id: "u1" } }, res, (err) => (err ? reject(err) : resolve()));
    setTimeout(resolve, 50);
  });
  assert.deepEqual(saved, [["print.aiCopy", false]]);
});

test("magenta left anywhere in an AI copy is cleared, even with no plain edge (VF-2026-0079 poster, 16 Nov 2026)", async () => {
  const { clearKeyColour } = await import("../services/cutoutService.js");
  // 40 x 40: a red figure filling the bottom edge (so the edge is not plain), magenta above it and a closed-in
  // magenta gap inside the figure; one deep suit red that must stay
  const W = 40, px = [];
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const figure = y >= 20, gap = figure && x >= 18 && x < 22 && y >= 26 && y < 30;
    px.push(gap || !figure ? [250, 8, 246, 255] : x < 5 ? [150, 20, 70, 255] : [200, 40, 40, 255]);
  }
  const png = await sharp(Buffer.from(px.flat()), { raw: { width: W, height: W, channels: 4 } }).png().toBuffer();
  const { buffer, cleared } = await clearKeyColour(png);
  const out = await sharp(buffer).raw().toBuffer();
  const a = (x, y) => out[(y * W + x) * 4 + 3];
  assert.equal(a(20, 5), 0); // the background above
  assert.equal(a(20, 28), 0); // the closed-in gap
  assert.equal(a(10, 35), 255); // the figure
  assert.equal(a(2, 35), 255); // the deep suit red is not magenta
  assert.ok(cleared > 0.5 && cleared < 0.52);
});

test("a white letter's pale-pink edge on the magenta is not cleared (no dark ring inside white letters)", async () => {
  const { clearKeyColour } = await import("../services/cutoutService.js");
  // a white bar (x 10..29) on magenta, with a 2-px blended edge each side, running off the top and bottom edges
  const W = 40, px = [];
  const blend = (t) => [255, Math.round(255 * t), 255, 255]; // t = share of white
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++)
    px.push(x === 8 || x === 31 ? blend(0.3) : x === 9 || x === 30 ? blend(0.7) : x >= 10 && x <= 29 ? [255, 255, 255, 255] : [255, 0, 255, 255]);
  const png = await sharp(Buffer.from(px.flat()), { raw: { width: W, height: W, channels: 4 } }).png().toBuffer();
  const out = await sharp((await clearKeyColour(png)).buffer).raw().toBuffer();
  const at = (x, y) => [...out.subarray((y * W + x) * 4, (y * W + x) * 4 + 4)];
  assert.equal(at(3, 20)[3], 0); // magenta: gone
  for (let x = 10; x <= 29; x++) assert.equal(at(x, 20)[3], 255, `inside the letter at x=${x}`);
  const edge = at(9, 20);
  assert.ok(edge[3] > 100, "the 70% white edge pixel keeps most of its cover");
  assert.ok(edge[1] > 200, "and it is white, not pink");
});
