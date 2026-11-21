// Where each part of a copied tee's side is on the customer's photo (21 Nov 2026): the text AI's boxes (a real answer
// on the owner's tee photo, saved) turned into the tee's own measure, with the collar seam found in the photo's pixels —
// the AI's collar box ends 16 px (about 2 cm) above it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { seamBelow, teeOutline, toTeeMeasure, measurePrompt, matchLayout, layoutWords } from "../services/photoMeasure.js";

const answer = JSON.parse(readFileSync(new URL("./fixtures/teePhotoMeasure.json", import.meta.url), "utf8"));
const size = { width: 1313, height: 1198 };
const L = 63.53; // our Oversized M front, collar seam to hem
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

test("the seam is found on the shadow line below the AI's collar box (row 137, not 121)", async () => {
  const photo = new URL("../../../test-pictures/identee-reference-tee.jpg", import.meta.url);
  let g;
  try {
    g = await sharp(photo.pathname.replace(/^\/([A-Z]:)/, "$1")).greyscale().raw().toBuffer({ resolveWithObject: true });
  } catch {
    return; // (the owner's photo lives outside the repo: only on the laptop)
  }
  const guess = (answer.collar[2] / 1000) * size.height;
  const seam = seamBelow({ data: g.data, width: g.info.width, height: g.info.height }, ((answer.collar[1] + answer.collar[3]) / 2000) * size.width, guess, (answer.body[2] / 1000) * size.height - guess);
  near(seam, 137, 2, "seam row");
});

test("with the seam, the chest logo is 7.8 cm below the collar and 10.5 cm to the wearer's left (as measured by hand)", () => {
  const m = toTeeMeasure(answer, size, 4, { seamPx: 137 });
  const [logo, strokes, words, tag] = m.at;
  near(logo.d * L, 7.8, 0.5, "logo top");
  near(logo.r * L, 10.5, 0.6, "logo across");
  near(logo.w * L, 9.1, 0.6, "logo width");
  assert.ok(strokes.r < 0 && words.r < 0, "strokes and words on the wearer's right");
  assert.ok(tag.d * L > 55, "tag near the hem");
  // with only the AI's collar box (it ends about 2 cm short of the seam) the logo would read about 2 cm too low
  const rough = toTeeMeasure(answer, size, 4);
  assert.ok(rough.at[0].d * L > logo.d * L + 1, "the AI's collar alone puts the logo lower");
});

test("a seam it can't see: no line in plain fabric", () => {
  const W = 200;
  const H = 200;
  const data = Buffer.alloc(W * H, 200);
  assert.equal(seamBelow({ data, width: W, height: H }, 100, 50, 120), null);
  for (let x = 0; x < W; x++) data[54 * W + x] = 150; // a seam line at row 54 (inside the 4 cm below the guess)
  assert.equal(seamBelow({ data, width: W, height: H }, 100, 50, 120), 54);
});

test("parts not found, a missing tee, or boxes off the tee: nothing to place by", () => {
  assert.equal(toTeeMeasure({ ...answer, found: false }, size, 4), null);
  assert.equal(toTeeMeasure({ ...answer, body: null }, size, 4), null);
  const some = toTeeMeasure({ ...answer, parts: [{ part: 1, box: null }, { part: 2, box: answer.parts[1].box }] }, size, 2);
  assert.equal(some.at[0], null);
  assert.ok(some.at[1]);
  assert.equal(toTeeMeasure({ ...answer, parts: [{ part: 1, box: [0, 0, 20, 20] }] }, size, 1), null, "above the collar");
});

test("the request names the side and the parts, and asks for boxes (not points)", () => {
  const p = measurePrompt("back", 3);
  assert.match(p, /BACK of the tee/);
  assert.match(p, /Images 2 to 4 are parts 1 to 3/);
  assert.match(p, /"collar": box, "body": box/);
});

// (21 Nov 2026, the owner: "the customer expects the output as like in the mockup") the concept sheet's tees: measured
// by their outline — the top of the shoulders and the hem stand out on any fabric colour; a black tee's seam doesn't
test("the tee's outline: the shoulders, hem and centre line, on a white tee (the photo) and a black one (the sheet)", async () => {
  const read = async (f) => {
    try {
      const r = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      return { data: r.data, width: r.info.width, height: r.info.height, channels: r.info.channels };
    } catch {
      return null; // (the pictures live outside the repo: only on the laptop)
    }
  };
  const photo = await read("E:/AI CUSTOMIZATION/test-pictures/identee-reference-tee.jpg");
  if (photo) {
    const o = teeOutline(photo, [(39 / 1000) * 1198, (9 / 1000) * 1313, (537 / 1000) * 1198, (419 / 1000) * 1313]);
    near(o.top, 51, 4, "photo shoulders");
    near(o.hem, 641, 4, "photo hem");
    near(o.centre, 288, 6, "photo centre (the collar's middle)");
  }
  const sheet = await read("E:/AI CUSTOMIZATION/test-pictures/like-this-21nov/3-like-this-sheet-fixed.jpg");
  if (sheet) {
    const o = teeOutline(sheet, [198, 51, 758, 592]); // concept 1's front
    near(o.top, 199, 4, "sheet shoulders");
    near(o.hem, 754, 4, "sheet hem");
    near(o.centre, 322, 6, "sheet centre");
  }
});

