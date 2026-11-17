// Photo of it worn / Try it on me on every printed side (17 Nov 2026, the owner: "it must show all sides where the
// prints are available"): one request per side; the sides after the first carry the first photo, so the AI keeps the
// same person. Google is never reached for real (a stand-in fetch records what would be sent and fails), and the
// mock run's stored files are removed again.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import Setting from "../models/settingModel.js";
import AiUsage from "../models/aiUsageModel.js";
import AiChatUsage from "../models/aiChatUsageModel.js";
import { UPLOADS_DIR } from "../utils/imageStorage.js";
import { makeTryOn, makeWorn } from "../controllers/assistantController.js";
import { tryOnPrompt, tryOnSidePrompt, wornPrompt } from "../services/conceptSheets.js";

const png = async (colour) => sharp({ create: { width: 48, height: 64, channels: 3, background: colour } }).png().toBuffer();
const dataUrl = async (colour) => `data:image/png;base64,${(await png(colour)).toString("base64")}`;
const fakeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (b) => ((res.body = b), res);
  return res;
};
const usedRows = (n) => (pipeline) => {
  const sum = pipeline.find((st) => st.$group)?.$group?.n?.$sum;
  if (!sum || !JSON.stringify(sum).includes("counted")) return []; // the month's spend: nothing
  return [{ _id: null, n }];
};

// one request to a handler: Google (when reached) answers 500 and its request body is kept
async function ask(handler, body, { used = 0, mock = false } = {}) {
  process.env.IDENTEE_GEMINI_API_KEY = "test-key-not-real";
  if (mock) process.env.AI_IMAGE_PROVIDER = "mock";
  else delete process.env.AI_IMAGE_PROVIDER;
  const oldStorage = process.env.FILE_STORAGE;
  process.env.FILE_STORAGE = "local";
  Setting.find = () => ({ select: () => ({ lean: async () => [{ key: "ai.dailyPerUser", value: 10 }] }) });
  AiUsage.aggregate = async (p) => usedRows(used)(p);
  AiChatUsage.aggregate = async () => [];
  const rows = [];
  AiUsage.create = async (row) => rows.push(row);
  const realFetch = globalThis.fetch;
  const google = [];
  const ours = [];
  const person = await png("#3366aa");
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith("https://generativelanguage.googleapis.com/")) {
      ours.push(String(url));
      return new Response(person, { status: 200, headers: { "content-type": "image/png" } }); // our own pictures (the first photo)
    }
    google.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ error: { message: "stand-in failure" } }), { status: 500, headers: { "content-type": "application/json" } });
  };
  try {
    const res = fakeRes();
    let error = null;
    await handler({ body, user: { _id: "6ae0e519fd34553aecf59db3" }, protocol: "http", get: () => "localhost:5000" }, res, (e) => (error = e));
    return { status: res.statusCode, body: res.body, message: error?.message || "", google, ours, rows };
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.IDENTEE_GEMINI_API_KEY;
    delete process.env.AI_IMAGE_PROVIDER;
    if (oldStorage == null) delete process.env.FILE_STORAGE;
    else process.env.FILE_STORAGE = oldStorage;
  }
}
const textOf = (g) => g.input.find((i) => i.type === "text").text;
const imagesIn = (g) => g.input.filter((i) => i.type === "image").length;

test("the prompts: the front is as before; the back and sleeve sides pose for their print; a second image keeps the same person", () => {
  const front = wornPrompt({ garment: "oversized tee", teeColour: "black" });
  assert.match(front, /EXACTLY as in the attached image/);
  assert.match(front, /college campus/);
  assert.match(front, /facing the camera so the front print is fully visible/);
  const back = wornPrompt({ garment: "oversized tee", teeColour: "black", side: "back" });
  assert.match(back, /seen from behind/);
  assert.match(back, /BACK of the tee/);
  assert.match(back, /back to the camera/);
  assert.doesNotMatch(back, /SECOND attached image/);
  const same = wornPrompt({ garment: "oversized tee", teeColour: "black", side: "left", sameAs: true });
  assert.match(same, /LEFT side/);
  assert.match(same, /SECOND attached image is a photo already taken of this person/);
  assert.match(same, /SAME person/);
  assert.match(same, /Do not copy the print from the second image/);
  assert.doesNotMatch(same, /college campus/); // the place is the first photo's
  assert.match(tryOnPrompt({ side: "back" }), /a person seen from behind/);
  assert.match(tryOnPrompt({ side: "back" }), /the BACK of a t-shirt/);
  assert.doesNotMatch(tryOnPrompt({}), /seen from behind/);
  const made = tryOnSidePrompt({ garment: "oversized tee", teeColour: "black", side: "back" });
  assert.match(made, /SAME person seen from behind/);
  assert.match(made, /exactly as in the second image/);
  assert.match(tryOnSidePrompt({ side: "right" }), /RIGHT side, with the print on the right sleeve/);
});

