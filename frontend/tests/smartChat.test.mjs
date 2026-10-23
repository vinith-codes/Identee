// Which TYPED messages the smart Assistant answers, and its drawing plan card (23 Oct 2026).
// Everything else keeps the fixed replies — see assistantScript.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { smartCanAnswer, smartPlan, firstState, IMPROVE, NOT_NOW, BACK, PHOTO_AS_IS } from "../src/studio/assistantScript.js";
import { makeCtx } from "./helpers.mjs";

const on = makeCtx({ ai: { smart: true } });
const can = (text, st = firstState(), ctx = on) => smartCanAnswer(text, ctx, st);

test("off unless the smart chat is on", () => {
  assert.equal(can("How can I design a funky t-shirt?", firstState(), makeCtx()), false);
  assert.equal(can("How can I design a funky t-shirt?", firstState(), makeCtx({ ai: { smart: false } })), false);
});

test("free-typed questions and ideas go to the smart chat", () => {
  for (const t of ["How can I design a funky t-shirt?", "give me some funky ideas", "what suits a birthday party?", "make the text gold", "draw a lion with a crown", "how much is this tee?", "enaku oru mass design venum"]) assert.equal(can(t), true, t);
});

test("an answer to the fixed chat's own question stays with the fixed chat", () => {
  for (const wait of ["size", "sloganTopic", "drawWhat", "aiChange", "idea", "photoWhat", "name", "aiStyle", "sloganTone"]) assert.equal(can("something typed", { ...firstState(), wait }), false, wait);
});

test("a button's own words typed exactly keep the button's answer", () => {
  for (const t of ["Colour help", "Size help", "Check my design", "Team order", "Make a design", "Something else", BACK, NOT_NOW, PHOTO_AS_IS, "Team jersey", "Log in", "Use size M", "Open Left chest"]) assert.equal(can(t), false, t);
  assert.equal(can(`${IMPROVE}: a tiger`), false);
});

test("a pasted player list stays with the fixed chat (one tee per player)", () => {
  assert.equal(can("Arun 7 L, Karthik 10 XL, Ravi 3 M"), false);
});

test("an empty message is not sent", () => {
  assert.equal(can("   "), false);
});

test("the smart chat's drawing becomes the same plan card, nothing drawn", () => {
  const out = smartPlan(on, [{ subject: "a lion with a crown", area: "full-back" }], "Cartoon");
  assert.equal(out.length, 2);
  assert.deepEqual(out[1].plan, { items: [{ subject: "a lion with a crown", areaKey: "full-back" }], style: "Cartoon" });
});

test("plan card: unknown area → a free front area; two pictures never share an area; unknown style → a real one", () => {
  const plan = smartPlan(on, [{ subject: "a tiger", area: "moon" }, { subject: "a tree", area: "centre-front" }], "Glitter")[1].plan;
  assert.equal(plan.items[0].areaKey, "centre-front");
  assert.notEqual(plan.items[1].areaKey, "centre-front");
  assert.ok(on.ai.styles.includes(plan.style));
});

test("plan card: at most three pictures, none without a subject", () => {
  const plan = smartPlan(on, [{ subject: "a" }, { subject: "" }, { subject: "b" }, { subject: "c" }, { subject: "d" }], null)[1].plan;
  assert.equal(plan.items.length, 3);
  assert.deepEqual(smartPlan(on, [{ subject: "" }], null), []);
});
