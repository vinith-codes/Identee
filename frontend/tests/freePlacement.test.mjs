// Free placement phase 1 (14 Nov 2026, docs/FREE_PLACEMENT.md): the new print areas on the real oversized 3D tee
// (inside the tee, clear of the collar, hem and side seams at XS, M and 3XL), the "Where to print" list order,
// the place names in plain words for the AI's chat edits and concept pieces, and the print pack's TOP / SIDE.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { PRINT_AREA_CATALOG, catalogForGarment, positionsForGarment } from "../../server/data/printPositions.js";
import { TEE_MODELS, placeArea } from "../src/studio/teeModel.js";
import { areaGroups, listOrder } from "../src/studio/areaGroups.js";
import { areaFor, areaInWords } from "../src/studio/aiOps.js";
import { pieceArea, placementHint } from "../src/studio/assistantV2.js";
import { areaFromWords, areasFromWords } from "../src/studio/photoIntent.js";
import { startFontPct, startTextY } from "../src/studio/textStart.js";

const src = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

// The Oversized tee once the admin switches every place on (what Admin → Print areas saves: each row with the size it
// shows), and a garment with no settings (the old default list).
const saved = catalogForGarment(null).map((a) => ({ key: a.key, offered: true, width: a.cm ? a.cm.standard[0] : null, height: a.cm ? a.cm.standard[1] : null, bySize: a.exact && a.cmBySize ? a.cmBySize : null }));
const all = positionsForGarment({ printAreas: saved }).positions;
const plain = positionsForGarment(null).positions;
const pos = (key, list = all) => list.find((p) => p.key === key);

/* ---------- the real 3D tee ---------- */

// The points of a .glb's first mesh with its node's place in the scene applied (the same reader as neckDip.test.mjs):
// y = height (raw metres, as the anchors), x = across (wearer's left +), z = front (+) / back (−).
function teePoints(file) {
  const b = readFileSync(new URL(`../public/models/${file}`, import.meta.url));
  const jsonLen = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + jsonLen).toString("utf8"));
  const bin = 20 + jsonLen + 8;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const node = (function find(ids, chain) {
    for (const id of ids) {
      const nd = j.nodes[id];
      if (nd.mesh != null) return [...chain, nd];
      const deeper = find(nd.children || [], [...chain, nd]);
      if (deeper) return deeper;
    }
    return null;
  })(j.scenes[j.scene || 0].nodes, []);
  const matrixOf = (nd) => nd.matrix
    ? new THREE.Matrix4().fromArray(nd.matrix)
    : new THREE.Matrix4().compose(
      new THREE.Vector3(...(nd.translation || [0, 0, 0])),
      new THREE.Quaternion(...(nd.rotation || [0, 0, 0, 1])),
      new THREE.Vector3(...(nd.scale || [1, 1, 1])),
    );
  const world = node.reduce((m, nd) => m.multiply(matrixOf(nd)), new THREE.Matrix4());
  const a = j.accessors[j.meshes[node.at(-1).mesh].primitives[0].attributes.POSITION];
  const bv = j.bufferViews[a.bufferView];
  const [size, get, max] = { 5122: [2, "getInt16", 32767], 5123: [2, "getUint16", 65535], 5126: [4, "getFloat32", 1] }[a.componentType];
  const stride = bv.byteStride || size * 3;
  const start = bin + (bv.byteOffset || 0) + (a.byteOffset || 0);
  const out = [];
  for (let i = 0; i < a.count; i++) {
    const v = [0, 1, 2].map((k) => {
      const n = view[get](start + i * stride + k * size, true);
      return a.normalized ? Math.max(n / max, -1) : n;
    });
    out.push(new THREE.Vector3(...v).applyMatrix4(world));
  }
  return out;
}

