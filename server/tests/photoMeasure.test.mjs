// Where each part of a copied tee's side is on the customer's photo (21 Nov 2026): the text AI's boxes (a real answer
// on the owner's tee photo, saved) turned into the tee's own measure, with the collar seam found in the photo's pixels —
// the AI's collar box ends 16 px (about 2 cm) above it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { seamBelow, teeOutline, toTeeMeasure, measurePrompt, matchLayout, layoutWords, sleevePrompt, toSleevePlace } from "../services/photoMeasure.js";

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

// (21 Nov 2026, the back of a live test) on a concept sheet the front tee hangs just above the back tee: the back's
// outline must not run up into it (it did: the back's top 46 px too high, its print placed 6 % low)
test("teeOutline: a tee just above the box (the sheet's front over its back) is not taken for this tee's top", () => {
  const W = 400, H = 700, c = 3;
  const data = Buffer.alloc(W * H * c, 212); // the sheet's grey
  const fill = (x0, y0, x1, y1, v) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data.fill(v, (y * W + x) * c, (y * W + x) * c + c); };
  fill(80, 20, 320, 280, 255); // the front tee, its hem at 280
  fill(80, 300, 320, 640, 255); // the back tee: 20 px of grey between
  fill(190, 320, 210, 630, 20); // its tall black print down the centre
  const o = teeOutline({ data, width: W, height: H, channels: c }, [285, 70, 650, 330]); // a loose box, starting in the gap
  near(o.top, 300, 2, "the back tee's own top");
  near(o.hem, 639, 2, "its hem");
});

test("teeOutline on the live sheet's concept 1 back (laptop only)", async () => {
  let sheet = null;
  try {
    const r = await sharp("E:/AI CUSTOMIZATION/test-pictures/live-back-21nov/sheet.jpg").removeAlpha().raw().toBuffer({ resolveWithObject: true });
    sheet = { data: r.data, width: r.info.width, height: r.info.height, channels: r.info.channels };
  } catch {
    return;
  }
  const o = teeOutline(sheet, [808, 154, 1478, 784]);
  near(o.top, 836, 5, "the back's top, not the front tee's hem above it");
  near(o.hem, 1465, 6, "its hem");
});

test("teeOutline: a close-up over one side (the sheet's R inset over the back tee) doesn't move the centre line", () => {
  const W = 400, H = 700, c = 3;
  const data = Buffer.alloc(W * H * c, 212);
  const fill = (x0, y0, x1, y1, v) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data.fill(v, (y * W + x) * c, (y * W + x) * c + c); };
  fill(100, 60, 300, 660, 255); // the tee: centre 200, half 100
  fill(170, 40, 230, 70, 150); // its collar ring
  fill(40, 300, 130, 640, 90); // a close-up box over the tee's lower left edge
  fill(45, 305, 125, 635, 240);
  const rgb = { data, width: W, height: H, channels: c };
  const plain = teeOutline(rgb, [60, 60, 660, 340]); // the AI's box takes in the sleeves: wider than the body
  assert.ok(Math.abs(plain.centre - 200) > 20, "without the collar the close-up pulls the centre off (the old fault)");
  const o = teeOutline(rgb, [60, 60, 660, 340], 200);
  near(o.centre, 200, 0.5, "the collar's middle");
  near(o.half, 100, 2, "the uncovered side's half-width");
});

test("live full-tee sheet: the back print centred on the mockup is measured centred (laptop only)", async () => {
  let pic = null;
  try {
    pic = await sharp("E:/AI CUSTOMIZATION/test-pictures/fulltee-test/sheet-run1.jpg").removeAlpha().raw().toBuffer({ resolveWithObject: true });
  } catch {
    return;
  }
  const { width, height } = pic.info;
  const answer = { found: true, collar: [66, 339, 90, 407], body: [66, 271, 513, 481], parts: [{ part: 1, box: [94, 356, 499, 388] }] };
  const b = answer.body;
  const o = teeOutline({ data: pic.data, width, height, channels: pic.info.channels }, [(b[0] / 1000) * height, (b[1] / 1000) * width, (b[2] / 1000) * height, (b[3] / 1000) * width], ((339 + 407) / 2 / 1000) * width);
  const m = toTeeMeasure(answer, { width, height }, 1, { outline: o });
  assert.ok(Math.abs(m.at[0].r) < 0.05, `centred (r ${m.at[0].r}; was 0.22 when the R close-up was taken for the tee's side)`);
  near(o.half, 197, 8, "the back's half-width: the middle of its two sides (about 206 and 192 px) where the R close-up doesn't cover them");
  // the front: the L and R close-ups beside it were taken for its sides (half 341 px, 1.6x) — the strokes came out
  // 40 % too narrow on the 3D tee; they reach the side seam on the mockup
  const front = { found: true, collar: [62, 137, 115, 202], body: [62, 53, 508, 287], parts: [{ part: 1, box: [178, 191, 224, 224] }, { part: 2, box: [239, 91, 506, 163] }, { part: 3, box: [479, 224, 506, 237] }] };
  const fb = front.body;
  const fo = teeOutline({ data: pic.data, width, height, channels: pic.info.channels }, [(fb[0] / 1000) * height, (fb[1] / 1000) * width, (fb[2] / 1000) * height, (fb[3] / 1000) * width], ((137 + 202) / 2 / 1000) * width);
  near(fo.half, 208, 10, "the front's own half-width");
  const fm = toTeeMeasure(front, { width, height }, 3, { outline: fo });
  assert.ok(fm.at[1].w > 0.9 && fm.at[1].r - fm.at[1].w / 2 < -1.0, `the strokes reach the side seam (${JSON.stringify(fm.at[1])})`);
});

