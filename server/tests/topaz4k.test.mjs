// Topaz as the print enlarger, and customers' AI designs at 4K (15 Nov 2026). No real calls: fetch and the database
// are stood in for, so nothing is paid and nothing is written.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import sharp from "sharp";
import { enlargeWithTopaz, topazFactor, topazInput, topazUnits, ENLARGER_MAX_PIXELS } from "../services/replicateService.js";
import { enlargeForPrint, looksLikePhoto, pictureKind, printCost } from "../controllers/printFileController.js";
import Setting from "../models/settingModel.js";
import AiUsage from "../models/aiUsageModel.js";
import AiChatUsage from "../models/aiChatUsageModel.js";
import { DESIGN_SIZE, makeAiDesign, readSettings, saveAiAdmin } from "../controllers/aiController.js";
import { makeConcepts, makeDevelop } from "../controllers/assistantController.js";

const png = (w, h, colour = "#3366cc") => sharp({ create: { width: w, height: h, channels: 3, background: colour } }).png().toBuffer();
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/* ---------- Topaz: the request ---------- */
test("Topaz factor: 2× up to 2.5, 4× up to 4, else 6× (the caller resizes to the exact size)", () => {
  assert.equal(topazFactor(1.25), "2x");
  assert.equal(topazFactor(2.5), "2x");
  assert.equal(topazFactor(2.51), "4x");
  assert.equal(topazFactor(4), "4x");
  assert.equal(topazFactor(4.25), "6x");
  assert.equal(topazFactor(6), "6x");
});

test("Topaz model: a small photo -> Low Resolution V2, a big one -> Standard V2, both with faces kept (creativity 0); art -> CGI", () => {
  const small = topazInput({ scale: 4, kind: "photo", width: 1000, height: 1333, image: "u" });
  assert.deepEqual(small, { image: "u", enhance_model: "Low Resolution V2", upscale_factor: "4x", output_format: "png", face_enhancement: true, face_enhancement_strength: 0.8, face_enhancement_creativity: 0 });
  assert.equal(topazInput({ scale: 2, kind: "photo", width: 2000, height: 1500, image: "u" }).enhance_model, "Standard V2");
  const art = topazInput({ scale: 2, kind: "art", width: 3584, height: 4800, image: "u" });
  assert.deepEqual(art, { image: "u", enhance_model: "CGI", upscale_factor: "2x", output_format: "png", face_enhancement: false });
});

test("Topaz units: Replicate's own count, else worked out from the result's size", () => {
  assert.equal(topazUnits({ metrics: { unspecified_billing_metric: 3 } }, 100, 100), 3);
  assert.equal(topazUnits({}, 4000, 5000), 1); // 20 MP
  assert.equal(topazUnits({ metrics: {} }, 6000, 8000), 2); // 48 MP
  assert.equal(topazUnits(null, 7000, 8000), 3); // 56 MP
  assert.equal(topazUnits(null, 9000, 10000), 4); // 90 MP
});

test("enlargeWithTopaz: uploads the picture as it is (no shrink), runs the model with Prefer: wait, polls, counts units, deletes the file", async () => {
  const realFetch = globalThis.fetch;
  process.env.REPLICATE_API_TOKEN = "test-token-not-real";
  delete process.env.REPLICATE_MOCK;
  const input = await png(1500, 1500); // 2.25 MP: Real-ESRGAN's path would have shrunk it
  assert.ok(1500 * 1500 > ENLARGER_MAX_PIXELS);
  const out = await png(3000, 3000, "#cc3366");
  const calls = [];
  try {
    globalThis.fetch = async (url, init = {}) => {
      calls.push({ url: String(url), init });
      if (url === "https://api.replicate.com/v1/files" && init.method === "POST") {
        const file = init.body.get("content");
        assert.ok(file instanceof Blob);
        assert.ok(Buffer.from(await file.arrayBuffer()).equals(input), "the picture goes up byte for byte, never made smaller");
        return json({ id: "f1", urls: { get: "https://api.replicate.com/v1/files/f1" } }, 201);
      }
      if (url === "https://api.replicate.com/v1/models/topazlabs/image-upscale/predictions") {
        assert.equal(init.headers.Prefer, "wait=60");
        const body = JSON.parse(init.body);
        assert.equal(body.input.image, "https://api.replicate.com/v1/files/f1");
        assert.equal(body.input.enhance_model, "CGI");
        assert.equal(body.input.upscale_factor, "2x");
        return json({ id: "p1", status: "processing", urls: { get: "https://api.replicate.com/v1/predictions/p1", cancel: "https://api.replicate.com/v1/predictions/p1/cancel" } }, 201);
      }
      if (url === "https://api.replicate.com/v1/predictions/p1") return json({ id: "p1", status: "succeeded", output: "https://replicate.delivery/out.png", metrics: { unspecified_billing_metric: 1 } });
      if (url === "https://replicate.delivery/out.png") return new Response(out, { status: 200 });
      if (url === "https://api.replicate.com/v1/files/f1" && init.method === "DELETE") return new Response(null, { status: 204 });
      throw new Error(`unexpected fetch ${url}`);
    };
    const got = await enlargeWithTopaz(input, 2, { kind: "art", sleep: async () => {} });
    assert.equal(got.units, 1);
    assert.ok(got.png.equals(out));
    await new Promise((r) => setImmediate(r));
    assert.ok(calls.some((c) => c.url.endsWith("/files/f1") && c.init.method === "DELETE"), "the file is removed from Replicate");
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.REPLICATE_API_TOKEN;
  }
});

