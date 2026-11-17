// Free placement phase 3 (15 Nov 2026, docs/FREE_PLACEMENT.md): the panel editor, where a customer drags a print to
// any place on a side of the tee. What happens when a thing is let go (stays in its area, becomes a print of its own,
// joins a print within 1 cm, the 9th print refused), with no cm drift; snapping; the live label's words; a tap on the
// 3D tee in cm; zoom; players' names keep their width; one Undo per drop; old designs untouched.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { maxPrintBySize, positionsForGarment } from "../../server/data/printPositions.js";
import * as pm from "../src/studio/panelModel.js";
import * as pd from "../src/studio/panelDrag.js";
import { TEE_MODELS, areaCentreRaw, modelForGarment, placeArea, pointToCm, sideAtPoint } from "../src/studio/teeModel.js";

const src = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const { garment, design } = JSON.parse(src("../../server/tests/fixtures/threeSpotDesign.json"));
const oldPlacement = JSON.parse(src("./fixtures/oldPlacement.json"));
const catalog = positionsForGarment(garment).positions;
const maxPrint = maxPrintBySize(garment);
const ctx = (size = "M") => ({ catalog, garment, size, maxPrint });
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
const positionsOf = (els) => pm.withSpots(catalog, els, garment, maxPrint);
const posOf = (els, key) => positionsOf(els).find((p) => p.key === key);

// an old design: a logo on Left Chest, a heading on Centre Front
const logo = { id: "logo", type: "image", src: "/uploads/logo.png", position: "left-chest", side: "front", x: 10, y: 10, width: 80, height: 73.8, rotation: 0, zIndex: 1 };
const heading = { id: "head", type: "text", text: "TEAM", fontFamily: "Anton", fontSizePct: 14, color: "#fff", position: "centre-front", side: "front", x: 20, y: 10, width: 60, height: 15, rotation: 0, zIndex: 2 };
const oldDesign = [logo, heading];

// where a thing sits on the panel (cm), and the same thing let go with its centre at (x, y) on the panel
const where = (els, id, size = "M") => {
  const e = els.find((x) => x.id === id);
  const p = posOf(els, e.position);
  const view = pd.panelView(garment, size, p.side, maxPrint);
  return { ...pd.thingOnPanel(e, pd.panelBox(p, size, garment), view.w), view, pos: p, e };
};
const letGo = (els, id, x, y, size = "M") => {
  const w = where(els, id, size);
  return pd.placeOnPanel(w.e, pd.panelBox(w.pos, size, garment), w.view.w, w, x, y);
};
const sameCm = (a, b, what) => {
  near(a.x, b.x, 0.051, `${what} x`);
  near(a.y, b.y, 0.051, `${what} y`);
  near(a.w, b.w, 0.051, `${what} w`);
  near(a.h, b.h, 0.051, `${what} h`);
};

/* ---------- letting go ---------- */

test("1. a thing moved inside its print area stays there, exactly as the area editor leaves it", () => {
  const moved = { ...logo, x: 2, y: 20 };
  const out = pd.dropThing(oldDesign, moved, ctx());
  assert.deepEqual(out.elements, [moved, heading]);
  assert.equal(out.key, "left-chest");
  assert.equal(out.elements[1], heading); // the other things are the very same objects
  assert.ok(!out.elements.some((e) => e.spot));
});

test("3. dragged out of Left Chest to the middle: a print of its own, boxed round it, same cm on the tee", () => {
  const at = where(oldDesign, "logo");
  // (low on the front: higher up it would meet Centre Front on the bigger sizes and join the heading)
  const out = pd.dropThing(oldDesign, letGo(oldDesign, "logo", at.view.w / 2, 52), ctx());
  const el = out.elements.find((e) => e.id === "logo");
  assert.equal(el.position, "spot-1");
  assert.equal(out.key, "spot-1");
  assert.equal(out.left, "Left Chest");
  assert.equal(out.name, "Front 1");
  assert.deepEqual(out.joined, []);
  const box = el.spot;
  assert.equal(box.from, "left-chest");
  assert.equal(box.base, "M");
  assert.equal(box.scale, "F"); // a logo keeps its cm on every size
  near(box.acrossCm, 0, 0.051, "centred");
  near(box.wCm, at.w + 2 * pm.PAD_CM, 0.11, "boxed round it");
  // its size and place on the panel are where it was let go
  const now = where(out.elements, "logo");
  sameCm(now, { x: at.view.w / 2, y: 52, w: at.w, h: at.h }, "the logo");
  // the heading stayed on Centre Front, untouched
  assert.equal(out.elements.find((e) => e.id === "head"), heading);
  // and the server's checks pass
  assert.equal(pm.spotProblem(box, garment, { maxPrint }), null);
  assert.equal(pm.overlapPair([posOf(out.elements, "spot-1")], [posOf(out.elements, "centre-front")], garment), null);
});

