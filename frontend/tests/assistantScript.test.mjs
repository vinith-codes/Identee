// The design-room Assistant's fixed replies (studio/assistantScript.js), written down on 23 Oct 2026 before the
// smart (AI) chat was added next to it. The smart chat must not change any of this: when it is switched off, or
// Google isn't available, the Assistant answers exactly like this.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  replyTo,
  firstMessages,
  firstState,
  IMPROVE,
  NOT_NOW,
  BACK,
  PHOTO_AS_IS,
  PHOTO_CUT,
  PHOTO_COPY,
  PHOTO_ART,
} from "../src/studio/assistantScript.js";
import { makeCtx, kinds, actOf, chipsOf, botText } from "./helpers.mjs";

const say = (text, ctx = makeCtx(), st = firstState(), opts = {}) => replyTo(text, ctx, st, opts);

test("opens with a hello, the examples and More help", () => {
  const out = firstMessages();
  assert.deepEqual(kinds(out), ["bot", "examples", "chips"]);
  assert.deepEqual(chipsOf(out), ["More help"]);
});

test("What can you do? shows the examples", () => {
  assert.deepEqual(kinds(say("What can you do?").out), ["bot", "examples", "chips"]);
});

test("More help / Something else list everything", () => {
  for (const t of ["More help", "Something else"]) {
    const chips = chipsOf(say(t).out);
    for (const c of ["Slogan ideas", "Start from a template", "Check my design", "Colour help", "Where to print", "Size help", "Make a design", IMPROVE]) assert.ok(chips.includes(c), `${t} offers ${c}`);
  }
});

test("Back always has a way out", () => {
  const { out } = say(BACK);
  assert.match(botText(out), /What do you need\?/);
  assert.ok(chipsOf(out).includes("What can you do?"));
});

/* ---------- colours, print areas, sizes ---------- */

test("Colour help shows inks for the tee colour", () => {
  const { out } = say("Colour help");
  assert.deepEqual(kinds(out), ["bot", "inks", "chips"]);
  assert.match(botText(out), /black tee/);
});

test("Where to print → what are you printing → the right areas", () => {
  assert.ok(chipsOf(say("Where to print").out).includes("A small logo"));
  const { out } = say("A small logo");
  assert.match(botText(out), /chest or a sleeve/);
  assert.ok(chipsOf(out).includes("Open Left chest"));
  assert.deepEqual(actOf(say("Open Left chest").out), { type: "area", key: "left-chest" });
});

test("Size help asks the usual size, then explains the oversized fit", () => {
  const first = say("Size help");
  assert.equal(first.st.wait, "size");
  assert.deepEqual(chipsOf(first.out).slice(0, 4), ["S", "M", "L", "XL"]);
  const { out } = say("L", makeCtx(), first.st);
  assert.match(botText(out), /oversized/);
  assert.match(botText(out), /chest 44″, length 29″/);
  assert.deepEqual(chipsOf(out), ["Use size L", "Use size M", "Something else"]);
  assert.deepEqual(actOf(say("Use size M").out), { type: "size", value: "M" });
});

/* ---------- templates, design check, team orders ---------- */

test("templates: the list, then a layout put on an empty tee", () => {
  assert.ok(chipsOf(say("Start from a template").out).includes("Team jersey"));
  const { out } = say("Birthday squad");
  assert.deepEqual(actOf(out), { type: "template", key: actOf(out).key, fresh: true });
});

test("a template on a tee that already has a design asks first", () => {
  const { out, st } = say("Birthday squad", makeCtx({ hasDesign: true }));
  assert.deepEqual(chipsOf(out), ["Start fresh", "Add to my design", "Keep my design"]);
  assert.ok(st.template);
});

test("Check my design: empty tee, then a clean design", () => {
  assert.match(botText(say("Check my design").out), /nothing on the tee yet/);
  assert.match(botText(say("Check my design", makeCtx({ hasDesign: true })).out), /Good to go/);
});

