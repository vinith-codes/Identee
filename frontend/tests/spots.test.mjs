// Free placement phase 2 (14 Nov 2026, docs/FREE_PLACEMENT.md): a print can sit at any place on the tee (a "spot"),
// stored in cm. The panels of each tee size, the safe zone, how a spot grows with the tee size, where it lands on the
// 3D tee and on the job card, the design check, the AI's edits, re-boxing and joining — and old designs placed and
// measured exactly as before.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { maxPrintBySize, positionsForGarment } from "../../server/data/printPositions.js";
import * as pm from "../src/studio/panelModel.js";
import { TEE_MODELS, areaCm, blockersOf, clashesIn, modelForGarment, placeArea } from "../src/studio/teeModel.js";
import { checkDesign } from "../src/studio/designCheck.js";
import { applyAiOps, areaFor, describeDesign } from "../src/studio/aiOps.js";
import { listOrder } from "../src/studio/areaGroups.js";

const src = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const { garment, design } = JSON.parse(src("../../server/tests/fixtures/threeSpotDesign.json"));
const oldPlacement = JSON.parse(src("./fixtures/oldPlacement.json"));
const clone = (v) => structuredClone(v);
const r1 = (n) => Math.round(n * 10) / 10;
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);

// the garment's print areas as the server sends them, and the biggest print per size
const catalog = positionsForGarment(garment).positions;
const maxPrint = maxPrintBySize(garment);
const withIds = (els) => els.map((e, i) => ({ id: `e${i + 1}`, ...e }));
const elements = withIds(clone(design.elements));
const positions = pm.withSpots(catalog, elements, garment, maxPrint);
const pos = (key, list = positions) => list.find((p) => p.key === key);
const box = (key, size, list = positions) => pm.areaBoxCm(pos(key, list), size, garment);
const spotEl = (spot, extra = {}) => ({ id: `${spot.key}-el`, type: "image", src: "/uploads/x.png", position: spot.key, side: spot.side, spot, x: 0, y: 0, width: 100, height: 100, ...extra });
const frontSpot = (key, label, downCm, acrossCm, wCm, hCm, scale, from = null) => ({ key, side: "front", label, from, downCm, acrossCm, wCm, hCm, base: "M", scale });

