// A laid-out side in separate prints (21 Nov 2026, option A): the server cuts the whole-front picture into its parts
// (chest logo, strokes with their words, hem tag); the design room puts each part in a free place exactly where it sat
// in the whole picture — so the layout is the same, and each one can be moved, resized or removed on its own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { maxPrintBySize, positionsForGarment } from "../../server/data/printPositions.js";
import * as pm from "../src/studio/panelModel.js";
import { partsAsSpots, photoPlace, FACE_SHARE, placedWords } from "../src/studio/assistantV2.js";

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
const src = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const { garment } = JSON.parse(src("../../server/tests/fixtures/threeSpotDesign.json"));
const catalog = positionsForGarment(garment).positions;
const maxPrint = maxPrintBySize(garment);
const fullFront = catalog.find((p) => p.key === "full-front");
let id = 0;
const makeId = () => `t${++id}`;
// the whole picture on Full Front, as the room's aiElement puts a picture of the area's own shape: 92 % wide, centred
const whole = { id: "whole", type: "image", src: "/uploads/ai-designs/whole.png", position: "full-front", side: "front", rotation: 0, zIndex: 1, x: 4, y: 4, width: 92, height: 92 };
// today's real front (3392 × 5056): the chest logo, the strokes with the words, the hem tag (splitParts on it)
const parts = [
  { url: "/uploads/ai-designs/p1.png", width: 689, height: 569, x: 0.666, y: 0.173, w: 0.203, h: 0.113 },
  { url: "/uploads/ai-designs/p2.png", width: 1587, height: 3668, x: 0, y: 0.275, w: 0.468, h: 0.725 },
  { url: "/uploads/ai-designs/p3.png", width: 294, height: 353, x: 0.843, y: 0.931, w: 0.087, h: 0.07 },
];
const ctx = { positions: catalog, garment, size: "M", maxPrint, makeId };

test("each part becomes its own print in a free place, labelled Front 1, 2, 3", () => {
  const r = partsAsSpots([], whole, parts, fullFront, ctx);
  assert.ok(r, "split");
  assert.equal(r.spots.length, 3);
  assert.deepEqual(r.spots.map((s) => s.label), ["Front 1", "Front 2", "Front 3"]);
  assert.deepEqual(r.spots.map((s) => s.url), parts.map((p) => p.url));
  assert.equal(pm.spotsIn(r.elements).length, 3);
  for (const sp of r.spots) {
    const el = r.elements.find((e) => e.id === sp.elId);
    assert.ok(pm.isSpotKey(el.position));
    assert.equal(el.side, "front");
    assert.equal(el.src, sp.url);
  }
  assert.ok(!r.elements.some((e) => e.position === "full-front"), "nothing left on Full Front");
});

test("each part keeps its place on the tee: where it sat in the whole picture on Full Front", () => {
  const r = partsAsSpots([], whole, parts, fullFront, ctx);
  const area = pm.areaBoxCm(fullFront, "M", garment); // { down, across, w, h } of Full Front on M
  for (const [i, p] of parts.entries()) {
    const el = r.elements.find((e) => e.id === r.spots[i].elId);
    const box = el.spot;
    // the part's centre on the tee (cm), from the whole picture's place on the area
    const cx = ((whole.x + (p.x + p.w / 2) * whole.width) / 100) * area.w; // from the area's left edge
    const cy = ((whole.y + (p.y + p.h / 2) * whole.height) / 100) * area.h;
    const wantAcross = area.across - area.w / 2 + cx;
    const wantDown = area.down + cy;
    const t = pm.thingCm(el, box.wCm, box.hCm);
    const at = pm.onTee(box, t);
    assert.ok(Math.abs(at.across - wantAcross) < 0.6, `part ${i + 1} across ${at.across} vs ${wantAcross}`);
    assert.ok(Math.abs(at.down - wantDown) < 0.6, `part ${i + 1} down ${at.down} vs ${wantDown}`);
    // and its size in cm
    assert.ok(Math.abs(t.w - (p.w * whole.width * area.w) / 100) < 0.3, `part ${i + 1} width`);
  }
});