test("enlargeWithTopaz: a failed run and a run over its time limit both throw (the caller then uses Real-ESRGAN)", async () => {
  const realFetch = globalThis.fetch;
  process.env.REPLICATE_API_TOKEN = "test-token-not-real";
  const input = await png(64, 64);
  try {
    let status = "failed";
    let cancelled = false;
    globalThis.fetch = async (url, init = {}) => {
      if (String(url).endsWith("/files") && init.method === "POST") return json({ id: "f2", urls: { get: "https://api.replicate.com/v1/files/f2" } }, 201);
      if (String(url).endsWith("/predictions") && init.method === "POST") return json({ id: "p2", status, error: status === "failed" ? "NSFW" : null, urls: { get: "https://api.replicate.com/v1/predictions/p2", cancel: "https://api.replicate.com/v1/predictions/p2/cancel" } }, 201);
      if (String(url).endsWith("/cancel")) return (cancelled = true), json({});
      if (String(url).endsWith("/predictions/p2")) return json({ id: "p2", status: "processing", urls: { get: "https://api.replicate.com/v1/predictions/p2" } });
      return new Response(null, { status: 204 });
    };
    await assert.rejects(enlargeWithTopaz(input, 2, { sleep: async () => {} }), /Topaz failed: NSFW/);
    status = "processing";
    await assert.rejects(enlargeWithTopaz(input, 2, { sleep: async () => {}, timeoutMs: 0 }), (err) => err.status === 504);
    assert.ok(cancelled, "the run over time is cancelled");
    // refused at the start (no credit)
    globalThis.fetch = async () => json({ detail: "Insufficient credit" }, 402);
    await assert.rejects(enlargeWithTopaz(input, 2, { sleep: async () => {} }), /Insufficient credit/);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.REPLICATE_API_TOKEN;
  }
});

/* ---------- the enlarger choice and the backup ---------- */
test("enlargeForPrint: Topaz when chosen; Real-ESRGAN when chosen; Real-ESRGAN as the backup when Topaz fails", async () => {
  const rgbPng = await png(10, 10);
  const used = [];
  const topazOk = async (b, k, o) => (used.push(["topaz", k, o.kind]), { png: Buffer.from("T"), units: 2 });
  const topazBad = async () => {
    used.push(["topaz-fail"]);
    throw Object.assign(new Error("Topaz took more than 5 minutes."), { status: 504 });
  };
  const esrgan = async (b, k) => (used.push(["esrgan", k]), Buffer.from("E"));
  const kindOf = async () => "photo";

  let r = await enlargeForPrint({ rgbPng, keep: 2, useTopaz: true, kindOf, topaz: topazOk, esrgan });
  assert.deepEqual(r, { big: Buffer.from("T"), enlarger: "topaz", units: 2 });
  assert.deepEqual(used.pop(), ["topaz", 2, "photo"]);

  r = await enlargeForPrint({ rgbPng, keep: 3, useTopaz: false, kindOf, topaz: topazOk, esrgan });
  assert.deepEqual(r, { big: Buffer.from("E"), enlarger: "real-esrgan", units: 0 });
  assert.deepEqual(used.pop(), ["esrgan", 3]);
  assert.ok(!used.some((u) => u[0] === "topaz" && u[1] === 3), "Topaz is not run when Real-ESRGAN is chosen");

  used.length = 0;
  const lines = [];
  r = await enlargeForPrint({ rgbPng, keep: 1.5, useTopaz: true, kindOf, topaz: topazBad, esrgan, log: (t) => lines.push(t) });
  assert.deepEqual(r, { big: Buffer.from("E"), enlarger: "real-esrgan-backup", units: 0 });
  assert.deepEqual(used, [["topaz-fail"], ["esrgan", 1.5]]);
  assert.ok(lines.some((t) => /Topaz did not work/.test(t)));

  // a failed photo/art check does not stop Topaz: it is treated as art
  r = await enlargeForPrint({ rgbPng, keep: 2, useTopaz: true, kindOf: async () => { throw new Error("odd file"); }, topaz: topazOk, esrgan });
  assert.equal(r.enlarger, "topaz");
  assert.deepEqual(used.pop(), ["topaz", 2, "art"]);

  // (16 Nov 2026) Topaz failed on a picture over the backup's ~2 MP limit: the backup would shrink it first, so
  // nothing is made (the admin tries again) and Real-ESRGAN is not run
  used.length = 0;
  const bigPng = await png(2000, 1500);
  await assert.rejects(enlargeForPrint({ rgbPng: bigPng, keep: 2, useTopaz: true, kindOf, topaz: topazBad, esrgan }), /would have to make this 2000 × 1500 picture smaller first, so nothing was made/);
  assert.deepEqual(used, [["topaz-fail"]]);
});

