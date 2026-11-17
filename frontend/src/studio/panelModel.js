// panelModel.js — free placement phase 2 (14 Nov 2026, docs/FREE_PLACEMENT.md): a print can sit at ANY place on the
// tee (a "spot"), stored in cm. This file holds the maths every part needs: each side of the tee ("panel") for every
// tee size, the safe zone a print must keep clear of the collar / seams / hem, the biggest print, how a spot grows with
// the tee size, where it lands, which prints overlap, and the helpers that re-box and join prints.
//
// TWO IDENTICAL COPIES: server/data/panelModel.js and frontend/src/studio/panelModel.js. Change both the same way
// (frontend/tests/spots.test.mjs checks the two files are the same text): the design room, the server's checks and
// the print files must work out exactly the same centimetres. No imports, so both sides can load it as it is.
//
// A spot is kept ON each of its elements (el.spot), so every copy of a design keeps it:
//   el.position = "spot-1", el.spot = { key: "spot-1", side, label: "Front 1", from, downCm, acrossCm, wCm, hCm, base, scale }
//   downCm   top edge of the print below the collar seam at the centre (sleeves: below the sleeve's top seam)
//   acrossCm the print's centre from the tee's centre line, + = the wearer's left (sleeves: 0, on the sleeve's centre line)
//   wCm, hCm its size, all measured on the tee size `base` (the size it was designed on)
//   scale    "G" grows with the tee (a big print: bigger on 2XL, smaller on S), "F" the same cm on every size (a logo)
//   from     the print area it started from ("left-chest"), or null
// The element's x / y / width / height stay % of the spot's box and fontSizePct % of its height, as on a print area.
// So to the rest of the code a spot is one more print area (spotPosition gives it the same shape).

export const SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"];
// our size groups (as printPositions.js SIZE_GROUPS): a growing print gets one size per group, so at most 3 print files
const GROUP_OF = { XS: "small", S: "small", M: "standard", L: "standard", XL: "standard", "2XL": "large", "3XL": "large" };
// the usual start line under the collar for an area without the print team's own (printFiles.js EST_START)
const EST_START = { front: 8, back: 7, shorts: 25 };

export const SPOT_SIDES = ["front", "back", "left", "right"];
const SPOT_KEY = /^spot-(\d+)$/;
export const isSpotKey = (key) => SPOT_KEY.test(String(key ?? ""));

// The safe zone (cm), our ESTIMATE until the print team answers: DTF transfers are not pressed over the collar rib,
// a seam or the hem. Shops keep about 2.5 cm from every seam; these are a little stricter.
export const SAFE_CM = { collar: 3, sideSeam: 5, hem: 4, shoulder: 2.5, sleeveHem: 2.5, sleeveSide: 2.5 };
// The 3D tee's body is narrower than the real tee (about 0.65 of the size chart's width): a print also keeps this far
// inside its outline, so it shows on the front or back and doesn't wrap round the side in the preview.
export const MODEL_EDGE_CM = 1;
export const MAX_SPOTS = 8; // prints in free places per tee (each one is a picture and a 3D decal: phones run out of memory)
export const JOIN_CM = 1; // two prints closer than this are pressed as one transfer
export const PAD_CM = 0.5; // a print's box = its things + this much all round
export const LETTER_ROOM = 1.15; // a box is at least this many times the biggest letter size tall (the server keeps letters <= 100 % of it)
export const NAME_MIN_CM = 30; // a print with the players' names keeps at least this width (or its print area's), so long names stay big
const TOL_CM = 0.5; // the server's check allows this much over a line (rounding, a finger's nudge)
const TOUCH_CM = 0.05; // boxes that only touch don't overlap

const r1 = (n) => Math.round(n * 10) / 10;
const up1 = (n) => Math.ceil(n * 10 - 1e-6) / 10;
const down1 = (n) => Math.floor(n * 10 + 1e-6) / 10;
const isSleeve = (side) => side === "left" || side === "right";

/* ---------- the 3D tees ---------- */
// Measured on each .glb (frontend/public/models, model cm, z up; free-placement-plan/work/phase2/build/glbmeasure.cjs):
//   front / back  collar seam to hem at the centre line (the front collar as the room draws it: 3 cm lower than the
//                 model's own on the oversized tees, neckDip.js)
//   half          the narrowest half-width of the body below the arms (the hem, on the oversized tee)
//   sleeveStart   how far below the sleeve's top a sleeve print area starts on it (teeModel.js anchors; on the
//                 regular tee 2.5 and 1.5 cm below its one shoulder line: 2 between)
//   frontTop      (collar crop top) how far below the collar its front prints start, clear of the V opening
//   start         how far below the collar the 3D tee draws a front / back print area that has no print-team start
//                 line (teeModel.js anchors: neck − top). Our usual start line (EST_START) is an estimate and the 3D
//                 tee scales its own with the size, so the overlap checks keep a spot clear of both (boxesOf).
//   sleeve        the real sleeve [length, opening] in model cm. The sleeve has no row in the size chart: the
//                 Oversized tee's is 9" long with an 8.5" opening at M (30" long), as a share of the tee's length
//                 (server/scripts/garment-images/README.md — an ESTIMATE until the client confirms). A crop keeps its
//                 uncropped tee's sleeve (cropping the body doesn't shorten it: the Oversized Crop has the Oversized
//                 tee's sleeve mesh); the collar crop top (a cropped polo) its 3D sleeve, with the same opening ratio.
//   sleeve3d      how far the 3D sleeve reaches below its top seam on the room's sleeve line (measured 14 Nov 2026:
//                 free-placement-plan/work/phase2/fix/sleeveHem.cjs, both sleeves): a sleeve print stays on it too
// The 3D tee is one size: for a tee size it is scaled by the size chart's length / lengthCm (teeModel.js placeArea).
const SLEEVE = { len: 9 / 30, w: 8.5 / 30 };
const teeSleeve = (lengthCm) => [SLEEVE.len * lengthCm, SLEEVE.w * lengthCm];
const KINDS = {
  oversized: { lengthCm: 72.4, front: 60.36, back: 68.83, half: 18, sleeveStart: 5, start: { front: 8, back: 7 }, sleeve: teeSleeve(72.4), sleeve3d: 20.7 },
  oversizedCrop: { lengthCm: 48.3, front: 39.3, back: 45.26, half: 19.2, sleeveStart: 5, start: { front: 8, back: 7 }, sleeve: teeSleeve(72.4), sleeve3d: 20.7 },
  regular: { lengthCm: 62.6, front: 57.62, back: 62.59, half: 16.5, sleeveStart: 2, start: { front: 8, back: 7 }, sleeve: teeSleeve(62.6), sleeve3d: 10.2 },
  collarCrop: { lengthCm: 42.6, front: 37.87, back: 41.1, half: 16.5, frontTop: 15.07, sleeveStart: 5, start: { front: 15.07, back: 7 }, sleeve: [19.7, (19.7 * 8.5) / 9], sleeve3d: 19.7 },
};