test("2. a free place's only thing moved: the box follows it, measured on the size on screen", () => {
  const els = design.elements.map((e, i) => ({ id: `e${i + 1}`, ...e }));
  const before = where(els, "e1");
  const out = pd.dropThing(els, letGo(els, "e1", before.x - 3, before.y + 2), ctx());
  const el = out.elements.find((e) => e.id === "e1");
  assert.equal(el.position, "spot-1");
  assert.equal(out.key, "spot-1");
  assert.equal(out.left, null);
  sameCm(where(out.elements, "e1"), { ...before, x: before.x - 3, y: before.y + 2 }, "the logo");
  assert.equal(el.spot.label, "Front 1"); // its name stays
  // its other spots are untouched
  for (const id of ["e2", "e3", "e4"]) assert.equal(out.elements.find((e) => e.id === id), els.find((e) => e.id === id));
});

test("2. on another tee size a free place is measured on that size from then on (what the customer sees is kept)", () => {
  const els = design.elements.map((e, i) => ({ id: `e${i + 1}`, ...e }));
  const before = where(els, "e2", "XL"); // "IDENTEE", a growing print made on M
  const out = pd.dropThing(els, letGo(els, "e2", before.x, before.y + 1, "XL"), ctx("XL"));
  const el = out.elements.find((e) => e.id === "e2");
  assert.equal(el.spot.base, "XL");
  sameCm(where(out.elements, "e2", "XL"), { ...before, y: before.y + 1 }, "the words on XL");
  near(el.fontSizePct * el.spot.hCm, els[1].fontSizePct * before.pos.cmBySize.XL[1], 0.6, "the letters keep their cm size");
});

test("3. joined: a print let go within 1 cm of another becomes one print with it (the other keeps its name)", () => {
  const els = design.elements.map((e, i) => ({ id: `e${i + 1}`, ...e }));
  const logoAt = where(els, "e1"); // Front 1, 9 x 9 cm
  const words = where(els, "e2"); // Front 2
  // the words' top 0.5 cm under the logo's bottom edge, centred (they reach under the logo)
  const y = logoAt.y + logoAt.hh + 0.5 + words.hh;
  const x = words.view.w / 2;
  const out = pd.dropThing(els, letGo(els, "e2", x, y), ctx());
  assert.deepEqual(out.joined, ["Front 1"]);
  assert.equal(out.key, "spot-1");
  const front = out.elements.filter((e) => e.side === "front");
  assert.deepEqual([...new Set(front.map((e) => e.position))], ["spot-1"]);
  assert.equal(front[0].spot.label, "Front 1");
  // both kept their cm size and place on the panel
  sameCm(where(out.elements, "e1"), logoAt, "the logo");
  sameCm(where(out.elements, "e2"), { ...words, x, y }, "the words");
  assert.equal(out.otherSize, false);
  // the joined box: round both, 0.5 cm all round
  near(front[0].spot.hCm, 2 * logoAt.hh + 0.5 + 2 * words.hh + 2 * pm.PAD_CM, 0.21, "the joined height");
  assert.equal(front[0].spot.scale, "G"); // the words grew with the tee: the joined print does too
});

test("3. a thing let go on a print area that has things joins it: the area's things keep their cm place", () => {
  const head = where(oldDesign, "head");
  // the logo dragged out of Left Chest to sit just right of the heading, overlapping Centre Front's box
  const out = pd.dropThing(oldDesign, letGo(oldDesign, "logo", head.x + head.hw + 0.3 + 4, head.y), ctx());
  assert.deepEqual(out.joined, ["Centre Front"]);
  const spot = out.elements.find((e) => e.id === "logo").spot;
  assert.equal(out.elements.find((e) => e.id === "head").position, spot.key);
  sameCm(where(out.elements, "head"), head, "the heading");
  assert.equal(pm.overlapPair(pm.spotsIn(out.elements).map((b) => posOf(out.elements, b.key)), [], garment), null);
});

test("3. a thing taken away from the other things of its free place: a print of its own, theirs boxed round them", () => {
  const els = [
    { id: "a", type: "image", src: "/a.png", position: "spot-1", side: "front", x: 0, y: 0, width: 40, height: 100, rotation: 0, spot: { key: "spot-1", side: "front", label: "Front 1", from: null, downCm: 10, acrossCm: 0, wCm: 25, hCm: 10, base: "M", scale: "G" } },
    { id: "b", type: "image", src: "/b.png", position: "spot-1", side: "front", x: 60, y: 0, width: 40, height: 100, rotation: 0, spot: { key: "spot-1", side: "front", label: "Front 1", from: null, downCm: 10, acrossCm: 0, wCm: 25, hCm: 10, base: "M", scale: "G" } },
  ];
  const a = where(els, "a");
  const b = where(els, "b");
  const out = pd.dropThing(els, letGo(els, "b", b.x, 40), ctx());
  assert.equal(out.key, "spot-2");
  assert.equal(out.name, "Front 2");
  const spots = pm.spotsIn(out.elements);
  assert.equal(spots.length, 2);
  const first = spots.find((s) => s.key === "spot-1");
  near(first.wCm, a.w + 2 * pm.PAD_CM, 0.11, "Front 1 boxed round what is left");
  sameCm(where(out.elements, "a"), a, "the thing left behind");
  sameCm(where(out.elements, "b"), { ...b, y: 40 }, "the thing taken away");
});