test("mock mode (laptop, tests): Topaz's stand-in is a plain resize to its 2×/4×/6×, recorded as topaz, no units", async () => {
  process.env.REPLICATE_MOCK = "1";
  try {
    const r = await enlargeForPrint({ rgbPng: await png(300, 200), keep: 1.5, useTopaz: true, kindOf: async () => "art" });
    assert.equal(r.enlarger, "topaz");
    assert.equal(r.units, 0);
    const m = await sharp(r.big).metadata();
    assert.deepEqual([m.width, m.height], [600, 400]);
    // the stand-in for a big picture is never made smaller first either
    const big = await enlargeWithTopaz(await png(1600, 1500), 1.25);
    const mb = await sharp(big.png).metadata();
    assert.deepEqual([mb.width, mb.height], [3200, 3000]);
  } finally {
    delete process.env.REPLICATE_MOCK;
  }
});

test("print cost: Topaz units × ₹ per unit; Real-ESRGAN (chosen or backup) its price; nothing when not enlarged or mock", () => {
  const settings = { topazPricePerUnitInr: 4.5, replicatePricePerImageInr: 1 };
  assert.equal(printCost({ enlarge: true, enlarger: "topaz", units: 2, settings }), 9);
  assert.equal(printCost({ enlarge: true, enlarger: "real-esrgan", settings }), 1);
  assert.equal(printCost({ enlarge: true, enlarger: "real-esrgan-backup", units: 0, settings }), 1);
  assert.equal(printCost({ enlarge: false, enlarger: null, settings }), 0);
  assert.equal(printCost({ enlarge: true, enlarger: "topaz", units: 3, settings, mock: true }), 0);
});