// Which 3D tee a garment is shown on — the same rule as studio/teeModel.js modelForGarment (null = no 3D tee: the
// flat page, which has no free places).
export function panelKind(garment) {
  if (!garment) return null;
  const name = `${garment.category || ""} ${garment.key || ""}`;
  if (/co-?ord/i.test(name)) return "regular";
  if (/crop/i.test(name)) {
    if (/collar|polo/i.test(name)) return "collarCrop";
    if (/oversized/i.test(name)) return "oversizedCrop";
  }
  if (garment.fit === "oversized" || /oversized/i.test(garment.category || "") || /oversized/i.test(garment.key || "")) return "oversized";
  if (/round.?neck/i.test(name)) return "regular";
  return null;
}

/* ---------- the size chart ---------- */
// The size chart's row for a size, in inches: { chest (all round — "chest around the fullest part", PRODUCT_SPEC.md),
// length (high shoulder point to the hem) }. A size missing from the chart takes the nearest standard size that has
// one, 2" of chest and 1" of length a size (the Oversized chart's steps; 4XL / 5XL step on from 3XL); no chart at all,
// or a size of no standard step (a kids' age the chart leaves out): the Oversized M.
const NO_CHART = { chest: 46, length: 30 };
const stepOf = (size) => {
  const i = SIZES.indexOf(size);
  const big = /^([4-9])XL$/i.exec(String(size));
  return i >= 0 ? i : big ? SIZES.length - 1 + (Number(big[1]) - 3) : -1;
};
const inChart = (garment) => (Array.isArray(garment?.sizeChart) ? garment.sizeChart : []).filter((r) => r && Number(r.chest) > 0 && Number(r.length) > 0);
export function chartRow(garment, size) {
  const chart = inChart(garment);
  const row = chart.find((r) => r.size === size);
  if (row) return { chest: Number(row.chest), length: Number(row.length) };
  const i = stepOf(size);
  const near = chart.filter((r) => stepOf(r.size) >= 0).sort((a, b) => Math.abs(stepOf(a.size) - i) - Math.abs(stepOf(b.size) - i))[0];
  if (i < 0 || !near) return { ...NO_CHART };
  const d = i - stepOf(near.size);
  return { chest: Number(near.chest) + 2 * d, length: Number(near.length) + d };
}

const chartSizes = (garment) => (Array.isArray(garment?.sizeChart) ? garment.sizeChart.map((r) => r?.size).filter(Boolean) : []);
// The sizes the garment comes in, in its own order (its list, else its chart, else the standard sizes): the overlap
// and size-group checks run on each of them.
export function sizesOf(garment) {
  const own = garment?.sizes?.length ? garment.sizes : chartSizes(garment);
  return own.length ? [...own] : [...SIZES];
}
// Every size a spot gets centimetres for: the standard sizes and the garment's own (kids' ages, 4XL / 5XL).
export const allSizes = (garment) => [...new Set([...SIZES, ...chartSizes(garment), ...(garment?.sizes || [])])];

// The size group of a size: XS–S / M–XL / 2XL–3XL; 4XL / 5XL go with 2XL–3XL (as printPositions.js withChartSizes);
// a kids' size (smaller chest than S, or one the chart doesn't have) is a group of its own.
export function groupOf(size, garment) {
  if (GROUP_OF[size]) return GROUP_OF[size];
  if (stepOf(size) >= 0) return "large";
  const row = inChart(garment).find((r) => r.size === size);
  return row && Number(row.chest) >= chartRow(garment, "S").chest ? "large" : `own:${size}`;
}
// the sizes of a group this garment comes in (its smallest first), else every size of the group
const groupMembers = (group, garment) => {
  const sold = sizesOf(garment).filter((s) => groupOf(s, garment) === group);
  return sold.length ? sold : allSizes(garment).filter((s) => groupOf(s, garment) === group);
};

/* ---------- the panels ---------- */
/**
 * Each side of the tee for one tee size, in cm.
 * @returns {{ kind, size, s, sleeveStart, start, front, back, left, right }} or null (no 3D tee). Each side:
 *   flatW   width from side seam to side seam (the size chart's chest / 2; a sleeve: its opening)
 *   w       the width a print can use on the 3D tee too (the smaller of the chart's and the 3D tee's)
 *   len     collar seam to hem at the centre (a sleeve: its top seam to its hem)
 *   top, bottom  the safe zone: a print's top edge at least `top` below the collar seam, its bottom edge at most `bottom`
 *           (a sleeve: also MODEL_EDGE_CM inside the 3D sleeve's hem, as `half` keeps inside the 3D body)
 *   half    the safe zone across: a print's edge at most this far from the centre line
 */