test("4. the 9th free place is refused and the thing goes back; joining it to another print is fine", () => {
  // 8 small spots down the back
  const els = Array.from({ length: 8 }, (_, i) => {
    const key = `spot-${i + 1}`;
    return { id: `s${i}`, type: "image", src: "/x.png", position: key, side: "back", x: 0, y: 0, width: 100, height: 100, rotation: 0, spot: { key, side: "back", label: `Back ${i + 1}`, from: null, downCm: 8 + i * 7, acrossCm: 0, wCm: 5, hCm: 5, base: "M", scale: "F" } };
  });
  const design9 = [...els, logo];
  const at = where(design9, "logo");
  const out = pd.dropThing(design9, letGo(design9, "logo", at.view.w / 2, 40), ctx());
  assert.equal(out.refused, pd.CAP_MSG);
  assert.equal(out.elements, design9);
  assert.equal(out.key, "left-chest");
  // within its area it still moves
  assert.ok(!pd.dropThing(design9, { ...logo, x: 0 }, ctx()).refused);
});

test("4. two big prints joined into one bigger than the biggest print: refused with the reason", () => {
  const big = (id, key, label, downCm) => ({ id, type: "image", src: "/x.png", position: key, side: "front", x: 0, y: 0, width: 100, height: 100, rotation: 0, spot: { key, side: "front", label, from: null, downCm, acrossCm: 0, wCm: 30, hCm: 30, base: "M", scale: "G" } });
  const els = [big("a", "spot-1", "Front 1", 5), big("b", "spot-2", "Front 2", 37)];
  const b = where(els, "b");
  const out = pd.dropThing(els, letGo(els, "b", b.x, b.y - 2.5), ctx()); // 0.5 cm under the first
  assert.match(out.refused, /would be one print with Front 1, and it is bigger than the biggest print \(35 x 52 cm\)\. Leave at least 1 cm between them/);
  assert.equal(out.elements, els);
});

test("no cm drift: 20 drops back and forth leave the box and the thing exactly where they were", () => {
  let els = design.elements.map((e, i) => ({ id: `e${i + 1}`, ...e }));
  const start = where(els, "e2");
  // (the first drop boxes the words tightly: letters 85 % of the box need a box 1.15 x their size)
  const first = pd.dropThing(els, letGo(els, "e2", start.x, start.y), ctx()).elements;
  sameCm(where(first, "e2"), start, "after the first drop");
  const box0 = { ...first.find((e) => e.id === "e2").spot };
  els = first;
  for (let i = 0; i < 20; i++) {
    const dx = i % 2 ? -2 : 2;
    const now = where(els, "e2");
    els = pd.dropThing(els, letGo(els, "e2", now.x + dx, now.y), ctx()).elements;
  }
  const end = where(els, "e2");
  sameCm(end, start, "after 20 drops");
  const box = els.find((e) => e.id === "e2").spot;
  for (const k of ["downCm", "acrossCm", "wCm", "hCm"]) near(box[k], box0[k], 0.11, k);
  // and a drop where it already is changes nothing at all after the first
  const once = pd.dropThing(els, letGo(els, "e2", end.x, end.y), ctx()).elements;
  const twice = pd.dropThing(once, letGo(once, "e2", end.x, end.y), ctx()).elements;
  assert.deepEqual(twice.find((e) => e.id === "e2"), once.find((e) => e.id === "e2"));
});

test("players' names: a free place with the name keeps at least 30 cm (or the safe width), so long names stay big", () => {
  const name = { id: "n", type: "text", text: "PLAYER", role: "name", fontFamily: "Anton", fontSizePct: 8, color: "#fff", position: "full-back", side: "back", x: 30, y: 2, width: 40, height: 9, rotation: 0 };
  const at = where([name], "n");
  const out = pd.dropThing([name], letGo([name], "n", at.x, 64), ctx()); // down to the hem: out of Full Back
  const box = out.elements[0].spot;
  assert.ok(box.wCm >= 30, `${box.wCm} cm wide`);
  near(where(out.elements, "n").w, at.w, 0.051, "the name's own size");
  // a sleeve has less room: the safe width
  const onSleeve = { id: "m", type: "text", text: "PLAYER", role: "name", fontFamily: "Anton", fontSizePct: 15, color: "#fff", position: "left-sleeve", side: "left", x: 10, y: 10, width: 80, height: 18, rotation: 0 };
  const s = where([onSleeve], "m");
  const out2 = pd.dropThing([onSleeve], letGo([onSleeve], "m", s.x, s.y + 9), ctx());
  assert.equal(out2.refused, undefined);
  const view = pd.panelView(garment, "M", "left", maxPrint);
  assert.ok(out2.elements[0].spot.wCm <= view.safe.x1 - view.safe.x0 + 0.11);
});