test("Check my design lists what won't print well", () => {
  const issues = [{ id: "x", text: "Tiny text" }];
  const { out } = say("Check my design", makeCtx({ hasDesign: true, issues: () => issues }));
  assert.deepEqual(kinds(out), ["bot", "issues", "chips"]);
});

test("team order: without a name/number place it suggests the Team jersey", () => {
  assert.ok(chipsOf(say("Team order").out).includes("Team jersey"));
});

test("team order: with a name and number place it asks for the players", () => {
  assert.match(botText(say("Team order", makeCtx({ hasRoles: true, roles: { name: true, number: true } })).out), /name, number and size/);
});

test("a pasted player list becomes one tee per player", () => {
  const ctx = makeCtx({ hasRoles: true, roles: { name: true, number: true } });
  const { out } = say("Arun 7 L, Karthik 10 XL, Ravi 3 M", ctx);
  const a = actOf(out);
  assert.equal(a.type, "players");
  assert.equal(a.players.length, 3);
  assert.match(botText(out), /3 players, one tee each/);
});

/* ---------- slogans ---------- */

test("slogans with the text AI: ask the topic, then the AI writes them", () => {
  const first = say("Slogan ideas");
  assert.equal(first.st.wait, "sloganTopic");
  const { out } = say("My mother", makeCtx(), first.st);
  assert.deepEqual(actOf(out), { type: "slogans", ask: "My mother", tone: null, avoid: [] });
});

test("a slogan request typed in a sentence goes to the AI", () => {
  assert.equal(actOf(say("A slogan for my mother").out)?.type, "slogans");
});

test("slogans without the text AI come from the built-in library", () => {
  const ctx = makeCtx({ ai: { text: false } });
  const occ = say("A birthday", ctx);
  assert.match(botText(occ.out), /Which tone\?/);
  const { out } = say("Funny", ctx, occ.st);
  assert.deepEqual(kinds(out), ["bot", "slogans", "chips"]);
});

/* ---------- pictures (the picture AI) ---------- */

test("Make a design asks what to draw", () => {
  const { out, st } = say("Make a design");
  assert.match(botText(out), /What should I draw\?/);
  assert.equal(st.wait, "drawWhat");
});

test("a drawing request becomes the plan card (nothing drawn yet)", () => {
  const { out } = say("Draw a lion holding a cricket bat");
  assert.deepEqual(kinds(out), ["bot", "plan"]);
  const plan = out.find((m) => m.plan).plan;
  assert.equal(plan.items[0].subject, "lion holding a cricket bat");
  assert.equal(plan.items[0].areaKey, "centre-front");
});

test("a short drawing request naming an area keeps that area", () => {
  const plan = say("Draw a tiger on full back").out.find((m) => m.plan).plan;
  assert.equal(plan.items[0].areaKey, "full-back");
  assert.equal(plan.items[0].subject, "tiger");
});

test("a 7+ word request naming front/back goes to the planner (the edit AI), which splits it per area", () => {
  assert.equal(actOf(say("Draw a tiger on the full back").out)?.type, "edit");
});

test("drawing when the picture AI is off, logged out, or out of requests", () => {
  assert.match(botText(say("Draw a lion", makeCtx({ ai: { available: false } })).out), /coming soon/);
  assert.match(botText(say("Draw a lion", makeCtx({ ai: { available: false, reason: "cap" } })).out), /break until next month/);
  assert.ok(chipsOf(say("Draw a lion", makeCtx({ ai: { loggedIn: false } })).out).includes("Log in"));
  assert.match(botText(say("Draw a lion", makeCtx({ ai: { left: 0 } })).out), /used today’s design requests/);
});

test("Not now on the plan card draws nothing", () => {
  assert.match(botText(say(NOT_NOW).out), /nothing was drawn/);
});