export function panelFor(garment, size) {
  const name = panelKind(garment);
  const kind = KINDS[name];
  if (!kind) return null;
  const { chest, length } = chartRow(garment, size);
  const L = length * 2.54;
  const s = L / kind.lengthCm;
  const flatW = (chest * 2.54) / 2;
  const modelW = 2 * kind.half * s;
  const body = (len, top) => ({ flatW, w: Math.min(flatW, modelW), len, top, bottom: len - SAFE_CM.hem, half: Math.min(flatW / 2 - SAFE_CM.sideSeam, modelW / 2 - MODEL_EDGE_CM) });
  const sleeveLen = kind.sleeve[0] * s;
  const sleeveW = kind.sleeve[1] * s;
  const sleeve = { flatW: sleeveW, w: sleeveW, len: sleeveLen, top: SAFE_CM.shoulder, bottom: Math.min(sleeveLen - SAFE_CM.sleeveHem, kind.sleeve3d * s - MODEL_EDGE_CM), half: sleeveW / 2 - SAFE_CM.sleeveSide };
  return {
    kind: name,
    size,
    s,
    sleeveStart: kind.sleeveStart * s,
    start: { front: kind.start.front * s, back: kind.start.back * s },
    front: body(kind.front * s, Math.max(SAFE_CM.collar, (kind.frontTop || 0) * s)),
    back: body(kind.back * s, SAFE_CM.collar),
    left: sleeve,
    right: { ...sleeve },
  };
}

// The biggest print for a size and side [w, h] (cm). The server works it out from its catalog — the print team's
// Full Front / Centre Back (35 x 52, 37 x 54 at 2XL–3XL) and on a sleeve the bigger of its sleeve area and 10 x 10
// (the most Indian DTF shops press on a sleeve) — and sends it with the print areas (printPositions.js maxPrintBySize).
// When that table hasn't come, the same numbers from here (a test checks the two agree).
export function maxPrintFor(maxPrint, size, side) {
  const own = maxPrint?.[size]?.[side];
  if (Array.isArray(own) && own.length === 2 && own.every((n) => Number.isFinite(n) && n > 0)) return own;
  const big = GROUP_OF[size] === "large" || /^[4-9]XL$/i.test(String(size));
  return isSleeve(side) ? (big ? [13, 14] : [10, 10]) : big ? [37, 54] : [35, 52];
}

// The lines one tee size puts on a print (safe zone + the biggest print).
function limitsFor(garment, size, side, maxPrint) {
  const [maxW, maxH] = maxPrintFor(maxPrint, size, side);
  const p = panelFor(garment, size);
  if (!p) return { top: -Infinity, bottom: Infinity, half: Infinity, maxW, maxH };
  const q = p[side];
  return { top: q.top, bottom: q.bottom, half: q.half, maxW, maxH };
}
const tightest = (list) => list.reduce((a, b) => ({ top: Math.max(a.top, b.top), bottom: Math.min(a.bottom, b.bottom), half: Math.min(a.half, b.half), maxW: Math.min(a.maxW, b.maxW), maxH: Math.min(a.maxH, b.maxH) }));
// one size group's lines: its tightest size, so every size of the group can print the same file
const groupLimits = (group, garment, side, maxPrint) => tightest(groupMembers(group, garment).map((size) => limitsFor(garment, size, side, maxPrint)));

/* ---------- where a print area sits ---------- */
// Where a print area (a catalog one or a spot) sits for one tee size, in cm: its top edge below the collar seam
// (sleeves: below the sleeve's top seam), its centre from the centre line (+ = the wearer's left; sleeves: 0), its size.
// A catalog area without the print team's start line sits under the side's usual start line (printFiles.js EST_START,
// what the job card uses); a catalog sleeve area starts where the 3D tee puts it.
export function areaBoxCm(position, size, garment) {
  const side = position.side;
  const [w, h] = position.cmBySize?.[size] || position.cm?.[GROUP_OF[size] || "standard"] || position.cm?.standard || [0, 0];
  const p = position.placeBySize?.[size] || position.place || { align: "centre", topCm: 0 };
  const collar = position.collarCm?.[size];
  let down;
  if (collar != null) down = collar;
  else if (isSleeve(side)) down = (panelFor(garment, size)?.sleeveStart ?? 5) + (p.topCm || 0);
  else down = (EST_START[side] ?? 8) + (position.main ? 0 : p.topCm || 0);
  const gap = p.gapCm || 0;
  const across = isSleeve(side) ? 0 : p.align === "wearer-left" ? gap + w / 2 : p.align === "wearer-right" ? -(gap + w / 2) : 0;
  return { side, down, across, w, h };
}

// How far apart two boxes ({ down, across, w, h }) are, in cm; below 0 they overlap.
export function gapBetween(a, b) {
  const x = Math.max(a.across - a.w / 2 - (b.across + b.w / 2), b.across - b.w / 2 - (a.across + a.w / 2));
  const y = Math.max(a.down - (b.down + b.h), b.down - (a.down + a.h));
  return Math.max(x, y);
}
export const boxesOverlap = (a, b) => a.side === b.side && gapBetween(a, b) < -TOUCH_CM;

// Where a print may sit on one tee size, for the overlap and "too close" checks: its box (areaBoxCm) and, for a front
// or back print area without the print team's start line (Centre Front, the chests, Full Back), also where the 3D tee
// draws it — the model's own start line × the size's scale (teeModel.js placeArea), lower on the big sizes and under
// the collar crop top's V opening. Our usual start line is only an estimate, so a spot keeps clear of both.
function boxesOf(position, size, garment) {
  const a = areaBoxCm(position, size, garment);
  if (position.spot || isSleeve(a.side) || position.collarCm?.[size] != null) return [a];
  const start = panelFor(garment, size)?.start?.[a.side];
  if (start == null) return [a];
  const p = position.placeBySize?.[size] || position.place || {};
  const down = start + (p.topCm || 0);
  return Math.abs(down - a.down) > TOUCH_CM ? [a, { ...a, down }] : [a];
}
// the least gap between two prints on one tee size, in cm (below 0 they overlap)
const leastGap = (a, b, size, garment) => Math.min(...boxesOf(a, size, garment).flatMap((x) => boxesOf(b, size, garment).map((y) => gapBetween(x, y))));

/* ---------- a spot on every tee size ---------- */
const same = (a, b) => Math.abs(a - b) <= TOUCH_CM;
// A spot made from a print area and not moved or resized: it keeps that area's exact sizes and start lines on every
// tee size (the print team's own sheet).
export function presetKept(box, preset, garment) {
  if (!preset || !box?.from || box.from !== preset.key || box.side !== preset.side) return false;
  const at = areaBoxCm(preset, box.base, garment);
  return same(at.w, box.wCm) && same(at.h, box.hCm) && same(at.down, box.downCm) && same(at.across, box.acrossCm);
}