const model = TEE_MODELS.oversized;
const points = teePoints("oversized-tee.glb");
// the hem at the centre line, front and back (the lowest point there)
const hemOf = (front) => Math.min(...points.filter((p) => Math.abs(p.x) < 0.02 && (front ? p.z > 0 : p.z < -0.03)).map((p) => p.y));
const HEM = { front: hemOf(true), back: hemOf(false) };
// how wide the body is at each height (5 mm bands): its narrower half, as seen from the front or the back — the
// prints are laid flat onto the tee from straight in front, so this is the side seam they must keep clear of
const BAND = 0.005;
const halfAt = new Map();
for (const p of points) {
  const k = Math.round(p.y / BAND);
  const [lo, hi] = halfAt.get(k) || [Infinity, -Infinity];
  halfAt.set(k, [Math.min(lo, p.x), Math.max(hi, p.x)]);
}
// above the armpits the outline is the sleeves: a box there is held to the body's width at the armpit
const ARMPIT = 1.26;
const bodyHalf = (bottom, top) => {
  let half = Infinity;
  for (let k = Math.round(Math.min(bottom, ARMPIT) / BAND); k <= Math.round(Math.min(top, ARMPIT) / BAND); k++) {
    // a 2 cm window: some 5 mm bands hold only a few points, none of them on the side seam
    let lo = Infinity;
    let hi = -Infinity;
    for (let n = k - 2; n <= k + 2; n++) {
      const band = halfAt.get(n);
      if (band) [lo, hi] = [Math.min(lo, band[0]), Math.max(hi, band[1])];
    }
    if (hi > lo) half = Math.min(half, -lo, hi);
  }
  return half;
};
// The oversized chart (inches: length, and chest all round) — the 3D tee is drawn at each size's length. XS is not
// sold on it: one size below S (S 44 / 29, M 46 / 30, 3XL 54 / 34 on the chart).
const LENGTH_IN = { XS: 28, M: 30, "3XL": 34 };
const CHEST_IN = { XS: 42, M: 46, "3XL": 54 };
// cm from the collar, the hem and the nearer side seam at that size. The 3D body is narrower than the real tee (about
// 37 cm across at XS against 53 cm flat), so the side seam is measured twice: on the real tee (half its chest, from
// the chart) — where the print team prints — and on the 3D tee's outline (the preview), where a print right on the
// edge would wrap round its side.
function margins(key, size) {
  const p = pos(key);
  const lengthCm = LENGTH_IN[size] * 2.54;
  const s = lengthCm / model.lengthCm;
  const spot = placeArea(model, p, size, lengthCm);
  const cm = (m) => Math.round(m * 100 * s * 10) / 10;
  const [wCm] = p.cmBySize[size];
  const outerCm = (p.place.align === "centre" ? 0 : p.place.gapCm) + (p.place.align === "centre" ? wCm / 2 : wCm);
  return {
    collar: cm(model.anchors[p.side].neck - spot.top),
    hem: cm(spot.top - spot.h - HEM[p.side]),
    side: Math.round(((CHEST_IN[size] * 2.54) / 4 - outerCm) * 10) / 10,
    outline: cm(bodyHalf(spot.top - spot.h, spot.top) - (Math.abs(spot.x) + spot.w / 2)),
  };
}

const NEW_BOXES = ["chest-line", "mid-front", "lower-left", "lower-right", "nape", "mid-back", "lower-back"];

test("the 3D tee measured: hems front and back, a body about 37 cm across under the arms", () => {
  // the bottom edge at the centre line (the back hangs about 2.5 cm lower than the front)
  assert.ok(Math.abs(HEM.front - 0.946) < 0.003, `front hem ${HEM.front}`);
  assert.ok(Math.abs(HEM.back - 0.921) < 0.003, `back hem ${HEM.back}`);
  const under = bodyHalf(1.0, 1.25);
  assert.ok(under > 0.17 && under < 0.2, `half the body ${under}`);
});

test("every new box sits on the oversized tee at XS, M and 3XL: 2.5 cm under the collar, 4 cm over the hem, 5 cm from the side seams", () => {
  for (const key of NEW_BOXES) {
    for (const size of Object.keys(LENGTH_IN)) {
      const m = margins(key, size);
      assert.ok(m.collar >= 2.5, `${key} ${size}: ${m.collar} cm under the collar`);
      assert.ok(m.hem >= 4, `${key} ${size}: ${m.hem} cm above the hem`);
      assert.ok(m.side >= 5, `${key} ${size}: ${m.side} cm from the real tee's side seam`);
      // and the preview: on the front (or back) of the 3D tee, not round its side
      assert.ok(m.outline >= 2, `${key} ${size}: ${m.outline} cm from the 3D tee's outline`);
    }
  }
  // the low spots really are low: within 10 cm of the hem on every size (their start line moves with the length)
  for (const key of ["lower-left", "lower-right", "lower-back"]) for (const size of Object.keys(LENGTH_IN)) assert.ok(margins(key, size).hem <= 10, `${key} ${size}`);
  // and the back neck mark is right under the collar
  for (const size of Object.keys(LENGTH_IN)) assert.equal(margins("nape", size).collar, 2.5);
});