test("the chest logo sits on the wearer's left chest, the strokes on the wearer's right side", () => {
  const r = partsAsSpots([], whole, parts, fullFront, ctx);
  const [logo, strokes, tag] = r.spots.map((s) => r.elements.find((e) => e.id === s.elId).spot);
  assert.ok(logo.acrossCm > 5, "logo to the wearer's left");
  assert.ok(strokes.acrossCm < -3, "strokes to the wearer's right");
  assert.ok(tag.downCm > strokes.downCm, "tag low");
  assert.ok(logo.downCm < strokes.downCm, "logo above the strokes");
});

test("prints already on the tee stay; no split when the free places would run out", () => {
  const other = { id: "o1", type: "text", text: "HI", position: "full-back", side: "back", x: 10, y: 10, width: 80, height: 20, fontSizePct: 50 };
  const r = partsAsSpots([other], whole, parts, fullFront, ctx);
  assert.ok(r.elements.some((e) => e.id === "o1" && e.position === "full-back"));
  // 7 spots already: 3 more would be 10 > 8
  let els = [];
  for (let i = 0; i < 7; i++) {
    const key = pm.nextSpotKey(els);
    const spot = { key, side: "back", label: `Back ${i + 1}`, from: null, downCm: 5 + i * 6, acrossCm: 0, wCm: 4, hCm: 4, base: "M", scale: "F" };
    els = [...els, { id: `s${i}`, type: "image", src: "/x.png", position: key, side: "back", spot, x: 0, y: 0, width: 100, height: 100 }];
  }
  assert.equal(partsAsSpots(els, whole, parts, fullFront, ctx), null);
  assert.equal(partsAsSpots([], { ...whole, rotation: 90 }, parts, fullFront, ctx), null, "a turned picture stays whole");
  assert.equal(partsAsSpots([], whole, [], fullFront, ctx), null);
});

test("the parts grow with the tee size together, like the Full Front they came from", () => {
  const r = partsAsSpots([], whole, parts, fullFront, ctx);
  const boxes = pm.spotsIn(r.elements);
  assert.deepEqual(boxes.map((b) => b.scale), ["G", "G", "G"]);
  // every element of a spot carries the same box
  for (const b of boxes) for (const e of r.elements.filter((x) => x.position === b.key)) assert.equal(e.spot.scale, "G");
  // on 2XL the whole layout is bigger and lower than on S, in the same proportions
  const pos = pm.withSpots(catalog, r.elements, garment, maxPrint).filter((p) => p.spot);
  const big = pos.map((p) => pm.areaBoxCm(p, "2XL", garment));
  const small = pos.map((p) => pm.areaBoxCm(p, "S", garment));
  assert.ok(big[1].h > small[1].h, "strokes taller on 2XL");
  assert.ok(big[2].down > small[2].down, "tag lower on 2XL");
});

test("each part is marked as the AI's laid-out front, so making the front again replaces them (also after an Undo)", () => {
  const r = partsAsSpots([], whole, parts, fullFront, ctx);
  for (const sp of r.spots) assert.equal(r.elements.find((e) => e.id === sp.elId).aiLayout, "front");
});

// (21 Nov 2026) the parts found on the customer's photo: the photo's own layout, in front lengths (measured on the
// owner's tee photo: the chest logo's top 7.8 cm below the collar seam on a 63.5 cm front, 10.5 cm to the wearer's left)
const L = pm.panelFor(garment, "M").front.len;
const onPhoto = [
  { d: 7.8 / L, r: 10.5 / L, w: 9.1 / L, h: 7.4 / L }, // chest logo
  { d: 17.8 / L, r: -13 / L, w: 20 / L, h: 45.5 / L }, // strokes + words
  { d: 52 / L, r: 12 / L, w: 3.8 / L, h: 4.8 / L }, // hem tag (moved up into the print zone already)
];
const measured = parts.map((p, i) => ({ ...p, at: onPhoto[i] }));

test("a part found on the photo goes where it is THERE, not where the drawing put it", () => {
  const r = partsAsSpots([], whole, measured, fullFront, ctx);
  const logo = r.elements.find((e) => e.id === r.spots[0].elId);
  const t = pm.thingCm(logo, logo.spot.wCm, logo.spot.hCm);
  const at = pm.onTee(logo.spot, t);
  const e = pm.extentOf(t);
  // its top edge 7.8 cm below the collar seam (the drawing had it at about 19), its centre 10.5 cm to the wearer's left
  near(at.down - e.hh, 7.8, 0.6, "logo top");
  near(at.across, 10.5, 0.6, "logo across");
  // its own shape kept, fitted in the photo's box (9.1 x 7.4 cm): as wide as the box or as tall
  assert.ok(Math.abs(t.w - 9.1) < 0.3 || Math.abs(t.h - 7.4) < 0.3, `logo size ${t.w} x ${t.h}`);
  // the strokes on the wearer's right, from 17.8 cm down
  const strokes = r.elements.find((e) => e.id === r.spots[1].elId);
  const ts = pm.thingCm(strokes, strokes.spot.wCm, strokes.spot.hCm);
  assert.ok(pm.onTee(strokes.spot, ts).across < -5, "strokes to the wearer's right");
});