// A box fitted inside a size group's lines: shrunk as a whole when too big (its things keep their shape), then moved in
// from the collar / hem / side seams. `clamped` says why, for the design check.
function fitBox(b, lim) {
  let { w, h, down, across } = b;
  const clamped = [];
  const big = Math.min(1, lim.maxW / w, lim.maxH / h);
  if (big < 1) {
    clamped.push("big");
    w = down1(w * big);
    h = down1(h * big);
  }
  const wide = (2 * lim.half) / w;
  const tall = (lim.bottom - lim.top) / h;
  if (Math.min(wide, tall) < 1 && lim.half > 0 && lim.bottom > lim.top) {
    clamped.push(wide < tall ? "side" : "hem");
    const k = Math.min(wide, tall);
    w = down1(w * k);
    h = down1(h * k);
  }
  w = r1(w);
  h = r1(h);
  down = r1(down);
  across = r1(across);
  if (down < lim.top) {
    down = up1(lim.top);
    clamped.push("collar");
  }
  if (down + h > lim.bottom + 1e-9) {
    down = down1(lim.bottom - h);
    clamped.push("hem");
  }
  if (Math.abs(across) + w / 2 > lim.half + 1e-9) {
    across = Math.sign(across) * Math.max(0, down1(lim.half - w / 2));
    clamped.push("side");
  }
  return { w, h, down, across, clamped: [...new Set(clamped)] };
}

// The panel width a G spot grows with: the size group's smallest size (so the print fits every size of the group)
const growWidth = (group, garment, side) => panelFor(garment, groupMembers(group, garment)[0])?.[side]?.flatW || 1;

/**
 * The room a spot's box has, measured on the tee size `base`, so that it needs no moving or shrinking on ANY size the
 * garment comes in (phase 3, 15 Nov 2026: the panel editor stops a thing there, and reboxSpot keeps a wide box inside
 * it): each size group's lines taken back to `base` — "F" the same cm, "G" divided by how much it grows there (as
 * spotSizes grows it) — and the tightest of them. { top, bottom, half, maxW, maxH } in cm.
 */
export function spotRoom(garment, base, side, scale = "F", maxPrint = null) {
  const baseGroup = groupOf(base, garment);
  const baseW = growWidth(baseGroup, garment, side);
  const groups = [...new Set([baseGroup, ...sizesOf(garment).map((s) => groupOf(s, garment))])];
  return tightest(
    groups.map((group) => {
      const lim = groupLimits(group, garment, side, maxPrint);
      const k = scale === "G" && group !== baseGroup ? growWidth(group, garment, side) / baseW : 1;
      return { top: lim.top / k, bottom: lim.bottom / k, half: lim.half / k, maxW: lim.maxW / k, maxH: lim.maxH / k };
    }),
  );
}

/**
 * A spot's size and place on every tee size: { size: { w, h, down, across, clamped } } (cm, to 0.1).
 * G: box, down and across × (the size group's panel width / the base size group's), F: the same cm; then fitted into
 * the size group's safe zone and biggest print. The same numbers for every size of a group: at most one print file per
 * group. A spot that is still its print area (presetKept) takes that area's own sizes.
 * @param ctx  { preset: the catalog position of box.from (as this garment offers it), maxPrint: maxPrintBySize table }
 */
export function spotSizes(box, garment, { preset = null, maxPrint = null } = {}) {
  const out = {};
  const sizes = allSizes(garment);
  if (presetKept(box, preset, garment)) {
    for (const size of sizes) {
      const a = areaBoxCm(preset, size, garment);
      out[size] = { w: a.w, h: a.h, down: a.down, across: a.across, clamped: [] };
    }
    return out;
  }
  const side = box.side;
  const baseGroup = groupOf(box.base, garment);
  const baseW = growWidth(baseGroup, garment, side);
  const fit = {};
  for (const size of sizes) {
    const group = groupOf(size, garment);
    if (!fit[group]) {
      const k = box.scale === "G" && group !== baseGroup ? growWidth(group, garment, side) / baseW : 1;
      fit[group] = fitBox({ w: box.wCm * k, h: box.hCm * k, down: box.downCm * k, across: isSleeve(side) ? 0 : box.acrossCm * k }, groupLimits(group, garment, side, maxPrint));
    }
    out[size] = fit[group];
  }
  return out;
}

/**
 * A spot as a print position, the same shape as the catalog's (printPositions.js toPosition), so the 3D tee, the
 * editor, the cards, the design check and the print files treat it as one more print area:
 *   collarCm[size] = its top below the collar seam (sleeves: below the sleeve's top seam), cmBySize[size] its size,
 *   placeBySize[size] its place across (align + gapCm from the centre line, gapCm < 0 when it straddles the line),
 *   place = the one at its base size (the card drawing), spot = the stored box, clamped = { size: why } (design check)
 */
export function spotPosition(box, garment, ctx = {}) {
  const per = spotSizes(box, garment, ctx);
  const side = box.side;
  const placeOf = (b) =>
    isSleeve(side)
      ? { align: "centre", topCm: 0 }
      : { ...(b.across === 0 ? { align: "centre" } : { align: b.across > 0 ? "wearer-left" : "wearer-right", gapCm: Math.abs(b.across) - b.w / 2 }), topCm: r1(b.down - (EST_START[side] ?? 0)) };
  const cmBySize = {};
  const collarCm = {};
  const placeBySize = {};
  const clamped = {};
  for (const [size, b] of Object.entries(per)) {
    cmBySize[size] = [b.w, b.h];
    collarCm[size] = b.down;
    placeBySize[size] = placeOf(b);
    if (b.clamped.length) clamped[size] = b.clamped;
  }
  return {
    key: box.key,
    label: box.label,
    hint: "",
    aka: [],
    side,
    main: false,
    place: placeOf(per[box.base] || per.M),
    placeBySize,
    collarCm,
    cmBySize,
    exact: true,
    cm: { small: cmBySize.S, standard: cmBySize.L, large: cmBySize["2XL"] },
    spot: box,
    clamped,
  };
}

