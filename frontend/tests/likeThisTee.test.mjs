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

// (21 Nov 2026, live test) a whole-tee copy's front — chest logo + strokes from the hem + a hem tag — went into the
// 12×13 cm Left Chest because its words begin "small ID logo on the left chest"
test("a front made of prints in several places goes on the Full Front, a lone chest logo still on the chest", async () => {
  const { placementHint, spreadOut } = await import("../src/studio/assistantV2.js");
  const all = [
    ...positions,
    { key: "full-front", side: "front", label: "Full Front", ...cm(35, 52) },
    { key: "left-chest", side: "front", label: "Left Chest", ...cm(12, 13) },
  ];
  const front = "Small 'ID IDENTEE' logo on the left chest, black and yellow brush strokes rising from the lower left hem with 'IDEAS DESIGNS PEOPLE STORIES ON TEES' beside them, and a small 'ID' tag just above the hem";
  assert.equal(spreadOut(front), true);
  assert.deepEqual(placementHint(front, all), { area: "whole", size: null });
  assert.equal(pieceArea("front", all, [], placementHint(front, all)).key, "full-front");
  // the old cases keep working
  assert.equal(pieceArea("front", all, [], placementHint("small ID logo on the left chest", all)).key, "left-chest");
  assert.equal(pieceArea("front", all, [], placementHint("a large roaring lion", all)).key, "centre-front");
  // a back laid out top and bottom → Full Back; a sleeve is never "whole"
  assert.equal(pieceArea("back", all, [], placementHint("'TEAM' across the shoulders and the number lower down", all)).key, "full-back");
  assert.equal(pieceArea("sleeve", all, [], { area: "whole", size: null }).key, "left-sleeve");
  // a tee without a Full Front: the main front area
  assert.equal(pieceArea("front", positions, [], { area: "whole", size: null }).key, "centre-front");
});