// (our Oversized collar is cut deeper than the photo's tee: 12.7 cm below the shoulders against about 11 — so measured
// from the shoulders, the logo is where the photo has it on the tee as a whole, 1.4 cm nearer our deeper collar)
test("measured from the shoulders: the logo on the photo is 19.1 cm below the shoulders, 6.4 cm below our M collar", () => {
  const m = toTeeMeasure(answer, size, 4, { outline: { top: 51, hem: 641, centre: 284.5 } });
  const logo = m.at[0];
  assert.equal(logo.from, "shoulder");
  const full = 76.2; // our Oversized M, the top of the shoulders to the hem (the size chart: 30 in)
  near(logo.d * full, 19.1, 0.5, "logo top below the shoulders");
  near(logo.d * full - (full - L), 6.4, 0.5, "logo top below our collar");
  near(logo.r * full, 10.5, 1, "logo across");
});

test("a part inside the collar ring (a neck label the AI drew) is left off — our own label goes there", () => {
  const withLabel = { ...answer, parts: [...answer.parts, { part: 5, box: [50, 205, 70, 230] }] };
  const m = toTeeMeasure(withLabel, size, 5, { outline: { top: 51, hem: 641, centre: 284.5 } });
  assert.deepEqual(m.at[4], { inCollar: true });
  assert.ok(m.at[0] && !m.at[0].inCollar, "the chest logo stays");
  // only a label: nothing to place by
  assert.equal(toTeeMeasure({ ...answer, parts: [{ part: 1, box: [50, 205, 70, 230] }] }, size, 1), null);
});

test("the sheet's request names the picked concept and its side", () => {
  const p = measurePrompt("front", 3, { concept: 2 });
  assert.match(p, /concept sheet/);
  assert.match(p, /ONLY concept 2's whole view of the FRONT/);
});

// the first real sheet read (21 Nov 2026): concept 1's front cut into a chest logo, gold strokes and a tiny copy of the
// logo near the hem; the AI gave the logo's box to the tiny copy and said the logo wasn't there
const sheet = { width: 2048, height: 1152 };
const copyLayout = [
  { x: 0.649, y: 0.238, w: 0.208, h: 0.108 },
  { x: 0, y: 0.322, w: 0.487, h: 0.678 },
  { x: 0.846, y: 0.938, w: 0.082, h: 0.062 },
];
const copyAspect = 0.671;
const realRead = { found: true, collar: [128, 93, 169, 143], body: [129, 17, 492, 215], parts: [{ part: 1, box: null }, { part: 2, box: [270, 50, 492, 110] }, { part: 3, box: [223, 134, 260, 163] }] };
const rightRead = { found: true, collar: [129, 95, 170, 142], body: [129, 19, 492, 215], parts: [{ part: 1, box: [222, 134, 259, 161] }, { part: 2, box: [275, 50, 490, 111] }, { part: 3, box: [473, 164, 487, 173] }] };

test("a box the AI gave to a look-alike part goes back to the right part (the sizes in the copy tell them apart)", () => {
  const c = matchLayout(realRead, sheet, copyLayout, copyAspect);
  assert.equal(c.moved, 1);
  assert.deepEqual(c.answer.parts[0].box, [223, 134, 260, 163], "the logo's box is the logo's again");
  assert.deepEqual(c.answer.parts[1].box, [270, 50, 492, 110], "the strokes keep theirs");
  assert.equal(c.answer.parts[2].box, null, "the tiny copy stays where it was drawn");
});

test("a right answer is left as it is", () => {
  const c = matchLayout(rightRead, sheet, copyLayout, copyAspect);
  assert.equal(c.moved + c.dropped, 0);
  assert.deepEqual(c.answer.parts.map((p) => p.box), rightRead.parts.map((p) => p.box));
});

test("a box far too big or small for any part is dropped, never placed wrong; a lone box or no layout: as given", () => {
  // the strokes right, the logo's box drawn 4x too big
  const wrong = { ...rightRead, parts: [{ part: 1, box: [150, 60, 300, 200] }, rightRead.parts[1]] };
  const c = matchLayout(wrong, sheet, copyLayout.slice(0, 2), copyAspect);
  assert.ok(c.dropped >= 1, "the misfit is left as drawn");
  const lone = { ...rightRead, parts: [rightRead.parts[0]] };
  assert.equal(matchLayout(lone, sheet, copyLayout, copyAspect).answer, lone);
  assert.equal(matchLayout(rightRead, sheet, null).answer, rightRead);
});

test("the request tells the AI each part's size and spot in the copy", () => {
  assert.equal(layoutWords(copyLayout), "part 1: medium, top right; part 2: large, middle left; part 3: small, bottom right");
  assert.match(measurePrompt("front", 3, { concept: 1, layout: copyLayout }), /a large logo and a tiny copy of it are different parts/);
  assert.doesNotMatch(measurePrompt("front", 3, { concept: 1 }), /blown up/);
});
