// Free placement phase 2 (14 Nov 2026, docs/FREE_PLACEMENT.md): prints in free places ("spots") on the server — the
// save check (cleanDesign), the box kept on each element (el.spot) through the database and copies, the print data
// for the print team, the AI area lists, and old designs giving exactly the same print data as before.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import mongoose from "mongoose";
import Customization from "../models/customizationModel.js";
import GarmentType from "../models/garmentTypeModel.js";
import { cleanDesign, designPrintData } from "../controllers/customizationController.js";
import { aiAreas, maxPrintBySize, positionsForGarment, spotWhereOf } from "../data/printPositions.js";
import { SIZES, maxPrintFor } from "../data/panelModel.js";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const { garment, design } = fixture("threeSpotDesign.json");
const old = fixture("oldDesigns.json");
const clone = (v) => structuredClone(v);
const LINES = ["S", "M", "L", "XL", "2XL", "3XL"].map((size) => ({ size, qty: 1 }));

// cleanDesign looks the garment up: here the fixture's, without a database
const realFindOne = GarmentType.findOne;
async function save(body, g = garment) {
  GarmentType.findOne = async () => g;
  try {
    return await cleanDesign(body);
  } finally {
    GarmentType.findOne = realFindOne;
  }
}
const refused = (body, words, g) =>
  assert.rejects(save(body, g), (err) => {
    assert.equal(err.status, 400);
    assert.match(err.message, words);
    return true;
  });
// the 3-spot design with one spot's box changed
const withBox = (i, patch) => {
  const d = clone(design);
  d.elements[i].spot = { ...d.elements[i].spot, ...patch };
  return d;
};
// a small logo in a free place on the front
const logo = (key, label, downCm, acrossCm) => ({
  type: "image",
  src: design.elements[0].src,
  position: key,
  side: "front",
  spot: { key, side: "front", label, from: null, downCm, acrossCm, wCm: 5, hCm: 5, base: "M", scale: "F" },
  x: 0,
  y: 0,
  width: 100,
  height: 100,
});

test("the 3-spot design saves: every print keeps its box on its elements", async () => {
  const d = await save(clone(design));
  assert.equal(d.layoutVersion, 2);
  assert.deepEqual(
    d.elements.map((e) => [e.position, e.side]),
    [
      ["spot-1", "front"],
      ["spot-2", "front"],
      ["spot-3", "back"],
      ["spot-4", "left"],
    ],
  );
  d.elements.forEach((e, i) => assert.deepEqual(e.spot, design.elements[i].spot, e.position));
});

test("a box is cleaned: rounded to 1 mm, a sleeve print on the sleeve's centre line, an unknown start area dropped, a name given", async () => {
  const d = await save(withBox(3, { downCm: 4.04, acrossCm: 3.3, label: "   ", from: "made-up", scale: "X" }));
  assert.deepEqual(d.elements[3].spot, { key: "spot-4", side: "left", label: "Left sleeve 1", from: null, downCm: 4, acrossCm: 0, wCm: 8, hCm: 6, base: "M", scale: "G" });
  // every element of a spot gets the same checked box (the first one's)
  const two = clone(design);
  two.elements.push({ ...clone(design.elements[1]), text: "2026", spot: { ...design.elements[1].spot, downCm: 1 } });
  const saved = await save(two);
  assert.deepEqual(saved.elements[4].spot, saved.elements[1].spot);
  assert.equal(saved.elements[4].spot.downCm, 40);
});

