// Assistant v2 brain (services/assistantBrain.js, 7 Nov 2026): the steps the page may run, picks by number, the asking rule.
import test from "node:test";
import assert from "node:assert/strict";
import { cleanBrainAnswer, parsePicks, isBarePick, brainReply, MAX_STEPS } from "../services/assistantBrain.js";

const areas = [
  { key: "centre-front", label: "Centre front", free: true },
  { key: "full-back", label: "Full back", free: true },
  { key: "left-sleeve", label: "Left sleeve", free: true },
];
const styles = ["Bold mascot", "Cartoon", "Minimal line"];
const sheets = [{ n: 1, brief: "college fest", concepts: [{ n: 1, title: "A" }, { n: 2, title: "B" }, { n: 3, title: "C" }], developed: [] }];
const clean = (out, extra = {}) => cleanBrainAnswer(out, { areas, styles, sheets, ...extra });

test("picks: numbers, words, ranges, 'all' — in the order said, no repeats, within the sheet", () => {
  assert.deepEqual(parsePicks("3, 6 and 9 suit me", 12), [3, 6, 9]);
  assert.deepEqual(parsePicks("the second one", 3), [2]);
  assert.deepEqual(parsePicks("first and third", 3), [1, 3]);
  assert.deepEqual(parsePicks("1-3", 6), [1, 2, 3]);
  assert.deepEqual(parsePicks("4 to 6 please", 6), [4, 5, 6]);
  assert.deepEqual(parsePicks("all", 3), [1, 2, 3]);
  assert.deepEqual(parsePicks("2, 2 and 7", 3), [2]);
  assert.deepEqual(parsePicks("make it 20% bigger", 3), []);
  assert.deepEqual(parsePicks("", 3), []);
});

test("a bare pick is recognised; a sentence with a number in it is not", () => {
  assert.equal(isBarePick("2", 3), true);
  assert.equal(isBarePick("3 and 6", 9), true);
  assert.equal(isBarePick("the second one", 3), true);
  assert.equal(isBarePick("1, 2 and 3 please", 3), true);
  assert.equal(isBarePick("I want 2 tees for my team", 3), false);
  assert.equal(isBarePick("size 2", 3), false);
  assert.equal(isBarePick("9", 3), false);
});

test("every step kind passes through clean; unknown kinds, areas, styles and pieces are dropped", () => {
  // (a develop step may carry a change asked with the pick: "2 but in gold")
  const r = clean({
    reply: "Doing it",
    steps: [
      { type: "concepts", brief: "fest", concepts: [{ title: "Cosmic", front: "a swirl", back: "VORTEX", sleeve: null, colours: "purple", style: "Cartoon" }, { title: "Glitch", front: "glitch emblem", back: null, sleeve: "a dot", colours: "cyan", style: "Glitter" }, { title: "Street", front: "graffiti", back: "VORTEX", sleeve: null, colours: "white", style: "Minimal line" }] },
      { type: "develop", picks: [2, "3", 99, 2], sheet: 1, pieces: ["front", "nose"] },
      { type: "draw", subject: "a lion", area: "nowhere", style: "Glitter" },
      { type: "edit", message: "make the back text gold" },
      { type: "slogans", about: "my mother", tone: "Angry" },
      { type: "menu", item: "Size help" },
      { type: "menu", item: "Refund my order" },
      { type: "delete_order", id: 5 },
      { type: "undo" },
    ],
    chips: ["More options", "Make it darker"],
  });
  assert.equal(r.reply, "Doing it");
  assert.deepEqual(r.steps.map((s) => s.type), ["concepts", "develop", "draw", "edit", "slogans", "menu"]); // 6 = MAX_STEPS; the rest is cut
  assert.equal(r.steps.length, MAX_STEPS);
  assert.equal(r.steps[0].concepts.length, 3);
  assert.equal(r.steps[0].concepts[1].style, "Bold mascot"); // an unknown style falls back to the first
  assert.deepEqual(r.steps[1], { type: "develop", picks: [2, 3], sheet: 1, pieces: ["front"], change: null });
  assert.deepEqual(r.steps[2], { type: "draw", subject: "a lion", area: null, style: null });
  assert.equal(r.steps[4].tone, null);
  assert.deepEqual(r.chips, ["More options", "Make it darker"]);
});

test("an ask is always the last step and its options become the chips", () => {
  const r = clean({ reply: "One thing", steps: [{ type: "edit", message: "make it gold" }, { type: "ask", question: "What name should I print?", options: ["Vinith", "Skip"] }, { type: "draw", subject: "a lion", area: "centre-front", style: "Cartoon" }], chips: ["Make it bigger"] });
  assert.deepEqual(r.steps.map((s) => s.type), ["edit", "ask"]);
  assert.deepEqual(r.chips, ["Vinith", "Skip"]);
});