test("words as hand lettering become a lettering plan", () => {
  const { out } = say("Hand lettering that says “Work smarter not harder”");
  const plan = out.find((m) => m.plan)?.plan;
  assert.ok(plan, "a plan card");
  assert.equal(plan.style, "Hand lettering");
  assert.match(plan.items[0].subject, /Work smarter not harder/);
});

/* ---------- Improve my idea (the text AI, free) ---------- */

test("Improve my idea asks for the idea, then improves it", () => {
  const first = say(IMPROVE);
  assert.equal(first.st.wait, "idea");
  const { out } = say("Vijay's face with the name VIJAY at the bottom", makeCtx(), first.st);
  assert.equal(actOf(out)?.type, "improve");
});

test("Improve my idea when the text AI is off", () => {
  assert.match(botText(say(IMPROVE, makeCtx({ ai: { text: false } })).out), /not available right now/);
});

/* ---------- changing the tee by chat (the text AI) ---------- */

test("an edit typed with a design on the tee goes to the edit AI", () => {
  assert.deepEqual(actOf(say("make the text gold and bigger", makeCtx({ hasDesign: true })).out), { type: "edit", message: "make the text gold and bigger" });
});

test("a whole tee in one sentence goes to the edit AI", () => {
  assert.equal(actOf(say("A tiger on the front and a tree on the back, on a black t-shirt").out)?.type, "edit");
});

test("Style it for me needs text first, then offers moods", () => {
  assert.match(botText(say("Style it for me").out), /Add some text first/);
  assert.ok(chipsOf(say("Style it for me", makeCtx({ hasText: true })).out).includes("Royal"));
  assert.equal(actOf(say("Royal", makeCtx({ hasText: true })).out)?.type, "edit");
});

test("anything else typed goes to the edit AI; tapped or without AI it gets the menu", () => {
  assert.equal(actOf(say("hmm not sure what I want really").out)?.type, "edit");
  assert.match(botText(say("hmm not sure what I want really", makeCtx({ ai: { text: false } })).out), /I can help with slogans/);
  assert.match(botText(say("something odd", makeCtx(), firstState(), { tapped: true }).out), /I can help with slogans/);
});

test("today: an open question with 7+ words and 't-shirt' is sent to the edit AI (what the smart chat fixes)", () => {
  assert.equal(actOf(say("How can I design a funky t-shirt?").out)?.type, "edit");
});

/* ---------- photos sent with 📎 ---------- */

const withPhoto = { ...firstState(), photo: { url: "https://example.test/p.jpg", w: 1200, h: 1200 } };

test("photo choices: as it is, without background, copy the design", () => {
  assert.deepEqual(actOf(say(PHOTO_AS_IS, makeCtx(), withPhoto).out), { type: "photoPlace", cutOut: false });
  assert.deepEqual(actOf(say(PHOTO_CUT, makeCtx(), withPhoto).out), { type: "photoPlace", cutOut: true });
  assert.deepEqual(actOf(say(PHOTO_COPY, makeCtx(), withPhoto).out), { type: "photoUnderstand", text: "", job: "copy" });
});

test("photo to art: styles when allowed, Log in when logged out", () => {
  const { out } = say(PHOTO_ART, makeCtx(), withPhoto);
  assert.ok(chipsOf(out).includes("Cartoon"));
  assert.ok(chipsOf(say(PHOTO_ART, makeCtx({ ai: { loggedIn: false } }), withPhoto).out).includes("Log in"));
});

test("words typed after a photo are read together with the photo", () => {
  const st = { ...withPhoto, wait: "photoWhat" };
  assert.deepEqual(actOf(say("make a design like this", makeCtx(), st).out), { type: "photoUnderstand", text: "make a design like this" });
});

test("Remove a background explains where the button is", () => {
  assert.match(botText(say("Remove a background").out), /Remove background/);
});

test("Log in starts the login", () => {
  assert.deepEqual(actOf(say("Log in").out), { type: "login" });
});