/* ---------- the spots of a design ---------- */
// The spot boxes of a design, one per spot key (its first element's), in the order they first appear.
export function spotsIn(elements = []) {
  const seen = new Map();
  for (const e of elements || []) {
    if (isSpotKey(e?.position) && !seen.has(e.position) && e.spot && e.spot.key === e.position && SPOT_SIDES.includes(e.spot.side)) seen.set(e.position, e.spot);
  }
  return [...seen.values()];
}

const BOX_KEYS = ["key", "side", "label", "from", "downCm", "acrossCm", "wCm", "hCm", "base", "scale"];
const sameBox = (a, b) => a === b || (!!a && !!b && BOX_KEYS.every((k) => (a[k] ?? null) === (b[k] ?? null)));

/**
 * Every element of a spot carries the same box (the first one's); one added to a spot without it (a new picture, words
 * the AI added, a thing moved there) gets it from the others, or from the design before the change (`prev`: the spot
 * whose only thing was just replaced). Elements on a print area lose a box they no longer need.
 * @returns the same array when nothing changed (old designs: always)
 */
export function normaliseSpots(elements, prev = []) {
  if (!Array.isArray(elements)) return elements;
  const boxOf = new Map();
  const find = (list, key) => (list || []).find((e) => e?.position === key && e.spot && e.spot.key === key)?.spot || null;
  let changed = false;
  const out = elements.map((e) => {
    if (!e || !isSpotKey(e.position)) {
      if (!e || e.spot === undefined) return e;
      changed = true;
      const { spot, ...rest } = e; // eslint-disable-line no-unused-vars
      return rest;
    }
    if (!boxOf.has(e.position)) boxOf.set(e.position, find(elements, e.position) || find(prev, e.position));
    const box = boxOf.get(e.position);
    if (!box || sameBox(e.spot, box)) return e;
    changed = true;
    return { ...e, spot: box };
  });
  return changed ? out : elements;
}

// Two prints overlap on the tee on one of these sizes (every size it comes in).
const hitsOn = (a, b, sizes, garment) => a.side === b.side && sizes.some((size) => leastGap(a, b, size, garment) < -TOUCH_CM);

/**
 * The room's print positions: the catalog (exactly as the server sent it when the design has no spots — the same
 * array) and after it a position for each spot. `conflicts` follow the real boxes in cm on every size the tee comes
 * in: a spot lists the print areas and spots it overlaps, and a print area it overlaps lists the spot (blockersOf /
 * clashesIn read them). Print areas the spot doesn't touch stay the very same objects.
 */
export const withSpots = (catalog, elements, garment, maxPrint = null) => withSpotBoxes(catalog, spotsIn(elements), garment, maxPrint);
// the same from the spot boxes themselves (spotsIn): the design room keeps them apart, so the positions are worked out
// again only when a box changes
export function withSpotBoxes(catalog, boxes, garment, maxPrint = null) {
  if (!boxes.length) return catalog;
  const spots = boxes.map((b) => spotPosition(b, garment, { preset: b.from ? catalog.find((p) => p.key === b.from) || null : null, maxPrint }));
  const sizes = sizesOf(garment);
  const out = catalog.map((c) => {
    const extra = spots.filter((s) => hitsOn(s, c, sizes, garment)).map((s) => s.key);
    return extra.length ? { ...c, conflicts: [...(c.conflicts || []), ...extra] } : c;
  });
  for (const s of spots) {
    s.conflicts = [...catalog.filter((c) => hitsOn(s, c, sizes, garment)).map((c) => c.key), ...spots.filter((o) => o !== s && hitsOn(s, o, sizes, garment)).map((o) => o.key)];
  }
  return [...out, ...spots];
}

/* ---------- checks ---------- */
const WORDS = {
  // (top: the real line — the collar crop top's front prints start below its V opening, not 3 cm down)
  front: {
    collar: (top) => (top > SAFE_CM.collar + TOUCH_CM ? `it is too near the collar opening (its top must be at least ${up1(top)} cm below the collar seam)` : `it is too near the collar (keep ${SAFE_CM.collar} cm clear of the collar seam)`),
    hem: `it is too near the hem (keep ${SAFE_CM.hem} cm clear)`,
    side: `it is too near the side seam (keep ${SAFE_CM.sideSeam} cm clear)`,
  },
  sleeve: { collar: () => `it is too near the shoulder seam (keep ${SAFE_CM.shoulder} cm clear)`, hem: `it is too near the sleeve's hem (keep ${SAFE_CM.sleeveHem} cm clear)`, side: "it is too wide for the sleeve" },
};
// The lines a spot is fitted into on one tee size: its size group's safe zone and biggest print (the design check's words)
export const spotLimits = (garment, size, side, maxPrint = null) => groupLimits(groupOf(size, garment), garment, side, maxPrint);
/**
 * What is wrong with a spot's box as stored (the server's check), or null: it must fit the safe zone and the biggest
 * print of every size of its base size group (with a little room), unless it is still its print area.
 */
export function spotProblem(box, garment, { preset = null, maxPrint = null } = {}) {
  if (presetKept(box, preset, garment)) return null;
  const words = isSleeve(box.side) ? WORDS.sleeve : WORDS.front;
  const lim = groupLimits(groupOf(box.base, garment), garment, box.side, maxPrint);
  if (box.wCm > lim.maxW + TOUCH_CM || box.hCm > lim.maxH + TOUCH_CM) return `it is bigger than the biggest print (${lim.maxW} x ${lim.maxH} cm)`;
  if (box.downCm < lim.top - TOL_CM) return words.collar(lim.top);
  if (box.downCm + box.hCm > lim.bottom + TOL_CM) return words.hem;
  if (Math.abs(box.acrossCm) + box.wCm / 2 > lim.half + TOL_CM) return words.side;
  return null;
}