test("after a concepts step the chips always offer more options", () => {
  const r = clean({ reply: "x", steps: [{ type: "concepts", brief: "b", concepts: [{ title: "A", front: "a" }, { title: "B", front: "b" }, { title: "C", back: "c" }] }], chips: ["1", "2", "3", "Darker"] });
  assert.equal(r.chips[0], "More options");
  assert.equal(r.chips.length, 4);
});

test("a concepts step needs at least two real concepts; a develop needs a real pick", () => {
  assert.deepEqual(clean({ reply: "x", steps: [{ type: "concepts", concepts: [{ title: "only one", front: "a" }] }] }).steps, []);
  assert.deepEqual(clean({ reply: "x", steps: [{ type: "develop", picks: [8] }] }).steps, []); // the sheet has 3 concepts
  assert.deepEqual(clean({ reply: "x", steps: [{ type: "develop", picks: [8] }] }, { sheets: [] }).steps, [{ type: "develop", picks: [8], sheet: null, pieces: null, change: null }]); // no sheet list: any 1-12
});

test("an empty or broken answer still says something", () => {
  assert.equal(clean(null).reply, "How can I help with your tee?");
  assert.deepEqual(clean({ steps: "nope", chips: 7 }).steps, []);
  assert.equal(clean({ reply: "", steps: [{ type: "undo" }] }).reply, "On it.");
});

test("the mock brain exercises every kind of step (AI_CHAT_PROVIDER=mock)", async () => {
  process.env.AI_CHAT_PROVIDER = "mock";
  const ask = (message, extra = {}) => brainReply({ message, areas, styles, facts: { price: 699, teeColour: "black" }, ...extra });
  const concepts = await ask("create t-shirt designs for identee with front back and sleeve print");
  assert.equal(concepts.steps[0].type, "concepts");
  assert.equal(concepts.steps[0].concepts.length, 3);
  assert.equal(concepts.chips[0], "More options");
  const more = await ask("more options", { sheets });
  assert.equal(more.steps[0].type, "concepts");
  const dev = await ask("3 and 2 suit me", { sheets });
  assert.deepEqual(dev.steps[0], { type: "develop", picks: [3, 2], sheet: null, pieces: null, change: null });
  assert.equal((await ask("2 but with the text in gold", { sheets })).steps[0].change, "the text in gold"); // a change asked with the pick
  const front = await ask("I like 2 but only the front", { sheets });
  assert.deepEqual(front.steps[0].pieces, ["front"]);
  assert.equal((await ask("put my name on it")).steps[0].type, "ask");
  assert.equal((await ask("draw a lion holding a cricket bat")).steps[0].type, "concepts"); // choices first: three takes on the lion
  assert.equal((await ask("just draw a lion holding a cricket bat")).steps[0].type, "draw"); // the shortcut
  assert.equal((await ask("make the text gold")).steps[0].type, "edit");
  assert.equal((await ask("a slogan for my mother")).steps[0].type, "slogans");
  assert.equal((await ask("which size am I")).steps[0].type, "size"); // round 8: the size finder in the chat
  assert.equal((await ask("undo that")).steps[0].type, "undo");
  assert.equal((await ask("how much is it")).steps.length, 0);
  delete process.env.AI_CHAT_PROVIDER;
});

test("a concepts step keeps its logo flag; an attached picture makes the stand-in use it", async () => {
  const r = cleanBrainAnswer({ reply: "x", steps: [{ type: "concepts", logo: true, concepts: [{ title: "A", front: "logo big" }, { title: "B", front: "logo small", back: "name" }] }] }, { areas, styles, sheets: [] });
  assert.equal(r.steps[0].logo, true);
  assert.equal(cleanBrainAnswer({ reply: "x", steps: [{ type: "concepts", concepts: [{ title: "A", front: "a" }, { title: "B", front: "b" }] }] }, { areas, styles, sheets: [] }).steps[0].logo, false);
  process.env.AI_CHAT_PROVIDER = "mock";
  const withLogo = await brainReply({ message: "use our logo on the tees", areas, styles, attached: { url: "/uploads/x.png", about: "our logo" } });
  assert.equal(withLogo.steps[0].type, "concepts");
  assert.equal(withLogo.steps[0].logo, true);
  const art = await brainReply({ message: "make a cartoon of this", areas, styles, attached: { url: "/uploads/x.png", about: "" } });
  assert.deepEqual(art.steps[0], { type: "menu", item: "Photo to art" });
  delete process.env.AI_CHAT_PROVIDER;
});