test("photoPlace: the same cm on the back is mirrored the right way (seen from behind)", () => {
  const area = { down: 7, across: 0, w: 35, h: 52 };
  const front = photoPlace({ width: 100, height: 100, at: { d: 0.2, r: 0.15, w: 0.1, h: 0.1 } }, "front", area, { len: 60 });
  const back = photoPlace({ width: 100, height: 100, at: { d: 0.2, r: 0.15, w: 0.1, h: 0.1 } }, "back", area, { len: 60 });
  // a centred area: the viewer's right is the file's right on both sides
  assert.equal(front.x, back.x);
  near(front.x, ((9 - 3 + 17.5) / 35) * 100, 0.01, "x");
  near(front.y, ((12 - 7) / 52) * 100, 0.01, "y");
  // an area off to the wearer's left: on the front that is the viewer's right, on the back the viewer's left
  const offF = photoPlace({ width: 100, height: 100, at: { d: 0.2, r: 0, w: 0.1, h: 0.1 } }, "front", { ...area, across: 5 }, { len: 60 });
  const offB = photoPlace({ width: 100, height: 100, at: { d: 0.2, r: 0, w: 0.1, h: 0.1 } }, "back", { ...area, across: 5 }, { len: 60 });
  const mid = photoPlace({ width: 100, height: 100, at: { d: 0.2, r: 0, w: 0.1, h: 0.1 } }, "front", area, { len: 60 });
  assert.ok(offF.x < mid.x && offB.x > mid.x, `${offF.x} ${mid.x} ${offB.x}`);
  assert.equal(photoPlace({ width: 1, height: 1 }, "front", area, { len: 60 }), null, "not found: stays as drawn");
});

// (21 Nov 2026) measured on the concept sheet from the tee's outline: from the top of the shoulders, in its length
test("a part measured from the shoulders lands the same cm below our collar (size chart length − collar seam to hem)", () => {
  const panel = pm.panelFor(garment, "M");
  near(panel.length, 76.2, 0.1, "Oversized M length (30 in)");
  const full = panel.length;
  const drop = full - L; // the collar seam below the top of the shoulders
  const fromShoulder = parts.map((p, i) => ({ ...p, at: { ...onPhoto[i], d: (onPhoto[i].d * L + drop) / full, r: (onPhoto[i].r * L) / full, w: (onPhoto[i].w * L) / full, h: (onPhoto[i].h * L) / full, from: "shoulder" } }));
  const r = partsAsSpots([], whole, fromShoulder, fullFront, ctx);
  const logo = r.elements.find((e) => e.id === r.spots[0].elId);
  const t = pm.thingCm(logo, logo.spot.wCm, logo.spot.hCm);
  const at = pm.onTee(logo.spot, t);
  near(at.down - pm.extentOf(t).hh, 7.8, 0.6, "logo top");
  near(at.across, 10.5, 0.6, "logo across");
});

test("a part inside the collar (a neck label) never becomes a print; a lone measured part still goes on its own", () => {
  const label = { url: "/uploads/ai-designs/label.png", width: 100, height: 120, x: 0.45, y: 0, w: 0.05, h: 0.03, at: { inCollar: true } };
  const r = partsAsSpots([], whole, [...measured, label], fullFront, ctx);
  assert.equal(r.spots.length, 3);
  assert.ok(!r.elements.some((e) => e.src === label.url));
  const one = partsAsSpots([], whole, [measured[0]], fullFront, ctx);
  assert.equal(one.spots.length, 1);
});