/**
 * The first two prints that would overlap on the tee on any size it comes in — a spot and another spot, or a spot and
 * a print area the design uses — as [a, b], or null. (Two print areas: the catalog's own rule, printPositions.js.)
 */
export function overlapPair(spots, used, garment) {
  const sizes = sizesOf(garment);
  const all = [...spots, ...used];
  for (let i = 0; i < spots.length; i++) {
    for (let j = i + 1; j < all.length; j++) if (hitsOn(spots[i], all[j], sizes, garment)) return [spots[i], all[j]];
  }
  return null;
}

/**
 * Prints closer than JOIN_CM on one tee size (they would be pressed as one transfer): [[a, b], …] with at least one
 * spot in each pair; prints that overlap are left out (their conflicts already say so).
 */
export function nearPairs(positions, usedKeys, size, garment) {
  const used = positions.filter((p) => usedKeys.includes(p.key));
  const out = [];
  used.forEach((a, i) =>
    used.slice(i + 1).forEach((b) => {
      if (a.side !== b.side || (!a.spot && !b.spot)) return;
      const g = leastGap(a, b, size, garment);
      if (g >= -TOUCH_CM && g < JOIN_CM) out.push([a, b]);
    }),
  );
  return out;
}

/* ---------- names and words ---------- */
const SIDE_WORD = { front: "Front", back: "Back", left: "Left sleeve", right: "Right sleeve" };
// The next free spot key of a design: "spot-3"
export function nextSpotKey(elements = []) {
  const n = Math.max(0, ...(elements || []).map((e) => Number(SPOT_KEY.exec(String(e?.position ?? ""))?.[1] || 0)));
  return `spot-${n + 1}`;
}
// The customer's name for a new spot on a side: "Front 1", "Front 2", "Left sleeve 1" (`also`: more names in use;
// names are compared without capitals)
export function spotLabel(side, elements = [], also = []) {
  const taken = new Set([...spotsIn(elements).map((b) => b.label), ...also].map((l) => String(l).toLowerCase()));
  const word = SIDE_WORD[side] || "Print";
  let n = 1;
  while (taken.has(`${word} ${n}`.toLowerCase())) n++;
  return `${word} ${n}`;
}
// The customer's name for a place key in a design: a spot's own name ("Front 1", kept on its elements), else null
// (a print area goes by its catalog name) — so "spot-1" is never shown
export const spotNameIn = (elements, key) => (isSpotKey(key) ? (elements || []).find((e) => e?.position === key && e.spot?.label)?.spot.label || null : null);
// A spot in words for the AI and the order sheet: "24 x 6 cm, 40 cm below the collar seam, centred"
export function spotWhere(position, size, garment) {
  const b = areaBoxCm(position, size, garment);
  const f = (n) => String(r1(n));
  if (isSleeve(b.side)) return `${f(b.w)} x ${f(b.h)} cm, ${f(b.down)} cm below the shoulder seam, on the sleeve's centre line`;
  const across = Math.abs(b.across) < 0.5 ? "centred" : `${f(Math.abs(b.across))} cm to the wearer's ${b.across > 0 ? "left" : "right"} of the centre`;
  return `${f(b.w)} x ${f(b.h)} cm, ${f(b.down)} cm below the collar seam, ${across}`;
}

/* ---------- re-boxing and joining (phase 3 uses these as the customer drags) ---------- */
// One thing in its box, in cm: centre (x across the box's file from its left edge, y down), size, letter size, turn.
// (thingCm, extentOf, onTee, inFile and placeIn are exported for the panel editor, studio/panelDrag.js, phase 3)
export const thingCm = (e, W, H) => ({
  cx: (((e.x || 0) + (e.width || 0) / 2) / 100) * W,
  cy: (((e.y || 0) + (e.height || 0) / 2) / 100) * H,
  w: ((e.width || 0) / 100) * W,
  h: ((e.height || 0) / 100) * H,
  font: e.type === "text" ? ((e.fontSizePct || 0) / 100) * H : 0,
  rot: e.rotation || 0,
});
// half its width / height as it sits, turned
export const extentOf = (t) => {
  const a = (t.rot * Math.PI) / 180;
  return { hw: (Math.abs(t.w * Math.cos(a)) + Math.abs(t.h * Math.sin(a))) / 2, hh: (Math.abs(t.w * Math.sin(a)) + Math.abs(t.h * Math.cos(a))) / 2 };
};
// A box's file runs left to right towards the wearer's left on the front (and a sleeve), towards the wearer's right on
// the back (it is seen from behind): a thing's centre on the tee from its place in the file, and back.
export const onTee = (box, t) => ({ across: box.side === "back" ? box.acrossCm + box.wCm / 2 - t.cx : box.acrossCm - box.wCm / 2 + t.cx, down: box.downCm + t.cy });
export const inFile = (box, across, down) => ({ cx: box.side === "back" ? box.acrossCm + box.wCm / 2 - across : across - (box.acrossCm - box.wCm / 2), cy: down - box.downCm });
// a thing with its cm place in a box -> its % values (letters keep their cm size: fontSizePct follows the box height)
export const placeIn = (e, t, W, H) => ({
  ...e,
  x: ((t.cx - t.w / 2) / W) * 100,
  y: ((t.cy - t.h / 2) / H) * 100,
  width: (t.w / W) * 100,
  ...(e.height != null ? { height: (t.h / H) * 100 } : {}),
  ...(e.type === "text" ? { fontSizePct: (t.font / H) * 100 } : {}),
});

/**
 * The spot's box made again round its things (after a drag): their outer edges + PAD_CM, at least LETTER_ROOM × the
 * biggest letter size tall, a print with the players' names at least NAME_MIN_CM (or its print area's width) wide but
 * never wider than the safe zone. Every thing keeps its cm size and place on the tee; only its % values change.
 * @param elements  the design (only this spot's elements change)
 * @param box       the spot's box (el.spot)
 * @param ctx       { garment, preset, maxPrint } (for the names' width)
 * @returns { box, elements }
 */
