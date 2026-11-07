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
  assert.deepEqual(r.steps[1], { type: "develop", picks: [2, 3], sheet: 1, pieces: ["front"] });
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
  assert.deepEqual(clean({ reply: "x", steps: [{ type: "develop", picks: [8] }] }, { sheets: [] }).steps, [{ type: "develop", picks: [8], sheet: null, pieces: null }]); // no sheet list: any 1-12
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
  assert.deepEqual(dev.steps[0], { type: "develop", picks: [3, 2], sheet: null, pieces: null });
  const front = await ask("I like 2 but only the front", { sheets });
  assert.deepEqual(front.steps[0].pieces, ["front"]);
  assert.equal((await ask("put my name on it")).steps[0].type, "ask");
  assert.equal((await ask("draw a lion holding a cricket bat")).steps[0].type, "concepts"); // choices first: three takes on the lion
  assert.equal((await ask("just draw a lion holding a cricket bat")).steps[0].type, "draw"); // the shortcut
  assert.equal((await ask("make the text gold")).steps[0].type, "edit");
  assert.equal((await ask("a slogan for my mother")).steps[0].type, "slogans");
  assert.equal((await ask("which size am I")).steps[0].item, "Size help");
  assert.equal((await ask("undo that")).steps[0].type, "undo");
  assert.equal((await ask("how much is it")).steps.length, 0);
  delete process.env.AI_CHAT_PROVIDER;
});
