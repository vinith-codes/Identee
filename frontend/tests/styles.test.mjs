// The picture styles (23 Oct 2026): six more looks, and the Draw card's first four (studio/styleInfo.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { styleIn, topStyles, STYLE_GROUPS, STYLE_INFO, styleSample } from "../src/studio/styleInfo.js";

const ALL = ["Bold mascot", "Minimal line art", "Retro badge", "Cartoon", "Watercolour", "Realistic", "Detailed art", "Hand lettering", "Anime", "Graffiti", "Vintage distressed", "Pop art", "Mandala", "Pixel art"];

test("every style has a description, a sample picture and a group", () => {
  for (const s of ALL) {
    assert.ok(STYLE_INFO[s], `${s} description`);
    assert.ok(styleSample(s), `${s} sample`);
    assert.ok(STYLE_GROUPS.some(([, list]) => list.includes(s)), `${s} group`);
  }
});

test("words in the idea pick the new styles", () => {
  assert.equal(styleIn("naruto in anime style", ALL), "Anime");
  assert.equal(styleIn("graffiti of my name", ALL), "Graffiti");
  assert.equal(styleIn("8-bit pixel cat", ALL), "Pixel art");
  assert.equal(styleIn("pop art portrait", ALL), "Pop art");
  assert.equal(styleIn("a mandala elephant", ALL), "Mandala");
  assert.equal(styleIn("a faded distressed eagle", ALL), "Vintage distressed");
});

test("words still pick the old styles as before", () => {
  assert.equal(styleIn("a realistic tiger", ALL), "Realistic");
  assert.equal(styleIn("cartoon of my dog", ALL), "Cartoon");
  assert.equal(styleIn("a vintage badge", ALL), "Retro badge");
  assert.equal(styleIn("hand lettering of BE YOU", ALL), "Hand lettering");
});

test("anime is Cartoon when the server has no Anime style (an old server)", () => {
  assert.equal(styleIn("anime girl", ALL.filter((s) => s !== "Anime")), "Cartoon");
});

test("the first four: the picked one, then ones that go with it — always four, no repeats", () => {
  const four = topStyles(ALL, "Bold mascot", "a lion with a crown");
  assert.equal(four.length, 4);
  assert.equal(four[0], "Bold mascot");
  assert.equal(new Set(four).size, 4);
  assert.deepEqual(topStyles(ALL, "Bold mascot", "a lion"), ["Bold mascot", "Cartoon", "Retro badge", "Detailed art"]);
});

test("a style named in the idea comes second", () => {
  assert.deepEqual(topStyles(ALL, "Bold mascot", "naruto anime style").slice(0, 2), ["Bold mascot", "Anime"]);
});

test("only styles the server offers, and fewer than four when it offers fewer", () => {
  assert.deepEqual(topStyles(["Cartoon", "Realistic"], "Cartoon", ""), ["Cartoon", "Realistic"]);
  assert.equal(topStyles(ALL, "Unknown", "").length, 4);
});