test("Front Left Vertical sits where the print team's Front Right Vertical does, on the other side", () => {
  // the print team's 10 × 52 strip 8 cm off the centre runs close to the outline of the narrow 3D body at the small
  // sizes (on a real tee it keeps 8 cm or more from the seam); the new left strip is kept an exact mirror of it
  for (const size of Object.keys(LENGTH_IN)) {
    const lengthCm = LENGTH_IN[size] * 2.54;
    const l = placeArea(model, pos("front-left-vertical"), size, lengthCm);
    const r = placeArea(model, pos("front-right-vertical"), size, lengthCm);
    assert.ok(Math.abs(l.x + r.x) < 1e-12 && l.top === r.top && l.w === r.w && l.h === r.h, size);
    assert.ok(l.x > 0, "on the wearer's left (raw +x)");
    assert.deepEqual(margins("front-left-vertical", size), margins("front-right-vertical", size));
    assert.ok(margins("front-left-vertical", size).collar >= 2.5);
    assert.ok(margins("front-left-vertical", size).side >= 5);
  }
});

/* ---------- the "Where to print" list ---------- */

test("the list: Front, Back, Sleeves (Shorts), each with the main spot first, the big prints, then bands and strips, then the small hits", () => {
  const groups = areaGroups(all).map(([title, , list]) => [title, list.map((p) => p.key)]);
  assert.deepEqual(groups, [
    ["Front", ["centre-front", "full-front", "left-chest", "right-chest", "chest-line", "mid-front", "vertical-front", "front-left-vertical", "front-right-vertical", "lower-left", "lower-right"]],
    ["Back", ["full-back", "centre-back", "top-back", "mid-back", "lower-back", "vertical-back", "nape"]],
    ["Sleeves", ["left-sleeve", "right-sleeve"]],
    ["Shorts", ["left-leg", "right-leg"]],
  ]);
  // a garment without the new places keeps its groups; an empty group is left out
  assert.deepEqual(areaGroups(plain).map(([title]) => title), ["Front", "Back", "Sleeves"]);
  // the order does not depend on the order the areas came in, and the list given is not changed
  const shuffled = [...all].reverse();
  const copy = [...shuffled];
  assert.deepEqual(listOrder(shuffled.filter((p) => p.side === "back")).map((p) => p.key).slice(0, 2), ["full-back", "centre-back"]);
  assert.deepEqual(shuffled, copy);
  // the design room and "Where should it go?" both use it
  const room = src("../src/studio/DesignRoomPage.jsx");
  assert.match(room, /import \{ AREA_GROUPS, groupOfSide, listOrder \} from "\.\/areaGroups";/);
  assert.equal((room.match(/listOrder\((positions|areas)\.filter\(\(p\) => sides\.includes\(p\.side\)\)\)/g) || []).length, 2);
});