export function reboxSpot(elements, box, { garment = null, preset = null, maxPrint = null } = {}) {
  const mine = elements.filter((e) => e.position === box.key);
  if (!mine.length) return { box, elements };
  const sleeve = isSleeve(box.side);
  const things = mine.map((e) => {
    const t = thingCm(e, box.wCm, box.hCm);
    return { e, t, ...onTee(box, t), ...extentOf(t) };
  });
  const x0 = Math.min(...things.map((p) => p.across - p.hw));
  const x1 = Math.max(...things.map((p) => p.across + p.hw));
  const y0 = Math.min(...things.map((p) => p.down - p.hh));
  const y1 = Math.max(...things.map((p) => p.down + p.hh));
  const font = Math.max(0, ...things.map((p) => p.t.font));
  let w = sleeve ? 2 * Math.max(Math.abs(x0), Math.abs(x1)) + 2 * PAD_CM : x1 - x0 + 2 * PAD_CM;
  let h = y1 - y0 + 2 * PAD_CM;
  if (mine.some((e) => e.role)) {
    const lim = groupLimits(groupOf(box.base, garment), garment, box.side, maxPrint);
    const presetW = preset ? areaBoxCm(preset, box.base, garment).w : NAME_MIN_CM;
    w = Math.max(w, Math.min(presetW, NAME_MIN_CM, Number.isFinite(lim.half) ? 2 * lim.half : Infinity));
  }
  h = Math.max(h, LETTER_ROOM * font);
  w = up1(w);
  h = up1(h);
  // A box wider or taller than its things (players' names, big letters) has its extra room on the side away from the
  // nearest safe line, as far as it needs: centred, it could reach past the line, and the print would then be moved in
  // with its things on it (a name let go near the side seam landed 5 cm nearer the middle, phase 3 review).
  let across = (x0 + x1) / 2;
  let down = (y0 + y1) / 2 - h / 2;
  const room = w > x1 - x0 + 2 * PAD_CM + TOUCH_CM || h > y1 - y0 + 2 * PAD_CM + TOUCH_CM ? spotRoom(garment, box.base, box.side, box.scale, maxPrint) : null;
  if (room && !sleeve) {
    const lo = Math.max(x1 + PAD_CM - w / 2, -room.half + w / 2);
    const hi = Math.min(x0 - PAD_CM + w / 2, room.half - w / 2);
    // (kept to 0.1 cm towards the inside, so the rounding can't tip it back over the line)
    if (lo <= hi) across = across > hi ? down1(hi) : across < lo ? up1(lo) : across;
  }
  if (room) {
    const lo = Math.max(y1 + PAD_CM - h, room.top);
    const hi = Math.min(y0 - PAD_CM, room.bottom - h);
    if (lo <= hi) down = down > hi ? down1(hi) : down < lo ? up1(lo) : down;
  }
  const next = { ...box, wCm: w, hCm: h, acrossCm: sleeve ? 0 : r1(across), downCm: r1(down) };
  const byElement = new Map(things.map((p) => [p.e, p]));
  const out = elements.map((e) => {
    const p = byElement.get(e);
    if (!p) return e;
    return { ...placeIn(e, { ...p.t, ...inFile(next, p.across, p.down) }, w, h), spot: next };
  });
  return { box: next, elements: out };
}

// A thing that reaches past its spot's box (in cm, turned as it sits), or words too big for it (LETTER_ROOM): the box
// is the print's page, so that part would be cut off.
const outgrows = (e, box) => {
  const t = thingCm(e, box.wCm, box.hCm);
  const { hw, hh } = extentOf(t);
  const out = t.cx - hw < -TOUCH_CM || t.cx + hw > box.wCm + TOUCH_CM || t.cy - hh < -TOUCH_CM || t.cy + hh > box.hCm + TOUCH_CM;
  return out || (e.type === "text" && (e.fontSizePct || 0) * LETTER_ROOM > 100 + 1e-6);
};

/**
 * After a change in the design room (Bigger, the size slider, a copy, words the AI added or made bigger): a spot whose
 * changed or new things now outgrow its box gets its box made again round them (reboxSpot) — every thing keeps its cm
 * size and place, and nothing is cut off on the 3D tee or the print page (the design check then says if it still
 * fits the tee). Spots with nothing changed keep their box.
 * @param prev  the design before the change (things not in it are the changed ones)
 * @param ctx   { garment, catalog (the print areas: a spot's start area), maxPrint }
 * @returns the same array when no box needed it (old designs: always)
 */
export function reboxChanged(elements, prev = [], { garment = null, catalog = [], maxPrint = null } = {}) {
  if (!Array.isArray(elements)) return elements;
  const before = new Set(prev || []);
  let out = elements;
  for (const box of spotsIn(elements)) {
    if (!out.some((e) => e.position === box.key && !before.has(e) && outgrows(e, box))) continue;
    const preset = box.from ? (catalog || []).find((p) => p.key === box.from) || null : null;
    out = reboxSpot(out, box, { garment, preset, maxPrint }).elements;
  }
  return out;
}

// Every element of one print area or spot moved into another box (same side), keeping its cm size and place on the
// tee: the frames are each one's box on the tee size `size` (areaBoxCm).
function moveInto(elements, from, frame, into, size, garment) {
  const fb = areaBoxCm(from, size, garment);
  const fromBox = { side: from.side, downCm: fb.down, acrossCm: fb.across, wCm: fb.w, hCm: fb.h };
  return elements.map((e) => {
    if (e.position !== from.key) return e;
    const t = thingCm(e, fromBox.wCm, fromBox.hCm);
    const at = onTee(fromBox, t);
    return { ...placeIn(e, { ...t, ...inFile(frame, at.across, at.down) }, frame.wCm, frame.hCm), position: into.key, side: into.side, spot: into };
  });
}

/**
 * Two prints on the same side that overlap or sit within JOIN_CM, made one print: a spot keeps its key and name (two
 * print areas become a new spot), its box round all their things. The frames are the prints on the tee size `size`
 * (a spot: its base size).
 * @param positions  the room's positions (catalog + spots)
 */