test("a sleeve print stays on the sleeve's centre line (its box), the thing keeps its own place", () => {
  const els = design.elements.map((e, i) => ({ id: `e${i + 1}`, ...e }));
  const before = where(els, "e4");
  const out = pd.dropThing(els, letGo(els, "e4", before.x + 0.5, before.y + 3), ctx());
  const el = out.elements.find((e) => e.id === "e4");
  assert.equal(el.spot.acrossCm, 0);
  sameCm(where(out.elements, "e4"), { ...before, x: before.x + 0.5, y: before.y + 3 }, "the number");
  // off the line its box widens on both sides, so the biggest sleeve print (10 cm) limits how far it can go
  const view = before.view;
  near(view.limit.x1 - view.w / 2, 5 - pd.INSET_CM, 1e-9, "the sleeve's limit");
  const kept = pd.clampToLimit({ ...before, x: before.x + 9 }, view.limit);
  const far = pd.dropThing(els, letGo(els, "e4", kept.x, kept.y), ctx()).elements.find((e) => e.id === "e4").spot;
  assert.ok(far.wCm <= 10, `${far.wCm} cm`);
});

test("arrow keys and Centre move a thing through the same rule, kept inside the safe zone", () => {
  const els = design.elements.map((e, i) => ({ id: `e${i + 1}`, ...e }));
  const before = where(els, "e1");
  const right = pd.movedThing(els, "e1", { dx: 0.5 }, ctx());
  near(where(els.map((e) => (e.id === "e1" ? right : e)), "e1").x, before.x + 0.5, 0.01, "half a cm to the right");
  const centred = pd.dropThing(els, pd.movedThing(els, "e1", { centre: true }, ctx()), ctx());
  near(centred.elements.find((e) => e.id === "e1").spot.acrossCm, 0, 0.051, "centred");
  // pushed up past the collar: stops at the limit (its box then starts on the safe line)
  const up = pd.dropThing(els, pd.movedThing(els, "e1", { dy: -30 }, ctx()), ctx());
  const box = up.elements.find((e) => e.id === "e1").spot;
  assert.ok(box.downCm >= 3 - 1e-9, `${box.downCm} cm below the collar`);
  assert.equal(pm.spotProblem(box, garment, { maxPrint }), null);
  assert.deepEqual(pm.spotPosition(box, garment, { maxPrint }).clamped, {});
});

test("the limit keeps a thing's box inside the safe zone on every side, so the print files never move it", () => {
  const view = pd.panelView(garment, "M", "front", maxPrint);
  for (const [x, y] of [[-50, 20], [99, 20], [19, -10], [19, 99]]) {
    const els = [{ ...logo }];
    const at = where(els, "logo");
    const kept = pd.clampToLimit({ ...at, x, y }, view.limit);
    const out = pd.dropThing(els, letGo(els, "logo", kept.x, kept.y), ctx());
    const box = out.elements[0].spot;
    assert.equal(pm.spotProblem(box, garment, { maxPrint }), null, `${x}, ${y}`);
    assert.deepEqual(pm.spotPosition(box, garment, { maxPrint }).clamped.M, undefined, `${x}, ${y}: not moved on M`);
  }
  assert.deepEqual(pd.clampToLimit({ x: 19, y: 1, hw: 2, hh: 2 }, view.limit).hit, ["collar"]);
  assert.deepEqual(pd.clampToLimit({ x: 0, y: 30, hw: 2, hh: 2 }, view.limit).hit, ["side"]);
});

/* ---------- snapping ---------- */

test("snapping: in at 1.5 cm, out at 1.6 cm; the tag names the place", () => {
  const view = pd.panelView(garment, "M", "front", maxPrint);
  const lines = pd.snapLines(catalog, "front", "M", garment, view.w);
  const mid = view.w / 2;
  const t = { x: mid + 1.5, y: 30, hw: 3, hh: 3 };
  assert.equal(pd.snapDrag(t, lines).x, mid);
  assert.equal(pd.snapDrag(t, lines).tag, "Centre line");
  assert.equal(pd.snapDrag({ ...t, x: mid + 1.6 }, lines).x, mid + 1.6);
  assert.equal(pd.snapDrag({ ...t, x: mid + 1.6 }, lines).guides.length, 0);
  // Left Chest: its centre line and its top line (the 3D tee's start line on M)
  const lc = pd.panelBox(catalog.find((p) => p.key === "left-chest"), "M", garment);
  const onLc = pd.snapDrag({ x: pd.panelX("front", view.w, lc.across) - 1, y: lc.down + 3 + 1.2, hw: 3, hh: 3 }, lines);
  assert.equal(onLc.x, pd.panelX("front", view.w, lc.across));
  near(onLc.y - 3, lc.down, 1e-9, "top edge on Left Chest's top line");
  assert.equal(onLc.tag, "Left Chest");
  // the back: Left Chest has no line there; sleeves: the centre line only
  assert.ok(!pd.snapLines(catalog, "back", "M", garment, view.w).v.some((l) => l.labels.includes("Left Chest")));
  assert.deepEqual(pd.snapLines(catalog, "left", "M", garment, 21.6).v.length, 1);
});

/* ---------- the live label ---------- */

