// "Trending now" / the GTA Studio (23 Nov 2026): a trend has its own assistant in the Design Room — pick the tee, send
// a photo, see three tees made from it, tap one. What the home page hands over, what that assistant opens with, and
// its "Show me 3 more" button (studio/trends.js, studio/assistantScript.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { TREND_MORE, TREND_READY, TREND_UPLOAD, trendColours, trendFromLink, trendHello, trendSheetAct, trendState } from "../src/studio/trends.js";
import { replyTo, firstState, smartCanAnswer } from "../src/studio/assistantScript.js";
import { makeCtx, actOf, botText, chipsOf } from "./helpers.mjs";

const GTA = { key: "gta", name: "GTA style" };
const LINK = { ...GTA, colours: [] }; // (what the home page hands over, checked)
// the whole trend as the shop gets it: its tee colours, its front logo, its ready-made backs
const BACKS = [{ url: "/uploads/designs/b1.png", name: "Duo" }, { url: "/uploads/designs/b2.png", name: "Cover" }];
const FULL = { ...GTA, colours: ["black", "white"], front: "/uploads/designs/logo.png", backs: BACKS };
const on = (over = {}) => makeCtx({ ai: { available: true, loggedIn: true, left: 5, ...over } });
const photo = { url: "/uploads/designs/me.jpg", w: 1200, h: 1600 };
const studio = (over = {}) => ({ ...firstState(), ...trendState(GTA), ...over });

test("what the home page hands over is checked before it is used (the photo is sent later, in the assistant)", () => {
  assert.deepEqual(trendFromLink({ trend: { key: "gta", name: "GTA style" } }), LINK);
  assert.deepEqual(trendFromLink({ trend: { key: " gta ", name: "GTA style", photo } }), LINK, "nothing else is carried");
  assert.deepEqual(trendFromLink({ trend: { ...GTA, colours: ["Black", " White "] } }).colours, ["black", "white"], "its tee colours, for the first screen");
  assert.equal(trendFromLink({ trend: { name: "GTA style" } }), null, "no key: no trend");
  assert.equal(trendFromLink({ trend: null }), null);
  assert.equal(trendFromLink(null), null);
  assert.equal(trendFromLink({ idea: "a lion" }), null);
  assert.equal(trendFromLink({ trend: { key: "gta" } }).name, "this trend");
});

test("the trend's assistant opens with one line and the upload button, waiting for the photo", () => {
  const hello = trendHello(GTA);
  assert.match(hello[0].text, /^GTA style/);
  assert.match(hello[0].text, /three designs/);
  assert.match(hello[0].text, /back of your tee/);
  assert.deepEqual(hello[1].chips, [TREND_UPLOAD]);
  assert.deepEqual(trendState(GTA), { studio: "gta", studioName: "GTA style", studioBacks: [], wait: "trendPhoto", photo: null });
});

test("the mockup request carries the trend and the photo", () => {
  assert.deepEqual(trendSheetAct(studio(), photo), { type: "trendSheet", trend: "gta", trendName: "GTA style", photo });
});

test("'Upload a photo' opens the photo picker in the trend's assistant too", () => {
  assert.equal(actOf(replyTo(TREND_UPLOAD, on(), studio(), { tapped: true }).out).type, "photoPick");
});

test("'Show me 3 more' makes another mockup from the same photo — only in a trend's assistant", () => {
  const more = replyTo(TREND_MORE, on(), studio({ photo, wait: null }), { tapped: true });
  assert.deepEqual(actOf(more.out), { type: "trendSheet", trend: "gta", trendName: "GTA style", photo });
  // no photo yet: it asks for one
  const none = replyTo(TREND_MORE, on(), studio(), { tapped: true });
  assert.equal(actOf(none.out), null);
  assert.deepEqual(chipsOf(none.out), [TREND_UPLOAD]);
  assert.equal(none.st.wait, "trendPhoto");
  // the Create your IDENTEE assistant doesn't know the button: no mockup is made there
  assert.notEqual(actOf(replyTo(TREND_MORE, on(), { ...firstState(), photo }, { tapped: true }).out)?.type, "trendSheet");
});