export function mergeSpots(elements, keyA, keyB, { positions = [], garment = null, size = "M", maxPrint = null } = {}) {
  const a = positions.find((p) => p.key === keyA);
  const b = positions.find((p) => p.key === keyB);
  if (!a || !b || a.key === b.key || a.side !== b.side) return elements;
  const [keep, other] = !a.spot && b.spot ? [b, a] : [a, b];
  const base = keep.spot?.base || size;
  const kb = areaBoxCm(keep, base, garment);
  const box = {
    key: keep.spot ? keep.key : nextSpotKey(elements),
    side: keep.side,
    label: keep.spot ? keep.spot.label : spotLabel(keep.side, elements),
    from: keep.spot ? keep.spot.from ?? null : keep.key,
    downCm: kb.down,
    acrossCm: kb.across,
    wCm: kb.w,
    hCm: kb.h,
    base,
    scale: keep.spot?.scale || "G",
  };
  let next = moveInto(elements, keep, box, box, base, garment);
  next = moveInto(next, other, box, box, base, garment);
  return reboxSpot(next, box, { garment, maxPrint }).elements;
}

/**
 * One thing taken out of its print area (dragged away from Left Chest towards the middle): it becomes a new spot of
 * its own, boxed round it, keeping its cm size and place on the tee size `size` (the spot's base). A small thing keeps
 * the same cm on every size (F), a big one grows with the tee (G).
 */
export function elementToSpot(elements, elId, { positions = [], garment = null, size = "M", maxPrint = null } = {}) {
  const el = elements.find((e) => String(e.id) === String(elId));
  const from = el && positions.find((p) => p.key === el.position);
  if (!from || !SPOT_SIDES.includes(from.side)) return elements;
  const fb = areaBoxCm(from, size, garment);
  const key = nextSpotKey(elements);
  const frame = { key, side: from.side, label: spotLabel(from.side, elements), from: from.spot ? from.spot.from ?? null : from.key, downCm: fb.down, acrossCm: fb.across, wCm: fb.w, hCm: fb.h, base: size, scale: "F" };
  const moved = { ...el, position: key, side: from.side, spot: frame };
  const done = reboxSpot(
    elements.map((e) => (e === el ? moved : e)),
    frame,
    { garment, maxPrint },
  );
  if (done.box.wCm <= 20) return done.elements;
  const grown = { ...done.box, scale: "G" };
  return done.elements.map((e) => (e.position === key ? { ...e, spot: grown } : e));
}

/**
 * A design-check fix that changes a whole spot (JSON, so it can be kept in the chat). It is worked out from the design
 * as it is when tapped, so an old card never puts back a box from before; the same array comes back when the print is
 * gone.
 *   { kind: "fit", key, sizes }  its box made to need no moving or shrinking on those tee sizes (boxThatFits; its
 *                                things grow / move with it)
 *   { kind: "rebox", key }      its box made again round its things
 *   { kind: "join", keys: [a, b] }  the two prints joined into one
 * @param ctx  { positions, garment, size, maxPrint }
 */
export function applySpotFix(elements, fix, ctx = {}) {
  if (!fix || typeof fix !== "object") return elements;
  if (fix.kind === "fit") {
    let box = spotsIn(elements).find((b) => b.key === fix.key);
    if (!box) return elements;
    const preset = box.from ? (ctx.positions || []).find((p) => p.key === box.from && !p.spot) || null : null;
    for (const size of Array.isArray(fix.sizes) ? fix.sizes : []) box = boxThatFits(box, ctx.garment, size, { preset, maxPrint: ctx.maxPrint });
    return elements.map((e) => (e.position === fix.key ? { ...e, spot: box } : e));
  }
  if (fix.kind === "rebox") {
    const box = spotsIn(elements).find((b) => b.key === fix.key);
    return box ? reboxSpot(elements, box, ctx).elements : elements;
  }
  if (fix.kind === "join" && Array.isArray(fix.keys)) return mergeSpots(elements, fix.keys[0], fix.keys[1], ctx);
  return elements;
}

/**
 * The box to store so a spot needs no moving or shrinking on the tee size `size` (the design check's fix): what it
 * prints on that size, taken back to its base size, and fitted there too.
 */
export function boxThatFits(box, garment, size, { preset = null, maxPrint = null } = {}) {
  const at = spotSizes(box, garment, { preset, maxPrint })[size];
  if (!at) return box;
  const baseGroup = groupOf(box.base, garment);
  const group = groupOf(size, garment);
  const k = box.scale === "G" && group !== baseGroup ? growWidth(group, garment, box.side) / growWidth(baseGroup, garment, box.side) : 1;
  const fit = fitBox({ w: at.w / k, h: at.h / k, down: at.down / k, across: at.across / k }, groupLimits(baseGroup, garment, box.side, maxPrint));
  let next = { ...box, wCm: fit.w, hCm: fit.h, downCm: fit.down, acrossCm: fit.across, from: box.from ?? null };
  // The base size's box is kept to 0.1 cm, and × the growth that can tip it back over a line on `size` (47.8 × 1.13 =
  // 54.01 > 54 cm: the fix never cleared the warning, 14 Nov 2026). Then it steps in by 0.1 cm until it fits there:
  // smaller, down from the collar, up from the hem, in from the side.
  for (let i = 0; i < 50; i++) {
    const why = spotSizes(next, garment, { preset, maxPrint })[size]?.clamped || [];
    if (!why.length) break;
    const collar = why.includes("collar");
    const hem = why.includes("hem");
    const side = why.includes("side") && next.acrossCm !== 0;
    const shrink = why.includes("big") || (why.includes("side") && !side) || (collar && hem);
    const f = shrink ? 1 - 0.1 / Math.max(next.wCm, next.hCm) : 1;
    next = {
      ...next,
      wCm: shrink ? down1(next.wCm * f) : next.wCm,
      hCm: shrink ? down1(next.hCm * f) : next.hCm,
      downCm: collar && !hem ? up1(next.downCm + 0.1) : hem && !collar ? down1(next.downCm - 0.1) : next.downCm,
      acrossCm: side ? Math.sign(next.acrossCm) * Math.max(0, down1(Math.abs(next.acrossCm) - 0.1)) : next.acrossCm,
    };
  }
  return next;
}