test("the live label says the size and place in a shopper's words, left / right as worn", () => {
  assert.equal(pd.liveLabel({ side: "front", box: { down: 8.2, across: 0.3, w: 24.2, h: 18.4 } }), "24 × 18 cm · 8 cm below the collar · centred");
  assert.equal(pd.liveLabel({ side: "front", box: { down: 8, across: 9.1, w: 9, h: 9 } }), "9 × 9 cm · 8 cm below the collar · 9 cm to your left");
  assert.equal(pd.liveLabel({ side: "front", box: { down: 8, across: -9.1, w: 9, h: 9 }, asWorn: true }), "9 × 9 cm · 8 cm below the collar · 9 cm to your right (as you wear it)");
  assert.equal(pd.liveLabel({ side: "back", box: { down: 12.3, across: 4.3, w: 30, h: 38 } }), "30 × 38 cm · 12 cm below the collar · 4.5 cm to your left");
  assert.equal(pd.liveLabel({ side: "left", box: { down: 4.1, across: 0, w: 8, h: 6 } }), "8 × 6 cm · 4 cm below the shoulder seam");
  assert.equal(pd.liveLabel({ side: "front", box: { down: 3, across: 0, w: 9, h: 9 }, hit: "collar" }), "9 × 9 cm · Can't go nearer the collar");
  assert.equal(pd.liveLabel({ side: "right", box: { down: 3, across: 0, w: 9, h: 9 }, hit: "collar" }), "9 × 9 cm · Can't go nearer the shoulder seam");
  assert.equal(pd.liveLabel({ side: "front", box: { down: 3, across: 0, w: 35, h: 30 }, big: [35, 52] }), "35 × 30 cm · Biggest print here: 35 × 52 cm");
  // the panel measures the thing's outline: its top edge from the collar seam, its middle from the centre line
  const view = pd.panelView(garment, "M", "back", maxPrint);
  assert.deepEqual(pd.labelBox({ x: view.w / 2 - 5, y: 20, hw: 2, hh: 3 }, "back", view.w), { down: 17, across: 5, w: 4, h: 6 }); // the back: screen left is the wearer's left
});

/* ---------- a tap on the 3D tee in cm ---------- */

test("a tapped point on the 3D tee in cm: the exact inverse of where the tee draws a print (XS, M, 3XL)", () => {
  const model = modelForGarment(garment);
  for (const size of ["XS", "M", "3XL"]) {
    const L = pm.chartRow(garment, size).length * 2.54;
    for (const box of [
      { key: "spot-1", side: "front", label: "Front 1", from: null, downCm: 12, acrossCm: 7, wCm: 10, hCm: 10, base: size, scale: "F" },
      { key: "spot-2", side: "back", label: "Back 1", from: null, downCm: 20, acrossCm: -5, wCm: 10, hCm: 10, base: size, scale: "F" },
      { key: "spot-3", side: "left", label: "Left sleeve 1", from: null, downCm: 4, acrossCm: 0, wCm: 8, hCm: 8, base: size, scale: "F" },
    ]) {
      const spot = placeArea(model, pm.spotPosition(box, garment, { maxPrint }), size, L);
      const [x, y, z] = areaCentreRaw(spot); // the middle of the print, raw metres
      const cm = pointToCm(model, [x, y, z + spot.h / 2], box.side, L); // its top edge's middle
      near(cm.down, box.downCm, 1e-6, `${size} ${box.side} down`);
      near(cm.across, box.acrossCm, 1e-6, `${size} ${box.side} across`);
    }
  }
  // which side a point is on: a sleeve where the fabric faces sideways near the shoulder, else the half looked at
  const m = TEE_MODELS.oversized;
  assert.equal(sideAtPoint(m, [0.3, 0, m.anchors.left.shoulder - 0.05], [1, 0, 0], true), "left");
  assert.equal(sideAtPoint(m, [-0.3, 0, m.anchors.right.shoulder - 0.05], [-1, 0, 0], true), "right");
  assert.equal(sideAtPoint(m, [0.05, -0.1, 1.2], [0, -1, 0], true), "front");
  assert.equal(sideAtPoint(m, [0.05, 0.1, 1.2], [0, 1, 0], false), "back");
  assert.equal(sideAtPoint(m, [0.2, 0, 1.0], [1, 0, 0], true), "front"); // the body's side, below the sleeve
  // seen from the front (or the back) most of the sleeve faces the camera: out past the body, it is still the sleeve
  assert.equal(sideAtPoint(m, [0.26, -0.05, m.anchors.left.shoulder - 0.1], [0.2, -0.95, 0], true), "left");
  assert.equal(sideAtPoint(m, [-0.24, 0.05, m.anchors.right.shoulder - 0.06], [-0.1, 0.98, 0], false), "right");
  assert.equal(sideAtPoint(m, [0.17, -0.1, m.anchors.left.shoulder - 0.1], [0, -1, 0], true), "front"); // inside the body
  assert.equal(sideAtPoint(m, [0.26, -0.1, m.anchors.left.shoulder - 0.25], [0, -1, 0], true), "front"); // below the sleeve's reach
  const r = TEE_MODELS.regular;
  assert.equal(sideAtPoint(r, [0.23, -0.05, r.anchors.left.shoulder - 0.05], [0.1, -0.95, 0], true), "left");
  assert.equal(sideAtPoint(r, [0.12, -0.1, r.anchors.left.shoulder - 0.05], [0, -1, 0], true), "front");
});

