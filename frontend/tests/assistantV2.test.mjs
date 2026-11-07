// Assistant v2 helpers (studio/assistantV2.js, 7 Nov 2026): the first screen, the sheets kept in a chat, picks by number,
// and which print area a concept's piece goes on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { firstMessagesV2, isUntouchedStart, sheetsFromChat, nextConceptNumber, conceptCount, findConcept, piecesOf, parsePicks, isBarePick, assistAct, pieceArea, suggestionsFor } from "../src/studio/assistantV2.js";

const sheet = (numberFrom, url) => ({ url, numberFrom, concepts: Array.from({ length: 3 }, (_, i) => ({ n: numberFrom + i, title: `C${numberFrom + i}`, front: "x", back: i === 2 ? null : "y", sleeve: i === 0 ? "z" : null })), developed: [] });
const chat = [{ from: "bot", text: "hi" }, { from: "me", text: "designs" }, { sheet: sheet(1, "/uploads/ai-concepts/a.png") }, { from: "me", text: "more" }, { sheet: sheet(4, "/uploads/ai-concepts/b.png") }];

test("the v2 start is one line and three suggestions that go to the brain", () => {
  const m = firstMessagesV2();
  assert.equal(m.length, 2);
  assert.equal(m[0].from, "bot");
  assert.deepEqual(m[1], { chips: suggestionsFor(new Date()), smart: true }); // (the first chip follows the season)
  assert.equal(isUntouchedStart(m), true);
  assert.equal(isUntouchedStart([...m, { from: "me", text: "hello" }]), false);
});

test("sheets are read from the chat, numbering continues, concepts are found by number", () => {
  const sheets = sheetsFromChat(chat);
  assert.equal(sheets.length, 2);
  assert.equal(conceptCount(sheets), 6);
  assert.equal(nextConceptNumber(sheets), 7);
  assert.equal(nextConceptNumber([]), 1);
  assert.equal(findConcept(sheets, 5).concept.title, "C5");
  assert.equal(findConcept(sheets, 5).sheet.url, "/uploads/ai-concepts/b.png");
  assert.equal(findConcept(sheets, 9), null);
  assert.deepEqual(piecesOf(sheets[0].concepts[0]), ["front", "back", "sleeve"]);
  assert.deepEqual(piecesOf(sheets[0].concepts[2]), ["front"]);
});

test("picks by number, in words, ranges, all; a bare pick is told apart from a sentence", () => {
  assert.deepEqual(parsePicks("3, 6 and 9 suit me", 9), [3, 6, 9]);
  assert.deepEqual(parsePicks("the second one", 3), [2]);
  assert.deepEqual(parsePicks("4 to 6", 6), [4, 5, 6]);
  assert.deepEqual(parsePicks("all", 3), [1, 2, 3]);
  assert.equal(isBarePick("2", 3), true);
  assert.equal(isBarePick("2 and 3 please", 3), true);
  assert.equal(isBarePick("I want 2 tees", 3), false);
  assert.equal(isBarePick("2", 0), false);
});

test("a bare pick becomes a develop step without the brain; anything else goes to the brain", () => {
  assert.deepEqual(assistAct("2 and 5", chat), { type: "assist", text: "2 and 5", steps: [{ type: "develop", picks: [2, 5], sheet: null, pieces: null }] });
  assert.deepEqual(assistAct("make it darker", chat), { type: "assist", text: "make it darker" });
  assert.deepEqual(assistAct("2", [{ from: "bot", text: "hi" }]), { type: "assist", text: "2" }); // no sheet yet: the brain answers
});