// (21 Nov 2026, the owner: "what we see in the mockup the same in the 3D tee") a share of the tee as it looks: down in
// the shoulders-to-hem length, across in the 3D tee's own half-width (prints are pressed straight on: that is how far
// out it looks; the mockup's tee is cut differently from ours)
test("a part measured as a share of the mockup's tee lands at the same share of our 3D tee (its top to its hem)", () => {
  const panel = pm.panelFor(garment, "M");
  near(panel.bodyHalf, 20.2, 0.1, "Oversized M: the 3D tee's body as the room draws it (19.3 cm modelled), centre to outline");
  near(panel.front.drop, 8.5, 0.1, "the 3D tee's top above its front collar line (M)");
  // the sheet's concept 1 logo: 25.6 % down the tee, its centre 47.7 % of the way out, 10.2 % tall
  const logoPart = { ...parts[0], at: { d: 0.256, r: 0.477, w: 0.422, h: 0.102, from: "outline" } };
  const r = partsAsSpots([], whole, [logoPart, parts[1]], fullFront, ctx);
  const logo = r.elements.find((e) => e.id === r.spots[0].elId);
  const t = pm.thingCm(logo, logo.spot.wCm, logo.spot.hCm);
  const at = pm.onTee(logo.spot, t);
  const look = panel.front.drop + L; // the 3D tee's top to its hem
  const top = at.down - pm.extentOf(t).hh;
  const boxTop = 0.256 * look - panel.front.drop;
  assert.ok(top >= boxTop - 0.1 && top <= boxTop + 0.102 * look, `logo top ${top} in the box from ${boxTop}`);
  near(at.across, 0.477 * panel.bodyHalf, 0.6, "across");
});

test("a tall print keeps its mockup height when our tee is cut narrower (grows up to 30 % wider, not squeezed)", () => {
  const area = { down: -8.5, across: 0, w: 60, h: 90 };
  const frame = { len: 63.5, drop: 8.5, half: 20.2 }; // our 3D tee: 0.28 as wide as long
  // the sheet's gold strokes (its tee 0.32 as wide as long): 0.381 down, 0.625 of the length tall, 0.942 of the half wide
  const part = { width: 482, height: 1000, at: { d: 0.381, r: -0.58, w: 0.942, h: 0.625, from: "outline" } };
  const p = photoPlace(part, "front", area, frame);
  const unit = frame.drop + frame.len;
  near((p.height / 100) * area.h, 0.625 * unit, 0.05, "the full height, as on the mockup");
  near((p.y / 100) * area.h + area.down, 0.381 * unit - frame.drop, 0.05, "the same top");
  assert.ok((p.width / 100) * area.w <= 0.942 * frame.half * 1.3 + 0.01, "at most 30 % wider than its box");
  // far off (a part 2x the box's shape): fits inside, grown only 30 %
  const odd = photoPlace({ width: 1000, height: 1000, at: { d: 0.2, r: 0, w: 0.2, h: 0.4, from: "outline" } }, "front", area, frame);
  near((odd.width / 100) * area.w, 0.2 * frame.half * 1.3, 0.05, "grown only 30 %");
});

// (21 Nov 2026, the owner: "the assistant should not be restricted by any print limits, it can place anywhere on the
// t-shirt; the print limits only for design myself") an Assistant-placed print keeps only the tee itself
test("an Assistant part is a free print: no margins, no biggest-print limit — only the tee's edges, the hem and the collar line", () => {
  const r = partsAsSpots([], whole, parts, fullFront, ctx);
  for (const sp of r.spots) assert.equal(r.elements.find((e) => e.id === sp.elId).spot.free, true, `${sp.label} is free`);
  const panel = pm.panelFor(garment, "M");
  const q = panel.front;
  // a print 0.3 cm from the hem, near the side: a customer's own is moved in, the Assistant's stays
  const box = { key: "spot-1", side: "front", label: "Front 1", from: null, wCm: 8, hCm: 6, downCm: r1(q.len - 6.3), acrossCm: r1(q.free.half - 4.5), base: "M", scale: "F" };
  const mine = pm.spotSizes(box, garment, { maxPrint }).M;
  assert.ok(mine.clamped.includes("hem"), `design-myself print moved in: ${mine.clamped}`);
  assert.ok(pm.spotProblem(box, garment, { maxPrint }), "design-myself print is refused there");
  const ai = pm.spotSizes({ ...box, free: true }, garment, { maxPrint }).M;
  assert.deepEqual(ai.clamped, [], "the Assistant's print stays where it is");
  assert.equal(ai.down, box.downCm);
  assert.equal(ai.across, box.acrossCm);
  assert.equal(pm.spotProblem({ ...box, free: true }, garment, { maxPrint }), null, "and is saved as it is");
  // bigger than the biggest print (35 x 52 at M): fine for the Assistant while it is on the tee
  const big = { ...box, wCm: 36, hCm: 56, downCm: 2, acrossCm: 0, free: true };
  assert.deepEqual(pm.spotSizes(big, garment, { maxPrint }).M.clamped, []);
  assert.ok(pm.spotSizes({ ...big, free: undefined }, garment, { maxPrint }).M.clamped.includes("big"));
  // still never past the tee: not above the collar line, not off the side or below the hem
  const off = pm.spotSizes({ ...box, downCm: 0, acrossCm: r1(q.free.half + 2), free: true }, garment, { maxPrint }).M;
  assert.ok(off.clamped.includes("side") && Math.abs(off.across) + off.w / 2 <= q.free.half + 1e-9, "kept on the tee");
});
const r1 = (n) => Math.round(n * 10) / 10;

