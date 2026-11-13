// "Try it on me" and "Photo of it worn" follow the side (13 Nov 2026, feedback 7 — studio/teeSide.js): a photo of the
// customer's back gets the BACK of the tee, never the front.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { teePicture, wornSideFor } from "../src/studio/teeSide.js";

// Review's four pictures, in the order of SIDES: front, back, left, right
const shots = [
  { label: "Front", url: "data:image/jpeg;base64,FRONT" },
  { label: "Back", url: "data:image/jpeg;base64,BACK" },
  { label: "Left", url: "data:image/jpeg;base64,LEFT" },
  { label: "Right", url: "data:image/jpeg;base64,RIGHT" },
];

test("the picture sent is the one of the side picked: Back gets the back, Front the front", () => {
  assert.equal(teePicture(shots, "back"), "data:image/jpeg;base64,BACK");
  assert.equal(teePicture(shots, "front"), "data:image/jpeg;base64,FRONT");
  // anything else is the front, as before (only "back" is the back)
  assert.equal(teePicture(shots, undefined), "data:image/jpeg;base64,FRONT");
  assert.equal(teePicture(shots, "left"), "data:image/jpeg;base64,FRONT");
});

test("a back picture that isn't there is null, never the front instead (the page then says so)", () => {
  const noBack = [shots[0], { label: "Back", url: null }, shots[2], shots[3]];
  assert.equal(teePicture(noBack, "back"), null);
  assert.equal(teePicture(noBack, "front"), "data:image/jpeg;base64,FRONT");
  assert.equal(teePicture(null, "back"), null); // (Review closed: no pictures)
  assert.equal(teePicture([shots[0]], "back"), null);
});

test("Photo of it worn: both sides printed → ask; back only → the back; front, sleeves or nothing → the front", () => {
  assert.equal(wornSideFor(new Set(["front", "back"])), "ask");
  assert.equal(wornSideFor(new Set(["front", "back", "left"])), "ask");
  assert.equal(wornSideFor(new Set(["back"])), "back");
  assert.equal(wornSideFor(new Set(["back", "right"])), "back");
  assert.equal(wornSideFor(new Set(["front"])), "front");
  assert.equal(wornSideFor(new Set(["left", "right"])), "front"); // sleeves only: the front, as before
  assert.equal(wornSideFor(new Set()), "front");
  assert.equal(wornSideFor(undefined), "front");
});

test("the page asks Front or Back before the photo picker, and sends the side with the matching picture", () => {
  const jsx = readFileSync(new URL("../src/studio/DesignRoomPage.jsx", import.meta.url), "utf8");
  // neither button hard-codes the front picture any more
  assert.doesNotMatch(jsx, /aiService\.(worn|tryOn)\(\{[^}]*shots\[0\]/);
  assert.match(jsx, /aiService\.worn\(\{ image: tee, side,/);
  assert.match(jsx, /aiService\.tryOn\(\{ photo, image: tee, side,/);
  // Try it on me opens the question, not the picker; the picker opens from the Front / Back tap itself
  assert.match(jsx, /setAskSide\(\(a\) => \(a === "tryon" \? null : "tryon"\)\)/);
  assert.match(jsx, /tryOnSide\.current = side;\s*\n\s*tryOnRef\.current\?\.click\(\);/);
  // the side is read before the photo is shrunk (an await), and the picture follows it
  assert.match(jsx, /const side = tryOnSide\.current;[^\n]*\n\s*const tee = teePicture\(shots, side\);/);
  // the question starts closed every time Review opens
  assert.match(jsx, /setSideShown\(null\);\s*\n\s*setAskSide\(null\);/);
  // and it fits a 360 px phone: the buttons wrap rather than overflow
  const css = readFileSync(new URL("../src/studio/designRoom.css", import.meta.url), "utf8");
  assert.match(css, /\.dr-sidepick \{ display: flex; flex-wrap: wrap;/);
});