test("Photo of it worn, the back with the first photo: the tee's back AND the first photo go to the AI, with the same-person words", async () => {
  const r = await ask(makeWorn, { image: await dataUrl("#000000"), side: "back", ref: "/uploads/ai-worn/1-front.jpg", garment: "Oversized tee", teeColour: "Black" });
  assert.equal(r.google.length, 1, r.message);
  assert.equal(imagesIn(r.google[0]), 2);
  assert.match(textOf(r.google[0]), /seen from behind/);
  assert.match(textOf(r.google[0]), /SAME person/);
  assert.equal(r.google[0].response_format.aspect_ratio, "3:4");
  assert.ok(r.ours.some((u) => u.endsWith("/uploads/ai-worn/1-front.jpg")), "the first photo is read from our own uploads");
});

test("Photo of it worn: a first photo that is not one of ours is refused before anything is drawn", async () => {
  const r = await ask(makeWorn, { image: await dataUrl("#000000"), side: "back", ref: "https://example.com/someone.jpg" });
  assert.equal(r.status, 400);
  assert.equal(r.google.length, 0);
});

test("Photo of it worn with all 10 pictures made today: refused, nothing drawn", async () => {
  const r = await ask(makeWorn, { image: await dataUrl("#000000"), side: "back", ref: "/uploads/ai-worn/1-front.jpg" }, { used: 10 });
  assert.equal(r.status, 429);
  assert.match(r.message, /You’ve made today’s 10 pictures/);
  assert.equal(r.google.length, 0);
});

test("Try it on me, the back without a photo of it: made by the AI from the front try-on photo (the same person turned round)", async () => {
  const r = await ask(makeTryOn, { image: await dataUrl("#000000"), side: "back", ref: "/uploads/ai-worn/1-me.jpg" });
  assert.equal(r.google.length, 1, r.message);
  assert.equal(imagesIn(r.google[0]), 2);
  assert.match(textOf(r.google[0]), /SAME person seen from behind/);
});

test("Try it on me, the back from the customer's own back photo: dressed like the front", async () => {
  const r = await ask(makeTryOn, { image: await dataUrl("#000000"), side: "back", backPhoto: await dataUrl("#c08060"), ref: "/uploads/ai-worn/1-me.jpg" });
  assert.equal(r.google.length, 1, r.message);
  assert.match(textOf(r.google[0]), /photo of a person seen from behind/);
  assert.match(textOf(r.google[0]), /keep their hair, head, body, pose, hands/);
  assert.equal(r.ours.length, 0, "their own back photo is used, not the front try-on");
});

test("Try it on me, the front with no photo of the customer: asked for one", async () => {
  const r = await ask(makeTryOn, { image: await dataUrl("#000000"), side: "front" });
  assert.equal(r.status, 400);
  assert.match(r.message, /Choose a photo of yourself first/);
  assert.equal(r.google.length, 0);
});

test("the mock picture service makes every side: one stored photo and one AiUsage row (one picture) each, 'left' going down", async () => {
  const made = [];
  try {
    const front = await ask(makeWorn, { image: await dataUrl("#111111"), side: "front" }, { mock: true, used: 3 });
    assert.equal(front.status, 201, front.message);
    made.push(front.body.url);
    assert.equal(front.body.side, "front");
    assert.equal(front.body.left, 6);
    for (const side of ["back", "left"]) {
      const r = await ask(makeWorn, { image: await dataUrl("#222222"), side, ref: front.body.url }, { mock: true, used: 4 });
      assert.equal(r.status, 201, r.message);
      made.push(r.body.url);
      assert.equal(r.body.side, side);
      assert.equal(r.rows.length, 1);
      assert.equal(r.rows[0].kind, "worn");
      assert.equal(r.rows[0].images, 1);
      assert.match(r.rows[0].prompt, side === "back" ? /— back/ : /— left side/);
      assert.equal(r.google.length, 0);
    }
    const me = await ask(makeTryOn, { photo: await dataUrl("#c08060"), image: await dataUrl("#111111"), side: "front" }, { mock: true });
    assert.equal(me.status, 201, me.message);
    made.push(me.body.url);
    assert.equal(me.body.from, "photo");
    const meBack = await ask(makeTryOn, { image: await dataUrl("#222222"), side: "back", ref: me.body.url }, { mock: true });
    assert.equal(meBack.status, 201, meBack.message);
    made.push(meBack.body.url);
    assert.equal(meBack.body.from, "ai"); // the caption then says the back is made by the AI
    assert.match(meBack.rows[0].prompt, /made by the AI/);
  } finally {
    for (const url of made.filter(Boolean)) fs.rmSync(path.join(UPLOADS_DIR, url.replace(/^\/uploads\//, "")), { force: true });
  }
});
