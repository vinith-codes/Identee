// Free placement phase 1 (14 Nov 2026, docs/FREE_PLACEMENT.md): more print areas in data/printPositions.js —
// their sizes on every tee size, their start lines, opt-in only, the overlap rule, kids / 4XL sizes and the AI lists.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AI_AREAS_MAX, CATALOG_BY_KEY, DEFAULT_OFFERED, PRINT_AREA_CATALOG, aiAreas, catalogForGarment, overlappingPairs, positionsForGarment, printSizeCm } from "../data/printPositions.js";

const NEW_KEYS = ["chest-line", "mid-front", "front-left-vertical", "lower-left", "lower-right", "mid-back", "lower-back", "nape"];
const SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];
// What Admin → Customizable → Print areas saves: every row with the size it shows (PrintAreasStep.jsx submit), the
// keys given switched on.
const adminSaved = (keys) => ({
  printAreas: catalogForGarment(null).map((a) => ({
    key: a.key,
    offered: keys.includes(a.key),
    width: a.cm ? a.cm.standard[0] : null,
    height: a.cm ? a.cm.standard[1] : null,
    bySize: a.exact && a.cmBySize ? a.cmBySize : null,
  })),
});
// a garment that offers every place (the Oversized tee once the admin switches the new ones on)
const everything = adminSaved(PRINT_AREA_CATALOG.map((a) => a.key));
const all = positionsForGarment(everything).positions;
const pos = (key) => all.find((p) => p.key === key);

test("the new places have the planned sizes on every tee size (cm, width × height)", () => {
  const want = {
    "chest-line": { XS: [22, 6], S: [22, 6], M: [26, 7], L: [26, 7], XL: [26, 7], "2XL": [30, 8], "3XL": [30, 8] },
    "mid-front": { XS: [22, 12], S: [22, 12], M: [26, 14], L: [26, 14], XL: [26, 14], "2XL": [30, 16], "3XL": [30, 16] },
    "mid-back": { XS: [26, 18], S: [26, 18], M: [30, 20], L: [30, 20], XL: [30, 20], "2XL": [34, 22], "3XL": [34, 22] },
    "lower-back": { XS: [26, 9], S: [26, 9], M: [30, 10], L: [30, 10], XL: [30, 10], "2XL": [34, 11], "3XL": [34, 11] },
  };
  for (const [key, sizes] of Object.entries(want)) for (const size of SIZES) assert.deepEqual(pos(key).cmBySize[size], sizes[size], `${key} ${size}`);
  // the same cm on every size: the small hits
  for (const size of SIZES) {
    assert.deepEqual(pos("lower-left").cmBySize[size], [10, 10]);
    assert.deepEqual(pos("lower-right").cmBySize[size], [10, 10]);
    assert.deepEqual(pos("nape").cmBySize[size], [7, 4]);
  }
  // printSizeCm (the print pack's size) reads the same numbers
  assert.deepEqual(printSizeCm("chest-line", "m", everything), { width: 26, height: 7 });
  assert.deepEqual(printSizeCm("nape", "3XL", everything), { width: 7, height: 4 });
});

test("Front Left Vertical is the mirror of the print team's Front Right Vertical", () => {
  const l = CATALOG_BY_KEY["front-left-vertical"];
  const r = CATALOG_BY_KEY["front-right-vertical"];
  assert.deepEqual(l.bySize, r.bySize);
  assert.deepEqual(l.collarCm, r.collarCm);
  assert.equal(l.place.gapCm, r.place.gapCm);
  assert.equal(l.place.topCm, r.place.topCm);
  assert.equal(l.place.align, "wearer-left");
  assert.equal(r.place.align, "wearer-right");
});

test("start lines: chest line on the print team's front line, the back neck 2.5 cm under the collar, the rest as planned", () => {
  const collar = (key, size) => pos(key).collarCm[size];
  assert.deepEqual(SIZES.map((s) => collar("chest-line", s)), [6, 6, 6, 7, 7, 8, 8]); // as Full Front
  assert.deepEqual(SIZES.map((s) => collar("chest-line", s)), SIZES.map((s) => collar("full-front", s)));
  assert.deepEqual(SIZES.map((s) => collar("mid-front", s)), [28, 28, 30, 30, 30, 32, 32]);
  assert.deepEqual(SIZES.map((s) => collar("mid-back", s)), [19, 19, 21, 21, 21, 23, 23]);
  assert.deepEqual(SIZES.map((s) => collar("nape", s)), [2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5]);
  // the low places move down with every size's length (measured up from the hem)
  for (const key of ["lower-left", "lower-right", "lower-back"]) {
    const lines = SIZES.map((s) => collar(key, s));
    assert.ok(lines.every((v, i) => i === 0 || v > lines[i - 1]), `${key}: ${lines}`);
  }
  // the small low prints sit 6 cm off the centre line, either side (clear of Vertical Front's 10 cm strip)
  assert.equal(pos("lower-left").place.gapCm, 6);
  assert.equal(pos("lower-right").place.gapCm, 6);
});

