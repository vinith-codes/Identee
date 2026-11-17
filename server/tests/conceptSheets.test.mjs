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
  assert.match(p, /pure magenta \(#FF00FF\) background/);
  assert.match(p, /No t-shirt, no mockup, no numerals/);
  const front = developPrompt({ concept: concepts[1], n: 2, piece: "front" });
  assert.match(front, /pure magenta \(#FF00FF\) background/);
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

test("unfinished designs: customers with sheets and no order since their first sheet, latest first", async () => {
  const { unfinishedDesigns } = await import("../services/conceptSheets.js");
  const d = (h) => new Date(Date.UTC(2026, 10, 1, h));
  const u1 = { _id: "u1", name: "Priya", email: "p@x.in", phone: "9" };
  const u2 = { _id: "u2", name: "Arun", email: "a@x.in" };
  const sheets = [{ user: u1, prompt: "cafe tee", createdAt: d(1) }, { user: u2, prompt: "cricket tee", createdAt: d(2) }, { user: u1, prompt: "cafe tee again", createdAt: d(5) }];
  const picks = [{ user: "u1" }, { user: "u1" }];
  const orders = [{ user: "u2", createdAt: d(3) }, { user: "u1", createdAt: d(0) }]; // Arun ordered after his sheet; Priya's order was BEFORE her first sheet
  assert.deepEqual(unfinishedDesigns(sheets, picks, orders), [{ who: "Priya", email: "p@x.in", phone: "9", first: d(1), last: d(5), sheets: 2, picks: 2, asked: "cafe tee again" }]);
});

test("round 5 instructions: colourways keep the tee's drawing; a matching piece follows the reference; the worn photo keeps the print exact", async () => {
  const { sheetPrompt, matchPrompt, wornPrompt } = await import("../services/conceptSheets.js");
  const p = sheetPrompt({ concepts: [{ title: "Gold", front: "the same in gold" }, { title: "Red", front: "the same in red" }], basis: true });
  assert.match(p, /artwork already on the customer's tee/);
  assert.doesNotMatch(p, /customer's own logo/);
  const m = matchPrompt({ piece: "sleeve", from: "the front", brief: "a small emblem with PRIYA", teeColour: "black", teeIsDark: true });
  assert.match(m, /matching sleeve artwork/);
  assert.match(m, /PRIYA/);
  assert.match(m, /pure magenta/);
  const w = wornPrompt({ garment: "oversized tee", teeColour: "black" });
  assert.match(w, /EXACTLY as in the attached image/);
  assert.match(w, /college campus/);
});

test("round 7: the try-on instruction keeps the person and the print", async () => {
  const { tryOnPrompt } = await import("../services/conceptSheets.js");
  const p = tryOnPrompt({ garment: "oversized tee", teeColour: "black" });
  assert.match(p, /keep their face, hair, body, pose/);
  assert.match(p, /exactly as in the second image/);
});

test("13 Nov (feedback 7): a photo of the back gets the back of the tee; the worn photo can be taken from behind; the front stays as before", async () => {
  const { teeSide, tryOnPrompt, wornPrompt } = await import("../services/conceptSheets.js");
  // the side: only "back" is the back — an older page sends none, which is the front
  assert.equal(teeSide("back"), "back");
  for (const v of [undefined, null, "", "front", "BACK", "left", { side: "back" }]) assert.equal(teeSide(v), "front");
  // try it on me, back photo: the back of the tee, the person still seen from behind, the words not mirrored
  const b = tryOnPrompt({ garment: "oversized tee", teeColour: "black", side: "back" });
  assert.match(b, /seen from behind/);
  assert.match(b, /shows the BACK/);
  assert.match(b, /do not turn them round/);
  assert.match(b, /exactly as in the second image/);
  assert.match(b, /not mirrored/);
  assert.match(b, /plain, keep it plain/);
  assert.doesNotMatch(b, /do not add a face|keep their face/); // a head turned over the shoulder stays as it is
  // the front: as before, word for word
  const f = tryOnPrompt({ garment: "oversized tee", teeColour: "black" });
  assert.equal(tryOnPrompt({ garment: "oversized tee", teeColour: "black", side: "front" }), f);
  assert.equal(tryOnPrompt({ garment: "oversized tee", teeColour: "black", side: "sideways" }), f);
  assert.doesNotMatch(f, /seen from behind|BACK/);
  assert.match(f, /keep their face, hair, body, pose/);
  // the photo of it worn, from behind: the back mock-up, back to the camera
  const w = wornPrompt({ garment: "oversized tee", teeColour: "black", side: "back" });
  assert.match(w, /shows the BACK of the tee/);
  assert.match(w, /back to the camera/);
  assert.match(w, /back print is fully visible/);
  assert.match(w, /EXACTLY as in the attached image/);
  assert.doesNotMatch(w, /facing the camera/);
  const wf = wornPrompt({ garment: "oversized tee", teeColour: "black" });
  assert.equal(wornPrompt({ garment: "oversized tee", teeColour: "black", side: "front" }), wf);
  assert.match(wf, /facing the camera so the front print is fully visible/);
  assert.doesNotMatch(wf, /BACK|back to the camera/);
});