test("a sleeve print is read along its sleeve (the sheet's L / R inset), its answer checked", () => {
  const p = sleevePrompt("sleeve2", 4, true);
  assert.match(p, /concept 4/);
  assert.match(p, /RIGHT sleeve's print \(the inset marked R\)/);
  assert.match(p, /shoulder seam .*\(0\) to the sleeve's hem \(1\)/);
  assert.match(sleevePrompt("sleeve", 2, true), /LEFT sleeve's print \(the inset marked L\)/);
  assert.match(sleevePrompt("sleeve", 2, false), /its sleeve print \(the inset that shows a print/);
  assert.deepEqual(toSleevePlace({ found: true, top: 0.55, bottom: 0.78, width: 1 }), { top: 0.55, bottom: 0.78, width: 1 });
  assert.deepEqual(toSleevePlace({ found: true, top: -0.1, bottom: 1.4, width: 3 }), { top: 0, bottom: 1, width: 1 });
  assert.deepEqual(toSleevePlace({ found: true, top: 0.4, bottom: 0.6 }), { top: 0.4, bottom: 0.6 });
  assert.equal(toSleevePlace({ found: false, top: 0.4, bottom: 0.6 }), null);
  assert.equal(toSleevePlace({ found: true, top: 0.6, bottom: 0.4 }), null, "upside down");
  assert.equal(toSleevePlace({ found: true, top: "x", bottom: 0.4 }), null);
  assert.equal(toSleevePlace(null), null);
});

// (21 Nov 2026) all 6 concept sheets on the laptop, every concept's front and back as the real text AI read them
// (36 answers saved in test-pictures/all-mockups-check/results.json): each tee's outline is found, every print on it
// is placed, and a sheet's fronts and backs come out about as wide as each other (the sleeve close-ups beside or over
// the tees — both lower corners on one sheet — white strokes on a black tee and a white tee's shaded hem fooled it)
test("all 6 laptop sheets: every tee measured, every print placed (laptop only)", async () => {
  const fs = await import("fs");
  const DIR = "E:/AI CUSTOMIZATION/Identee-like-this/server/uploads/ai-concepts/";
  let saved = null;
  try {
    saved = JSON.parse(fs.readFileSync("E:/AI CUSTOMIZATION/test-pictures/all-mockups-check/results.json", "utf8"));
  } catch {
    return;
  }
  const halves = {};
  for (const [key, { answer }] of Object.entries(saved)) {
    const file = key.split("|")[0];
    if (!fs.existsSync(DIR + file)) return;
    const r = await sharp(DIR + file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = r.info;
    const b = answer.body.map(Number);
    const o = teeOutline({ data: r.data, width, height, channels: r.info.channels }, [(b[0] / 1000) * height, (b[1] / 1000) * width, (b[2] / 1000) * height, (b[3] / 1000) * width], ((Number(answer.collar[1]) + Number(answer.collar[3])) / 2 / 1000) * width);
    assert.ok(o, `${key}: outline found`);
    const parts = answer.prints.map((box, i) => ({ part: i + 1, box }));
    const m = toTeeMeasure({ ...answer, parts }, { width, height }, parts.length, { outline: o });
    assert.equal(m?.at.filter(Boolean).length, parts.length, `${key}: every print placed`);
    (halves[file] ||= []).push(o.half);
  }
  for (const [file, hs] of Object.entries(halves)) {
    const mid = [...hs].sort((p, q) => p - q)[hs.length >> 1];
    for (const h of hs) assert.ok(Math.abs(h / mid - 1) < 0.12, `${file}: half-widths ${hs.map(Math.round)} agree`);
  }
});