test("every area with a collar start line has a matching topCm at M (front 8, back 7 cm under the collar)", () => {
  // the overlap rule (rectOf), the card drawings (AreaThumb) and the admin preview read topCm, not collarCm
  const START = { front: 8, back: 7 };
  for (const a of PRINT_AREA_CATALOG.filter((x) => x.collarCm)) {
    assert.ok(Math.abs(a.collarCm.M - (START[a.side] + a.place.topCm)) <= 0.5, `${a.key}: collar ${a.collarCm.M} vs top ${a.place.topCm}`);
    assert.equal(Object.keys(a.collarCm).length, SIZES.length, `${a.key}: a start line for every size`);
  }
});

test("the new places are opt-in: not offered on a garment without saved print-area settings", () => {
  for (const key of NEW_KEYS) {
    assert.equal(CATALOG_BY_KEY[key].optIn, true, key);
    assert.equal(CATALOG_BY_KEY[key].estimate, true, key);
    assert.ok(!DEFAULT_OFFERED.includes(key), key);
  }
  // a polo / kids' tee / crop top with no settings keeps exactly the areas it had before
  const before = ["centre-front", "left-chest", "right-chest", "full-front", "vertical-front", "front-right-vertical", "full-back", "top-back", "centre-back", "vertical-back", "left-sleeve", "right-sleeve"];
  assert.deepEqual([...DEFAULT_OFFERED].sort(), [...before].sort());
  assert.deepEqual(positionsForGarment({ key: "polo", sizeChart: [] }).positions.map((p) => p.key).sort(), [...before].sort());
  // the Oversized tee has saved settings: a new place shows only once the admin switches it on
  const saved = { printAreas: [{ key: "centre-front", offered: true }, { key: "full-back", offered: true }] };
  assert.deepEqual(positionsForGarment(saved).positions.map((p) => p.key), ["centre-front", "full-back"]);
  const withNape = adminSaved(["centre-front", "full-back", "nape"]);
  assert.ok(positionsForGarment(withNape).positions.some((p) => p.key === "nape"));
});

test("an old 'offered' with no size (girls', boys' and kids' round necks: Lower Left / Right) does not switch a new place on", () => {
  // the shape saved on those garments before Lower Left / Right had a size: it did nothing then, and must not now
  const stale = (key) => ({ key, offered: true, width: null, height: null, bySize: null });
  const garment = { printAreas: [{ key: "centre-front", offered: true, width: 28, height: 32, bySize: null }, stale("lower-left"), stale("lower-right"), stale("lower-back")] };
  assert.deepEqual(positionsForGarment(garment).positions.map((p) => p.key), ["centre-front"]);
  // and the admin page shows them as Off (so the next Save doesn't switch them on either)
  const rows = catalogForGarment(garment);
  for (const key of ["lower-left", "lower-right", "lower-back"]) assert.equal(rows.find((r) => r.key === key).offered, false, key);
  // a real admin choice always carries a size: then it counts (one size, or a size per tee size)
  const chosen = { printAreas: [...garment.printAreas.slice(0, 1), { key: "lower-left", offered: true, width: 10, height: 10, bySize: null }, { key: "lower-back", offered: true, width: null, height: null, bySize: { M: [30, 10] } }] };
  assert.deepEqual(positionsForGarment(chosen).positions.map((p) => p.key), ["centre-front", "lower-left", "lower-back"]);
  // the older places keep the rule they always had (an old "offered" on a place with a catalog size counts)
  assert.deepEqual(positionsForGarment({ printAreas: [{ key: "full-back", offered: true }] }).positions.map((p) => p.key), ["full-back"]);
});

test("the admin wizard lists the new places with their sizes, a hint and the estimate mark, and they can be switched on", () => {
  const rows = catalogForGarment({ printAreas: [{ key: "centre-front", offered: true }] });
  // what the page saves for a row once it is switched on carries the size it shows, so it counts
  const on = adminSaved(["centre-front", ...NEW_KEYS]);
  assert.equal(catalogForGarment(on).filter((r) => NEW_KEYS.includes(r.key) && r.offered).length, NEW_KEYS.length);
  for (const key of NEW_KEYS) {
    const r = rows.find((x) => x.key === key);
    assert.ok(r, key);
    assert.equal(r.estimate, true, key);
    assert.equal(r.offered, false, key);
    assert.ok(r.cmBySize && r.cmBySize.M, `${key} has a size, so it can be offered`);
    assert.ok(r.hint.length > 8, key);
  }
  assert.equal(rows.find((x) => x.key === "centre-front").estimate, false);
  // the save checks a size before offering: every new place has one
  for (const key of NEW_KEYS) assert.ok(CATALOG_BY_KEY[key].cm, key);
});