test("Anywhere: a 10 x 10 cm print centred on the tap, moved inside the safe zone; a tap on a print finds it", () => {
  const box = pd.anywhereBox({ side: "front", across: 3, down: 25 }, { garment, size: "M", maxPrint, elements: [] });
  assert.deepEqual([box.key, box.label, box.wCm, box.hCm, box.downCm, box.acrossCm, box.base, box.scale], ["spot-1", "Front 1", 10, 10, 20, 3, "M", "F"]);
  const high = pd.anywhereBox({ side: "front", across: 0, down: 1 }, { garment, size: "M", maxPrint, elements: [] });
  assert.ok(high.downCm >= 3, "kept clear of the collar");
  const sleeve = pd.anywhereBox({ side: "right", across: 4, down: 6 }, { garment, size: "M", maxPrint, elements: [] });
  assert.equal(sleeve.acrossCm, 0);
  assert.equal(pm.spotProblem(sleeve, garment, { maxPrint }), null);
  // on Centre Front's heading, or within 1 cm of it: that print
  const head = where(oldDesign, "head");
  const onIt = pd.anywhereBox({ side: "front", across: 0, down: head.y }, { garment, size: "M", maxPrint, elements: oldDesign });
  assert.equal(pd.printAt(onIt, oldDesign, ctx())?.key, "centre-front");
  // 2.6 cm under Centre Front on M is still Centre Front on 3XL (it is bigger and lower there): that print too
  const under = pd.anywhereBox({ side: "front", across: 0, down: 48 }, { garment, size: "M", maxPrint, elements: oldDesign });
  assert.equal(pd.printAt(under, oldDesign, ctx())?.key, "centre-front");
  const free = pd.anywhereBox({ side: "front", across: 0, down: 51 }, { garment, size: "M", maxPrint, elements: oldDesign });
  assert.equal(pd.printAt(free, oldDesign, ctx()), null);
  assert.equal(pd.spotCount(design.elements), 4);
});

test("Anywhere near a print: a smaller box (10, then 8, then 6 cm) still starts one there; else the print in the way", () => {
  const start = (down) => pd.startBox({ side: "front", across: 0, down }, { ...ctx(), elements: oldDesign });
  assert.equal(start(51).box.wCm, 10);
  assert.equal(start(50).box.wCm, 8); // a 10 cm box would meet Centre Front on a bigger size
  assert.equal(start(49).box.wCm, 6);
  for (const b of [start(51).box, start(50).box, start(49).box]) assert.equal(pd.printAt(b, oldDesign, ctx()), null);
  // a 6 cm box under the tap would meet the heading on the bigger sizes: one moved away from it, the tap 0.5 cm inside
  // its top edge (a tap 4 cm under a print was turned down before, 15 Nov 2026 review)
  const away = start(46).box;
  assert.deepEqual([away.wCm, away.downCm, away.acrossCm], [6, 45.5, 0]);
  assert.equal(pd.printAt(away, oldDesign, ctx()), null);
  // in the way even then: on the heading (here) or only on the bigger sizes (not here — the message says so)
  assert.deepEqual([start(30).hit.key, start(30).here], ["centre-front", true]);
  assert.deepEqual([start(44).hit.key, start(44).here, start(44).otherSize], ["centre-front", false, true]);
});

test("the area editor in a free place: a thing dragged to its print's edge is kept inside the panel's limit", () => {
  const els = design.elements.map((e, i) => ({ id: `e${i + 1}`, ...e }));
  const before = where(els, "e4");
  // (the area editor lets a thing's middle reach its print's edge; again and again, the sleeve print would grow)
  const pushed = letGo(els, "e4", before.x - 9, before.y);
  const kept = pd.keepInside(els, pushed, ctx());
  const on = where(els.map((e) => (e.id === "e4" ? kept : e)), "e4");
  near(on.x, pd.clampToLimit({ ...before, x: before.x - 9 }, before.view.limit).x, 1e-6, "stopped at the limit");
  const box = pm.reboxSpot(els.map((e) => (e.id === "e4" ? kept : e)), before.pos.spot, { garment, maxPrint }).elements.find((e) => e.id === "e4").spot;
  assert.ok(box.wCm <= 10, `${box.wCm} cm`);
  // a move that stays inside comes back as the very same element (nothing else changes)
  const small = letGo(els, "e4", before.x + 0.5, before.y);
  assert.equal(pd.keepInside(els, small, ctx()), small);
  // a print area (not a free place) is never touched
  assert.equal(pd.keepInside(oldDesign, { ...logo, x: 2 }, ctx()).x, 2);
});

/* ---------- zoom ---------- */