test("the tall back print of the live test (its sheet box 0.128 as wide as tall, the part 0.144): full mockup height, same top", () => {
  const area = { down: -2, across: 0, w: 60, h: 90 };
  const frame = { len: 63.5, drop: 2.1, half: 20.2 };
  // the hand-measured box of the live sheet's concept 1 back (find_back.py): 74 x 579 px on a tee 440 px wide, 670 long
  const part = { width: 381, height: 2652, at: { d: 0.066, r: 0, w: 0.336, h: 0.864, from: "outline" } };
  const p = photoPlace(part, "back", area, frame);
  const unit = frame.drop + frame.len;
  near((p.height / 100) * area.h, 0.864 * unit, 0.05, "the mockup's height");
  near((p.y / 100) * area.h + area.down, 0.066 * unit - frame.drop, 0.05, "the mockup's top");
});

// (21 Nov 2026) a sleeve print where the mockup has it: along the sleeve from the shoulder seam (0) to the hem (1)
test("a sleeve piece goes on its sleeve where the mockup has it: a free print, its share of the sleeve's length, its shape kept", async () => {
  const { sleeveAsSpot } = await import("../src/studio/assistantV2.js");
  const leftSleeve = catalog.find((p) => p.key === "left-sleeve");
  const sl = pm.panelFor(garment, "M").left;
  const el = { id: "s1", type: "image", src: "/uploads/ai-designs/band.png", position: "left-sleeve", side: "left", rotation: 0, zIndex: 1, x: 4, y: 4, width: 92, height: 92 };
  // the band: from 55 % to 78 % down the sleeve, right across it; drawn 3.2 : 1
  const r = sleeveAsSpot([], el, { top: 0.55, bottom: 0.78, width: 1 }, leftSleeve, { ...ctx, piece: "sleeve2", shape: 3.2 });
  assert.ok(r, "placed");
  const put = r.elements.find((e) => e.id === "s1");
  assert.equal(put.aiLayout, "sleeve2");
  assert.equal(put.spot.free, true, "no print limits: only the sleeve");
  assert.equal(put.spot.side, "left");
  const t = pm.thingCm(put, put.spot.wCm, put.spot.hCm);
  const at = pm.onTee(put.spot, t);
  const { hw, hh } = pm.extentOf(t);
  near(2 * hw, Math.min(sl.w, 0.23 * sl.len * 3.2), 0.2, "as wide as its shape allows, not past the sleeve");
  near(2 * hw / (2 * hh), 3.2, 0.05, "its shape kept");
  near(at.down, (0.55 + 0.78) / 2 * sl.len, 0.3, "its middle where the mockup has it");
  // not placed: a turned piece, or no place
  assert.equal(sleeveAsSpot([], { ...el, rotation: 90 }, { top: 0.5, bottom: 0.7 }, leftSleeve, { ...ctx, shape: 2 }), null);
  assert.equal(sleeveAsSpot([], el, null, leftSleeve, { ...ctx, shape: 2 }), null);
});

test("a print the mockup has on the centre line goes exactly on it (within a tenth of the half-width); one further out keeps its place", () => {
  const area = { down: -2, across: 0, w: 60, h: 90 };
  const frame = { len: 63.5, drop: 2.1, half: 20.2 };
  const at = (r) => ({ width: 400, height: 2600, at: { d: 0.07, r, w: 0.2, h: 0.9, from: "outline" } });
  const mid = (p) => (p.x + p.width / 2) / 100 * area.w + (-area.across - area.w / 2);
  near(mid(photoPlace(at(0.06), "back", area, frame)), 0, 0.01, "snapped to the centre");
  near(mid(photoPlace(at(-0.09), "front", area, frame)), 0, 0.01, "snapped (other side)");
  near(Math.abs(mid(photoPlace(at(0.3), "back", area, frame))), 0.3 * frame.half, 0.05, "a print off to one side stays there");
});

