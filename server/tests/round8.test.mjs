// Assistant round 8 (11 Nov 2026): delivery dates worked out by the server, and the new moves of the brain.
import test from "node:test";
import assert from "node:assert/strict";
import { addWorkingDays, arrivesBy, dayWords, deliveryFact, indiaDay } from "../utils/deliveryDates.js";
import { cleanBrainAnswer, brainReply } from "../services/assistantBrain.js";

const day = (s) => new Date(`${s}T00:00:00Z`);

test("working days are Monday to Saturday: Sundays are skipped", () => {
  assert.equal(dayWords(addWorkingDays(day("2026-11-11"), 4)), "Mon 16 Nov"); // Wed + Thu Fri Sat (Sun) Mon
  assert.equal(dayWords(addWorkingDays(day("2026-11-14"), 1)), "Mon 16 Nov"); // Sat -> Mon
  assert.equal(dayWords(addWorkingDays(day("2026-11-15"), 1)), "Mon 16 Nov"); // ordered on a Sunday
  assert.equal(dayWords(addWorkingDays(day("2026-11-11"), 0)), "Wed 11 Nov");
  assert.equal(dayWords(arrivesBy(day("2026-11-11"), 4, 7)), "Tue 24 Nov");
});

test("today is the Indian calendar day, wherever the server runs", () => {
  assert.equal(dayWords(indiaDay(new Date("2026-11-11T19:00:00Z"))), "Thu 12 Nov"); // 00:30 in India
  assert.equal(dayWords(indiaDay(new Date("2026-11-11T18:00:00Z"))), "Wed 11 Nov"); // 23:30 in India
});

test("the delivery fact: today's dates, the team dates and a two-week table to look a deadline up in", () => {
  const f = deliveryFact({ makingDays: 4, teamMakingDays: 7, shippingDays: 7 }, new Date("2026-11-11T06:00:00Z"));
  assert.equal(f.today, "Wed 11 Nov");
  assert.deepEqual(f.orderToday, { leavesUsBy: "Mon 16 Nov", arrivesBy: "Tue 24 Nov" });
  assert.equal(f.teamOrderToday.arrivesBy, "Fri 27 Nov");
  assert.equal(f.orderOn.length, 14);
  assert.deepEqual(f.orderOn[0], { order: "Wed 11 Nov", arrivesBy: "Tue 24 Nov", teamArrivesBy: "Fri 27 Nov" });
  // a later order never arrives earlier
  const stamps = f.orderOn.map((r) => Date.parse(`${r.arrivesBy} 2026`));
  assert.ok(stamps.every((t, i) => i === 0 || t >= stamps[i - 1]));
});

const ctx = { areas: [{ key: "centre-front", label: "Centre front", free: true }], styles: ["Cartoon"], sheets: [] };

test("the new moves are cleaned: size numbers in range, one orders card, a reorder with its colour", () => {
  const out = cleanBrainAnswer(
    {
      reply: "ok",
      steps: [
        { type: "size", who: "women", heightCm: 162.4, weightKg: 58 },
        { type: "size", who: "robot", heightCm: 999, weightKg: 2 },
        { type: "orders" },
        { type: "orders" },
        { type: "reorder", order: " VF-2026-0076 ", colour: "Navy" },
        { type: "email" },
      ],
    },
    ctx,
  );
  assert.deepEqual(out.steps[0], { type: "size", who: "women", heightCm: 162, weightKg: 58 });
  assert.deepEqual(out.steps[1], { type: "size", who: null, heightCm: null, weightKg: null });
  assert.deepEqual(out.steps.map((s) => s.type), ["size", "size", "orders", "reorder", "email"]);
  assert.deepEqual(out.steps[3], { type: "reorder", order: "VF-2026-0076", colour: "Navy" });
  assert.deepEqual(cleanBrainAnswer({ steps: [{ type: "group" }, { type: "reorder" }] }, ctx).steps, [{ type: "group" }, { type: "reorder", order: null, colour: null }]);
});

test("the mock brain reaches every new move (AI_CHAT_PROVIDER=mock)", async () => {
  process.env.AI_CHAT_PROVIDER = "mock";
  const facts = { price: 699, teeColour: "Black", teeColours: ["Black", "Navy Blue"], delivery: deliveryFact({}, new Date("2026-11-11T06:00:00Z")), orders: [{ no: "VF-2026-0076", status: "packed" }] };
  const ask = (message) => brainReply({ message, ...ctx, facts });
  assert.deepEqual((await ask("I am 5 ft 8 and 70 kg, what size?")).steps[0], { type: "size", who: null, heightCm: 173, weightKg: 70 });
  assert.deepEqual((await ask("size for my wife, 160 cm 55 kg")).steps[0], { type: "size", who: "women", heightCm: 160, weightKg: 55 });
  const when = await ask("when will it reach me?");
  assert.equal(when.steps.length, 0);
  assert.match(when.reply, /Tue 24 Nov/);
  const where = await ask("where is my order?");
  assert.equal(where.steps[0].type, "orders");
  assert.match(where.reply, /VF-2026-0076 is packed/);
  assert.deepEqual((await ask("order VF-2026-0076 again in navy blue")).steps[0], { type: "reorder", order: "VF-2026-0076", colour: "Navy Blue" });
  assert.equal((await ask("email me this design")).steps[0].type, "email");
  assert.equal((await ask("let my friends vote")).steps[0].type, "group");
  assert.equal((await ask("Too busy")).steps[0].type, "concepts"); // a feedback chip under a sheet
  // older moves still win where they should
  assert.equal((await ask("make the text bigger")).steps[0].type, "edit");
  assert.equal((await ask("I like 2's front")).steps[0]?.type !== "size", true);
  delete process.env.AI_CHAT_PROVIDER;
});

test("'the same tee again in blue': the colour asked for is found by its name, its slug or one clear word", async () => {
  const { pickColour } = await import("../controllers/customizationController.js");
  const colours = [
    { slug: "black", name: "Black" },
    { slug: "navy-blue", name: "Navy Blue" },
    { slug: "bottle-green", name: "Bottle Green" },
  ];
  assert.equal(pickColour(colours, "navy-blue").slug, "navy-blue"); // the slug
  assert.equal(pickColour(colours, "Navy Blue").slug, "navy-blue"); // the name, any case
  assert.equal(pickColour(colours, " NAVY  blue ").slug, "navy-blue");
  assert.equal(pickColour(colours, "navy").slug, "navy-blue"); // one word of the name
  assert.equal(pickColour(colours, "green").slug, "bottle-green");
  assert.equal(pickColour(colours, "pink"), null); // the tee doesn't come in it
  assert.equal(pickColour(colours, ""), null);
  assert.equal(pickColour([], "black"), null);
});
