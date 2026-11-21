// "Design a t-shirt like this" on the page (21 Nov 2026): a concept with a print on each sleeve has two sleeve
// pieces — "sleeve" goes on the left sleeve, "sleeve2" on the right one — and the chat calls sleeve2 "right sleeve".
import { test } from "node:test";
import assert from "node:assert/strict";
import { PIECES, pieceName, piecesOf, pieceArea } from "../src/studio/assistantV2.js";

const cm = (w, h) => ({ cm: { standard: [w, h] } });
const positions = [
  { key: "centre-front", side: "front", main: true, label: "Centre front", ...cm(28, 32) },
  { key: "full-back", side: "back", main: true, label: "Full back", ...cm(38, 42) },
  { key: "left-sleeve", side: "left", label: "Left sleeve", ...cm(8, 8) },
  { key: "right-sleeve", side: "right", label: "Right sleeve", ...cm(8, 8) },
];

test("the right sleeve is its own piece, named in plain words", () => {
  assert.deepEqual(PIECES, ["front", "back", "sleeve", "sleeve2"]);
  assert.deepEqual(piecesOf({ front: "a", back: "b", sleeve: "c", sleeve2: "d" }), ["front", "back", "sleeve", "sleeve2"]);
  assert.equal(pieceName("sleeve2"), "right sleeve");
  assert.equal(pieceName("sleeve"), "sleeve");
  assert.equal(pieceName("front"), "front");
});

test("sleeve → left sleeve, sleeve2 → right sleeve; one sleeve alone still goes where it went before", () => {
  assert.equal(pieceArea("sleeve", positions, []).key, "left-sleeve");
  assert.equal(pieceArea("sleeve2", positions, []).key, "right-sleeve");
  // the page passes the area the first piece took, so the two never land on the same sleeve
  const used = [pieceArea("sleeve", positions, []).key];
  assert.equal(pieceArea("sleeve2", positions, used).key, "right-sleeve");
  // a tee with only the right sleeve area: the left-sleeve piece goes there (as before)
  assert.equal(pieceArea("sleeve", [positions[0], positions[3]], []).key, "right-sleeve");
  // with only a left sleeve area, the right-sleeve piece still finds a sleeve
  assert.equal(pieceArea("sleeve2", [positions[0], positions[2]], []).key, "left-sleeve");
});
