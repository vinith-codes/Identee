// The Collection maker's fixed rules (services/collectionService.js): parts, places, layouts, picture fitting, the brief.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LAYOUTS, PLACES, MAX_PARTS, MAX_AI_PICTURES, assignLayouts, checkParts, cleanBrief, cleanParts, fitArt, isDark, layoutsFor, missingIn, partsOf, placeParts, wordsSlot, MAX_TEES, MAX_BUDGET } from "../services/collectionService.js";
import { positionsForGarment } from "../data/printPositions.js";

const positions = positionsForGarment(null).positions;
// a round neck's print areas (no vertical strips, no full front)
const roundNeck = positionsForGarment({
  printAreas: ["centre-front", "left-chest", "right-chest", "full-back", "top-back", "centre-back", "left-sleeve", "right-sleeve"].map((key) => ({ key, offered: true })),
}).positions;
const black = { slug: "black", name: "Black", hex: "#1C1C1D", dark: true };
const cream = { slug: "cream", name: "Cream", hex: "#EFE6D2", dark: false };
const colours = [black, cream];
const infos = [
  { key: "oversized-tee", colours },
  { key: "boys-round-neck", colours },
];
const info = { positions, layouts: LAYOUTS, colours };
const brief = { realPeople: false, sources: "both" };

test("every starting layout fits the oversized tee", () => {
  assert.equal(Object.keys(LAYOUTS).length, 30, "30 layouts to pick from");
  for (const [name, l] of Object.entries(LAYOUTS)) assert.equal(checkParts(l.parts, positions).parts.length, l.parts.length, name);
  for (const p of Object.values(PLACES)) assert.ok(p.box.x >= 0 && p.box.y >= 0 && p.box.x + p.box.width <= 100 && p.box.y + p.box.height <= 100);
});

test("each product only gets the layouts its print areas allow", () => {
  const round = layoutsFor(roundNeck);
  assert.ok(layoutsFor(positions)["back-poster"], "the oversized tee has the front strip");
  assert.equal(round["back-poster"], undefined, "a round neck has no front strip");
  assert.equal(round["front-poster"], undefined, "nor the full front here");
  assert.ok(round["front-type"] && round["front-caption"] && round["words-only"] && round["logo-and-back"], "the common layouts stay");
  assert.equal(Object.keys(round).length, 25);
  assert.equal(round["strip-and-logo"], undefined, "no centre front strip on a round neck");
});

test("parts: areas that overlap on the tee, or places that overlap in one area, are left out", () => {
  const { parts, dropped } = checkParts(
    [
      { kind: "picture", area: "centre-front", place: "top" },
      { kind: "words", area: "centre-front", place: "bottom-band" }, // fine: under the picture
      { kind: "words", area: "centre-front", place: "middle" }, // overlaps the picture
      { kind: "picture", area: "full-front" }, // full front overlaps the centre front on the tee
      { kind: "words", area: "hood" }, // no such area
    ],
    positions,
  );
  assert.deepEqual(parts.map((p) => `${p.area}/${p.place}`), ["centre-front/top", "centre-front/bottom-band"]);
  assert.equal(dropped.length, 3);
});

test("parts from the AI: any mix, within the limits", () => {
  const artNames = new Set(["rx king 135"]);
  const { parts } = cleanParts(
    [
      { kind: "art", area: "left-chest", name: "RX King 135" }, // from the art library
      { kind: "words", area: "full-back", place: "top-band", text: "VERA\\nLEVEL", ink: "#F0F0F0", size: "huge" }, // light ink on a light tee
      { kind: "picture", area: "full-back", place: "bottom", subject: "a scooter", style: "Nope" },
      { kind: "art", area: "right-sleeve", name: "Not in the library" }, // drawn instead
      { kind: "picture", area: "left-sleeve", subject: "a star" },
      { kind: "picture", area: "top-back", subject: "one too many" },
    ],
    info,
    { brief, colour: cream, artNames },
  );
  assert.equal(parts.length, MAX_PARTS);
  assert.equal(parts[0].kind, "art");
  assert.equal(parts[1].text, "VERA\nLEVEL");
  assert.equal(parts[1].ink, "#141110"); // dark ink: it must show on a cream tee
  assert.equal(parts[1].size, "big");
  assert.equal(parts[2].style, "Detailed art");
  assert.equal(parts[3].kind, "picture");
  assert.ok(parts.filter((p) => p.kind === "picture").length <= MAX_AI_PICTURES);
  // art library only: no AI pictures
  const artOnly = cleanParts([{ kind: "picture", area: "full-back", subject: "x" }, { kind: "art", area: "left-chest", name: "RX King 135" }], info, { brief: { ...brief, sources: "art" }, colour: black, artNames });
  assert.deepEqual(artOnly.parts.map((p) => p.kind), ["art"]);
  // a curved line carries one line only
  assert.equal(cleanParts([{ kind: "words", area: "full-back", text: "AATHTHI IVA\nYAARRAA!", shape: "arc-up" }], info, { brief, colour: black }).parts[0].text, "AATHTHI IVA YAARRAA!");
  // no words on these tees
  assert.equal(cleanParts([{ kind: "words", area: "full-back", text: "HI" }], info, { brief, colour: black, noWords: true }).parts.length, 0);
});