test("never a dead end: not logged in, today's pictures used up, or the picture maker off", () => {
  const st = studio({ photo, wait: null });
  assert.match(botText(replyTo(TREND_MORE, on({ loggedIn: false }), st, { tapped: true }).out), /Log in/);
  assert.match(botText(replyTo(TREND_MORE, on({ left: 0 }), st, { tapped: true }).out), /tomorrow/);
  assert.match(botText(replyTo(TREND_MORE, on({ available: false }), st, { tapped: true }).out), /resting/);
  for (const ctx of [on({ loggedIn: false }), on({ left: 0 }), on({ available: false })]) assert.equal(actOf(replyTo(TREND_MORE, ctx, st, { tapped: true }).out), null, "nothing is made");
});

test("the button's words, typed out, are the button — they never go to the smart chat", () => {
  assert.equal(smartCanAnswer(TREND_MORE, on({ smart: true }), studio({ photo })), false);
});

// (23 Nov 2026, the owner: "only the black and [white] colours should be given. In the front side of the t-shirt the
// logo I am giving is fixed for all tees. In the back either they can make the GTA version of their photo or we should
// provide many options for the back.")
const TEES = [{ slug: "black", name: "Black" }, { slug: "off-white", name: "White" }, { slug: "maroon", name: "Maroon" }];

test("a trend's studio offers only the trend's tee colours (by name or slug) — never an empty list", () => {
  assert.deepEqual(trendColours(TEES, FULL).map((c) => c.slug), ["black", "off-white"]);
  assert.deepEqual(trendColours(TEES, { ...GTA, colours: ["MAROON"] }).map((c) => c.slug), ["maroon"]);
  assert.equal(trendColours(TEES, GTA), TEES, "a trend that names none offers them all");
  assert.equal(trendColours(TEES, { ...GTA, colours: ["neon pink"] }), TEES, "none this garment has: all of them");
  assert.equal(trendColours(TEES, null), TEES);
});

test("with a front logo and ready designs, the studio says so and offers both ways for the back", () => {
  const hello = trendHello(FULL);
  assert.match(hello[0].text, /logo is on the front/);
  assert.match(hello[0].text, /For the back, send me a photo/);
  assert.match(hello[0].text, /ready designs/);
  assert.deepEqual(hello[1].chips, [TREND_UPLOAD, TREND_READY]);
  assert.deepEqual(trendState(FULL).studioBacks, BACKS);
  // a trend with a logo but no ready designs: only the photo
  assert.deepEqual(trendHello({ ...FULL, backs: [] })[1].chips, [TREND_UPLOAD]);
  assert.ok(!/ready designs/.test(trendHello({ ...FULL, backs: [] })[0].text));
});

test("'Choose a ready design' shows the trend's ready backs — free, also when today's pictures are used up", () => {
  const st = { ...firstState(), ...trendState(FULL) };
  for (const ctx of [on(), on({ left: 0 }), on({ available: false })]) {
    const r = replyTo(TREND_READY, ctx, st, { tapped: true });
    assert.deepEqual(r.out.find((o) => o.backs)?.backs, BACKS);
    assert.equal(actOf(r.out), null, "nothing is made: a tap on a picture puts it on the back");
    assert.deepEqual(chipsOf(r.out), [TREND_UPLOAD], "the photo is still one tap away");
  }
  // no ready designs (or outside a trend's studio): never an empty row
  const none = replyTo(TREND_READY, on(), studio(), { tapped: true });
  assert.equal(none.out.find((o) => o.backs), undefined);
  assert.deepEqual(chipsOf(none.out), [TREND_UPLOAD]);
  assert.equal(replyTo(TREND_READY, on(), firstState(), { tapped: true }).out.find((o) => o.backs), undefined);
  assert.equal(smartCanAnswer(TREND_READY, on({ smart: true }), st), false, "the button's words never go to the smart chat");
});