test("a concept's piece goes on the matching print area, with the AI drawings' fallback when it is taken", () => {
  const cm = (w, h) => ({ cm: { standard: [w, h] } });
  const positions = [
    { key: "centre-front", side: "front", main: true, label: "Centre front", ...cm(28, 32) },
    { key: "left-chest", side: "front", label: "Left chest", ...cm(10, 10) },
    { key: "full-back", side: "back", main: true, label: "Full back", ...cm(38, 42) },
    { key: "left-sleeve", side: "left", label: "Left sleeve", ...cm(8, 8) },
    { key: "right-sleeve", side: "right", label: "Right sleeve", ...cm(8, 8) },
  ];
  assert.equal(pieceArea("front", positions, []).key, "centre-front");
  assert.equal(pieceArea("back", positions, []).key, "full-back");
  assert.equal(pieceArea("sleeve", positions, []).key, "left-sleeve");
  assert.equal(pieceArea("sleeve", [positions[0], positions[4]], []).key, "right-sleeve");
  assert.equal(pieceArea("back", [positions[0]], []), null);
});

test("a tap on the sheet picture picks the tee under it, left to right", async () => {
  const { conceptAtX } = await import("../src/studio/assistantV2.js");
  const concepts = [{ n: 4 }, { n: 5 }, { n: 6 }];
  assert.equal(conceptAtX(0.1, concepts), 4);
  assert.equal(conceptAtX(0.5, concepts), 5);
  assert.equal(conceptAtX(0.99, concepts), 6);
  assert.equal(conceptAtX(1, concepts), 6);
  assert.equal(conceptAtX(1.2, concepts), null);
  assert.equal(conceptAtX(0.5, []), null);
});

test("the first suggestion follows the season; the other two stay", async () => {
  const { suggestionsFor, firstMessagesV2 } = await import("../src/studio/assistantV2.js");
  assert.equal(suggestionsFor(new Date(2026, 0, 10))[0], "A Pongal tee for my family");
  assert.equal(suggestionsFor(new Date(2026, 9, 20))[0], "A Diwali tee for my family");
  assert.equal(suggestionsFor(new Date(2026, 10, 7))[0], "Designs for my cafe staff");
  assert.deepEqual(suggestionsFor(new Date(2026, 5, 1)).slice(1), ["Draw a lion with a cricket bat", "A slogan for my team"]);
  assert.equal(firstMessagesV2(new Date(2026, 11, 25))[1].chips[0], "A New Year 2027 tee for our group");
});

test("placement from the concept's words: a chest badge goes small on the chest area, a full back fills", async () => {
  const { placementHint, shrinkForHint } = await import("../src/studio/assistantV2.js");
  assert.deepEqual(placementHint("small left-chest badge with the cafe name"), { area: "chest", size: "small" });
  assert.deepEqual(placementHint("large centre-front artwork of a roaring lion"), { area: null, size: "large" });
  assert.deepEqual(placementHint("full-back lettering ASSEMBLE"), { area: "full", size: "large" });
  assert.deepEqual(placementHint("a tiny monogram on the chest"), { area: "chest", size: "small" });
  assert.deepEqual(placementHint("a lion with a cricket bat"), { area: null, size: null });
  assert.deepEqual(placementHint(null), { area: null, size: null });
  const positions = [
    { key: "left-chest", label: "Left chest", side: "front" },
    { key: "centre-front", label: "Centre front", side: "front", main: true },
    { key: "full-back", label: "Full back", side: "back", main: true },
  ];
  assert.equal(pieceArea("front", positions, [], { area: "chest", size: "small" })?.key, "left-chest");
  assert.equal(pieceArea("front", positions, [], { area: null, size: "large" })?.key, "centre-front");
  assert.equal(pieceArea("front", positions.filter((p) => p.key !== "left-chest"), [], { area: "chest", size: "small" })?.key, "centre-front"); // no chest area: the main one, made small
  const el = { x: 4, y: 10, width: 92, height: 80, rotation: 0 };
  const small = shrinkForHint(el, positions[1], { area: "chest", size: "small" });
  assert.ok(small.width < 55 && small.height < 50 && small.y <= 12, JSON.stringify(small));
  assert.equal(shrinkForHint(el, positions[0], { size: "small" }), el); // a small area stays as it is
  assert.equal(shrinkForHint(el, positions[1], { size: null }), el);
});