test("words: their box and letter size; a strip turns them a quarter", () => {
  const chest = wordsSlot({ place: "middle", size: "big" }, [28, 32]);
  assert.equal(chest.slot.rotation, 0);
  assert.ok(chest.slot.y >= 18 && chest.slot.y + chest.slot.height <= 82);
  const strip = wordsSlot({ place: "full", size: "big" }, [10, 52]);
  assert.equal(strip.slot.rotation, 90);
  assert.ok(strip.pct > 10 && strip.pct < 20); // letters about as tall as the strip is wide
  assert.ok(wordsSlot({ place: "middle", size: "small" }, [28, 32]).pct < chest.pct);
});

test("a picture fills its box as far as it can, keeping its shape", () => {
  const tall = fitArt([35, 52], 2 / 3, "top");
  assert.equal(tall.height, 96);
  assert.equal(tall.y, 2);
  assert.ok(Math.abs((tall.width * 35) / (tall.height * 52) - 2 / 3) < 0.01);
  const boxed = fitArt([28, 32], 1, "top", PLACES.top.box);
  assert.ok(boxed.y + boxed.height <= PLACES.top.box.height);
});

test("placing parts: pictures and words become design elements", () => {
  const els = placeParts(
    [
      { kind: "art", area: "left-chest", place: "full", art: { url: "/uploads/art-designs/rx.png", width: 800, height: 800, artDesignId: "6ad71e6607b2b00a6c0f792b" } },
      { kind: "words", area: "front-right-vertical", place: "full", text: "ON DUTY", font: "Bebas Neue", ink: "#F2C21B", size: "big", shape: "straight" },
      { kind: "picture", area: "full-back", place: "top", art: { url: "/uploads/ai-designs/x.png", width: 1000, height: 1000 } },
      { kind: "words", area: "full-back", place: "bottom-band", text: "SCENE", font: "Anton", ink: "#FFFFFF", size: "big", shape: "arc-down" },
    ],
    info,
  );
  assert.equal(els.length, 4);
  assert.equal(els[0].artDesignId, "6ad71e6607b2b00a6c0f792b"); // art library: free in the checkout
  assert.equal(els[1].rotation, 90);
  assert.equal(els[3].effect, "arc-down");
  assert.ok(els[2].y + els[2].height <= els[3].y, "the back picture sits above its words");
  // a part whose picture isn't made yet is not placed
  assert.equal(placeParts([{ kind: "picture", area: "full-back", place: "full" }], info).length, 0);
});

test("the first plans (one picture + one line) still read as parts", () => {
  const old = { plan: { layout: "back-poster", words: "SCENE", font: "Anton", ink: "#FFFFFF", subject: "a cop", style: "Detailed art" }, art: { url: "/x.png", width: 2, height: 3 } };
  const parts = partsOf(old);
  assert.deepEqual(parts.map((p) => p.kind), ["picture", "words"]);
  assert.equal(parts[1].text, "SCENE");
});

test("the brief: limits, and the details still to be asked", () => {
  const b = cleanBrief({ theme: "  SCENE   ", count: 50, garments: ["oversized-tee", "hoodie"], colours: ["black", "pink"], budget: 2, realPeople: "yes", language: "Tanglish", sources: "anything" }, infos);
  assert.equal(b.theme, "SCENE");
  assert.equal(b.count, MAX_TEES);
  assert.deepEqual(b.garments, ["oversized-tee"]);
  assert.deepEqual(b.colours, ["black"]);
  assert.ok(b.budget >= b.count && b.budget <= MAX_BUDGET);
  assert.equal(b.realPeople, false);
  assert.equal(b.sources, "ai");
  assert.deepEqual(b.missing, []);
  assert.deepEqual(cleanBrief({ theme: "SCENE" }, infos).missing, ["garments", "count", "language"]);
  assert.deepEqual(missingIn({ garments: ["boys-round-neck"], count: 2, language: "No words" }), []);
});

test("dark and light tees", () => {
  assert.equal(isDark("#1C1C1D"), true);
  assert.equal(isDark("#EFE6D2"), false);
});

test("picked layouts: the tees are spread over them, each on a product that has its print areas", () => {
  const over = { key: "oversized-tee", layouts: layoutsFor(positions) };
  const round = { key: "boys-round-neck", layouts: layoutsFor(roundNeck) };
  const tees = assignLayouts(5, ["back-poster", "front-type"], [over, round]);
  assert.deepEqual(tees.map((t) => t.key), ["back-poster", "front-type", "back-poster", "front-type", "back-poster"]);
  // the front strip is only on the oversized tee; front-type fits both, so it takes turns
  assert.ok(tees.filter((t) => t.key === "back-poster").every((t) => t.info.key === "oversized-tee"));
  assert.deepEqual(tees.filter((t) => t.key === "front-type").map((t) => t.info.key), ["oversized-tee", "boys-round-neck"]);
  // a layout no chosen product has: no tee for it
  assert.equal(assignLayouts(2, ["back-poster"], [round]).length, 0);
});

test("the brief keeps only picked layouts that fit a chosen product", () => {
  const withLayouts = [
    { key: "oversized-tee", colours, layouts: layoutsFor(positions) },
    { key: "boys-round-neck", colours, layouts: layoutsFor(roundNeck) },
  ];
  const b = cleanBrief({ garments: ["boys-round-neck"], layouts: ["back-poster", "front-type", "made-up"] }, withLayouts);
  assert.deepEqual(b.layouts, ["front-type"]); // the round neck has no front strip
  assert.deepEqual(cleanBrief({ garments: ["oversized-tee"] }, withLayouts).layouts, []); // none picked: the AI chooses
});
