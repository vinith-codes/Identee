// The customer's daily limit counts PICTURES, not requests (16 Nov 2026, the owner: "10 pictures a day, redraws free").
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import sharp from "sharp";
import Setting from "../models/settingModel.js";
import AiUsage from "../models/aiUsageModel.js";
import AiChatUsage from "../models/aiChatUsageModel.js";
import { makeAiDesign, usedToday } from "../controllers/aiController.js";
import { makeDevelop } from "../controllers/assistantController.js";

// a tiny reader of the $group sum, so the counting rule itself is checked on example rows
const value = (e, row) => {
  if (typeof e === "string" && e.startsWith("$")) return row[e.slice(1)];
  if (typeof e !== "object" || e === null) return e;
  if (e.$ifNull) { const v = value(e.$ifNull[0], row); return v == null ? value(e.$ifNull[1], row) : v; }
  if (e.$max) return Math.max(...e.$max.map((x) => value(x, row)).filter((v) => v != null));
  throw new Error(`not read: ${JSON.stringify(e)}`);
};
const today = (rows) => (pipeline) => {
  const sum = pipeline.find((st) => st.$group)?.$group?.n?.$sum;
  if (!sum || !JSON.stringify(sum).includes("counted")) return []; // another figure (the month's spend): nothing
  return [{ _id: null, n: rows.reduce((t, row) => t + value(sum, row), 0) }];
};

test("today's pictures: each row counts its pictures; a developed concept counts its pieces, not the free redraws", async () => {
  AiUsage.aggregate = async (pipeline) => today([
    { kind: "new", images: 1 },
    { kind: "sheet", images: 1 }, // a concept sheet is one picture
    { kind: "develop", images: 5, counted: 3 }, // 3 pieces, 2 of them redrawn for spelling: 3 count
    { kind: "worn", images: 1 },
    { kind: "new", images: 0 }, // an old row with no number: counts as one, as before
  ])(pipeline);
  assert.equal(await usedToday("6ae0e519fd34553aecf59db3"), 7);
});

// --- the requests themselves (Google is never reached: every picture asked for is recorded and refused) ---
const fakeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  return res;
};
async function ask(handler, body, rows) {
  process.env.IDENTEE_GEMINI_API_KEY = "test-key-not-real";
  delete process.env.AI_IMAGE_PROVIDER;
  Setting.find = () => ({ select: () => ({ lean: async () => [{ key: "ai.dailyPerUser", value: 10 }] }) });
  AiUsage.aggregate = async (p) => today(rows)(p);
  AiChatUsage.aggregate = async () => [];
  const realFetch = globalThis.fetch;
  let drawn = 0;
  const picture = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#ff00ff" } }).png().toBuffer();
  globalThis.fetch = async (url) => {
    if (!String(url).startsWith("https://generativelanguage.googleapis.com/")) return new Response(picture, { status: 200, headers: { "content-type": "image/png" } }); // our own pictures
    drawn++;
    return new Response(JSON.stringify({ error: { message: "stand-in failure" } }), { status: 500, headers: { "content-type": "application/json" } });
  };
  try {
    const res = fakeRes();
    let error = null;
    await handler({ body, user: { _id: "6ae0e519fd34553aecf59db3" }, protocol: "http", get: () => "localhost:5000" }, res, (e) => (error = e));
    return { status: res.statusCode, message: error?.message || "", drawn };
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.IDENTEE_GEMINI_API_KEY;
  }
}
const concept = { title: "Lion", front: "a lion with a crown", back: "LION PRIDE in gold", sleeve: "a small crown", colours: "gold" };
const develop = { sheetUrl: "/uploads/ai-concepts/s.png", n: 1, concept };
const eight = Array.from({ length: 8 }, () => ({ images: 1 }));

test("a concept with 3 pieces and 2 pictures left: refused before anything is drawn, saying why", async () => {
  const r = await ask(makeDevelop, develop, eight);
  assert.equal(r.status, 429);
  assert.match(r.message, /You have 2 pictures left today, and this needs 3/);
  assert.equal(r.drawn, 0);
});

test("the same concept with 3 pictures left goes ahead (the 3 pieces are asked for)", async () => {
  const r = await ask(makeDevelop, develop, [...eight.slice(1)]);
  assert.notEqual(r.status, 429, r.message);
  assert.ok(r.drawn >= 3, `asked for ${r.drawn}`);
});

test("only the front of it, with 2 left: allowed (1 picture)", async () => {
  const r = await ask(makeDevelop, { ...develop, pieces: ["front"] }, eight);
  assert.notEqual(r.status, 429, r.message);
  assert.ok(r.drawn >= 1, `asked for ${r.drawn}`);
});

test("a new design with all 10 pictures made today: refused with the new words", async () => {
  const r = await ask(makeAiDesign, { subject: "a lion", style: "Cartoon", ratio: 1 }, Array.from({ length: 10 }, () => ({ images: 1 })));
  assert.equal(r.status, 429);
  assert.match(r.message, /You’ve made today’s 10 pictures/);
  assert.equal(r.drawn, 0);
});

test("a developed concept's row: its redraws are paid for (images, cost) but not counted; 'left' goes down by its pieces", () => {
  const src = fs.readFileSync(new URL("../controllers/assistantController.js", import.meta.url), "utf8");
  const dev = src.slice(src.indexOf("export const makeDevelop"), src.indexOf("export const makeMatch"));
  assert.match(dev, /images: made\.length \+ redraws,\s*\n\s*counted: made\.length,/);
  assert.match(dev, /left: Math\.max\(0, s\.dailyPerUser - used - made\.length\)/);
  const ai = fs.readFileSync(new URL("../controllers/aiController.js", import.meta.url), "utf8");
  assert.match(ai, /left: Math\.max\(0, settings\.dailyPerUser - used - made\.length\) \}\);/);
  assert.match(ai, /const of = Math\.min\(4, Math\.max\(1, wanted\), left\);/);
});
