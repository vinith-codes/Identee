// The smart Assistant's answer is cleaned before it reaches the page (services/aiChatService.js, 23 Oct 2026):
// whatever Google sends, only known tools, real print areas and styles, and short texts get through.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanChatAnswer, MENU_ITEMS } from "../services/aiChatService.js";

const areas = [
  { key: "centre-front", label: "Centre front", free: true },
  { key: "full-back", label: "Full back", free: true },
];
const styles = ["Bold mascot", "Cartoon"];
const clean = (out) => cleanChatAnswer(out, { areas, styles });

test("a normal answer with ideas passes through", () => {
  const r = clean({ reply: "Here are ideas", ideas: [{ title: "Retro sunset", about: "Wavy stripes", picture: "a sunset", area: "full-back", words: null, style: "Cartoon" }], do: null, chips: ["More ideas"] });
  assert.equal(r.reply, "Here are ideas");
  assert.deepEqual(r.ideas[0], { title: "Retro sunset", about: "Wavy stripes", picture: "a sunset", area: "full-back", words: null, style: "Cartoon" });
  assert.deepEqual(r.chips, ["More ideas"]);
});

test("unknown tools, areas and styles are dropped", () => {
  assert.equal(clean({ reply: "x", do: { tool: "delete_order", id: 5 } }).do, null);
  assert.equal(clean({ reply: "x", do: { tool: "menu", item: "Refund my order" } }).do, null);
  const r = clean({ reply: "x", ideas: [{ title: "T", about: "A", area: "made-up-area", style: "Glitter" }], do: { tool: "draw", pictures: [{ subject: "a lion", area: "nowhere" }], style: "Glitter" } });
  assert.equal(r.ideas[0].area, null);
  assert.equal(r.ideas[0].style, null);
  assert.deepEqual(r.do, { tool: "draw", pictures: [{ subject: "a lion", area: null }], style: null });
});

test("at most 3 pictures, 4 ideas and 4 chips", () => {
  const many = Array.from({ length: 9 }, (_, i) => ({ subject: `picture ${i}`, title: `Idea ${i}`, about: "about" }));
  const r = clean({ reply: "x", ideas: many, do: { tool: "draw", pictures: many }, chips: ["a1", "b2", "c3", "d4", "e5", "f6"] });
  assert.equal(r.do.pictures.length, 3);
  assert.equal(r.ideas.length, 4);
  assert.equal(r.chips.length, 4);
});

test("texts are kept short", () => {
  const r = clean({ reply: "a".repeat(5000), do: { tool: "edit", message: "b".repeat(5000) } });
  assert.ok(r.reply.length <= 900);
  assert.ok(r.do.message.length <= 500);
});

test("an empty or broken answer still says something", () => {
  assert.equal(clean(null).reply, "How can I help with your tee?");
  assert.equal(clean({}).do, null);
  assert.deepEqual(clean({ ideas: "not a list", chips: 7 }).ideas, []);
});

test("every helper the AI may open is one the Assistant already has", () => {
  for (const item of Object.keys(MENU_ITEMS)) assert.ok(["Colour help", "Where to print", "Size help", "Start from a template", "Check my design", "Team order", "Remove a background", "Photo to art", "Style it for me", "Open the art library", "Upload a picture", "Continue to review"].includes(item), item);
});

test("slogans keep only a known tone", () => {
  assert.deepEqual(clean({ reply: "x", do: { tool: "slogans", about: "my mother", tone: "Angry" } }).do, { tool: "slogans", about: "my mother", tone: null });
  assert.equal(clean({ reply: "x", do: { tool: "slogans", about: "my mother", tone: "Funny" } }).do.tone, "Funny");
});