test("zoom: Zoom in fits the selected thing to 60 % of the canvas (at most 6x); never panned into empty space", () => {
  const v = { cw: 343, ch: 480, k: 6, pw: 40, ph: 70, ox: 1, oy: 6 };
  const whole = pd.wholeView(v);
  assert.equal(whole.z, 1);
  near(whole.tx, (343 - 240) / 2, 1e-9, "centred across");
  const logoBox = { x0: 25, y0: 8, x1: 34, y1: 17 }; // 9 x 9 cm
  const z = pd.zoomToBox(v, logoBox);
  near(z.z, Math.min(6, (0.6 * 343) / (9 * 6)), 1e-9, "60 % of the width");
  near(z.tx + (29.5 + 1) * 6 * z.z, 343 / 2, 1e-9, "the logo in the middle across");
  near(z.ty + (12.5 + 6) * 6 * z.z, 480 / 2, 1e-9, "and down");
  assert.equal(pd.zoomToBox(v, { x0: 10, y0: 10, x1: 10.5, y1: 10.5 }).z, pd.MAX_ZOOM);
  assert.equal(pd.zoomToBox(v, { x0: 0, y0: 0, x1: 40, y1: 60 }).z, 1);
  // panned far away: a quarter of the canvas still shows the tee
  const far = pd.clampView(v, { z: 3, tx: 5000, ty: -9000 });
  assert.equal(far.tx, 343 * 0.75);
  assert.equal(far.ty, 480 * 0.25 - 70 * 6 * 3);
  // two fingers: the point under them stays put
  const pinch = pd.zoomAt(v, z, 1.2, 100, 100);
  const before = { x: (100 - z.tx) / (v.k * z.z), y: (100 - z.ty) / (v.k * z.z) };
  const after = { x: (100 - pinch.tx) / (v.k * pinch.z), y: (100 - pinch.ty) / (v.k * pinch.z) };
  near(after.x, before.x, 1e-9, "x under the fingers");
  near(after.y, before.y, 1e-9, "y under the fingers");
});

/* ---------- the design room ---------- */