test("photo or art: a flat logo is art, a photo-like picture is a photo, an AI cut-out is art", async () => {
  // a logo: two flat colours
  const logo = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#fff"/><circle cx="200" cy="200" r="150" fill="#c00"/></svg>`)).png().toBuffer();
  assert.equal(await pictureKind({ src: "/uploads/designs/logo.png", data: logo }), "art");
  // a "photo": smooth light with fine grain everywhere (thousands of colours, no flat areas)
  const W = 300, H = 300;
  const raw = Buffer.alloc(W * H * 3);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    raw[i] = Math.min(255, (x * 200) / W + rnd() * 40);
    raw[i + 1] = Math.min(255, (y * 200) / H + rnd() * 40);
    raw[i + 2] = Math.min(255, ((x + y) * 100) / W + rnd() * 40);
  }
  const photo = await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
  assert.equal(await pictureKind({ src: "/uploads/designs/me.jpg", data: photo }), "photo");
  // the same pixels as a design-maker cut-out (see-through around it): art
  const cut = await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).ensureAlpha().composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="40" height="40" fill="#000"/></svg>`), blend: "dest-out" }]).png().toBuffer();
  assert.equal(await pictureKind({ src: "/uploads/ai-designs/x.png", data: cut }), "art");
  // an AI picture with no see-through that looks like a photo (Photo Studio's enhanced photo): a photo
  assert.equal(await pictureKind({ src: "/uploads/ai-designs/y.jpg", data: photo }), "photo");
  // too few solid pixels to judge: art
  assert.equal(looksLikePhoto(Buffer.alloc(10 * 10 * 4), 10, 10), false);
});

/* ---------- settings ---------- */
const stubSettings = (rows) => {
  Setting.find = () => ({ select: () => ({ lean: async () => rows }) });
};
const fakeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  return res;
};
const run = async (handler, req) => {
  const res = fakeRes();
  let error = null;
  await handler(req, res, (err) => (error = err));
  return { res, error };
};

test("settings: Topaz is the default enlarger, ₹4.5 a unit, ₹8.7 a 4K picture; a saved choice is read back", async () => {
  stubSettings([]);
  let s = await readSettings();
  assert.equal(s.printEnlarger, "topaz");
  assert.equal(s.topazPricePerUnitInr, 4.5);
  assert.equal(s.price4kPerImageInr, 8.7);
  stubSettings([{ key: "ai.printEnlarger", value: "real-esrgan" }, { key: "ai.topazPricePerUnitInr", value: 5 }]);
  s = await readSettings();
  assert.equal(s.printEnlarger, "real-esrgan");
  assert.equal(s.topazPricePerUnitInr, 5);
  stubSettings([{ key: "ai.printEnlarger", value: "something else" }]);
  assert.equal((await readSettings()).printEnlarger, "topaz");
});

test("settings: the enlarger must be topaz or real-esrgan; the prices must be in range", async () => {
  const saved = [];
  Setting.findOneAndUpdate = async (q, u) => saved.push([q.key, u.$set.value]);
  stubSettings([]);
  const user = { _id: "u1" };
  let r = await run(saveAiAdmin, { body: { printEnlarger: "waifu2x" }, user });
  assert.equal(r.res.statusCode, 400);
  assert.match(r.error.message, /topaz or real-esrgan/);
  r = await run(saveAiAdmin, { body: { topazPricePerUnitInr: 500 }, user });
  assert.equal(r.res.statusCode, 400);
  r = await run(saveAiAdmin, { body: { price4kPerImageInr: -1 }, user });
  assert.equal(r.res.statusCode, 400);
  assert.equal(saved.length, 0);
  r = await run(saveAiAdmin, { body: { printEnlarger: "real-esrgan", topazPricePerUnitInr: 4.8, price4kPerImageInr: 9, replicatePricePerImageInr: 0.5 }, user });
  assert.equal(r.error, null);
  assert.deepEqual(saved, [["ai.printEnlarger", "real-esrgan"], ["ai.replicatePricePerImageInr", 0.5], ["ai.topazPricePerUnitInr", 4.8], ["ai.price4kPerImageInr", 9]]);
});

/* ---------- customers' designs at 4K ---------- */
// Google's answer is a stand-in error, so each request stops right after the picture is asked for: what was asked
// (image_size) is all that is checked, nothing is stored.
async function askedSizes(handler, body) {
  const realFetch = globalThis.fetch;
  process.env.IDENTEE_GEMINI_API_KEY = "test-key-not-real";
  delete process.env.AI_IMAGE_PROVIDER;
  stubSettings([]);
  AiUsage.aggregate = async () => [];
  AiChatUsage.aggregate = async () => [];
  AiUsage.countDocuments = async () => 0;
  const sizes = [];
  const picture = await png(64, 64, "#ff00ff");
  try {
    globalThis.fetch = async (url, init = {}) => {
      if (String(url).startsWith("https://generativelanguage.googleapis.com/")) {
        sizes.push(JSON.parse(init.body).response_format.image_size);
        return json({ error: { message: "stand-in failure" } }, 500);
      }
      return new Response(picture, { status: 200, headers: { "content-type": "image/png" } }); // our own pictures
    };
    const req = { body, user: { _id: "u1" }, protocol: "http", get: () => "localhost:5000" };
    const { error } = await run(handler, req);
    assert.ok(error, "the stand-in failure ends the request");
    return sizes;
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.IDENTEE_GEMINI_API_KEY;
  }
}

test("customer designs are asked for at 4K: a new design, a change, the Assistant's concept pieces", async () => {
  assert.equal(DESIGN_SIZE, "4K");
  assert.deepEqual(await askedSizes(makeAiDesign, { subject: "a lion with a crown", style: "Cartoon", ratio: 0.75 }), ["4K"]);
  assert.deepEqual(await askedSizes(makeAiDesign, { baseUrl: "/uploads/ai-designs/1-abc.png", change: "make it blue", ratio: 1 }), ["4K"]);
  assert.deepEqual(await askedSizes(makeAiDesign, { photoUrl: "/uploads/designs/me.jpg", artStyle: "Cartoon", ratio: 1 }), ["4K"]);
  const concept = { title: "Lion", front: "a lion with a crown", colours: "gold" };
  assert.deepEqual(await askedSizes(makeDevelop, { sheetUrl: "/uploads/ai-concepts/s.png", n: 1, concept, pieces: ["front"] }), ["4K"]);
});

test("not at 4K: concept sheets (their own 2K), the one-line banner lettering; the Studio and the Collection maker are untouched", async () => {
  const concepts = [{ title: "One", front: "a lion" }, { title: "Two", front: "a tiger" }, { title: "Three", front: "a bear" }];
  assert.deepEqual(await askedSizes(makeConcepts, { concepts, brief: "animals" }), ["2K"]);
  const banner = await askedSizes(makeAiDesign, { subject: "NEVER GIVE UP", style: "Hand lettering", banner: true, ratio: 0.2 });
  assert.ok(banner.length >= 1 && banner.every((s) => s === "1K"), JSON.stringify(banner));
  for (const f of ["services/studioService.js", "services/collectionService.js"]) {
    const src = fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    assert.ok(!/DESIGN_SIZE/.test(src), `${f} does not use the customers' 4K size`);
  }
});