test("every place has a customer name and a short hint; the names customers use are lower case", () => {
  const labels = new Set();
  for (const a of PRINT_AREA_CATALOG) {
    assert.ok(a.label && !labels.has(a.label), a.key);
    labels.add(a.label);
    assert.ok(a.hint && a.hint.length <= 45, `${a.key}: "${a.hint}"`);
    assert.ok(Array.isArray(a.aka) && a.aka.length && a.aka.every((w) => w === w.toLowerCase()), a.key);
  }
  assert.equal(CATALOG_BY_KEY.nape.label, "Back Neck");
  assert.ok(CATALOG_BY_KEY.nape.aka.includes("back of the neck"));
  assert.ok(CATALOG_BY_KEY["chest-line"].aka.includes("words across the chest"));
  // "across the chest" alone is how people describe a big chest print too: it must not send a picture to the thin strip
  assert.ok(!PRINT_AREA_CATALOG.some((a) => a.aka.includes("across the chest") || a.aka.includes("down the front")));
  assert.ok(CATALOG_BY_KEY["mid-front"].aka.includes("belly"));
});

test("overlaps: the new places are blocked by exactly the areas they share the tee with", () => {
  const conflicts = (key) => [...pos(key).conflicts].sort();
  assert.deepEqual(conflicts("chest-line"), ["centre-front", "front-left-vertical", "front-right-vertical", "full-front", "left-chest", "right-chest", "vertical-front"]);
  assert.deepEqual(conflicts("mid-front"), ["centre-front", "front-left-vertical", "front-right-vertical", "full-front", "vertical-front"]);
  assert.deepEqual(conflicts("front-left-vertical"), ["centre-front", "chest-line", "full-front", "left-chest", "lower-left", "mid-front"]);
  assert.deepEqual(conflicts("lower-left"), ["front-left-vertical", "full-front"]);
  assert.deepEqual(conflicts("lower-right"), ["front-right-vertical", "full-front"]);
  // Vertical Front (an older place) keeps exactly the clashes it had: the low prints sit beside its strip
  assert.ok(!pos("vertical-front").conflicts.some((k) => k.startsWith("lower-")));
  // the back neck mark sits above every back print, Full Back included: a nape mark with a big back print works
  assert.deepEqual(conflicts("nape"), []);
  assert.deepEqual(conflicts("mid-back"), ["centre-back", "full-back", "vertical-back"]);
  assert.deepEqual(conflicts("lower-back"), ["centre-back", "vertical-back"]);
  // and the other way round (the rule is the same both ways)
  for (const p of all) for (const q of p.conflicts) assert.ok(pos(q).conflicts.includes(p.key), `${p.key} / ${q}`);
  // places that may share a tee
  assert.deepEqual(overlappingPairs(["nape", "top-back", "mid-back", "lower-back"], all), []);
  for (const big of ["full-back", "centre-back", "vertical-back"]) assert.deepEqual(overlappingPairs(["nape", big], all), [], big);
  assert.deepEqual(overlappingPairs(["chest-line", "mid-front", "lower-left", "lower-right"], all), []);
  assert.deepEqual(overlappingPairs(["front-left-vertical", "front-right-vertical", "vertical-front"], all), []);
  assert.deepEqual(overlappingPairs(["chest-line", "left-chest"], all), [["Left Chest", "Chest Line"]]);
});

test("the back neck really clears the back prints on every size (not just within the 1 cm overlap allowance)", () => {
  // its bottom edge under the back collar, against where each back print starts: the print team's start lines
  // (Top Back, Centre Back, Vertical Back), and Full Back's estimated 7 cm (printFiles.js EST_START.back, the 3D tee)
  const FULL_BACK_TOP = 7;
  for (const size of SIZES) {
    const bottom = pos("nape").collarCm[size] + pos("nape").cmBySize[size][1];
    assert.ok(bottom <= FULL_BACK_TOP - 0.5, `${size}: ends ${bottom} cm under the collar, Full Back starts ${FULL_BACK_TOP}`);
    for (const key of ["top-back", "centre-back", "vertical-back"]) assert.ok(bottom <= pos(key).collarCm[size] - 1, `${size} ${key}: ${bottom} vs ${pos(key).collarCm[size]}`);
    assert.ok(pos("nape").collarCm[size] >= 2.5, "2.5 cm or more under the collar seam");
  }
});