// (22 Nov 2026, the Mountain trek test) "EST. 2026" near the right hem ran round the side seam on the 3D tee: the
// mockup's tee is a straight rectangle, ours narrows to the hem and turns away at its sides
test("a small part near the side stays on the tee's face (a hem tag is moved in); a chest logo and wide strokes keep the mockup's place", () => {
  const area = { down: -8.5, across: 0, w: 60, h: 90 };
  const frame = { len: 63.5, drop: 8.5, half: 21.5, hemHalf: 20.06 };
  const edges = (p) => {
    const left = (p.x / 100) * area.w - area.w / 2;
    return [left, left + (p.width / 100) * area.w];
  };
  // the hem tag as the real AI read it: its middle 0.69 of the half-width out, 0.35 of it wide, 93 % down
  const tag = { width: 700, height: 150, at: { d: 0.93, r: 0.69, w: 0.35, h: 0.03, from: "outline" } };
  const [, right] = edges(photoPlace(tag, "front", area, frame));
  near(right, FACE_SHARE * frame.hemHalf, 0.2, "its outer edge at the face's edge for the hem");
  const [, was] = edges(photoPlace(tag, "front", area, { ...frame, hemHalf: undefined }));
  assert.ok(was > right + 1, `it was ${was} cm out before, now ${right}`);
  const [leftSide] = edges(photoPlace({ ...tag, at: { ...tag.at, r: -0.69 } }, "front", area, frame));
  near(leftSide, -FACE_SHARE * frame.hemHalf, 0.2, "the same on the other side");
  // the chest badge (0.47 out, small, high up): nowhere near the side — exactly where the mockup has it
  const badge = { width: 500, height: 520, at: { d: 0.3, r: 0.47, w: 0.39, h: 0.13, from: "outline" } };
  const [bl, br] = edges(photoPlace(badge, "front", area, frame));
  near((bl + br) / 2, 0.47 * frame.half, 0.05, "the badge keeps its place");
  // wide strokes that run to the side on the mockup are left there
  const strokes = { width: 482, height: 1000, at: { d: 0.381, r: -0.58, w: 0.942, h: 0.625, from: "outline" } };
  const a = photoPlace(strokes, "front", area, frame);
  const b = photoPlace(strokes, "front", area, { ...frame, hemHalf: undefined });
  near(a.x, b.x, 0.001, "wide strokes are not moved");
});

test("what the Assistant says about a picked concept's pieces: each piece once, with its prints, in plain words", () => {
  const all = placedWords(
    [
      { piece: "front", prints: ["Front 1", "Front 2"] },
      { piece: "back", prints: ["Back 1"] },
      { piece: "sleeve", prints: ["Left sleeve 1"] },
      { piece: "sleeve2", prints: ["Right sleeve 1"] },
    ],
    true,
  );
  assert.equal(all, " — the front as 2 prints (Front 1 and Front 2), the back (Back 1), the left sleeve (Left sleeve 1) and the right sleeve (Right sleeve 1). Each is where it is on the concept you picked — move, resize or remove any of them on its own.");
  assert.ok(!/1 prints|is in/.test(all), "no \"1 prints\", no \"is in\"");
  // one piece, one print
  assert.equal(placedWords([{ piece: "back", prints: ["Back 1"] }], true), " — the back (Back 1). It is where it is on the concept you picked — move, resize or remove it.");
  // not measured on the sheet: where it sits in the drawing
  assert.match(placedWords([{ piece: "front", prints: ["Front 1", "Front 2"] }], false), /Each is where it sits on the tee/);
  // pieces on print areas (not cut into prints): only the list
  assert.equal(placedWords([{ piece: "front", prints: null, area: "Full Front" }, { piece: "back", prints: null, area: "Full Back" }], false), " — Full Front and Full Back.");
  assert.equal(placedWords([{ piece: "front", prints: null, area: "Full Front" }], false), ".");
  // one sleeve only: just "the sleeve"
  assert.match(placedWords([{ piece: "front", prints: null, area: "Full Front" }, { piece: "sleeve", prints: ["Left sleeve 1"] }], true), /Full Front and the sleeve \(Left sleeve 1\)\. It is where/);
});