test("stand-in brain: 'the front of 1 and the back of 3' is one develop step per concept with only that piece", async () => {
  process.env.AI_CHAT_PROVIDER = "mock";
  const r = await brainReply({ message: "the front of 1 and the back of 3", history: [], areas, styles, sheets, facts: {} });
  assert.deepEqual(r.steps, [
    { type: "develop", picks: [1], sheet: null, pieces: ["front"], change: null },
    { type: "develop", picks: [3], sheet: null, pieces: ["back"], change: null },
  ]);
});

test("round 5: a match step, a concepts step from the tee's own picture, and the profile that comes back from the fold", async () => {
  assert.deepEqual(clean({ reply: "x", steps: [{ type: "match", piece: "sleeve", brief: "a small matching emblem" }] }).steps, [{ type: "match", piece: "sleeve", brief: "a small matching emblem" }]);
  assert.deepEqual(clean({ reply: "x", steps: [{ type: "match", piece: "nose", brief: "a companion mark" }] }).steps, [{ type: "match", piece: "back", brief: "a companion mark" }]);
  const c = clean({ reply: "x", steps: [{ type: "concepts", basis: "tee", concepts: [{ title: "Gold", front: "the same in gold" }, { title: "Red", front: "the same in red" }] }] }).steps[0];
  assert.equal(c.basis, "tee");
  process.env.AI_CHAT_PROVIDER = "mock";
  const r = await brainReply({ message: "make a matching back with the name PRIYA", history: [], areas, styles, sheets, facts: {} });
  assert.equal(r.steps[0].type, "match");
  assert.equal(r.steps[0].piece, "back");
  const cw = await brainReply({ message: "show this in 3 colourways", history: [], areas, styles, sheets, facts: {} });
  assert.equal(cw.steps[0].type, "concepts");
  assert.equal(cw.steps[0].basis, "tee");
  const cols = await brainReply({ message: "see it on other colours", history: [], areas, styles, sheets, facts: { teeColour: "Black", teeColours: ["Black", "Maroon", "White"] } });
  assert.deepEqual(cols.steps, []);
  assert.deepEqual(cols.chips, ["See it on Maroon", "See it on White"]);
  const on = await brainReply({ message: "See it on Maroon", history: [], areas, styles, sheets, facts: {} });
  assert.deepEqual(on.steps, [{ type: "edit", message: "Change the tee colour to maroon" }]);
  // the fold (10 older messages) makes the note AND the profile
  const earlier = Array.from({ length: 10 }, (_, i) => ({ who: i % 2 ? "assistant" : "customer", text: i % 2 ? "ok" : "I run a cafe, minimal style please" }));
  const f = await brainReply({ message: "hi", history: [], earlier, memory: "", areas, styles, sheets, facts: {}, profile: "likes black tees" });
  assert.match(f.memory, /MOCK NOTE/);
  assert.match(f.profile, /^likes black tees MOCK PROFILE/);
});

test("round 6: the brain may open the team's help as a helper", () => {
  assert.deepEqual(clean({ reply: "x", steps: [{ type: "menu", item: "Ask the team" }] }).steps, [{ type: "menu", item: "Ask the team" }]);
});

test("round 7: a team step keeps names as written, numbers as digits, areas valid; the stand-in reads a list and a budget", async () => {
  const t = clean({ reply: "x", steps: [{ type: "team", players: [{ name: "Arun", number: 7 }, { name: "Priya" }, { number: "x10" }, {}], namesOn: "back", numbersOn: "nose" }] }).steps[0];
  assert.deepEqual(t, { type: "team", players: [{ name: "Arun", number: "7" }, { name: "Priya", number: null }, { name: "", number: "10" }], namesOn: "back", numbersOn: "back" });
  assert.deepEqual(clean({ reply: "x", steps: [{ type: "team", players: [] }] }).steps, []);
  process.env.AI_CHAT_PROVIDER = "mock";
  const r = await brainReply({ message: "players: Arun 7, Priya 10, Karthik", history: [], areas, styles, sheets, facts: {} });
  assert.equal(r.steps[0].type, "team");
  assert.deepEqual(r.steps[0].players.map((p) => p.name), ["Arun", "Priya", "Karthik"]);
  assert.equal(r.steps[0].numbersOn, "back");
  const b = await brainReply({ message: "20 tees, budget ₹500 each", history: [], areas, styles, sheets, facts: { price: 699, pictureAddOn: 100 } });
  assert.deepEqual(b.steps, []);
  assert.match(b.reply, /20 tees at ₹699 = ₹13980/);
});
