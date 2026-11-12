// Replicate's graphics card refuses pictures over 2,096,704 pixels (12 Nov 2026): bigger ones are sent smaller.
import test from "node:test";
import assert from "node:assert/strict";
import { fitForEnlarger, ENLARGER_MAX_PIXELS } from "../services/replicateService.js";

const LIMIT = 2_096_704;

test("a small picture goes as it is, at the scale asked", () => {
  assert.deepEqual(fitForEnlarger(1024, 1024, 4), { w: 1024, h: 1024, scale: 4, shrunk: false });
  assert.deepEqual(fitForEnlarger(800, 600, 2.75), { w: 800, h: 600, scale: 2.75, shrunk: false });
});

test("the pictures Replicate refused now fit under its limit", () => {
  for (const [W, H, k] of [[2300, 2300, 1.25], [2000, 1414, 2], [2000, 1333, 4], [6000, 4000, 1.5]]) {
    const f = fitForEnlarger(W, H, k);
    assert.ok(f.shrunk);
    assert.ok(f.w * f.h <= ENLARGER_MAX_PIXELS && f.w * f.h < LIMIT, `${W}×${H} → ${f.w}×${f.h}`);
    assert.ok(f.scale >= 1 && f.scale <= 4);
    // the shape stays the same
    assert.ok(Math.abs(f.w / f.h - W / H) < 0.01);
  }
});

test("a shrunk picture asks for more enlarging, at most 4× (the rest is a plain resize)", () => {
  const f = fitForEnlarger(2000, 1414, 2); // needs 4000 wide
  assert.equal(f.scale, Math.round((4000 / f.w) * 100) / 100);
  assert.equal(fitForEnlarger(2000, 1333, 4).scale, 4);
});

// Replicate's "throttled" answer (under $5 credit: 6 new runs a minute): wait as told, then try again
import { createPrediction, waitSeconds } from "../services/replicateService.js";

test("the wait is read from Replicate's answer", () => {
  assert.equal(waitSeconds(null, "Request was throttled. ... Your rate limit resets in ~5s."), 6);
  assert.equal(waitSeconds("3", "anything"), 3);
  assert.equal(waitSeconds(null, "no number here"), 10);
});

test("a throttled run waits and is tried again; it gives up with plain words after 8 tries", async () => {
  const realFetch = globalThis.fetch;
  process.env.REPLICATE_API_TOKEN = "test-token-not-real";
  const throttled = () => new Response(JSON.stringify({ detail: "Request was throttled. Your rate limit resets in ~1s." }), { status: 429 });
  try {
    let calls = 0;
    globalThis.fetch = async () => (++calls < 3 ? throttled() : new Response(JSON.stringify({ id: "p1", status: "starting" }), { status: 201 }));
    const waits = [];
    const p = await createPrediction({ version: "v", input: {} }, () => {}, async (ms) => waits.push(ms));
    assert.equal(p.id, "p1");
    assert.equal(calls, 3);
    assert.deepEqual(waits, [2000, 2000]);

    calls = 0;
    globalThis.fetch = async () => (++calls, throttled());
    await assert.rejects(createPrediction({}, () => {}, async () => {}), /Wait a minute and press Prepare again/);
    assert.equal(calls, 8);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.REPLICATE_API_TOKEN;
  }
});
