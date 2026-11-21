// A laid-out side in separate prints (21 Nov 2026, option A): the server cuts the whole-front picture into its parts
// (chest logo, strokes with their words, hem tag); the design room puts each part in a free place exactly where it sat
// in the whole picture — so the layout is the same, and each one can be moved, resized or removed on its own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { maxPrintBySize, positionsForGarment } from "../../server/data/printPositions.js";
import * as pm from "../src/studio/panelModel.js";
import { partsAsSpots, photoPlace } from "../src/studio/assistantV2.js";

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

test("a tall print keeps its mockup height when our tee is cut a little narrower (grows up to 15 % wider, not squeezed)", () => {
  const area = { down: -8.5, across: 0, w: 60, h: 90 };
  const frame = { len: 63.5, drop: 8.5, half: 20.2 }; // our 3D tee: 0.28 as wide as long
  // the sheet's gold strokes (its tee 0.32 as wide as long): 0.381 down, 0.625 of the length tall, 0.942 of the half wide
  const part = { width: 482, height: 1000, at: { d: 0.381, r: -0.58, w: 0.942, h: 0.625, from: "outline" } };
  const p = photoPlace(part, "front", area, frame);
  const unit = frame.drop + frame.len;
  near((p.height / 100) * area.h, 0.625 * unit, 0.05, "the full height, as on the mockup");
  near((p.y / 100) * area.h + area.down, 0.381 * unit - frame.drop, 0.05, "the same top");
  assert.ok((p.width / 100) * area.w <= 0.942 * frame.half * 1.15 + 0.01, "at most 15 % wider than its box");
  // far off (a part 2x the box's shape): fits inside, grown only 15 %
  const odd = photoPlace({ width: 1000, height: 1000, at: { d: 0.2, r: 0, w: 0.2, h: 0.4, from: "outline" } }, "front", area, frame);
  near((odd.width / 100) * area.w, 0.2 * frame.half * 1.15, 0.05, "grown only 15 %");
});
