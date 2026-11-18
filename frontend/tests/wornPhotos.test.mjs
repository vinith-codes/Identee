// Photo of it worn / Try it on me on every printed side (17 Nov 2026, the owner: "it must show all sides where the
// prints are available"): which sides get a photo, what that costs of today's pictures, and the honest captions.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { costLine, noPhotoNote, planSides, printedSides, sideBySideLayout, sideLabel, sideWords, skippedNote, tryOnAsks, tryOnSides, wornCaption } from "../src/studio/wornPhotos.js";

test("the printed sides, in the order the photos are made", () => {
  assert.deepEqual(printedSides([]), ["front"]);
  assert.deepEqual(printedSides(null), ["front"]);
  assert.deepEqual(printedSides([{ side: "front" }, { side: "front" }]), ["front"]);
  assert.deepEqual(printedSides([{ side: "back" }, { side: "front" }]), ["front", "back"]);
  assert.deepEqual(printedSides([{ side: "back" }]), ["back"]); // a back-only design: one photo, from behind
  assert.deepEqual(printedSides([{ side: "right" }, { side: "front" }, { side: "left" }, { side: "back" }]), ["front", "back", "left", "right"]);
  assert.deepEqual(printedSides([{ side: "shorts" }]), ["front"]); // the co-ord set's shorts show on the front photo
  assert.deepEqual(printedSides([{ side: "shorts" }, { side: "back" }]), ["front", "back"]);
});

test("what fits in today's pictures: the first sides first; not known yet → all (the server still checks)", () => {
  assert.deepEqual(planSides(["front", "back"], 10), { make: ["front", "back"], skipped: [] });
  assert.deepEqual(planSides(["front", "back", "left"], 1), { make: ["front"], skipped: ["back", "left"] });
  assert.deepEqual(planSides(["front", "back"], 0), { make: [], skipped: ["front", "back"] });
  assert.deepEqual(planSides(["front", "back"], null), { make: ["front", "back"], skipped: [] });
});

test("the cost line says how many photos, which sides, and of how many pictures", () => {
  assert.equal(costLine({ sides: ["front", "back"], left: 10, daily: 10 }), "This makes 2 photos (front + back) — 2 of your 10 pictures for today.");
  assert.equal(costLine({ sides: ["front"], left: 4, daily: 10 }), "This makes 1 photo (front) — 1 of your 10 pictures for today.");
  assert.equal(costLine({ sides: ["front", "back", "left"], left: null, daily: null }), "This makes 3 photos (front, back + left side) — 3 of today’s pictures.");
  assert.equal(costLine({ sides: ["front", "back", "left"], left: 1, daily: 10 }), "You have 1 picture left today, so this makes 1 photo (front) — not the back + left side.");
  assert.match(costLine({ sides: ["front", "back"], left: 0, daily: 10 }), /^You’ve made today’s 10 pictures/);
  assert.equal(skippedNote(["back"]), "Not made: the back — today’s pictures ran out. They come back tomorrow.");
  assert.equal(skippedNote([]), "");
});

test("words and labels", () => {
  assert.equal(sideWords(["front"]), "front");
  assert.equal(sideWords(["front", "back"]), "front + back");
  assert.equal(sideWords(["front", "back", "left", "right"]), "front, back, left side + right side");
  assert.equal(sideLabel("back"), "Back");
  assert.equal(sideLabel("right"), "Right side");
});

test("the captions are honest: a back made by the AI says so; their own back photo says that", () => {
  assert.match(wornCaption({ me: false, side: "back" }), /the person and place are made up/);
  assert.match(wornCaption({ me: true, side: "front", from: "photo" }), /made from your photo/);
  assert.match(wornCaption({ me: true, side: "back", from: "ai" }), /^The back view is made by the AI from your photo/);
  assert.match(wornCaption({ me: true, side: "left", from: "ai" }), /^The left side view is made by the AI/);
  assert.match(wornCaption({ me: true, side: "back", from: "photo" }), /photo of your back/);
});

test("Share all: the photos side by side at one height, inside the picture", () => {
  const L = sideBySideLayout([{ width: 768, height: 1024 }, { width: 768, height: 1024 }, { width: 600, height: 1000 }], { photoH: 960, gap: 28 });
  assert.equal(L.boxes.length, 3);
  assert.ok(L.boxes.every((b) => b.h === 960));
  assert.equal(L.boxes[0].w, 720);
  assert.equal(L.boxes[1].x, 28 + 720 + 28);
  const last = L.boxes[2];
  assert.equal(last.x + last.w + 28, L.W);
  assert.ok(L.labelY > 28 + 960 && L.footY < L.H);
});

test("Try it on me asks for a front photo (front or sleeves printed) and a back photo (back printed)", () => {
  assert.deepEqual(tryOnAsks(["front"]), ["front"]);
  assert.deepEqual(tryOnAsks(["front", "back"]), ["front", "back"]);
  assert.deepEqual(tryOnAsks(["back"]), ["back"]);
  assert.deepEqual(tryOnAsks(["front", "back", "right"]), ["front", "back"]);
  assert.deepEqual(tryOnAsks(["left"]), ["front"]); // a sleeve is made from the front photo
});

test("Try it on me makes only the sides the photos given can make; none is required", () => {
  const all = ["front", "back", "left", "right"];
  assert.deepEqual(tryOnSides(all, { front: true, back: true }), { make: all, noPhoto: [] });
  assert.deepEqual(tryOnSides(all, { front: true }), { make: ["front", "left", "right"], noPhoto: ["back"] });
  assert.deepEqual(tryOnSides(all, { back: true }), { make: ["back"], noPhoto: ["front", "left", "right"] });
  assert.deepEqual(tryOnSides(["front", "back"], {}), { make: [], noPhoto: ["front", "back"] });
  assert.equal(noPhotoNote(["back"]), "Not made: the back — no photo was added for it.");
  assert.equal(noPhotoNote(["front", "right"]), "Not made: the front + right side — no photo was added for them.");
  assert.equal(noPhotoNote([]), "");
});

test("the Design Room asks side by side: the first photo goes with the other sides; Back closes the window; shareTee kept", () => {
  const src = fs.readFileSync(new URL("../src/studio/DesignRoomPage.jsx", import.meta.url), "utf8");
  assert.match(src, /put\(side, done\(await ask\(side, keep\)\)\)/);
  assert.match(src, /const keep = !me \|\| make\[0\] === "front" \? first\.url : null;/);
  assert.match(src, /tryOnSides\(wornSides, \{ front: Boolean\(photo\), back: Boolean\(backPhoto\) \}\)/);
  assert.match(src, /useBackClose\(Boolean\(worn\?\.photos\), \(\) => closeWorn\(\)\)/);
  assert.match(src, /planSides\(mine\.make, ai\.left\)/);
  assert.match(src, /makeSideBySide\(/);
  assert.match(src, /shareTee\(blob, \{ text: `My \$\{garment\?\.label \|\| "tee"\} design on IDENTEE`, fileName: "my-identee-tee-worn-all\.png" \}\)/);
});
