// Concept sheets (services/conceptSheets.js, Assistant v2, 7 Nov 2026): the picture instructions and the stand-in sheet.
import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { sheetPrompt, developPrompt, piecesOf, mockSheet, conceptWords } from "../services/conceptSheets.js";

const concepts = [
  { title: "Cosmic Swirl", front: "a neon spiral vortex", back: "VORTEX arched in bold letters", sleeve: null, colours: "purple and teal", style: "Bold mascot" },
  { title: "Glitch", front: "a glitchy geometric emblem", back: null, sleeve: "a small glitch mark", colours: "cyan", style: "Minimal line" },
  { title: "Street", front: "graffiti swirl with drips", back: "VORTEX in graffiti lettering", sleeve: null, colours: "white and red", style: "Cartoon" },
];

test("the sheet instruction numbers the concepts, names the garment and colour, and keeps every printed word", () => {
  const p = sheetPrompt({ concepts, garment: "oversized t-shirt", teeColour: "black", teeIsDark: true, numberFrom: 1 });
  assert.match(p, /1\) "Cosmic Swirl"/);
  assert.match(p, /3\) "Street"/);
  assert.match(p, /oversized t-shirt in black/);
  assert.match(p, /VORTEX arched in bold letters/);
  assert.match(p, /stand out on the dark fabric/);
  assert.match(p, /numerals? above/i);
  assert.match(p, /front: nothing|back: nothing|sleeve: nothing/);
});

test("a second sheet continues the numbering", () => {
  const p = sheetPrompt({ concepts, numberFrom: 4 });
  assert.match(p, /4\) "Cosmic Swirl"/);
  assert.match(p, /\(4, 5, 6\)/);
});

test("the develop instruction asks for one piece of one concept, alone, on a plain background, no mockup", () => {
  const p = developPrompt({ concept: concepts[0], n: 1, piece: "back", teeIsDark: true });
  assert.match(p, /ONLY the back artwork of concept 1/);
  assert.match(p, /VORTEX arched in bold letters/);
  assert.match(p, /pure black background/);
  assert.match(p, /No t-shirt, no mockup, no numerals/);
  const front = developPrompt({ concept: concepts[1], n: 2, piece: "front" });
  assert.match(front, /pure white background/);
});

test("the pieces of a concept are the ones with a print", () => {
  assert.deepEqual(piecesOf(concepts[0]), ["front", "back"]);
  assert.deepEqual(piecesOf(concepts[1]), ["front", "sleeve"]);
  assert.deepEqual(piecesOf({ title: "empty" }), []);
  assert.match(conceptWords(concepts[1]), /sleeve: a small glitch mark/);
});

test("the stand-in sheet is a real landscape PNG", async () => {
  const { buffer, mime } = await mockSheet(concepts, { teeColour: "black", numberFrom: 4 });
  assert.equal(mime, "image/png");
  const meta = await sharp(buffer).metadata();
  assert.equal(meta.format, "png");
  assert.ok(meta.width > meta.height);
});

test("with the customer's logo, the sheet and develop instructions say to print it exactly as it is", () => {
  assert.match(sheetPrompt({ concepts, logo: true }), /customer's own logo.*EXACTLY as it is/);
  assert.doesNotMatch(sheetPrompt({ concepts }), /logo/);
  assert.match(developPrompt({ concept: concepts[0], n: 1, piece: "front", logo: true }), /second attached image is the customer's own logo/);
});

test("the admin's concept summary: sheets, picks, pick rate and the styles picked most", async () => {
  const { conceptSummary } = await import("../services/conceptSheets.js");
  const rows = [
    { kind: "sheet" }, { kind: "sheet" }, { kind: "sheet" },
    { kind: "develop", style: "Cartoon" }, { kind: "develop", style: "Cartoon" }, { kind: "develop", style: "Minimal line" },
    { kind: "new" },
  ];
  const s = conceptSummary(rows);
  assert.deepEqual([s.sheets, s.picks, s.shown, s.pickRate], [3, 3, 9, 33]);
  assert.deepEqual(s.styles, [{ style: "Cartoon", count: 2 }, { style: "Minimal line", count: 1 }]);
  assert.equal(conceptSummary([]).pickRate, null);
});