// printFiles.js needs a canvas to load: its pure functions are read out of the source (as freePlacement.test.mjs)
const filesSrc = src("../src/studio/printFiles.js");
const artworkSpot = new Function(`${/export function artworkSpot\([\s\S]*?\r?\n\}\r?\n/.exec(filesSrc)[0].replace("export ", "")}; return artworkSpot;`)();
const fmtCm = (n) => String(Math.round(n * 10) / 10);
const placementWords = new Function("fmtCm", `return ${/export const placementWords = (\(s\) =>[\s\S]*?\}`);/.exec(filesSrc)[1]}`)(fmtCm);
const centredCm = new Function(`return ${/export const centredCm = (\(s\) => [^;]*);/.exec(filesSrc)[1]}`)();
const acrossText = new Function("fmtCm", "centredCm", `return ${/export const acrossText = (\(s\) =>[\s\S]*?);\r?\n/.exec(filesSrc)[1]}`)(fmtCm, centredCm);
const topText = new Function("fmtCm", `return ${/export const topText = (\(s\) =>[\s\S]*?);\r?\n/.exec(filesSrc)[1]}`)(fmtCm);
const spotSheetLines = new Function("placementWords", `${/export function spotSheetLines\([\s\S]*?\r?\n\}\r?\n/.exec(filesSrc)[0].replace("export ", "")}; return spotSheetLines;`)(placementWords);
const FULL = { x0: 0, y0: 0, x1: 100, y1: 100 };

/* ---------- one maths for the design room, the server and the print files ---------- */

test("panelModel.js: the design room's copy is the server's, word for word", () => {
  assert.equal(src("../src/studio/panelModel.js"), src("../../server/data/panelModel.js"));
});

test("panelModel.js picks the same 3D tee as the design room, at the same scale per size", () => {
  const garments = [
    [{ key: "oversized-tee", category: "Boys Oversized", fit: "oversized" }, "oversized"],
    [{ key: "crop-oversized", category: "Women Crop Oversized" }, "oversizedCrop"],
    [{ key: "polo-crop", category: "Collar Crop" }, "collarCrop"],
    [{ key: "round-neck-tshirt", category: "Round Neck" }, "regular"],
    [{ key: "coord-set", category: "Co-ord Set" }, "regular"], // the regular tee with shorts
    [{ key: "hoodie", category: "Hoodie" }, null],
    [null, null],
  ];
  for (const [g, kind] of garments) {
    assert.equal(pm.panelKind(g), kind, g?.key);
    const model = modelForGarment(g);
    assert.equal(model ? model.lengthCm : null, kind ? TEE_MODELS[kind].lengthCm : null, g?.key);
    if (!kind) continue;
    // the 3D tee is drawn at each size's length: the same scale
    const p = pm.panelFor({ ...g, sizeChart: garment.sizeChart }, "L");
    near(p.s, (31 * 2.54) / model.lengthCm, 1e-9, `${g.key} scale`);
  }
  // a catalog sleeve area starts where the 3D tee puts it (5 cm below the sleeve's top on the oversized tees)
  for (const kind of ["oversized", "oversizedCrop", "collarCrop"]) {
    const a = TEE_MODELS[kind].anchors.left;
    near((a.shoulder - a.top) * 100, 5, 1e-9, kind);
  }
});

test("the panels of the Oversized tee at XS, M and 3XL (cm, from the size chart and the 3D tee)", () => {
  const want = {
    // chart (inches): XS 42 / 28 (one step below S, not sold), M 46 / 30, 3XL 54 / 34
    XS: { front: [53.3, 35.4, 59.3, 3, 55.3, 16.7], back: [53.3, 35.4, 67.6, 3, 63.6, 16.7], left: [20.2, 20.2, 21.3, 2.5, 18.8, 7.6] },
    M: { front: [58.4, 37.9, 63.5, 3, 59.5, 17.9], back: [58.4, 37.9, 72.4, 3, 68.4, 17.9], left: [21.6, 21.6, 22.9, 2.5, 20.4, 8.3] },
    "3XL": { front: [68.6, 42.9, 72, 3, 68, 20.5], back: [68.6, 42.9, 82.1, 3, 78.1, 20.5], left: [24.5, 24.5, 25.9, 2.5, 23.4, 9.7] },
  };
  for (const [size, sides] of Object.entries(want)) {
    const p = pm.panelFor(garment, size);
    for (const [side, nums] of Object.entries(sides)) {
      const q = p[side];
      assert.deepEqual([q.flatW, q.w, q.len, q.top, q.bottom, q.half].map(r1), nums, `${size} ${side}`);
    }
    // flat width = half the chart's chest (it is measured all round)
    near(p.front.flatW, (pm.chartRow(garment, size).chest * 2.54) / 2, 1e-9, size);
  }
  assert.deepEqual(pm.chartRow(garment, "4XL"), { chest: 56, length: 35 });
  assert.deepEqual(["XS", "S", "M", "XL", "2XL", "3XL", "4XL"].map((s) => pm.groupOf(s, garment)), ["small", "small", "standard", "standard", "large", "large", "large"]);
  assert.equal(pm.groupOf("5-6Y", { sizeChart: [{ size: "5-6Y", chest: 26, length: 18 }] }), "own:5-6Y");
});

test("the biggest print: 35 x 52 cm (37 x 54 at 2XL–3XL), a sleeve 10 x 10 (13 x 14)", () => {
  assert.deepEqual(pm.maxPrintFor(null, "S", "front"), [35, 52]);
  assert.deepEqual(pm.maxPrintFor(null, "3XL", "back"), [37, 54]);
  assert.deepEqual(pm.maxPrintFor(null, "M", "left"), [10, 10]);
  assert.deepEqual(pm.maxPrintFor(null, "2XL", "right"), [13, 14]);
  assert.deepEqual(pm.maxPrintFor({ M: { front: [30, 40] } }, "M", "front"), [30, 40]);
});

/* ---------- a spot on every tee size ---------- */

test("the 3-spot design on every size group: F keeps its cm, G grows with the tee (one size per group)", () => {
  const at = (key, size) => {
    const b = box(key, size);
    return [b.w, b.h, b.down, b.across];
  };
  for (const size of ["XS", "S", "M", "L", "XL", "2XL", "3XL"]) {
    assert.deepEqual(at("spot-1", size), [9, 9, 8, 9], `Front 1 ${size}`);
    assert.deepEqual(at("spot-4", size), [8, 6, 4, 0], `Left sleeve 1 ${size}`);
  }
  // G: x 55.9 / 58.4 cm (S's flat width / M's) on XS–S, x 66 / 58.4 on 2XL–3XL
  assert.deepEqual([at("spot-2", "S"), at("spot-2", "XL"), at("spot-2", "3XL")], [[23, 5.7, 38.3, 0], [24, 6, 40, 0], [27.1, 6.8, 45.2, 0]]);
  assert.deepEqual([at("spot-3", "XS"), at("spot-3", "M"), at("spot-3", "2XL")], [[28.7, 36.3, 9.6, 0], [30, 38, 10, 0], [33.9, 43, 11.3, 0]]);
  for (const key of ["spot-1", "spot-2", "spot-3", "spot-4"]) assert.deepEqual(pos(key).clamped, {}, key);
  // at most 3 different print files per spot
  for (const key of ["spot-2", "spot-3"]) assert.equal(new Set(Object.values(pos(key).cmBySize).map(String)).size, 3);
  // names, never "spot-N"
  assert.deepEqual(["spot-1", "spot-2", "spot-3", "spot-4"].map((k) => pos(k).label), ["Front 1", "Front 2", "Back 1", "Left sleeve 1"]);
  assert.equal(pm.spotWhere(pos("spot-2"), "M", garment), "24 x 6 cm, 40 cm below the collar seam, centred");
  assert.equal(pm.spotWhere(pos("spot-1"), "S", garment), "9 x 9 cm, 8 cm below the collar seam, 9 cm to the wearer's left of the centre");
  assert.equal(pm.spotWhere(pos("spot-4"), "3XL", garment), "8 x 6 cm, 4 cm below the shoulder seam, on the sleeve's centre line");
});

test("on a size where it would not fit, a spot moves in from the seams or shrinks, and says why", () => {
  const sizes = (b) => pm.spotSizes(b, garment, { maxPrint });
  // a logo near the side: fine on M (17.9 cm from the centre allowed), moved in on S (17.3)
  const side = sizes(frontSpot("spot-1", "Front 1", 10, 13, 9, 9, "F"));
  assert.deepEqual([side.M.across, side.M.clamped], [13, []]);
  assert.deepEqual([side.S.across, side.S.clamped], [12.8, ["side"]]);
  // a growing print near the collar: 3 cm on M is 2.9 on S, moved down to 3
  const collar = sizes(frontSpot("spot-1", "Front 1", 3, 0, 20, 5, "G"));
  assert.deepEqual([collar.S.down, collar.S.clamped], [3, ["collar"]]);
  // the biggest print on M grows past 37 x 54 on 2XL: shrunk as a whole
  const big = sizes(frontSpot("spot-1", "Front 1", 6, 0, 35, 52, "G"));
  assert.ok(big["2XL"].w <= 37 && big["2XL"].h <= 54 && big["2XL"].clamped.includes("big"), JSON.stringify(big["2XL"]));
  near(big["2XL"].w / big["2XL"].h, 35 / 52, 0.01, "keeps its shape");
  // all of these are fine on the size they were made on (the server takes them)
  for (const b of [frontSpot("spot-1", "Front 1", 10, 13, 9, 9, "F"), frontSpot("spot-1", "Front 1", 3, 0, 20, 5, "G"), frontSpot("spot-1", "Front 1", 6, 0, 35, 52, "G")]) {
    assert.equal(pm.spotProblem(b, garment, { maxPrint }), null);
  }
});

test("a spot that is still its print area keeps the print team's sizes on every tee size", () => {
  const preset = pos("left-chest");
  const at = pm.areaBoxCm(preset, "M", garment);
  const kept = frontSpot("spot-1", "Front 1", at.down, at.across, at.w, at.h, "G", "left-chest");
  const p = pm.spotPosition(kept, garment, { preset, maxPrint });
  for (const size of pm.allSizes(garment)) {
    const want = pm.areaBoxCm(preset, size, garment);
    const got = pm.areaBoxCm(p, size, garment);
    assert.deepEqual([got.w, got.h, got.down, got.across], [want.w, want.h, want.down, want.across], size);
  }
  // moved by 1 cm it is a spot of its own (F here: the same cm on every size)
  const moved = pm.spotPosition({ ...kept, downCm: at.down + 1, scale: "F" }, garment, { preset, maxPrint });
  assert.deepEqual(moved.cmBySize["3XL"], [at.w, at.h]);
});

test("the room's print positions: the server's list itself for an old design; a spot's overlaps both ways", () => {
  assert.equal(pm.withSpots(catalog, [{ position: "left-chest", type: "text", text: "A" }], garment, maxPrint), catalog);
  assert.ok(pos("spot-1").conflicts.includes("left-chest"));
  assert.ok(pos("left-chest").conflicts.includes("spot-1"));
  assert.ok(pos("spot-4").conflicts.includes("left-sleeve"));
  // a print area no spot touches is the very same object
  assert.equal(pos("nape"), pos("nape", catalog));
  // the room's overlap rules read them: Left Chest is taken while Front 1 is used
  assert.deepEqual(blockersOf("left-chest", positions, ["spot-1"]).map((p) => p.key), ["spot-1"]);
  assert.deepEqual(clashesIn(positions, ["spot-1", "left-chest"]).map(([a, b]) => [a.key, b.key]), [["left-chest", "spot-1"]]);
});

test("every thing in a spot carries the spot's box; old designs come back as the very same array", () => {
  const oldEls = [{ position: "left-chest", type: "text", text: "A" }];
  assert.equal(pm.normaliseSpots(oldEls), oldEls);
  assert.equal(pm.normaliseSpots(elements), elements);
  // a new thing on Front 2 (the AI added words there) gets its box
  const added = pm.normaliseSpots([...elements, { id: "n", type: "text", text: "HI", position: "spot-2" }]);
  assert.deepEqual(added.at(-1).spot, design.elements[1].spot);
  // a thing moved back onto a print area loses the box
  const back = pm.normaliseSpots([{ ...elements[0], position: "left-chest" }]);
  assert.equal("spot" in back[0], false);
  // the only thing of a spot replaced: its box comes from the design before the change
  const replaced = pm.normaliseSpots([{ id: "r", type: "text", text: "NEW", position: "spot-3" }], elements);
  assert.deepEqual(replaced[0].spot, design.elements[2].spot);
});

/* ---------- the 3D tee ---------- */

test("a spot lands on the 3D tee exactly where it says, at XS, M and 3XL (front, back, sleeve)", () => {
  const extra = pm.withSpots(catalog, [spotEl({ key: "spot-1", side: "back", label: "Back 1", from: null, downCm: 30, acrossCm: -6, wCm: 10, hCm: 10, base: "M", scale: "G" })], garment, maxPrint);
  const model = TEE_MODELS.oversized;
  const checks = [
    ["spot-1", positions],
    ["spot-2", positions],
    ["spot-3", positions],
    ["spot-4", positions],
    ["spot-1", extra],
  ];
  for (const size of ["XS", "M", "3XL"]) {
    const L = pm.chartRow(garment, size).length * 2.54;
    const s = L / model.lengthCm;
    for (const [key, list] of checks) {
      const p = pos(key, list);
      const want = pm.areaBoxCm(p, size, garment);
      const at = placeArea(model, p, size, L);
      const a = model.anchors[p.side];
      const what = `${p.label} ${size}`;
      if (p.side === "left" || p.side === "right") near((a.shoulder - at.top) * 100 * s, want.down, 1e-6, `${what} below the shoulder seam`);
      else {
        near((a.neck - at.top) * 100 * s, want.down, 1e-6, `${what} below the collar seam`);
        near(at.x * 100 * s, want.across, 1e-6, `${what} across`); // raw +x = the wearer's left, front and back
      }
      near(at.w * 100 * s, want.w, 1e-6, `${what} width`);
      near(at.h * 100 * s, want.h, 1e-6, `${what} height`);
    }
  }
  // the back spot to the wearer's right: raw −x
  assert.ok(placeArea(model, pos("spot-1", extra), "M", 30 * 2.54).x < 0);
});

test("old designs: every print area sits on the 3D tee and on the job card exactly as before", () => {
  const model = TEE_MODELS.oversized;
  const cmOf = (p, size) => p.cmBySize?.[size] || p.cm.standard;
  for (const row of oldPlacement.placeArea) assert.deepEqual(placeArea(model, pos(row.key, catalog), row.size, oldPlacement.lengthIn[row.size] * 2.54), row.out, `${row.key} ${row.size}`);
  for (const row of oldPlacement.artworkSpot) {
    const p = pos(row.key, catalog);
    assert.deepEqual(artworkSpot(p, row.size, row.box, cmOf(p, row.size)), row.out, `${row.key} ${row.size}`);
  }
  assert.equal(oldPlacement.placeArea.length, catalog.length * 7);
});

/* ---------- the print files ---------- */

test("the job card's TOP / SIDE for a spot: from the collar seam, a sleeve from the shoulder seam, no * mark", () => {
  const at = (key, size, b = FULL, list = positions) => artworkSpot(pos(key, list), size, b, pos(key, list).cmBySize[size]);
  assert.deepEqual(at("spot-1", "M"), { down: 8, fromCollar: true, across: 9, sleeve: false, side: "front", aw: 9, ah: 9, free: true });
  assert.deepEqual(at("spot-2", "2XL"), { down: 45.2, fromCollar: true, across: 0, sleeve: false, side: "front", aw: 27.1, ah: 6.8, free: true });
  assert.deepEqual(at("spot-3", "S"), { down: 9.6, fromCollar: true, across: 0, sleeve: false, side: "back", aw: 28.7, ah: 36.3, free: true });
  assert.deepEqual(at("spot-4", "XL"), { down: 4, fromCollar: false, fromShoulder: true, across: 0, sleeve: true, side: "left", aw: 8, ah: 6, free: true });
  // the ink only in the right half of Front 1's file: its centre 2.25 cm further to the wearer's left
  assert.deepEqual(at("spot-1", "M", { x0: 50, y0: 0, x1: 100, y1: 100 }), { down: 8, fromCollar: true, across: 11.3, sleeve: false, side: "front", aw: 4.5, ah: 9, free: true });
  // a print area's row is exactly as before (no "free")
  assert.equal("free" in artworkSpot(pos("left-chest"), "M", FULL, pos("left-chest").cmBySize.M), false);
  // a back spot to the wearer's right
  const extra = pm.withSpots(catalog, [spotEl({ key: "spot-1", side: "back", label: "Back 1", from: null, downCm: 30, acrossCm: -6, wCm: 10, hCm: 10, base: "M", scale: "F" })], garment, maxPrint);
  assert.equal(at("spot-1", "M", FULL, extra).across, -6);
  // in words on the order sheet
  assert.equal(placementWords(at("spot-1", "M")), "9 x 9 cm · top 8 cm below collar seam · 9 cm to wearer's left of centre");
  assert.equal(placementWords(at("spot-2", "M")), "24 x 6 cm · top 40 cm below collar seam · centred");
  assert.equal(placementWords(at("spot-4", "M")), "8 x 6 cm · top 4 cm below shoulder seam · on the sleeve's centre line");
  assert.equal(placementWords(at("spot-1", "M", FULL, extra)), "10 x 10 cm · top 30 cm below collar seam · 6 cm to wearer's right of centre");
  // the job card's TOP column: from the collar seam / the shoulder seam, no * (a print area keeps its old words)
  assert.equal(topText(at("spot-1", "M")), "8 cm below");
  assert.equal(topText(at("spot-4", "M")), "4 cm below shoulder seam");
  const lc = artworkSpot(pos("left-chest"), "M", FULL, pos("left-chest").cmBySize.M);
  assert.equal(topText(lc), "0 cm below front start*");
  assert.equal(topText({ ...lc, sleeve: true, down: 2 }), "2 cm from sleeve top*");
  // the order sheet: one line per print and place — the sizes of one file that share a place share a line
  assert.deepEqual(spotSheetLines("②", "Front 2", ["M", "L", "XL"], (size) => at("spot-2", size)), ["  ② Front 2 (M, L, XL) · 24 x 6 cm · top 40 cm below collar seam · centred"]);
  assert.deepEqual(spotSheetLines("③", "Back 1", ["S", "M"], (size) => at("spot-3", size)), [
    "  ③ Back 1 (S) · 28.7 x 36.3 cm · top 9.6 cm below collar seam · centred",
    "  ③ Back 1 (M) · 30 x 38 cm · top 10 cm below collar seam · centred",
  ]);
  assert.deepEqual(spotSheetLines("④", "Left sleeve 1", ["S", "2XL"], (size) => at("spot-4", size)), ["  ④ Left sleeve 1 (S, 2XL) · 8 x 6 cm · top 4 cm below shoulder seam · on the sleeve's centre line"]);
  assert.deepEqual(spotSheetLines("①", "Front 1", ["L"], (size) => at("spot-1", size), "#7 ASHA"), ["  ① Front 1 (#7 ASHA) · 9 x 9 cm · top 8 cm below collar seam · 9 cm to wearer's left of centre"]);
  // "centred" means the same on every page: a print in a free place 0.4 cm off the line is centred on the job card's
  // SIDE, the day sheet's tag and the order sheet; a print area keeps its old 0.3 cm
  const off = at("spot-2", "M", { x0: 2, y0: 0, x1: 100, y1: 100 }); // the ink's centre 0.2 cm to the wearer's left
  const off4 = { ...off, across: 0.4 };
  assert.equal(acrossText(off4), "centred · 11.8 cm each side");
  assert.match(placementWords(off4), /· centred$/);
  assert.equal(acrossText({ ...off4, free: undefined }), "0.4 cm to wearer's LEFT");
  assert.equal(acrossText({ ...off4, across: 0.6 }), "0.6 cm to wearer's LEFT");
  assert.ok(filesSrc.includes("!r.spot.fromShoulder")); // no "* measured from" note for it
  assert.ok(filesSrc.includes("if (Math.abs(spot.across) >= centredCm(spot)) {")); // the tee drawing's SIDE arrow too
  assert.ok(src("../src/studio/printSheets.js").includes('s.fromShoulder\n    ? "below the shoulder seam"') || /s\.fromShoulder\r?\n\s+\? "below the shoulder seam"/.test(src("../src/studio/printSheets.js")));
});

/* ---------- the design check ---------- */

const ink = { fabricHex: "#1C1C1D", inkDefault: "#FFFFFF" };
const cmAt = (size) => (p) => {
  const [wCm, hCm] = areaCm(p, size);
  return { wCm, hCm };
};
const check = (els, list, size) => checkDesign(els, list, { ...ink, cmOf: cmAt(size), garment, size, maxPrint });

test("the design check: too near the collar on one size — and its fix makes it fit", () => {
  let els = [spotEl(frontSpot("spot-1", "Front 1", 3, 0, 20, 5, "G"))];
  let list = pm.withSpots(catalog, els, garment, maxPrint);
  assert.deepEqual(check(els, list, "M").filter((i) => i.spotFix), []);
  const [issue] = check(els, list, "S").filter((i) => i.spotFix);
  assert.equal(issue.kind, "spot-collar");
  assert.equal(issue.text, "Front 1 is too near the collar on size S. A print keeps 3 cm clear of the collar seam, so it moves down.");
  assert.equal(issue.fixLabel, "Move it down");
  assert.deepEqual(issue.spotFix, { kind: "fit", key: "spot-1", sizes: ["S"] });
  els = pm.applySpotFix(els, issue.spotFix, { positions: list, garment, size: "S", maxPrint });
  list = pm.withSpots(catalog, els, garment, maxPrint);
  assert.deepEqual(check(els, list, "S").filter((i) => i.spotFix), []);
  assert.equal(els[0].spot.downCm, 3.1);
});

test("the design check: two prints less than 1 cm apart join into one; a thing past its spot's edge re-boxes it", () => {
  const els = [...elements, spotEl(frontSpot("spot-5", "Front 3", 17.5, 9, 5, 5, "F"), { id: "e5" })];
  const list = pm.withSpots(catalog, els, garment, maxPrint);
  const join = check(els, list, "M").find((i) => i.kind === "join");
  assert.equal(join.text, "Front 1 and Front 3 are less than 1 cm apart, so they would be pressed as one print.");
  const joined = pm.applySpotFix(els, join.spotFix, { positions: list, garment, size: "M", maxPrint });
  assert.deepEqual([...new Set(joined.map((e) => e.position))], ["spot-1", "spot-2", "spot-3", "spot-4"]);
  const one = joined.find((e) => e.id === "e5").spot;
  assert.deepEqual([one.downCm, one.acrossCm, one.wCm, one.hCm], [7.5, 9, 10, 15.5]);
  // a thing hanging out of Front 2
  const out = elements.map((e) => (e.position === "spot-2" ? { ...e, x: -20 } : e));
  const past = check(out, positions, "M").find((i) => i.kind === "outside");
  assert.deepEqual(past.spotFix, { kind: "rebox", key: "spot-2" });
  assert.match(past.text, /reaches past the edge of Front 2/);
  // a print area keeps its old "Move it inside" fix, and an old design gets no spot checks
  const oldEls = [{ id: "o1", type: "text", text: "HI", position: "left-chest", x: -20, y: 10, width: 60, height: 30, fontSizePct: 20, color: "#FFFFFF" }];
  const old = checkDesign(oldEls, catalog, { ...ink, cmOf: cmAt("M") });
  assert.equal(old.find((i) => i.kind === "outside").fixLabel, "Move it inside");
  assert.equal(old.some((i) => i.spotFix), false);
});

/* ---------- re-boxing and joining ---------- */

// a thing's centre on the tee and its size, in cm (front and sleeve files run to the wearer's left, a back file to the right)
const onTee = (e, b) => {
  const cx = ((e.x + e.width / 2) / 100) * b.wCm;
  const cy = ((e.y + e.height / 2) / 100) * b.hCm;
  return {
    across: b.side === "back" ? b.acrossCm + b.wCm / 2 - cx : b.acrossCm - b.wCm / 2 + cx,
    down: b.downCm + cy,
    w: (e.width / 100) * b.wCm,
    h: (e.height / 100) * b.hCm,
    font: e.type === "text" ? (e.fontSizePct / 100) * b.hCm : 0,
  };
};

test("re-boxing round its things keeps every thing's cm size and place; 50 re-boxes in a row don't drift", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let n = 0; n < 50; n++) {
    const side = ["front", "back", "front"][n % 3];
    const b0 = { key: "spot-1", side, label: "Print 1", from: null, downCm: r1(10 + rnd() * 20), acrossCm: r1(-5 + rnd() * 10), wCm: r1(10 + rnd() * 15), hCm: r1(6 + rnd() * 10), base: "M", scale: "G" };
    const things = Array.from({ length: 1 + (n % 3) }, (_, i) => {
      const text = rnd() < 0.6;
      const height = 10 + rnd() * 30;
      return { id: `t${i}`, type: text ? "text" : "image", position: "spot-1", side, spot: b0, x: rnd() * 60, y: rnd() * 60, width: 10 + rnd() * 30, height, rotation: [0, 0, 15, -30, 90][Math.floor(rnd() * 5)], ...(text ? { text: "AB", fontSizePct: height * 0.8 } : {}) };
    });
    const before = things.map((e) => onTee(e, b0));
    const first = pm.reboxSpot(things, b0, { garment, maxPrint });
    const font = Math.max(0, ...before.map((t) => t.font));
    assert.ok(first.box.hCm >= 1.15 * font - 1e-9, `${n}: ${first.box.hCm} for letters of ${font}`);
    let cur = first;
    for (let k = 0; k < 50; k++) cur = pm.reboxSpot(cur.elements, cur.box, { garment, maxPrint });
    for (const f of ["downCm", "acrossCm", "wCm", "hCm"]) near(cur.box[f], first.box[f], 0.01, `${n} ${f}`);
    cur.elements.forEach((e, i) => {
      const t = onTee(e, cur.box);
      for (const f of ["across", "down", "w", "h", "font"]) near(t[f], before[i][f], 0.01, `${n} thing ${i} ${f}`);
      assert.deepEqual(e.spot, cur.box);
    });
  }
});

test("a print of players' names keeps its width (30 cm, or its print area's) so long names stay big", () => {
  const b = frontSpot("spot-1", "Front 1", 20, 0, 12, 6, "G");
  const name = { id: "n", type: "text", text: "NAME", role: "name", position: "spot-1", side: "front", spot: b, x: 30, y: 10, width: 40, height: 80, fontSizePct: 60 };
  assert.equal(pm.reboxSpot([name], b, { garment, maxPrint }).box.wCm, 30);
  assert.equal(pm.reboxSpot([name], { ...b, from: "left-chest" }, { garment, maxPrint, preset: pos("left-chest") }).box.wCm, pos("left-chest").cmBySize.M[0]);
});

test("joining two prints and taking a thing out of a print area keep every thing where it is on the tee", () => {
  const els = [...elements, spotEl(frontSpot("spot-5", "Front 3", 17.5, 9, 5, 5, "F"), { id: "e5" })];
  const list = pm.withSpots(catalog, els, garment, maxPrint);
  const was = (id) => onTee(els.find((e) => e.id === id), els.find((e) => e.id === id).spot);
  const joined = pm.mergeSpots(els, "spot-1", "spot-5", { positions: list, garment, size: "M", maxPrint });
  for (const id of ["e1", "e5"]) {
    const e = joined.find((x) => x.id === id);
    assert.equal(e.position, "spot-1");
    const t = onTee(e, e.spot);
    for (const f of ["across", "down", "w", "h"]) near(t[f], was(id)[f], 0.01, `${id} ${f}`);
  }
  // a picture taken out of Left Chest becomes Front 1 (F, from Left Chest), boxed round it, in the same place
  const lc = pos("left-chest", catalog);
  const frame = pm.areaBoxCm(lc, "M", garment);
  const pic = { id: "p", type: "image", src: "/uploads/x.png", position: "left-chest", side: "front", x: 10, y: 20, width: 50, height: 40 };
  const [out] = pm.elementToSpot([pic], "p", { positions: catalog, garment, size: "M", maxPrint });
  assert.deepEqual([out.position, out.spot.label, out.spot.from, out.spot.scale, out.spot.base], ["spot-1", "Front 1", "left-chest", "F", "M"]);
  const t = onTee(out, out.spot);
  const before = onTee(pic, { side: "front", downCm: frame.down, acrossCm: frame.across, wCm: frame.w, hCm: frame.h });
  for (const f of ["across", "down", "w", "h"]) near(t[f], before[f], 0.01, f);
  assert.deepEqual([out.spot.wCm, out.spot.hCm], [r1(before.w + 1), r1(before.h + 1)]);
});

/* ---------- the AI ---------- */

test("the AI: a spot the design doesn't have is ignored; words added to a spot or a thing moved there take its box", () => {
  const used = [...new Set(elements.map((e) => e.position))];
  assert.equal(areaFor("spot-9", positions, used), null);
  assert.equal(areaFor("spot-2", positions, used).key, "spot-2");
  const d = {
    elements,
    positions,
    fonts: ["Anton"],
    inkDefault: "#FFFFFF",
    active: null,
    makeId: () => "new",
    areaPx: (p) => {
      const [wCm, hCm] = areaCm(p, "M");
      return { W: wCm * 24, H: hCm * 24, wCm, hCm };
    },
    textBox: (el) => ({ ...el, width: 40, height: 30, x: el.x - 20, y: el.y - 15 }),
  };
  const added = applyAiOps([{ op: "add_text", text: "2026", area: "spot-2" }], d).elements.at(-1);
  assert.deepEqual([added.position, added.spot], ["spot-2", design.elements[1].spot]);
  assert.equal(applyAiOps([{ op: "add_text", text: "2026", area: "spot-7" }], { ...d, active: null }).changed, 0);
  // Front 2's words moved to the bare back, and back again onto Front 1
  const solo = { ...d, elements: [elements[0], elements[1]], positions: pm.withSpots(catalog, [elements[0], elements[1]], garment, maxPrint) };
  const toBack = applyAiOps([{ op: "move", id: "e2", area: "full-back" }], solo).elements.find((e) => e.id === "e2");
  assert.deepEqual([toBack.position, "spot" in toBack], ["full-back", false]);
  const toSpot = applyAiOps([{ op: "move", id: "e2", area: "spot-1" }], solo).elements.find((e) => e.id === "e2");
  assert.deepEqual([toSpot.position, toSpot.spot], ["spot-1", design.elements[0].spot]);
  // the AI is told where each spot is
  const where = (p) => pm.spotWhere(p, "M", garment);
  const told = describeDesign({ elements, positions, active: null, selectedId: null, fonts: ["Anton"], teeName: "Black", areaPx: d.areaPx, whereOf: where });
  assert.equal(told.areas.find((a) => a.key === "spot-2").where, "24 x 6 cm, 40 cm below the collar seam, centred");
  assert.equal("where" in told.areas.find((a) => a.key === "left-chest"), false);
});

/* ---------- names ---------- */

test("a spot is always called by its name: new names, the design preview and the admin's order window", () => {
  assert.equal(pm.spotLabel("front", elements), "Front 3");
  assert.equal(pm.spotLabel("right", elements), "Right sleeve 1");
  assert.equal(pm.nextSpotKey(elements), "spot-5");
  // "Where to print" lists them after the print areas, Front 1 before Front 2; the print areas keep their order
  const front = listOrder(positions.filter((p) => p.side === "front")).map((p) => p.key);
  assert.deepEqual(front.slice(-2), ["spot-1", "spot-2"]);
  assert.deepEqual(front.slice(0, -2), listOrder(catalog.filter((p) => p.side === "front")).map((p) => p.key));
  assert.equal(pm.spotNameIn(elements, "spot-4"), "Left sleeve 1");
  assert.equal(pm.spotNameIn(elements, "spot-9"), null);
  assert.equal(pm.spotNameIn(elements, "left-chest"), null); // a print area goes by its catalog name
  assert.match(src("../src/components/DesignPreview.jsx"), /AREA_NAMES\[a\] \|\| spotNameIn\(design\?\.elements, a\) \|\| a/);
  assert.equal(src("../src/pages/admin/OrderDesignsModal.jsx").split("el.spot?.label || ").length - 1, 2);
});

/* ---------- the review's fixes (14 Nov 2026) ---------- */

// where the 3D tee draws a print area on one size, in cm below the collar seam / from the centre line
const drawn = (g, key, size) => {
  const model = modelForGarment(g);
  const p = positionsForGarment(g).positions.find((x) => x.key === key);
  const len = pm.chartRow(g, size).length * 2.54;
  const s = len / model.lengthCm;
  const pa = placeArea(model, p, size, len);
  return { down: (model.anchors[p.side].neck - pa.top) * 100 * s, across: pa.x * 100 * s, w: pa.w * 100 * s, h: pa.h * 100 * s };
};
const chart = (rows) => rows.map(([size, chest, length]) => ({ size, chest, length }));
const boys = { key: "boys-round-neck", category: "Boys Round Neck", sizes: ["S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"], sizeChart: chart([["S", 36, 26], ["M", 38, 27], ["L", 40, 28], ["XL", 42, 29], ["2XL", 44, 30], ["3XL", 46, 31], ["4XL", 48, 32], ["5XL", 50, 33]]) };
const collarCrop = { key: "girls-crop-top-collar", category: "Girls Crop Top with Collar", sizes: ["S", "M", "L"], sizeChart: chart([["S", 32, 16], ["M", 34, 17], ["L", 36, 18]]) };
const cropOversized = { key: "girls-oversized-crop", category: "Girls Oversized Crop", sizes: ["S", "M", "L"], sizeChart: chart([["S", 44, 19], ["M", 46, 20], ["L", 48, 21]]) };

test("a spot keeps clear of a print area where the 3D tee draws it too (lower on big sizes, under the collar crop's V)", () => {
  for (const [g, key, size] of [[garment, "left-chest", "3XL"], [garment, "centre-front", "3XL"], [garment, "full-back", "3XL"], [boys, "centre-front", "5XL"], [boys, "left-chest", "5XL"], [collarCrop, "left-chest", "M"], [collarCrop, "right-chest", "L"]]) {
    const cat = positionsForGarment(g).positions;
    const d = drawn(g, key, size);
    const side = cat.find((p) => p.key === key).side;
    // a thin print just inside the bottom of the drawn area, and one just under its lowest edge on any size
    const thin = (down) => [spotEl({ key: "spot-1", side, label: "Print 1", from: null, downCm: r1(down), acrossCm: r1(d.across), wCm: 2, hCm: 0.4, base: "M", scale: "F" })];
    const hits = (down) => pm.withSpots(cat, thin(down), g, maxPrintBySize(g)).find((p) => p.key === "spot-1").conflicts.includes(key);
    assert.equal(hits(d.down + d.h - 0.6), true, `${g.key} ${key} ${size}: inside the 3D box`);
    const area = cat.find((p) => p.key === key);
    const lowest = Math.max(...pm.sizesOf(g).flatMap((sz) => [drawn(g, key, sz), pm.areaBoxCm(area, sz, g)].map((b) => b.down + b.h)));
    assert.equal(hits(lowest + 0.2), false, `${g.key} ${key}: clear of it on every size`);
  }
  // the design check's "less than 1 cm apart" reads the same boxes
  const lc3 = drawn(garment, "left-chest", "3XL");
  const els = [{ id: "c", type: "text", text: "HI", position: "left-chest", side: "front", x: 10, y: 10, width: 80, height: 40 }, spotEl({ key: "spot-1", side: "front", label: "Front 1", from: null, downCm: r1(lc3.down + lc3.h + 0.4), acrossCm: 10, wCm: 8, hCm: 4, base: "M", scale: "F" })];
  const list = pm.withSpots(catalog, els, garment, maxPrint);
  assert.deepEqual(pm.nearPairs(list, ["left-chest", "spot-1"], "3XL", garment).map(([a, b]) => [a.key, b.key]), [["left-chest", "spot-1"]]);
});

test("sleeves: a crop keeps its tee's sleeve; the regular tee's sleeve prints stay on its short 3D sleeve, one shoulder line", () => {
  const crop = pm.panelFor(cropOversized, "M").left;
  const tee = pm.panelFor(garment, "M").left;
  near(crop.len, tee.len, 0.1, "crop sleeve length");
  near(crop.w, tee.w, 0.1, "crop sleeve opening");
  near(crop.bottom, tee.bottom, 0.1, "crop sleeve bottom");
  assert.ok(pm.panelFor(collarCrop, "M").left.len > 19, "the collar crop top's sleeve is its 3D sleeve");
  // the Oversized tee's sleeve is as before: 9" x 8.5" at 30", 2.5 cm from its hem
  near(tee.len, 0.3 * 76.2, 1e-9, "oversized sleeve");
  near(tee.bottom, 0.3 * 76.2 - 2.5, 1e-9, "oversized sleeve bottom");
  const { left, right } = TEE_MODELS.regular.anchors;
  assert.equal(left.shoulder, right.shoulder);
  for (const size of boys.sizes) {
    const p = pm.panelFor(boys, size);
    // the lowest a sleeve print may reach stays 1 cm inside the 3D sleeve's hem (10.2 model cm below its top)
    assert.ok(p.left.bottom <= 10.2 * p.s - 1 + 1e-9, size);
    const at = placeArea(TEE_MODELS.regular, { side: "left", collarCm: { [size]: p.left.bottom - 2 }, cmBySize: { [size]: [5, 2] } }, size, pm.chartRow(boys, size).length * 2.54);
    assert.ok(at.top - at.h >= left.shoulder - 0.102, size); // on the 3D sleeve
  }
});

test("Bigger / the chat's 'make it bigger' on a print in a free place: it grows, its box grows round it, nothing is cut off", () => {
  const ctx = { garment, catalog, maxPrint };
  const d = {
    elements,
    positions,
    fonts: ["Anton"],
    inkDefault: "#FFFFFF",
    active: null,
    makeId: () => "new",
    areaPx: (p) => {
      const [wCm, hCm] = areaCm(p, "M");
      return { W: wCm * 24, H: hCm * 24, wCm, hCm };
    },
    textBox: (el) => ({ ...el, width: 40, height: 30, x: el.x - 20, y: el.y - 15 }),
  };
  const commit = (next) => pm.reboxChanged(pm.normaliseSpots(next, elements), elements, ctx);
  // the logo 1.5 x (the AI's limit: 140 % of its 9 cm box = 12.6 cm), in a box of 13.6 cm round it
  const big = commit(applyAiOps([{ op: "update", id: "e1", set: { scale: 1.5 } }], d).elements);
  const logo1 = big.find((e) => e.id === "e1");
  near((logo1.width / 100) * logo1.spot.wCm, 12.6, 0.01, "logo cm");
  assert.deepEqual([logo1.spot.wCm, logo1.spot.hCm, logo1.spot.acrossCm], [13.6, 13.6, 9]);
  assert.ok(logo1.x >= 0 && logo1.x + logo1.width <= 100 && logo1.y >= 0 && logo1.y + logo1.height <= 100);
  assert.deepEqual(big.find((e) => e.id === "e3").spot, elements[2].spot); // the other prints keep their boxes
  // "make IDENTEE bigger": its letters go from 5.1 cm to 6 cm (100 % of its box, the box then 1.15 x them) — never smaller
  const words = commit(applyAiOps([{ op: "update", id: "e2", set: { scale: 1.4 } }], d).elements).find((e) => e.id === "e2");
  near((words.fontSizePct / 100) * words.spot.hCm, 6, 0.01, "letters");
  assert.ok(words.spot.hCm >= 1.15 * 6 - 1e-9 && words.fontSizePct <= 100 / 1.15 + 1e-9);
  // words added to Front 2 start at the size of IDENTEE and go under it; IDENTEE stays where it was on the tee
  const added = commit(applyAiOps([{ op: "add_text", text: "EST 2026", area: "spot-2" }], d).elements);
  const [idt, est] = [added.find((e) => e.id === "e2"), added.at(-1)];
  near((est.fontSizePct / 100) * est.spot.hCm, (idt.fontSizePct / 100) * idt.spot.hCm, 1e-6, "same letters");
  near(onTee(idt, idt.spot).down, onTee(elements[1], elements[1].spot).down, 0.01, "IDENTEE stays");
  assert.ok(onTee(est, est.spot).down - onTee(est, est.spot).h / 2 > onTee(idt, idt.spot).down + onTee(idt, idt.spot).h / 2, "under it");
  // a design with no spots, or nothing outgrowing its box: the same array (old designs never change)
  const oldEls = [{ id: "o1", type: "text", text: "HI", position: "left-chest", x: -20, y: 10, width: 60, height: 30, fontSizePct: 20 }];
  assert.equal(pm.reboxChanged(oldEls, [], ctx), oldEls);
  assert.equal(pm.reboxChanged(elements, [], ctx), elements);
  // the room: Bigger and the Size slider go up to the server's 100 % in a free place (60 % on a print area, as before)
  const room = src("../src/studio/DesignRoomPage.jsx");
  assert.ok(room.includes("const fontSizePct = Math.min(isSpotKey(e.position) ? 100 : 60, Math.max(2, e.fontSizePct * f));"));
  assert.ok(room.includes("max={isSpotKey(sel.position) ? 100 : 60}"));
  // (phase 3: the first thing put in a new "Anywhere" print takes its box in between: panelDrag.test.mjs)
  assert.ok(room.includes('let made = normaliseSpots(typeof next === "function" ? next(prev) : next, prev);'));
  assert.ok(room.includes("const value = reboxChanged(made, prev, spotCtx.current);"));
});

test("a design-check fix is worked out when tapped: an old card never puts back an old box; a gone print changes nothing", () => {
  const ctx = { positions: catalog, garment, size: "S", maxPrint };
  const fix = { kind: "fit", key: "spot-1", sizes: ["S"] };
  const els = [spotEl(frontSpot("spot-1", "Front 1", 3, 0, 20, 5, "G"))];
  assert.equal(pm.applySpotFix(els, fix, ctx)[0].spot.downCm, 3.1);
  // moved down since the check: the old card leaves it where it is
  const moved = [spotEl(frontSpot("spot-1", "Front 1", 12, 0, 20, 5, "G"))];
  assert.deepEqual(pm.applySpotFix(moved, fix, ctx)[0].spot, moved[0].spot);
  const gone = [];
  assert.equal(pm.applySpotFix(gone, fix, ctx), gone);
  // the room tells the customer and the card stays unfixed
  assert.ok(src("../src/studio/DesignRoomPage.jsx").includes("That print isn’t on the tee any more."));
  assert.ok(src("../src/studio/Assistant.jsx").includes("if (onFix(issue) === false) return;"));
});

test("the design check looks at every size the tee comes in: a print that moves on 2XL and 3XL says so", () => {
  const els = elements.map((e) => (e.position === "spot-3" ? { ...e, spot: { ...e.spot, downCm: 30 } } : e));
  const list = pm.withSpots(catalog, els, garment, maxPrint);
  const all = (e, l) => checkDesign(e, l, { ...ink, cmOf: cmAt("M"), garment, size: "M", sizes: garment.sizes, maxPrint }).filter((i) => i.spotFix);
  assert.deepEqual(check(els, list, "M").filter((i) => i.spotFix), []); // M alone: fine
  const [issue] = all(els, list);
  assert.equal(issue.text, "Back 1 is too near the hem on sizes 2XL and 3XL. A print keeps 4 cm clear of it, so it moves up.");
  assert.deepEqual(issue.spotFix, { kind: "fit", key: "spot-3", sizes: ["2XL", "3XL"] });
  const fixed = pm.applySpotFix(els, issue.spotFix, { positions: list, garment, size: "M", maxPrint });
  assert.deepEqual(all(fixed, pm.withSpots(catalog, fixed, garment, maxPrint)), []);
  // the collar crop top: the real line under its V opening, not "3 cm"
  const crop = [spotEl({ key: "spot-1", side: "front", label: "Front 1", from: null, downCm: 10, acrossCm: 0, wCm: 5, hCm: 5, base: "M", scale: "F" })];
  const cropList = pm.withSpots(positionsForGarment(collarCrop).positions, crop, collarCrop, maxPrintBySize(collarCrop));
  const [high] = checkDesign(crop, cropList, { ...ink, cmOf: cmAt("M"), garment: collarCrop, size: "M", maxPrint: maxPrintBySize(collarCrop) }).filter((i) => i.spotFix);
  assert.match(high.text, /^Front 1 is too near the collar opening on size M\. A print starts at least 16\.\d cm below the collar seam on this top, so it moves down\.$/);
});

test("the fit fix clears its warning in one tap, also when 0.1 cm rounding × the growth tips it back over the line", () => {
  // Back 1 grown to 30 x 48 at M: 2XL and 3XL are bigger than 37 x 54. 47.8 cm back at M × 1.13 = 54.01 cm, still too big
  const els = elements.map((e) => (e.position === "spot-3" ? { ...e, spot: { ...e.spot, downCm: 18, hCm: 48 } } : e));
  const list = pm.withSpots(catalog, els, garment, maxPrint);
  const all = (e, l) => checkDesign(e, l, { ...ink, cmOf: cmAt("M"), garment, size: "M", sizes: garment.sizes, maxPrint }).filter((i) => i.spotFix);
  const [issue] = all(els, list);
  assert.equal(issue.kind, "spot-big");
  assert.deepEqual(issue.spotFix, { kind: "fit", key: "spot-3", sizes: ["2XL", "3XL"] });
  const fixed = pm.applySpotFix(els, issue.spotFix, { positions: list, garment, size: "M", maxPrint });
  assert.deepEqual(all(fixed, pm.withSpots(catalog, fixed, garment, maxPrint)), []);
  const b = fixed.find((e) => e.position === "spot-3").spot;
  assert.deepEqual([b.downCm, b.wCm, b.hCm], [18, 29.7, 47.7]);
});

test("the AI is told where each spot is in every chat; the room waits for the print areas before it opens one", () => {
  const room = src("../src/studio/DesignRoomPage.jsx");
  assert.equal(room.split("areas: c.areas.map(({ key, label, free, where }) => ({ key, label, free, ...(where ? { where } : {}) })),").length - 1, 2);
  assert.equal(room.split("areaPx, whereOf }),").length - 1, 3); // the smart chat, the Assistant and chat edits
  assert.ok(room.includes('if (!r || !catalog.length || !positions.length || step !== "design") return undefined;'));
  assert.ok(room.includes("if (!catalog.length) return null;"));
});