test("a blocked card says which print it clashes with; every card and row carries its hint", () => {
  const room = src("../src/studio/DesignRoomPage.jsx");
  // "Not with Centre Front", and "+1" when more than one print is in the way (the PlaceSheet pill too)
  assert.match(room, /\{blockedBy\.length \? <span className="why">Not with \{blockedBy\[0\]\.label\}\{blockedBy\.length > 1 \? ` \+\$\{blockedBy\.length - 1\}` : ""\}<\/span> : <span>\{w\}×\{h\} cm<\/span>\}/);
  assert.match(room, /\$\{blockedBy\.length \? " blocked says-why" : ""\}/);
  assert.match(room, /where: p\.hint \|\| \(p\.spot \? whereOf\(p\)\.replace\(\/\^\[\^,\]\*, \/, ""\) : ""\)/); // (a print in a free place: where it is, phase 2)
  const sheet = src("../src/studio/PlaceSheet.jsx");
  assert.match(sheet, /\{a\.where \? ` · \$\{a\.where\}` : ""\}/);
  assert.match(sheet, /`Covered by \$\{a\.blockers\[0\]\}\$\{a\.blockers\.length > 1 \? ` \+\$\{a\.blockers\.length - 1\}` : ""\}`/);
  // a row that says where it is gets no "small, for a logo" pill (it contradicted Chest Line, a words strip)
  assert.match(room, /hint: p\.spot \? "" : big && p\.main \? "best for big pictures" : !p\.hint && wCm \* hCm <= 200 \? "small, for a logo" : ""/);
  const css = src("../src/studio/designRoom.css");
  assert.match(css, /\.dr-side \.dr-cards \.dr-area span\.why \{ color: #8A4A12;/);
  // the clear look is only for cards that say why: the admin Studio's covered cards (no reason) stay faded
  assert.match(css, /\.dr-side \.dr-cards \.dr-area\.blocked\.says-why \{ opacity: 1; \}/);
  assert.doesNotMatch(css, /\.dr-side \.dr-cards \.dr-area\.blocked \{ opacity: 1; \}/);
  // on a phone the Front / Back / Sleeves tabs over the cards are a finger tall
  assert.match(css, /@media \(max-width: 760px\) \{\r?\n  \.dr-areatabs button \{ min-height: 44px; \}\r?\n\}/);
  // every area has a hint short enough for a phone row (PlaceSheet shows "26 × 7 cm · <hint>")
  for (const p of all) assert.ok(p.hint && p.hint.length <= 45, p.key);
});

/* ---------- places in plain words (chat edits, concept pieces) ---------- */

test("a place named in plain words finds the area — only one this tee offers", () => {
  const key = (text, list = all) => areaInWords(text, list)?.key || null;
  assert.equal(key("put it on the nape"), "nape");
  assert.equal(key("small logo at the back of the neck"), "nape");
  assert.equal(key("just under the back collar"), "nape");
  assert.equal(key("Back Neck"), "nape");
  assert.equal(key("chest-line"), "chest-line");
  assert.equal(key("a line of words across the chest"), "chest-line");
  assert.equal(key("write my name across the chest"), "chest-line");
  assert.equal(key("our slogan across the chest"), "chest-line");
  assert.equal(key("on the belly"), "mid-front");
  assert.equal(key("belly"), "mid-front");
  assert.equal(key("middle of the back"), "mid-back");
  assert.equal(key("words across the lower back"), "lower-back");
  assert.equal(key("a tiny star in the bottom left corner"), "lower-left"); // the nearest place there is: "bottom left"
  assert.equal(key("bottom right"), "lower-right");
  assert.equal(key("down the left side"), "front-left-vertical");
  assert.equal(key("a logo on the left chest"), "left-chest"); // "left chest" wins over the shorter names
  assert.equal(key("a logo on the pocket"), "left-chest");
  // ordinary words are not places: a one-word name needs "on / at / in …" before it
  assert.equal(key("a cat with a big belly"), null);
  assert.equal(key("pocket money"), null);
  assert.equal(key("a lion across the chest"), null); // a big chest print, not the thin Chest Line strip
  assert.equal(key(""), null);
  // a place this tee does not offer is not found
  assert.equal(key("nape", plain), null);
  assert.equal(key("bottom left corner", plain), null);
});

test("chat edits: the AI may name the place in words; a place the tee lacks falls back to the biggest free one on that side", () => {
  assert.equal(areaFor("nape", all, []).key, "nape");
  assert.equal(areaFor("Back Neck", all, ["top-back"]).key, "nape"); // Top Back and the back neck can share a tee
  assert.equal(areaFor("nape", all, ["full-back"]).key, "nape"); // so can Full Back: the nape mark is not moved onto it
  assert.equal(areaFor("the bottom left corner", all, []).key, "lower-left");
  assert.equal(areaFor("chest line", all, []).key, "chest-line");
  // not offered: the same side
  assert.equal(areaFor("nape", plain, []).side, "back");
  assert.equal(areaFor("lower-left", plain, []).side, "front");
  assert.equal(areaFor("mid-back", plain, []).side, "back");
  // taken by an overlapping print: the biggest free area on that side, never the blocked one
  const moved = areaFor("chest-line", all, ["centre-front"]);
  assert.notEqual(moved.key, "chest-line");
  assert.equal(moved.side, "front");
});

test("concept pieces go where the words say, when the tee offers that place on the piece's side", () => {
  assert.deepEqual(placementHint("small nape logo", all), { area: "nape", size: "small" });
  assert.equal(pieceArea("back", all, [], placementHint("small nape logo", all)).key, "nape");
  assert.equal(pieceArea("back", all, [], placementHint("words across the lower back", all)).key, "lower-back");
  assert.equal(pieceArea("front", all, [], placementHint("a small lower-left hit", all)).key, "lower-left");
  assert.equal(pieceArea("front", all, [], placementHint("a line of words on the chest line", all)).key, "chest-line");
  // a big picture is not squeezed into a logo spot
  assert.equal(placementHint("a big bold tiger on the back of the neck", all).area, null);
  assert.equal(pieceArea("back", all, [], placementHint("a big bold tiger on the back of the neck", all)).key, "full-back");
  // nor is a picture with more in it, when the place is named for one part of it
  assert.equal(pieceArea("front", all, [], placementHint("a roaring lion with KINGS XI on the chest line", all)).key, "centre-front");
  assert.equal(pieceArea("back", all, [], placementHint("phoenix rising, the name small at the nape", all)).key, "full-back");
  assert.equal(pieceArea("back", all, [], placementHint("team name across the shoulders and a big number in the middle of the back", all)).key, "full-back");
  // a strip carries lettering, a logo spot a small mark: not a picture
  assert.equal(pieceArea("back", all, [], placementHint("a tiger on the lower back", all)).key, "full-back");
  assert.equal(pieceArea("back", all, [], placementHint("a dragon at the back of the neck", all)).key, "full-back");
  assert.equal(pieceArea("back", all, [], placementHint("the initials AK at the back of the neck", all)).key, "nape");
  // "black and white" is one thing (the colours), not a second print
  assert.equal(pieceArea("back", all, [], placementHint("small nape logo in black and white", all)).key, "nape");
  // today's tee (no new places switched on): a picture still goes where it went before
  assert.equal(pieceArea("back", plain, [], placementHint("team name across the shoulders and a big number in the middle of the back", plain)).key, "full-back");
  assert.equal(pieceArea("back", plain, [], placementHint("a small logo on the upper back", plain)).key, "full-back");
  // the place must be on the piece's own side
  assert.equal(pieceArea("front", all, [], placementHint("nape logo", all)).key, "centre-front");
  // a tee without the place: the usual area
  assert.equal(pieceArea("back", plain, [], placementHint("nape logo", plain)).key, "full-back");
  // without the tee's areas the hint reads as before (chest / full / none)
  assert.deepEqual(placementHint("small left-chest badge"), { area: "chest", size: "small" });
  assert.equal(pieceArea("front", all, [], placementHint("small left-chest badge", all)).key, "left-chest");
});

test("a photo request names the new places in plain words too (the free reading, when the text AI can't)", () => {
  // the areas as the room hands them over: name, side, free, and the other names customers use
  const areas = all.map((p) => ({ key: p.key, label: p.label, side: p.side, main: p.main, free: true, aka: p.aka }));
  assert.equal(areaFromWords("print my logo at the back of the neck", areas), "nape"); // not Full Back
  assert.equal(areaFromWords("put this photo on the nape", areas), "nape");
  assert.equal(areaFromWords("my photo on the belly", areas), "mid-front");
  assert.equal(areaFromWords("logo at the bottom left corner", areas), "lower-left");
  assert.equal(areaFromWords("my photo on the back", areas), "full-back"); // "the back" is still the main back area
  assert.deepEqual(areasFromWords("my logo at the back of the neck and the photo on the full front", areas), ["nape", "full-front"]);
  assert.deepEqual(areasFromWords("a cat with a big belly", areas), []); // a word, not a place
  // a tee that doesn't offer the place: the old reading ("at the back" → the main back area)
  const old = plain.map((p) => ({ key: p.key, label: p.label, side: p.side, main: p.main, free: true, aka: p.aka }));
  assert.equal(areaFromWords("print my logo at the back of the neck", old), "full-back");
  assert.equal(areaFromWords("put this photo on the nape", old), null);
  // the room passes the other names along with the areas
  assert.match(src("../src/studio/DesignRoomPage.jsx"), /const areas = assistantCtx\(\)\.areas\.map\(\(x\) => \(\{ \.\.\.x, aka: positions\.find\(\(p\) => p\.key === x\.key\)\?\.aka \|\| \[\] \}\)\);/);
});

/* ---------- the print pack: TOP / SIDE on the job card ---------- */

// artworkSpot() from printFiles.js (that file needs a canvas to load, so its pure function is read out of the source)
const artworkSpot = new Function(`${/export function artworkSpot\([\s\S]*?\r?\n\}\r?\n/.exec(src("../src/studio/printFiles.js"))[0].replace("export ", "")}; return artworkSpot;`)();
const FULL = { x0: 0, y0: 0, x1: 100, y1: 100 }; // the artwork fills its area

test("the job card's TOP and SIDE for the new places: from the collar seam, wearer's left / right", () => {
  const spot = (key, size) => {
    const p = pos(key);
    const cm = p.cmBySize[size];
    const s = artworkSpot(p, size, FULL, cm);
    return [s.down, s.fromCollar, s.across];
  };
  assert.deepEqual(spot("chest-line", "M"), [6, true, 0]);
  assert.deepEqual(spot("mid-front", "M"), [30, true, 0]);
  assert.deepEqual(spot("mid-front", "3XL"), [32, true, 0]);
  assert.deepEqual(spot("lower-left", "XS"), [42, true, 11]); // 6 cm off the centre + half of 10 cm, to the wearer's LEFT
  assert.deepEqual(spot("lower-left", "3XL"), [54.5, true, 11]);
  assert.deepEqual(spot("lower-right", "M"), [46, true, -11]);
  assert.deepEqual(spot("front-left-vertical", "M"), [6, true, 13]);
  assert.deepEqual(spot("front-right-vertical", "M"), [6, true, -13]);
  assert.deepEqual(spot("nape", "M"), [2.5, true, 0]);
  assert.deepEqual(spot("mid-back", "L"), [21, true, 0]);
  assert.deepEqual(spot("lower-back", "2XL"), [61.5, true, 0]);
  // the sketch of the tee on the job card grows for a low print on a big size, and stays 74 cm for the rest
  const pf = src("../src/studio/printFiles.js");
  assert.match(pf, /const lengthCm = Math\.max\(74, dropCm \+ ribCm \+ lowest \+ 2\);/);
  assert.match(pf, /const S = Math\.min\(MAP_PX, \(c\.height - top - 76\) \/ lengthCm\);/);
  const lowestBack = 2.5 + 2 + 64 + 11 + 2; // collar dip + rib + Lower Back at 3XL + its height + room
  assert.ok(lowestBack > 74, "Lower Back at 3XL needs the longer sketch");
});

test("new words start at a size that suits the spot: wide strips get readable letters, tall areas start as before", () => {
  const cm = (W, H, small) => (startFontPct(W, H, small) / 100) * H; // letter size in cm
  // tall or square areas: exactly the old 12 % / 7 % of the height
  assert.equal(startFontPct(28, 32), 12); // Centre Front: 3.8 cm letters as before
  assert.equal(startFontPct(38, 42), 12);
  assert.equal(startFontPct(12, 13), 12); // Left Chest
  assert.equal(startFontPct(10, 52), 12); // a vertical strip
  assert.equal(startFontPct(9, 10, true), 7); // a sleeve's small line
  // wide strips: letters follow the width, never more than half the height (a third for a small line)
  assert.ok(cm(26, 7) > 3 && cm(26, 7) <= 3.5, `Chest Line heading ${cm(26, 7)} cm`); // was 0.84 cm
  assert.ok(cm(35, 10) > 4 && cm(35, 10) <= 5, `Top Back heading ${cm(35, 10)} cm`); // was 1.2 cm
  assert.ok(cm(7, 4) > 0.8, `Back Neck heading ${cm(7, 4)} cm`);
  assert.ok(cm(7, 4, true) >= 0.45, `Back Neck small line ${cm(7, 4, true)} cm`); // was 0.28 cm
  assert.equal(startFontPct(200, 10), 50); // never past half the height
  assert.equal(startFontPct(200, 10, true), 30);
  assert.equal(startFontPct(0, 10), 12); // no size yet: the plain start
  // the first grown words sit in the middle; stacked words never hang below the area
  assert.equal(startTextY({ n: 0, heightPct: 60, grown: true }), 20);
  assert.equal(startTextY({ n: 0, heightPct: 10 }), 18); // as before
  assert.equal(startTextY({ n: 3, heightPct: 40 }), 58);
  assert.ok(startTextY({ n: 2, heightPct: 70, grown: true }) + 70 <= 98);
});