test("refused with a plain reason: too near the side seam, the collar, the hem or the shoulder seam, too big, a wrong size, no box", async () => {
  await refused(withBox(0, { acrossCm: 15 }), /^Front 1: it is too near the side seam \(keep 2.5 cm clear\)\. Please move or shrink it\.$/);
  await refused(withBox(1, { downCm: 1 }), /^Front 2: it is too near the collar \(keep 2 cm clear of the collar seam\)/);
  await refused(withBox(2, { downCm: 40 }), /^Back 1: it is too near the hem/);
  await refused(withBox(2, { wCm: 36, hCm: 40 }), /^Back 1: it is bigger than the biggest print \(35 x 52 cm\)/);
  await refused(withBox(3, { downCm: 1 }), /^Left sleeve 1: it is too near the shoulder seam/);
  await refused(withBox(3, { wCm: 12, hCm: 6 }), /^Left sleeve 1: it is bigger than the biggest print \(10 x 10 cm\)/);
  await refused(withBox(0, { base: "XS" }), /measured on a size this tee doesn't come in/);
  await refused(withBox(0, { side: "shorts" }), /isn't on the front, back or a sleeve/);
  await refused(withBox(0, { wCm: "big" }), /can't be printed/);
  const none = clone(design);
  delete none.elements[0].spot;
  await refused(none, /has no place on the tee/);
});

test("refused: prints that overlap on any size (two spots, or a spot and a print area in use); at most 8 spots", async () => {
  const twoSpots = clone(design);
  twoSpots.elements.push({ ...clone(design.elements[1]), position: "spot-5", spot: { ...design.elements[1].spot, key: "spot-5", label: "Front 3", downCm: 43 } });
  await refused(twoSpots, /^Front 2 and Front 3 overlap on the tee — move one of them\.$/);
  const withArea = clone(design);
  withArea.elements.push({ type: "text", text: "HI", position: "left-chest", x: 10, y: 10, width: 80, height: 40 });
  await refused(withArea, /^Front 1 and Left Chest overlap on the tee/);
  // 8 small logos well apart save; a 9th is one too many
  const grid = [5, 15, 25, 35].flatMap((down) => [-8, 8].map((across) => [down, across]));
  const eight = { ...clone(design), elements: grid.map(([down, across], i) => logo(`spot-${i + 1}`, `Front ${i + 1}`, down, across)) };
  assert.equal((await save(eight)).elements.length, 8);
  eight.elements.push(logo("spot-9", "Front 9", 45, 0));
  await refused(eight, /^A tee can have at most 8 prints in free places/);
});

test("a garment without a 3D tee (the flat page) can't have prints in free places", async () => {
  await refused(clone(design), /need this garment's 3D design room/, { ...garment, key: "hoodie", category: "Hoodie", fit: "regular" });
});

test("the database keeps el.spot (and copies of the design do); an old element is stored exactly as before", () => {
  const user = new mongoose.Types.ObjectId();
  const doc = new Customization({ ...clone(design), _id: undefined, user });
  assert.equal(doc.validateSync(), undefined);
  const stored = doc.toObject();
  stored.elements.forEach((e, i) => assert.deepEqual(e.spot, design.elements[i].spot));
  // "Make a copy" / "the same tee again" (duplicateCustomization) creates a design from the stored elements
  const copy = new Customization({ garmentType: stored.garmentType, color: "white", user, layoutVersion: 2, elements: stored.elements }).toObject();
  assert.deepEqual(copy.elements.map((e) => e.spot), design.elements.map((e) => e.spot));
  // fields that aren't part of a box are not stored
  const junk = new Customization({ ...clone(design), _id: undefined, user, elements: [{ ...clone(design.elements[0]), spot: { ...design.elements[0].spot, evil: "x" } }] }).toObject();
  assert.equal("evil" in junk.elements[0].spot, false);
  // an element without a spot has no spot field at all (no default added to older designs)
  for (const d of old.designs) {
    const back = new Customization({ ...clone(d), _id: undefined, user }).toObject();
    for (const e of back.elements) assert.equal("spot" in e, false, `${d.name}: ${e.position}`);
  }
});

test("the print team gets each spot as a print area of its own: its name, one file per size group, its place per size", async () => {
  const saved = await save(clone(design));
  const pd = designPrintData({ ...clone(design), elements: saved.elements }, garment, LINES);
  const by = Object.fromEntries(pd.areas.map((a) => [a.key, a]));
  assert.deepEqual(
    pd.areas.map((a) => [a.label, a.side, a.spot]),
    [
      ["Front 1", "front", true],
      ["Front 2", "front", true],
      ["Back 1", "back", true],
      ["Left sleeve 1", "left", true],
    ],
  );
  const files = (key) => by[key].files.map((f) => [f.sizes.join(","), f.cm.join(" x ")]);
  // F: the same cm on every size (one file); G: one file per size group (S / M–XL / 2XL–3XL)
  assert.deepEqual(files("spot-1"), [["S,M,L,XL,2XL,3XL", "9 x 9"]]);
  assert.deepEqual(files("spot-2"), [["S", "23 x 5.7"], ["M,L,XL", "24 x 6"], ["2XL,3XL", "27.1 x 6.8"]]);
  assert.deepEqual(files("spot-3"), [["S", "28.7 x 36.3"], ["M,L,XL", "30 x 38"], ["2XL,3XL", "33.9 x 43"]]);
  assert.deepEqual(files("spot-4"), [["S,M,L,XL,2XL,3XL", "8 x 6"]]);
  // where it goes: its top below the collar seam (a sleeve: below the shoulder seam) and its place across, per size
  assert.deepEqual([by["spot-2"].collarCm.S, by["spot-2"].collarCm.M, by["spot-2"].collarCm["3XL"]], [38.3, 40, 45.2]);
  assert.deepEqual([by["spot-3"].collarCm.S, by["spot-3"].collarCm.XL, by["spot-3"].collarCm["2XL"]], [9.6, 10, 11.3]);
  assert.equal(by["spot-4"].collarCm.L, 4);
  assert.deepEqual(by["spot-1"].placeBySize["3XL"], { align: "wearer-left", gapCm: 4.5, topCm: 0 });
  assert.deepEqual(by["spot-2"].placeBySize.M, { align: "centre", topCm: 32 });
  assert.equal(by["spot-1"].main, false);
  // never "spot-1" as a name
  for (const a of pd.areas) assert.doesNotMatch(a.label, /spot-\d/);
});

test("a team print in a free place: one file per player, at the player's size group", () => {
  const d = clone(design);
  d.elements[1] = { ...d.elements[1], role: "name" };
  d.players = [
    { name: "ASHA", number: "1", size: "S" },
    { name: "RAVI", number: "2", size: "2XL" },
  ];
  const pd = designPrintData(d, garment, [{ size: "S", qty: 1 }, { size: "2XL", qty: 1 }]);
  const a = pd.areas.find((x) => x.key === "spot-2");
  assert.equal(a.perPlayer, true);
  assert.deepEqual(a.files.map((f) => [f.player.name, f.cm.join(" x ")]), [["ASHA", "23 x 5.7"], ["RAVI", "27.1 x 6.8"]]);
});

test("old designs (no spots) give exactly the same print data as before free placement", () => {
  old.designs.forEach((d, i) => assert.equal(JSON.stringify(designPrintData(clone(d), garment, old.lines)), JSON.stringify(old.printData[i]), d.name));
});

test("the biggest print the design room is sent is the one panelModel.js falls back to", () => {
  for (const g of [garment, null]) {
    const table = maxPrintBySize(g);
    for (const size of SIZES) for (const side of ["front", "back", "left", "right"]) assert.deepEqual(table[size][side], maxPrintFor(null, size, side), `${size} ${side}`);
  }
  // a garment's own chart sizes get one too (4XL as 2XL–3XL)
  const big = maxPrintBySize({ ...garment, sizeChart: [...garment.sizeChart, { size: "4XL", chest: 56, length: 35 }] });
  assert.deepEqual(big["4XL"].front, [37, 54]);
  assert.deepEqual(maxPrintFor(big, "4XL", "front"), [37, 54]);
});

test("the AI lists: a free place keeps its words; every other area keeps exactly what it had", () => {
  const where = "24 x 6 cm, 40 cm below the collar seam, centred";
  assert.deepEqual(spotWhereOf({ key: "spot-2", label: "Front 2", where }), { where });
  assert.deepEqual(spotWhereOf({ key: "left-chest", where: "anything" }), {});
  assert.deepEqual(spotWhereOf({ key: "spot-2" }), {});
  assert.equal(spotWhereOf({ key: "spot-1", where: "x".repeat(300) }).where.length, 100);
  // aiAreas leaves keys it doesn't know as they are
  assert.deepEqual(aiAreas([{ key: "spot-1", label: "Front 1", where }]), [{ key: "spot-1", label: "Front 1", where }]);
  // every AI route that maps the areas the design room sent keeps a spot's words
  const src = (file) => readFileSync(new URL(file, import.meta.url), "utf8");
  for (const [file, n] of [
    ["../controllers/aiController.js", 4],
    ["../controllers/assistantController.js", 1],
    ["../services/assistantBrain.js", 1],
    ["../services/aiChatService.js", 1],
    ["../services/aiTextService.js", 1],
  ]) {
    assert.ok(src(file).split("...spotWhereOf(a)").length - 1 >= n, file);
  }
});

/* ---------- the review's fixes (14 Nov 2026) ---------- */

test("refused: a spot on top of a print area where the 3D tee draws it (Left Chest sits lower on the big sizes)", async () => {
  // Left Chest has no print-team start line: our usual line puts it 8 cm down on every size, the 3D tee 8 cm × the
  // size's scale (9.5 cm on 3XL). A logo just under the usual box but on the 3D one is refused; one clear of both saves.
  const chest = { type: "text", text: "HI", position: "left-chest", x: 10, y: 10, width: 80, height: 40 };
  const s3xl = (34 * 2.54) / 72.4; // the 3XL tee's length / the 3D tee's
  const bottom3d = 8 * s3xl + positionsForGarment(garment).positions.find((p) => p.key === "left-chest").cmBySize["3XL"][1]; // its bottom on the 3D 3XL tee
  const at = (down) => ({ ...clone(design), elements: [chest, { ...logo("spot-1", "Front 1", down, 10), spot: { ...logo("spot-1", "Front 1", down, 10).spot, wCm: 8, hCm: 4 } }] });
  await refused(at(bottom3d - 0.6), /^Front 1 and Left Chest overlap on the tee/);
  assert.equal((await save(at(Math.ceil((bottom3d + 0.2) * 10) / 10))).elements.length, 2);
});

test("refused: a spot on a side the garment isn't printed on; a made-up start area is never kept", async () => {
  const noSleeves = { ...garment, printAreas: garment.printAreas.map((a) => (/sleeve/.test(a.key) ? { ...a, offered: false } : a)) };
  await refused(clone(design), /^Left sleeve 1: this garment isn't printed on the sleeves\. Please move it\.$/, noSleeves);
  const noBack = { ...garment, printAreas: garment.printAreas.map((a) => (["full-back", "nape", "top-back", "centre-back", "mid-back", "lower-back", "vertical-back"].includes(a.key) ? { ...a, offered: false } : a)) };
  await refused(clone(design), /^Back 1: this garment isn't printed on the back/, noBack);
  for (const from of ["__proto__", "constructor", "toString", "hasOwnProperty"]) {
    const d = await save(withBox(1, { from }));
    assert.equal(d.elements[1].spot.from, null, from);
  }
});

test("two prints never share a name: a taken name or a print area's name becomes the next free one", async () => {
  const twin = await save(withBox(1, { label: "Front 1" }));
  assert.deepEqual(twin.elements.map((e) => e.spot.label), ["Front 1", "Front 2", "Back 1", "Left sleeve 1"]);
  const area = await save(withBox(1, { label: "full front" }));
  assert.equal(area.elements[1].spot.label, "Front 2");
  // every element of the spot carries the new name, and the print team reads it
  const two = withBox(1, { label: "Front 1" });
  two.elements.push({ ...clone(two.elements[1]), text: "2026", y: 60 });
  const saved = await save(two);
  assert.deepEqual([saved.elements[1].spot.label, saved.elements[4].spot.label], ["Front 2", "Front 2"]);
  const pd = designPrintData({ ...clone(design), elements: saved.elements }, garment, LINES);
  assert.deepEqual(pd.areas.map((a) => a.label), ["Front 1", "Front 2", "Back 1", "Left sleeve 1"]);
});

test("the collar crop top: a print too high on the front is told the real line (below the V opening), not 3 cm", async () => {
  const crop = { key: "girls-crop-top-collar", label: "Crop Top with Collar", category: "Girls Crop Top with Collar", isActive: true, sizes: ["S", "M", "L"], sizeChart: [{ size: "S", chest: 32, length: 16 }, { size: "M", chest: 34, length: 17 }, { size: "L", chest: 36, length: 18 }], colors: garment.colors };
  const d = { ...clone(design), garmentType: crop.key, elements: [logo("spot-1", "Front 1", 10, 0)] };
  await refused(d, /^Front 1: it is too near the collar opening \(its top must be at least 16\.\d cm below the collar seam\)\. Please move or shrink it\.$/, crop);
});

// (21 Nov 2026, the owner: "the print limits should only be for design myself") a print the Assistant placed as on its
// mockup (its element marked aiLayout) keeps `free` and is saved anywhere on the tee; a customer's own print isn't
test("an Assistant print (aiLayout) is saved free of the print limits; free on a customer's own print is dropped", async () => {
  const { panelFor } = await import("../data/panelModel.js");
  const len = panelFor(garment, "M").front.len;
  const nearHem = { downCm: Math.round((len - 9.5) * 10) / 10, acrossCm: 0 }; // the 9 cm logo 0.5 cm above the hem (the limit: 2 cm)
  await refused(withBox(0, nearHem), /too near the hem/);
  await refused(withBox(0, { ...nearHem, free: true }), /too near the hem/); // free asked for, but not the Assistant's
  const ai = withBox(0, { ...nearHem, free: true });
  ai.elements[0].aiLayout = "front";
  const d = await save(ai);
  assert.equal(d.elements[0].spot.free, true);
  assert.equal(d.elements[0].spot.downCm, nearHem.downCm);
  assert.equal(d.elements[0].aiLayout, "front");
  // an old design (no free) keeps exactly its stored box
  const plain = await save(clone(design));
  assert.ok(plain.elements.every((e) => !("free" in e.spot)));
});