// (23 Nov 2026, the first real GTA mockup) the back poster, as measured on the sheet: centred, 1.52 half-widths wide,
// three quarters of the tee tall. Grown to that height it came out 40.8 cm wide — side to side on our narrower tee.
test("a whole picture (a trend's poster) stays as wide as the mockup shows; a cut-out part still grows", () => {
  const fullBack = catalog.find((p) => p.key === "full-back");
  const wholeBack = { ...whole, id: "wb", position: "full-back", side: "back" };
  const at = { d: 0.166, r: -0.0025, w: 1.518, h: 0.75, from: "outline" };
  const poster = { url: "/uploads/ai-designs/poster.jpg", width: 3584, height: 4800, x: 0, y: 0, w: 1, h: 1, at };
  const sizeOf = (part) => {
    const r = partsAsSpots([], wholeBack, [part], fullBack, ctx);
    const el = r.elements.find((e) => e.id === r.spots[0].elId);
    return { ...pm.thingCm(el, el.spot.wCm, el.spot.hCm), across: pm.onTee(el.spot, pm.thingCm(el, el.spot.wCm, el.spot.hCm)).across };
  };
  const half = pm.panelFor(garment, "M").bodyHalf;
  const kept = sizeOf({ ...poster, whole: true });
  near(kept.w, 1.518 * half, 0.4, "the poster's width: 1.52 of the body's half-width, as on the mockup");
  near(kept.w / kept.h, 3584 / 4800, 0.01, "its own shape");
  near(kept.across, 0, 0.05, "on the centre line");
  const grown = sizeOf(poster);
  assert.ok(grown.w > kept.w * 1.1, `a cut-out part of the same box grows to the mockup's height (${grown.w} vs ${kept.w})`);
});

// (23 Nov 2026, the owner: the ready back designs looked small) a trend's ready back is printed as big as the print
// team's biggest back print, just under the collar, keeping its shape — and stays a print of its own on every size
test("a ready back design is printed big: 9:16 → 28.7 x 51 cm, 3:4 → 34 x 45.3 cm on M", () => {
  const tall = pm.bigBackPrint(garment, "M", maxPrint, 9 / 16);
  near(tall.h, 51, 0.01, "tall picture height");
  near(tall.w, 28.69, 0.01, "tall picture width");
  near(tall.down, 5, 0.01, "starts under the collar");
  const poster = pm.bigBackPrint(garment, "M", maxPrint, 3 / 4);
  near(poster.w, 34, 0.01, "3:4 width");
  near(poster.h, 45.33, 0.01, "3:4 height");
  const wide = pm.bigBackPrint(garment, "S", maxPrint, 1.5);
  assert.ok(wide.w <= 2 * pm.panelFor(garment, "S").back.half + 1e-9, "never past the side seam lines");
  // put on the tee as the room does: a spot of its own with that box, inside the print limits on every size
  const fullBack = catalog.find((p) => p.key === "full-back");
  const area = pm.areaBoxCm(fullBack, "M", garment);
  const el = { id: "rb", type: "image", src: "/uploads/trend-backs/b.webp", position: "full-back", side: "back", rotation: 0, zIndex: 2, aiLayout: "back", x: ((area.w - tall.w) / 2 / area.w) * 100, y: ((tall.down - area.down) / area.h) * 100, width: (tall.w / area.w) * 100, height: (tall.h / area.h) * 100 };
  const out = pm.elementToSpot([el], "rb", { positions: catalog, garment, size: "M", maxPrint });
  const now = out.find((e) => e.id === "rb");
  assert.ok(pm.isSpotKey(now.position), "a print of its own");
  near(now.spot.wCm, 29.7, 0.11, "spot width");
  near(now.spot.hCm, 52, 0.11, "spot height");
  assert.deepEqual(pm.spotSizes(now.spot, garment, { maxPrint }).M.clamped, [], "not shrunk on its own size");
  for (const size of ["XS", "S", "M", "L", "XL", "2XL", "3XL"]) {
    const at = pm.spotSizes(now.spot, garment, { maxPrint })[size];
    if (at) assert.ok(at.w > 25, `${size}: still big (${at.w.toFixed(1)} cm)`);
  }
});
