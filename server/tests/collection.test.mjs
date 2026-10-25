// The Collection maker's fixed rules (services/collectionService.js): layouts, picture fitting, the brief.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LAYOUTS, cleanBrief, fitArt, isDark, placeElements, MAX_TEES, MAX_BUDGET } from "../services/collectionService.js";
import { overlappingPairs, positionsForGarment, PRINT_AREA_CATALOG } from "../data/printPositions.js";

const positions = positionsForGarment(null).positions;
const colours = [
  { slug: "black", name: "Black", hex: "#1C1C1D", dark: true },
  { slug: "cream", name: "Cream", hex: "#EFE6D2", dark: false },
];

test("every layout uses two real print areas that don't overlap", () => {
  const keys = PRINT_AREA_CATALOG.map((a) => a.key);
  for (const [name, l] of Object.entries(LAYOUTS)) {
    assert.ok(keys.includes(l.art.area), `${name}: picture area`);
    assert.ok(keys.includes(l.words.area), `${name}: words area`);
    assert.deepEqual(overlappingPairs([l.art.area, l.words.area], positions), [], `${name}: areas overlap`);
    const s = l.words.slot;
    assert.ok(s.x >= 0 && s.y >= 0 && s.x + s.width <= 100 && s.y + s.height <= 100, `${name}: words box inside the area`);
  }
});

test("a picture fills its area as far as it can, keeping its shape", () => {
  // a tall picture (2:3) in the 35 × 52 cm centre back: limited by the height
  const tall = fitArt([35, 52], 2 / 3, "top");
  assert.equal(tall.height, 96);
  assert.equal(tall.y, 2);
  const cmRatio = (tall.width * 35) / (tall.height * 52);
  assert.ok(Math.abs(cmRatio - 2 / 3) < 0.01);
  // a wide picture in the 28 × 32 cm centre front: limited by the width, centred up and down
  const wide = fitArt([28, 32], 1.6, "middle");
  assert.equal(wide.width, 96);
  assert.ok(Math.abs(wide.y - (100 - wide.height) / 2) < 0.01);
  assert.ok(wide.x >= 0 && wide.x + wide.width <= 100);
});

test("the brief is kept within its limits", () => {
  const b = cleanBrief({ theme: "  SCENE   ", count: 50, colours: ["black", "pink"], budget: 2, realPeople: "yes" }, colours);
  assert.equal(b.theme, "SCENE");
  assert.equal(b.count, MAX_TEES);
  assert.deepEqual(b.colours, ["black"]); // a colour the tee doesn't come in is dropped
  assert.ok(b.budget >= b.count && b.budget <= MAX_BUDGET); // a budget below the count gets the default
  assert.equal(b.realPeople, false); // only a real true ticks it
  assert.equal(cleanBrief({ count: 3, budget: 7, realPeople: true }, colours).budget, 7);
  assert.equal(cleanBrief({}, colours).count, 3);
});

test("placing: the picture and the words land in the layout's areas", () => {
  const info = { positions, layouts: LAYOUTS };
  const design = { plan: { layout: "back-poster", words: "INBARAJ · ON DUTY", font: "Bebas Neue", ink: "#F2C21B" }, art: { url: "/uploads/ai-designs/x.png", width: 761, height: 1245 } };
  const [art, words] = placeElements(design, info);
  assert.equal(art.position, "centre-back");
  assert.equal(art.side, "back");
  assert.equal(words.position, "front-right-vertical");
  assert.equal(words.rotation, 90);
  assert.equal(words.slot.rotation, 90);
  // no words: only the picture
  assert.equal(placeElements({ ...design, plan: { ...design.plan, words: "" } }, info).length, 1);
});

test("dark and light tees", () => {
  assert.equal(isDark("#1C1C1D"), true);
  assert.equal(isDark("#EFE6D2"), false);
});
