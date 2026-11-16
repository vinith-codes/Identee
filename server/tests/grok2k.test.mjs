// Grok draws customers' pictures at its best size (2k), and Prepare for print sends those straight to Topaz
// (16 Nov 2026, the owner: "if generated from the Assistant using Grok, proceed with the Topaz enlarger").
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GROK_BEST, xaiNewImage, xaiEditImage } from "../services/xaiImageService.js";
import { aiCopyPlan } from "../controllers/printFileController.js";

const picture = Buffer.from("not-really-a-png");
async function askedGrok(call, answers) {
  const realFetch = globalThis.fetch;
  process.env.XAI_API_KEY = "test-key-not-real";
  const sent = [];
  globalThis.fetch = async (url, init = {}) => {
    sent.push(JSON.parse(init.body));
    const a = answers[sent.length - 1] || answers.at(-1);
    return new Response(a.body, { status: a.status, headers: { "content-type": "application/json" } });
  };
  try {
    return { out: await call().catch((e) => e), sent };
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.XAI_API_KEY;
  }
}
const ok = { status: 200, body: JSON.stringify({ data: [{ b64_json: picture.toString("base64") }] }) };
const notTaken = { status: 400, body: JSON.stringify({ error: "Invalid resolution" }) };

test("Grok's best size is 2k; a new drawing asks for it together with the shape", async () => {
  assert.equal(GROK_BEST, "2k");
  const { out, sent } = await askedGrok(() => xaiNewImage({ prompt: "a lion", ratio: "3:4", resolution: GROK_BEST }), [ok]);
  assert.ok(out.buffer, "a picture came back");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].resolution, "2k");
  assert.equal(sent[0].aspect_ratio, "3:4");
});

test("if Grok won't take the size, it is asked again without it (not a refusal)", async () => {
  const { out, sent } = await askedGrok(() => xaiNewImage({ prompt: "a lion", ratio: "3:4", resolution: GROK_BEST }), [notTaken, ok]);
  assert.ok(out.buffer, "a picture came back on the second ask");
  assert.equal(sent.length, 2);
  assert.equal(sent[1].resolution, undefined);
  // a real refusal is not asked again
  const refused = { status: 400, body: JSON.stringify({ error: "Generated image rejected by content moderation" }) };
  const r = await askedGrok(() => xaiNewImage({ prompt: "x", resolution: GROK_BEST }), [refused]);
  assert.equal(r.sent.length, 1);
  assert.equal(r.out.status, 422);
});

test("an edit (concept pieces, matching pieces, photo to art) asks for 2k too", async () => {
  const { sent } = await askedGrok(() => xaiEditImage({ prompt: "the front", image: { data: picture, mime: "image/png" }, ratio: "1:1", resolution: GROK_BEST }), [ok]);
  assert.equal(sent[0].resolution, "2k");
});

test("every Grok picture made for a customer asks for Grok's best size", () => {
  for (const file of ["../controllers/aiController.js", "../controllers/assistantController.js"]) {
    const src = fs.readFileSync(new URL(file, import.meta.url), "utf8");
    // every call (the import line left out); the admin's print copy (makeAiPrintCopy) asks for "2k" itself
    const calls = [...src.matchAll(/xai(?:Edit|New)Image\(\{/g)].map((m) => src.slice(m.index, m.index + 400));
    const customer = calls.filter((c) => !/^xaiEditImage\(\{\s*prompt: `\$\{prompt\} Keep the same person/.test(c));
    assert.ok(customer.length >= (file.includes("assistant") ? 5 : 2), `${file}: ${customer.length} calls found`);
    for (const c of customer) assert.match(c.split("\n")[0], /resolution: GROK_BEST/, `${file}: ${c.slice(0, 120)}`);
  }
});

test("the admin's 4K print copy keeps asking Grok for 2k", () => {
  const src = fs.readFileSync(new URL("../controllers/aiController.js", import.meta.url), "utf8");
  assert.match(src, /xaiEditImage\(\{\s*prompt: `\$\{prompt\} Keep the same person[^]*?resolution: "2k"/);
});

test("the pictures Grok drew are remembered (design maker, concept pieces, matching pieces)", () => {
  const ai = fs.readFileSync(new URL("../controllers/aiController.js", import.meta.url), "utf8");
  assert.match(ai, /\.\.\.\(byGrok \? \{ grokUrls: stored\.map\(\(s\) => s\.url\) \} : \{\}\)/);
  const as = fs.readFileSync(new URL("../controllers/assistantController.js", import.meta.url), "utf8");
  assert.match(as, /grokUrls: stored\.filter\(\(_, i\) => made\[i\]\.byGrok\)\.map\(\(st\) => st\.url\)/); // only the pieces Grok drew
  assert.match(as, /\.\.\.\(byGrok \? \{ grokUrls: \[stored\.url\] \} : \{\}\)/);
});

test("Prepare for print: a picture Grok drew goes straight to Topaz; others under 4K still get the AI copy", () => {
  const grok = aiCopyPlan({ on: true, off: false, width: 1536, height: 2048, grok: true });
  assert.equal(grok.copy, false);
  assert.match(grok.why, /Drawn by Grok at its best size \(1536×2048\): no AI copy, Topaz enlarges it/);
  assert.equal(aiCopyPlan({ on: true, off: false, width: 1536, height: 2048 }).copy, true); // an upload, or an older 1K Grok picture
  assert.equal(aiCopyPlan({ on: true, off: false, width: 3840, height: 4800, grok: true }).why, "Already 4K (3840×4800): no AI copy");
  const src = fs.readFileSync(new URL("../controllers/printFileController.js", import.meta.url), "utf8");
  assert.match(src, /AiUsage\.exists\(\{ grokUrls: el\.src \}\)/);
});

test("under 4K: Google first; if Google refuses, Grok only for a picture under 2K (16 Nov 2026, the owner)", async () => {
  const small = aiCopyPlan({ on: true, off: false, width: 900, height: 1200 });
  assert.equal(small.copy, true); // Google is asked first
  assert.equal(small.grokOk, true); // then Grok, if Google refuses
  const mid = aiCopyPlan({ on: true, off: false, width: 1669, height: 2400 });
  assert.equal(mid.copy, true); // Google is still asked first
  assert.equal(mid.grokOk, false); // but no Grok copy: it is 2K already
  assert.match(mid.noGrokWhy, /already 2K or more, 1669×2400, so Grok is not asked — Topaz enlarges it as it is/);
  assert.equal(aiCopyPlan({ on: true, off: false, width: 2047, height: 1000 }).grokOk, true);
  assert.equal(aiCopyPlan({ on: true, off: false, width: 2048, height: 1000 }).grokOk, false);
  // Prepare passes the rule to the copy maker, and the copy maker says why when Grok is not asked
  const src = fs.readFileSync(new URL("../controllers/printFileController.js", import.meta.url), "utf8");
  assert.match(src, /makeAiPrintCopy\(\{ designId, index, user, req: ourReq, settings, allowGrok: plan\.grokOk, noGrokWhy: plan\.noGrokWhy \}\)/);
  const ai = fs.readFileSync(new URL("../controllers/aiController.js", import.meta.url), "utf8");
  assert.match(ai, /if \(!allowGrok\) throw fail\(422, `Google won't make a 4K copy of this picture\$\{noGrokWhy/);
});