test("kids' sizes and 4XL / 5XL get sizes for the new places the same way as for the others", () => {
  const garment = {
    ...everything,
    sizeChart: [
      { size: "S", chest: 44, length: 29 },
      { size: "M", chest: 46, length: 30 },
      { size: "4XL", chest: 56, length: 35 },
      { size: "5XL", chest: 58, length: 36 },
      { size: "7-8", chest: 30, length: 21 },
    ],
  };
  const { positions } = positionsForGarment(garment);
  for (const key of NEW_KEYS) {
    const p = positions.find((x) => x.key === key);
    assert.deepEqual(p.cmBySize["4XL"], p.cmBySize["3XL"], `${key} 4XL`);
    assert.deepEqual(p.cmBySize["5XL"], p.cmBySize["3XL"], `${key} 5XL`);
    const kid = p.cmBySize["7-8"];
    assert.ok(kid[0] <= p.cmBySize.S[0] && kid[1] <= p.cmBySize.S[1] && kid[0] >= 2, `${key} kids ${kid}`);
    // the start line too: 4XL / 5XL as 3XL; a kids' size higher up (its tee is shorter), never above 2.5 cm
    assert.equal(p.collarCm["4XL"], p.collarCm["3XL"], `${key} 4XL line`);
    assert.equal(p.collarCm["5XL"], p.collarCm["3XL"], `${key} 5XL line`);
    assert.ok(p.collarCm["7-8"] <= p.collarCm.S && p.collarCm["7-8"] >= 2.5, `${key} kids line ${p.collarCm["7-8"]}`);
  }
  // a low print on a kids' 7-8 tee (21 in ≈ 53 cm long) still ends well above its hem
  const low = positions.find((x) => x.key === "lower-back");
  assert.ok(low.collarCm["7-8"] + low.cmBySize["7-8"][1] < 21 * 2.54 - 8, `${low.collarCm["7-8"]} + ${low.cmBySize["7-8"][1]}`);
  // the print pack (catalogForGarment) reads the same line; the older places keep theirs exactly (old designs)
  assert.equal(catalogForGarment(garment).find((x) => x.key === "lower-back").collarCm["7-8"], low.collarCm["7-8"]);
  assert.equal(positions.find((x) => x.key === "full-front").collarCm["7-8"], undefined);
  assert.equal(positions.find((x) => x.key === "full-front").collarCm, CATALOG_BY_KEY["full-front"].collarCm);
  // the print pack's page (catalogForGarment) is the size the customer designed on, for the new places; the older
  // places keep the page they always printed with (L for a size the print team's sheet lacks), so old orders print
  // exactly as before
  const pack = catalogForGarment(garment);
  for (const key of NEW_KEYS) {
    const page = pack.find((x) => x.key === key).cmBySize;
    const room = positions.find((x) => x.key === key).cmBySize;
    for (const size of ["4XL", "5XL", "7-8"]) assert.deepEqual(page[size], room[size], `${key} ${size}`);
  }
  assert.equal(pack.find((x) => x.key === "full-front").cmBySize["4XL"], undefined);
});

test("the AI area lists keep 40 areas (none of the places is cut off) and carry where each one is", () => {
  assert.equal(AI_AREAS_MAX, 40);
  assert.ok(PRINT_AREA_CATALOG.length <= AI_AREAS_MAX);
  // every area list the AI gets is cut at that number, not at 20 / 24 / 30 as before
  const ai = readFileSync(new URL("../controllers/aiController.js", import.meta.url), "utf8");
  const assist = readFileSync(new URL("../controllers/assistantController.js", import.meta.url), "utf8");
  const cuts = [...`${ai}\n${assist}`.matchAll(/areas : \[\]\)\s*\.slice\(0, ([A-Z_0-9]+)\)/g)].map((m) => m[1]);
  assert.equal(cuts.length, 5);
  assert.ok(cuts.every((c) => c === "AI_AREAS_MAX"), cuts.join());
  // what the AI reads: each area with a few words on where it is and the names customers use
  const out = aiAreas([{ key: "nape", label: "Back Neck", free: true }, { key: "made-up", label: "?" }]);
  assert.equal(out[0].where, CATALOG_BY_KEY.nape.hint);
  assert.ok(out[0].words.includes("nape"));
  assert.deepEqual(out[1], { key: "made-up", label: "?" });
});
