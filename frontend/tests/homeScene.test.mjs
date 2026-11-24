// The SCENE tees on the home page (utils/homeScene.js) — the client, 30 Oct 2026: white tees too, fewer green ones,
// and the newly added tees first; the user, 31 Oct 2026: one Oversized card, then one Round Neck, and so on, with
// Black, White and other colours mixed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickSceneTees } from "../src/utils/homeScene.js";

const tee = (name, style, gender, colours) => ({
  brandname: `SCENE · ${name}`,
  garmentStyle: style,
  gender,
  colors: colours.map((c) => ({ name: c, image: `https://x/${name}-${c}.jpg` })),
});
const short = (p) => p.brandname.replace("SCENE · ", "");
// like the live shop's list: the newest first (the Round Neck versions of the new designs are the newest)
const cards = [
  tee("New Black 1", "Round Neck", "Women", ["Black"]),
  tee("New Black 1", "Round Neck", "Men", ["Black"]),
  tee("New White 1", "Round Neck", "Women", ["White"]),
  tee("New White 1", "Round Neck", "Men", ["White"]),
  tee("New Black 1", "Oversized", "Unisex", ["Black"]),
  tee("New White 1", "Oversized", "Unisex", ["White"]),
  tee("New Black 2", "Oversized", "Unisex", ["Black"]),
  tee("New White 2", "Oversized", "Unisex", ["White"]),
  ...["A", "B", "C"].map((n) => tee(`${n} · Green Edition`, "Oversized", "Unisex", ["Bottle Green"])),
  tee("Crown Collage", "Round Neck", "Men", ["White"]),
  tee("Crown Collage", "Round Neck", "Women", ["White"]),
  tee("Not Born Good", "Round Neck", "Women", ["Navy", "Black"]),
  tee("The Profile", "Round Neck", "Men", ["Black", "White"]),
];

test("one Oversized card, then one Round Neck, and so on", () => {
  const out = pickSceneTees(cards, 6);
  assert.deepEqual(
    out.map((p) => p.garmentStyle),
    ["Oversized", "Round Neck", "Oversized", "Round Neck", "Oversized", "Round Neck"],
  );
});

test("a design shows once; with one colour only, each style keeps the newest first", () => {
  const all = pickSceneTees(cards, 20);
  assert.equal(new Set(all.map((p) => p.brandname)).size, all.length);
  const black = ["O1", "O2", "O3"].map((n) => tee(n, "Oversized", "Unisex", ["Black"]));
  assert.deepEqual(pickSceneTees(black).map(short), ["O1", "O2", "O3"]);
});

test("Black, White and other colours mix: no two cards side by side in one colour, an older tee brings another colour", () => {
  const list = [
    ...["N1", "N2", "N3", "N4"].map((n, i) => tee(n, "Oversized", "Unisex", [i % 2 ? "White" : "Black"])),
    ...["R1", "R2", "R3", "R4"].map((n, i) => tee(n, "Round Neck", "Men", [i % 2 ? "Black" : "White"])),
    tee("Old Navy", "Round Neck", "Men", ["Navy"]),
    tee("Old Charcoal", "Oversized", "Unisex", ["Charcoal Melange", "Black"]),
  ];
  const out = pickSceneTees(list, 8);
  const colours = out.map((p) => p.shownColour.name);
  for (let i = 1; i < colours.length; i += 1) assert.notEqual(colours[i], colours[i - 1], colours.join(", "));
  assert.ok(colours.includes("Navy") && colours.includes("Charcoal Melange"), colours.join(", "));
  assert.deepEqual(out.map((p) => p.garmentStyle), ["Oversized", "Round Neck", "Oversized", "Round Neck", "Oversized", "Round Neck", "Oversized", "Round Neck"]);
});

test("a Round Neck sold for men and women is one card: the men's tee, marked Men & Women", () => {
  const out = pickSceneTees(cards, 20);
  const nw = out.find((p) => short(p) === "New White 1");
  assert.equal(nw.gender, "Men & Women");
  assert.equal(nw.colors, cards[3].colors); // the men's listing
  assert.equal(out.find((p) => short(p) === "Not Born Good").gender, "Women"); // sold for women only
});

test("when one style runs out the other fills the row", () => {
  const few = [tee("R1", "Round Neck", "Men", ["Black"]), ...["O1", "O2", "O3"].map((n) => tee(n, "Oversized", "Unisex", ["Black"]))];
  assert.deepEqual(pickSceneTees(few).map(short), ["O1", "R1", "O2", "O3"]);
  assert.equal(pickSceneTees(cards, 20).length, 9); // 9 designs, the third green one left out
});

test("at most two green; each card in a colour it is sold in", () => {
  const out = pickSceneTees(cards, 20);
  assert.ok(out.filter((p) => p.shownColour.name === "Bottle Green").length <= 2);
  for (const p of out) assert.ok(p.colors.some((c) => c.name === p.shownColour.name));
});

test("never more than asked for, and nothing from nothing", () => {
  assert.equal(pickSceneTees(cards, 4).length, 4);
  assert.equal(pickSceneTees(cards).length, 9);
  assert.deepEqual(pickSceneTees([]), []);
});

// (24 Nov 2026) the GTA and Ayyappa rows: black tees only — "make the front 4 with black tees"
test("a dark row has no White tee: a Black + White tee shows in Black, a White-only tee is left out", () => {
  const row = pickSceneTees(
    [
      tee("Words White", "Oversized", "Unisex", ["White"]),
      tee("Sun Rider", "Oversized", "Unisex", ["Black", "White"]),
      tee("Tiger", "Round Neck", "Men", ["White", "Black"]),
      tee("Darshanam", "Oversized", "Unisex", ["Black"]),
    ],
    10,
    { dark: true },
  );
  assert.deepEqual(row.map((p) => `${short(p)} ${p.shownColour.name}`), ["Sun Rider Black", "Tiger Black", "Darshanam Black"]);
  assert.ok(pickSceneTees(cards, 6).some((p) => p.shownColour.name === "White"), "the SCENE row still mixes in White");
});

// (24 Nov 2026) the same Ayyappa back picture with two front logos is two tees but one picture: shown once
test("tees that share their picture (art) are shown once on a row", () => {
  const art = (p, a) => ({ ...p, art: a });
  const row = pickSceneTees(
    [
      art(tee("Darshanam – English Saranam", "Oversized", "Unisex", ["Black"]), "d"),
      art(tee("Darshanam – Tiger Saranam", "Round Neck", "Men", ["Black"]), "d"),
      art(tee("Guardian Fire – Tiger Saranam", "Round Neck", "Men", ["Black"]), "g"),
      art(tee("Guardian Fire – Tamil Saranam", "Oversized", "Unisex", ["Black"]), "g"),
      art(tee("Purple Lotus – Thathwamasi", "Oversized", "Unisex", ["Black"]), "p"),
    ],
    10,
    { dark: true },
  );
  assert.deepEqual(row.map(short), ["Darshanam – English Saranam", "Guardian Fire – Tiger Saranam", "Purple Lotus – Thathwamasi"]);
});