test("one Undo per drop: the panel's drop is one commit (no joining key), the 3D tee waits while a thing is outside its print", () => {
  const room = src("../src/studio/DesignRoomPage.jsx");
  const drop = /const panelDrop = \(next\) => \{[\s\S]*?\n {2}\};/.exec(room)?.[0] || "";
  assert.ok(drop, "panelDrop is in the room");
  assert.equal(drop.match(/commit\(/g)?.length, 1);
  assert.doesNotMatch(drop, /soft:/);
  const editor = src("../src/studio/PanelEditor.jsx");
  assert.match(editor, /if \(inside\) props\.onLive\?\.\(/);
});

test("old designs: the panel shows their prints where the 3D tee does, and nothing about them changes", () => {
  // a design with no free places gets the server's own list (the same array)
  assert.equal(pm.withSpots(catalog, oldDesign, garment, maxPrint), catalog);
  // a free place's box on the panel is its box (areaBoxCm); a print area with the print team's start line too
  const els = design.elements.map((e, i) => ({ id: `e${i + 1}`, ...e }));
  for (const p of positionsOf(els).filter((x) => x.spot || x.collarCm)) {
    for (const size of ["S", "M", "3XL"]) assert.deepEqual(pd.panelBox(p, size, garment), pm.areaBoxCm(p, size, garment));
  }
  // Centre Front / the chests / Full Back: where the 3D tee draws them (its start line × the size's scale)
  const model = modelForGarment(garment);
  for (const key of ["centre-front", "left-chest", "full-back"]) {
    const p = catalog.find((x) => x.key === key);
    for (const size of ["S", "M", "3XL"]) {
      const L = pm.chartRow(garment, size).length * 2.54;
      const spot = placeArea(model, p, size, L);
      const top = pointToCm(model, [spot.x, 0, spot.top], p.side, L);
      near(pd.panelBox(p, size, garment).down, top.down, 1e-6, `${key} ${size}`);
    }
  }
  // every old print area on every size: the 3D tee places it exactly as the Phase 1 code did (the Phase 2 fixture)
  for (const row of oldPlacement.placeArea) {
    assert.deepEqual(placeArea(model, catalog.find((x) => x.key === row.key), row.size, oldPlacement.lengthIn[row.size] * 2.54), row.out, `${row.key} ${row.size}`);
  }
  // and a drop inside its print area keeps an old design an old design: no free place, nothing else touched
  const kept = pd.dropThing(oldDesign, { ...heading, x: 25 }, ctx());
  assert.deepEqual(pm.spotsIn(kept.elements), []);
  assert.equal(kept.elements[0], logo);
});

/* ---------- the 15 Nov 2026 review of phase 3 ---------- */

const clampedSizes = (box) => Object.entries(pm.spotPosition(box, garment, { maxPrint }).clamped || {}).filter(([, why]) => why?.length);

test("the limit holds on every tee size: a print let go at its edge is pressed where it is on all of them (F and G)", () => {
  const els = design.elements.map((e, i) => ({ id: `e${i + 1}`, ...e }));
  for (const id of ["e1", "e2", "e3"]) {
    const at = where(els, id);
    const L = pd.rulesFor(at.view, at, pd.ruleHints(at.pos, at.e, pd.panelBox(at.pos, "M", garment))).limit;
    for (const [x, y] of [[at.x, L.y1 - at.hh], [L.x1 - at.hw, at.y], [L.x0 + at.hw, L.y0 + at.hh], [L.x1 - at.hw, L.y1 - at.hh]]) {
      const out = pd.dropThing(els, letGo(els, id, x, y), ctx());
      assert.equal(out.refused, undefined, `${id} at ${x}, ${y}`);
      const box = pm.spotsIn(out.elements).find((s) => s.key === out.key);
      assert.deepEqual(clampedSizes(box), [], `${id} at ${x}, ${y}: moved on no size`);
    }
  }
});

test("a players' name let go off the centre stays where it was let go (its 30 cm box moves in round it)", () => {
  const name = { id: "n", type: "text", text: "PLAYER", role: "name", fontFamily: "Anton", fontSizePct: 8, color: "#fff", position: "full-back", side: "back", x: 30, y: 2, width: 40, height: 9, rotation: 0 };
  const at = where([name], "n");
  const L = pd.rulesFor(at.view, at, pd.ruleHints(at.pos, name, pd.panelBox(at.pos, "M", garment))).limit;
  for (const [dx, y] of [[8, 60], [-10, 55]]) {
    const k = pd.clampToLimit({ ...at, x: at.view.w / 2 + dx, y }, L);
    const out = pd.dropThing([name], letGo([name], "n", k.x, k.y), ctx());
    assert.equal(out.refused, undefined);
    const box = out.elements[0].spot;
    assert.ok(box.wCm >= 30 && box.acrossCm !== 0, JSON.stringify(box));
    const now = where(out.elements, "n");
    near(now.x, k.x, 0.051, "across");
    near(now.y, k.y, 0.051, "down");
    assert.deepEqual(clampedSizes(box), []);
  }
});

test("a nudge on a tee size that holds a print in keeps the print's own measurements (not that size's)", () => {
  const els = design.elements.map((e, i) => ({ id: `e${i + 1}`, ...e }));
  // Front 2 (it grows) low on the front: on 2XL and 3XL the hem holds it up
  const low = { ...els[1].spot, downCm: 53 };
  const held = els.map((e) => (e.position === "spot-2" ? { ...e, spot: low } : e));
  assert.deepEqual(clampedSizes(low).map(([s]) => s), ["2XL", "3XL"]);
  const out = pd.dropThing(held, pd.movedThing(held, "e2", { dx: 0.5 }, ctx("3XL")), ctx("3XL"));
  const box = out.elements.find((e) => e.id === "e2").spot;
  assert.equal(box.base, "M"); // (re-based on 3XL it would take 3XL's held-up place to every size)
  assert.ok(box.acrossCm > 0 && box.acrossCm <= 0.5, `${box.acrossCm}`);
  near(box.downCm, 53, 0.5, "down");
});

test("the print's own editor (a free place): through the drop rule, kept together; too big refused; near a print joins", () => {
  const els = design.elements.map((e, i) => ({ id: `e${i + 1}`, ...e }));
  // two things in Front 2, 3.8 cm apart: moved in the print's own editor they stay one print (the panel would split them)
  const e2 = els[1];
  const two = [...els.map((e) => (e.id === "e2" ? { ...e2, x: 58, width: 40 } : e)), { ...e2, id: "e5", x: 2, width: 40 }];
  const moved = { ...two.find((e) => e.id === "e2"), x: 59 };
  assert.equal(pd.dropThing(two, moved, { ...ctx(), together: true }).key, "spot-2");
  assert.notEqual(pd.dropThing(two, moved, ctx()).key, "spot-2");
  // the sleeve's words made far bigger than the sleeve's biggest print: refused, with why
  const e4 = els[3];
  const big = pd.dropThing(els, { ...e4, x: -60, y: -60, width: 220, height: 220, fontSizePct: e4.fontSizePct * 2.4 }, { ...ctx(), together: true });
  assert.match(big.refused || "", /bigger than the biggest print/);
  // Front 1's logo moved to within 1 cm of Front 2: one print (said, with an Undo), not two overlapping
  const a = where(els, "e1");
  const b = where(els, "e2");
  const join = pd.dropThing(els, letGo(els, "e1", a.x, b.y - b.hh - a.hh - 0.6), { ...ctx(), together: true });
  assert.deepEqual(join.joined, ["Front 2"]);
});

test("Bigger on the phone panel: never past the biggest print or the safe zone, and says when it can't grow", () => {
  const els = design.elements.map((e, i) => ({ id: `e${i + 1}`, ...e }));
  for (const id of ["e4", "e2"]) {
    let cur = els;
    let capped = false;
    for (let n = 0; n < 40 && !capped; n++) {
      const s = pd.scaledThing(cur, id, 1.1, ctx());
      const out = pd.dropThing(cur, s.el, ctx());
      assert.equal(out.refused, undefined, `${id} tap ${n}`);
      cur = out.elements;
      capped = s.capped;
    }
    assert.ok(capped, `${id}: stops growing`);
    const box = cur.find((e) => e.id === id).spot;
    assert.equal(pm.spotProblem(box, garment, { maxPrint }), null);
    assert.deepEqual(clampedSizes(box), []);
  }
});

test("the snap tag names only what the thing is lined up with", () => {
  const view = pd.panelView(garment, "M", "front", maxPrint);
  const lines = pd.snapLines(catalog, "front", "M", garment, view.w);
  const lc = pd.panelBox(catalog.find((p) => p.key === "left-chest"), "M", garment);
  const lcX = pd.panelX("front", view.w, lc.across);
  assert.equal(pd.snapDrag({ x: lcX + 4, y: lc.down + 3 + 1.2, hw: 3, hh: 3 }, lines).tag, "Top of Centre Front"); // its top line only
  assert.equal(pd.snapDrag({ x: lcX - 1, y: 45, hw: 3, hh: 3 }, lines).tag, "Middle of Left Chest"); // its centre line only
});
