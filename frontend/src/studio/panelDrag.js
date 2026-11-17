// studio/panelDrag.js — free placement phase 3 (15 Nov 2026, docs/FREE_PLACEMENT.md): the maths behind the panel
// editor (PanelEditor.jsx), where a customer drags a print to ANY place on a side of the tee. No React and no Konva,
// so every rule is tested on its own (tests/panelDrag.test.mjs).
//
// The panel is one side of the tee drawn flat, in cm, for the tee size on screen:
//   x  0 at the panel's left edge on screen, w at its right edge. On the front the screen's left is the WEARER'S right;
//      on the back (seen from behind) the screen's left is the wearer's left; a sleeve is seen from outside.
//   y  cm below the collar seam at the centre line (a sleeve: below its top seam); the strip above the collar is < 0.
// A print's file runs left to right on screen on every side (panelModel.js onTee), so a thing's place in its print
// and its place on the panel differ only by where the print's box sits.
//
// What happens when a thing is let go (dropThing), on the size on screen:
//   1. still fully inside its print area: it stays there, exactly as the area editor leaves it;
//   2. in a free place ("spot") and it is that print's only thing, or within 1 cm of its other things: the spot's box
//      is made again round its things (reboxSpot), measured on this size from now on;
//   3. otherwise it becomes a print of its own (a new spot), joined to any print it overlaps on any size or comes
//      within 1 cm of on this size (they would be pressed as one piece);
//   4. a 9th free place, or a joined print bigger than the biggest print, is refused and the thing goes back.

import { JOIN_CM, MAX_SPOTS, NAME_MIN_CM, PAD_CM, areaBoxCm, boxThatFits, chartRow, extentOf, inFile, nearPairs, nextSpotKey, onTee, overlapPair, panelFor, placeIn, reboxSpot, spotLabel, spotPosition, spotProblem, spotRoom, spotsIn, thingCm, withSpots } from "./panelModel";

export const SNAP_CM = 1.5; // a thing this close to a centre line or a print area's top line snaps to it
export const START_CM = 10; // "Anywhere": a new print starts as a 10 x 10 cm box where the tee was tapped
export const MAX_ZOOM = 6;
export const GROW_CM = 20; // a print wider than this grows with the tee size ("G"); a smaller one keeps its cm ("F")
// A thing stops this far inside the safe zone: its print's box is the thing + PAD_CM all round, and that box must stay
// inside the safe zone (else the print files move it in, and the design check says so). 0.1 more for the rounding.
export const INSET_CM = PAD_CM + 0.1;
export const CAP_MSG = `A tee can have up to ${MAX_SPOTS} separate prints. Put this one next to another print to join them, or delete one.`;

const EPS = 0.05; // cm: a thing that only touches its print area's edge is still inside it
const isSleeve = (side) => side === "left" || side === "right";
const r1 = (n) => Math.round(n * 10) / 10;

/* ---------- the panel ---------- */
/**
 * One side of the tee for the panel editor, in cm, on the tee size on screen (panelModel.js panelFor).
 * @returns {{ side, w, len, above, neckHalf, safe, limit, maxW, maxH, grow }} or null (no 3D tee)
 *   w, len    the side's width (as the 3D tee shows it) and its collar-to-hem length
 *   above     the strip of shoulder drawn above the collar seam (the front's neck drop, at most 5 cm; 0 on a sleeve)
 *   safe      { x0, x1, y0, y1 } where a print's box may go so it needs no moving or shrinking on ANY size the tee
 *             comes in (panelModel.js spotRoom: the design check looks at every size, 15 Nov 2026 review) — for a
 *             print that keeps its cm on every size ("F": a logo, words); its top line also suits a growing one, which
 *             it may be joined to
 *   limit     where a thing's own outline may go: the safe zone less INSET_CM (its box adds PAD_CM round it)
 *   maxW, maxH  the biggest print here (on every size)
 *   grow      { safe, limit, maxW, maxH } the same for a print that grows with the tee ("G": wider than 20 cm) — less
 *             room on the small sizes' side, more on the big sizes' (rulesFor picks)
 */
export function panelView(garment, size, side, maxPrint = null) {
  const p = panelFor(garment, size);
  const q = p?.[side];
  if (!q) return null;
  const sleeve = isSleeve(side);
  const length = chartRow(garment, size).length * 2.54;
  const above = sleeve ? 0 : Math.max(0, Math.min(5, length - q.len));
  const fixed = spotRoom(garment, size, side, "F", maxPrint);
  const grows = spotRoom(garment, size, side, "G", maxPrint);
  const rules = (room, top) => {
    // (a sleeve print's box is centred on the sleeve's line: a thing off the line widens it on both sides, so on a
    // sleeve the biggest print's width is a limit on where a thing can go too)
    const half = sleeve ? Math.min(room.half, room.maxW / 2) : room.half;
    const safe = { x0: q.w / 2 - half, x1: q.w / 2 + half, y0: top, y1: room.bottom };
    const limit = { x0: safe.x0 + INSET_CM, x1: safe.x1 - INSET_CM, y0: safe.y0 + INSET_CM, y1: safe.y1 - INSET_CM };
    return { safe, limit, maxW: down05(room.maxW), maxH: down05(room.maxH) };
  };
  return { side, w: q.w, len: q.len, above, neckHalf: Math.min(9 * p.s, q.w * 0.25), ...rules(fixed, Math.max(fixed.top, grows.top)), grow: rules(grows, grows.top) };
}
const down05 = (n) => Math.floor(n * 2 + 1e-6) / 2; // the biggest print, to the half cm below (it is said in words)

/**
 * The rules a thing is moved under (panelView): a growing print's when its print grows (a G spot), or when it would
 * make a growing print of its own — wider than GROW_CM with its box, or a players' name or number (its print keeps
 * the width of the area it came from, up to 30 cm: reboxSpot). Else a fixed print's.
 * @param t  the thing on the panel (thingOnPanel: hw, its half width as it sits)
 */
export function rulesFor(view, t, { grows = false, nameW = 0 } = {}) {
  const w = Math.max(2 * (t.hw + PAD_CM), Math.min(nameW, NAME_MIN_CM));
  return grows || w > GROW_CM ? view.grow : view;
}

/** A print's box on the panel as lines a thing's outline may go up to: { x0, x1, y0, y1 } (cm). */
export const boxRect = (side, w, b) => {
  const x0 = boxLeft(side, w, b);
  return { x0, x1: x0 + b.w, y0: b.down, y1: b.down + b.h };
};

// across (cm from the centre line, + = the wearer's left) -> x on the panel, and back
export const panelX = (side, w, across) => (side === "back" ? w / 2 - across : w / 2 + across);
export const acrossAt = (side, w, x) => (side === "back" ? w / 2 - x : x - w / 2);
// a box's left edge on the panel (its file starts there)
export const boxLeft = (side, w, b) => panelX(side, w, side === "back" ? b.across + b.w / 2 : b.across - b.w / 2);

/**
 * Where a print sits on the panel for a tee size: { side, down, across, w, h } in cm. As the 3D tee draws it, so the
 * panel and the tee agree: a print area without the print team's start line (Centre Front, the chests, Full Back) at
 * the 3D tee's own start line for the size (panelModel.js boxesOf); everything else as areaBoxCm.
 */
export function panelBox(position, size, garment) {
  const b = areaBoxCm(position, size, garment);
  if (position.spot || isSleeve(b.side) || position.collarCm?.[size] != null) return b;
  const start = panelFor(garment, size)?.start?.[b.side];
  if (start == null) return b;
  const place = position.placeBySize?.[size] || position.place || {};
  return { ...b, down: start + (place.topCm || 0) };
}
const frameOf = (b) => ({ side: b.side, downCm: b.down, acrossCm: b.across, wCm: b.w, hCm: b.h });

/** A thing on the panel: its centre (x, y), size, turn and half its outline as it sits (hw, hh), in cm. */
export function thingOnPanel(e, b, w) {
  const t = thingCm(e, b.w, b.h);
  const { hw, hh } = extentOf(t);
  return { ...t, x: boxLeft(b.side, w, b) + t.cx, y: b.down + t.cy, hw, hh };
}
/** The thing `e` (size and turn `t`, in cm) with its centre at (x, y) on the panel, as % of its print's box `b`. */
export const placeOnPanel = (e, b, w, t, x, y) => placeIn(e, { ...t, cx: x - boxLeft(b.side, w, b), cy: y - b.down }, b.w, b.h);

/**
 * A thing kept inside the panel's limit: { x, y, hit } — hit lists the lines it was pushed against ("collar", "hem",
 * "side"; on a sleeve the shoulder seam, the sleeve's hem, its edge). A thing bigger than the room sits in its middle.
 */
export function clampToLimit(t, limit) {
  let { x, y } = t;
  const hit = [];
  if (2 * t.hh > limit.y1 - limit.y0) y = (limit.y0 + limit.y1) / 2;
  else if (y - t.hh < limit.y0) {
    y = limit.y0 + t.hh;
    hit.push("collar");
  } else if (y + t.hh > limit.y1) {
    y = limit.y1 - t.hh;
    hit.push("hem");
  }
  if (2 * t.hw > limit.x1 - limit.x0) x = (limit.x0 + limit.x1) / 2;
  else if (x - t.hw < limit.x0) {
    x = limit.x0 + t.hw;
    hit.push("side");
  } else if (x + t.hw > limit.x1) {
    x = limit.x1 - t.hw;
    hit.push("side");
  }
  return { x, y, hit };
}

/**
 * A thing kept inside the limit, or inside its own print area's box when it is in one (area: boxRect): a print area
 * may reach past the safe zone (the print team's own sheet), and a thing that stays in its area stays there exactly as
 * the area editor allows. Whichever of the two is nearer to where it was put; hit only for the limit's lines.
 */
export function keepThing(t, limit, area = null) {
  const kept = clampToLimit(t, limit);
  if (!area) return kept;
  const inArea = clampToLimit(t, area);
  const d = (k) => Math.hypot(k.x - t.x, k.y - t.y);
  return d(inArea) < d(kept) - 1e-9 ? { ...inArea, hit: [] } : kept;
}

/* ---------- snapping ---------- */
const SAME_LINE_CM = 1.2; // two lines closer than this are one (Lower Left's centre line is 1 cm from Left Chest's)
/**
 * The lines a dragged thing snaps to on a side: the centre line, each print area's centre line (vertical, x) and each
 * print area's top line (horizontal, y) — the print team's start lines. Each carries the names of the places on it, for
 * the tag; lines closer than SAME_LINE_CM are one, named after the place that comes first in the list (the main print,
 * then the big ones, the chest prints, then the small hits).
 * @param positions  the print areas the garment offers (catalog only: a free place has no start line of its own)
 */
export function snapLines(positions, side, size, garment, w) {
  const v = [{ x: w / 2, labels: ["Centre line"] }];
  const h = [];
  const add = (list, k, at, label) => {
    const line = list.find((l) => Math.abs(l[k] - at) < SAME_LINE_CM);
    if (!line) list.push({ [k]: at, labels: [label] });
    else if (!line.labels.includes(label)) line.labels.push(label);
  };
  for (const p of positions) {
    if (p.side !== side || p.spot) continue;
    const b = panelBox(p, size, garment);
    if (!(b.w > 0 && b.h > 0)) continue;
    if (!isSleeve(side)) add(v, "x", Math.abs(b.across) < 0.5 ? w / 2 : panelX(side, w, b.across), p.label);
    add(h, "y", b.down, p.label);
  }
  return { v, h };
}

const nearest = (list, dist) => list.reduce((best, l) => (best && dist(best) <= dist(l) ? best : l), null);
/**
 * The thing's place after snapping: its centre snaps to the nearest centre line, its top edge to the nearest top line,
 * each when within SNAP_CM of where the pointer has it. Worked out from the pointer's own place every time, so moving
 * further than SNAP_CM breaks the snap.
 * @returns { x, y, guides: [{ dir: "v" | "h", at }], tag } — tag: what it is lined up with, to show while snapped:
 *   a place's name only when the thing sits on both its centre line and its top line ("Left Chest"); else the line
 *   itself ("Top of Full Front", "Centre line", "Middle of Left Chest"), so it never names a place it isn't on
 */
export function snapDrag(t, lines, snapCm = SNAP_CM) {
  let { x, y } = t;
  const guides = [];
  const v = nearest(lines.v || [], (l) => Math.abs(l.x - t.x));
  const onV = v && Math.abs(v.x - t.x) <= snapCm + 1e-9;
  if (onV) {
    x = v.x;
    guides.push({ dir: "v", at: v.x });
  }
  const top = t.y - t.hh;
  const h = nearest(lines.h || [], (l) => Math.abs(l.y - top));
  const onH = h && Math.abs(h.y - top) <= snapCm + 1e-9;
  if (onH) {
    y = h.y + t.hh;
    guides.push({ dir: "h", at: h.y });
  }
  const both = onV && onH ? h.labels.find((l) => v.labels.includes(l)) : null;
  const vWord = onV ? (v.labels[0] === "Centre line" ? "Centre line" : `Middle of ${v.labels[0]}`) : null;
  const tag = both || (onH ? `Top of ${h.labels[0]}${vWord === "Centre line" ? " · centred" : ""}` : vWord);
  return { x, y, guides, tag };
}

/* ---------- the live label ---------- */
// cm for a shopper: to the half cm below 10 cm, to the whole cm above
export const cmWords = (n) => {
  const v = n < 10 ? Math.round(n * 2) / 2 : Math.round(n);
  return String(v);
};
const LIMIT_WORDS = { front: { collar: "the collar", hem: "the hem", side: "the side seam" }, sleeve: { collar: "the shoulder seam", hem: "the sleeve's hem", side: "the sleeve's edge" } };
/**
 * The label shown while a thing is dragged or resized, in the shopper's words, on the tee size on screen:
 *   "24 × 18 cm · 8 cm below the collar · centred", "9 × 9 cm · 8 cm below the collar · 9 cm to your left",
 *   "8 × 6 cm · 4 cm below the shoulder seam". Left / right are as the tee is WORN (as "Left Chest", the job card and the
 *   panel's corner tags say); asWorn adds "(as you wear it)" the first time. hit: a line it is pushed against ("Can't go
 *   nearer the collar"); big: the biggest print [w, h] when a resize is stopped there.
 * @param box  the thing's outline as it sits: { down (its top below the collar seam), across (its centre), w, h }
 */
export function liveLabel({ side, box, asWorn = false, hit = null, big = null }) {
  const size = `${cmWords(box.w)} × ${cmWords(box.h)} cm`;
  if (big) return `${size} · Biggest print here: ${big[0]} × ${big[1]} cm`;
  const sleeve = isSleeve(side);
  if (hit) return `${size} · Can't go nearer ${(sleeve ? LIMIT_WORDS.sleeve : LIMIT_WORDS.front)[hit]}`;
  const down = Math.max(0, box.down);
  if (sleeve) return `${size} · ${cmWords(down)} cm below the shoulder seam`;
  const off = Math.abs(box.across) < 0.5 ? "centred" : `${cmWords(Math.abs(box.across))} cm to your ${box.across > 0 ? "left" : "right"}${asWorn ? " (as you wear it)" : ""}`;
  return `${size} · ${cmWords(down)} cm below the collar · ${off}`;
}
/** The outline of a thing on the panel as the label measures it: { down, across, w, h } (cm). */
export const labelBox = (t, side, w) => ({ down: t.y - t.hh, across: acrossAt(side, w, t.x), w: 2 * t.hw, h: 2 * t.hh });

/* ---------- zoom ---------- */
/**
 * The panel's place on the canvas: screen x = tx + (x + ox) · k · z, screen y = ty + (y + oy) · k · z.
 * @param v  { cw, ch (canvas px), k (px per cm at zoom 1), pw, ph (the panel's size in cm, with its margin and the
 *           shoulder strip), ox, oy (where panel cm 0, 0 is inside it: the margin, and the strip above the collar) }
 */
export function wholeView(v) {
  return { z: 1, tx: (v.cw - v.pw * v.k) / 2, ty: (v.ch - v.ph * v.k) / 2 };
}
// Never panned into empty space: a panel smaller than the canvas stays centred; a bigger one always covers at least a
// quarter of the canvas.
const keepIn = (t, size, span) => {
  if (size <= span) return (span - size) / 2;
  const keep = 0.25 * span;
  return Math.min(span - keep, Math.max(keep - size, t));
};
export function clampView(v, view) {
  const z = Math.max(1, Math.min(MAX_ZOOM, view.z));
  return { z, tx: keepIn(view.tx, v.pw * v.k * z, v.cw), ty: keepIn(view.ty, v.ph * v.k * z, v.ch) };
}
/** "Zoom in": the box { x0, y0, x1, y1 } (panel cm) made 60 % of the canvas, at most MAX_ZOOM, in the middle. */
export function zoomToBox(v, box) {
  const bw = Math.max(0.5, box.x1 - box.x0);
  const bh = Math.max(0.5, box.y1 - box.y0);
  const z = Math.max(1, Math.min(MAX_ZOOM, (0.6 * v.cw) / (bw * v.k), (0.6 * v.ch) / (bh * v.k)));
  const cx = (box.x0 + box.x1) / 2 + (v.ox || 0);
  const cy = (box.y0 + box.y1) / 2 + (v.oy || 0);
  return clampView(v, { z, tx: v.cw / 2 - cx * v.k * z, ty: v.ch / 2 - cy * v.k * z });
}
/** Two fingers (or Ctrl + wheel): zoomed by `f` round the screen point (mx, my), which stays under the fingers. */
export function zoomAt(v, view, f, mx, my) {
  const z = Math.max(1, Math.min(MAX_ZOOM, view.z * f));
  const g = z / view.z;
  return clampView(v, { z, tx: mx - (mx - view.tx) * g, ty: my - (my - view.ty) * g });
}

/* ---------- letting go ---------- */
const usedOn = (positions, elements, side, but) => positions.filter((p) => p.key !== but && p.side === side && elements.some((e) => e.position === p.key));
const presetOf = (box, catalog) => (box?.from ? (catalog || []).find((p) => p.key === box.from && !p.spot) || null : null);
// a spot's box as it shows on this size, measured on this size from now on (its things are % of it, so they don't move)
const rebased = (spot, b, size) => ({ ...spot, downCm: r1(b.down), acrossCm: isSleeve(spot.side) ? 0 : r1(b.across), wCm: r1(b.w), hCm: r1(b.h), base: size });
const BOX_KEYS = ["key", "side", "label", "from", "downCm", "acrossCm", "wCm", "hCm", "base", "scale"];
const sameBox = (a, b) => BOX_KEYS.every((k) => (a[k] ?? null) === (b[k] ?? null));
const withScale = (elements, key, scale) => elements.map((e) => (e.position === key && e.spot.scale !== scale ? { ...e, spot: { ...e.spot, scale } } : e));
// how far apart two things of one print are (cm, below 0 they overlap), from their outlines in the print's file
const thingGap = (a, b, W, H) => {
  const ta = thingCm(a, W, H);
  const tb = thingCm(b, W, H);
  const ea = extentOf(ta);
  const eb = extentOf(tb);
  return Math.max(Math.abs(ta.cx - tb.cx) - ea.hw - eb.hw, Math.abs(ta.cy - tb.cy) - ea.hh - eb.hh);
};

// The thing `el` (size and turn `t`, its centre `at` on the tee) as a print of its own: a new spot boxed round it.
// It grows with the tee (G) when it came out of a growing print (`grows`: it was moved under that print's rules,
// rulesFor) or when its box is wider than GROW_CM — worked out first, so reboxSpot keeps a wide box (a players' name)
// inside the right lines.
function ownSpot(elements, el, t, at, { side, from, size, garment, maxPrint, catalog, grows = false }) {
  const key = nextSpotKey(elements);
  const { hw, hh } = extentOf(t);
  const sleeve = isSleeve(side);
  const frame = {
    key,
    side,
    label: spotLabel(side, elements.filter((e) => e !== el)),
    from,
    downCm: at.down - hh - PAD_CM,
    acrossCm: sleeve ? 0 : at.across,
    wCm: 2 * ((sleeve ? Math.abs(at.across) : 0) + hw + PAD_CM),
    hCm: 2 * (hh + PAD_CM),
    base: size,
    scale: "F",
  };
  const preset = presetOf(frame, catalog);
  const nameW = el.role ? Math.min(preset ? areaBoxCm(preset, size, garment).w : NAME_MIN_CM, NAME_MIN_CM) : 0;
  frame.scale = grows || Math.max(frame.wCm, nameW) > GROW_CM ? "G" : "F";
  const moved = { ...placeIn(el, { ...t, ...inFile(frame, at.across, at.down) }, frame.wCm, frame.hCm), position: key, side, spot: frame };
  // (players' names keep the width of the area they came from, or 30 cm: reboxSpot)
  const done = reboxSpot(
    elements.map((e) => (e === el ? moved : e)),
    frame,
    { garment, preset, maxPrint },
  );
  return { key, elements: withScale(done.elements, key, frame.scale === "G" || done.box.wCm > GROW_CM ? "G" : "F") };
}

// The size on screen holds this print in: it is moved in or made smaller there (spotSizes `clamped`), so its box on
// this size is not the one stored. Re-measuring it on this size would make the smaller box its new size on every tee
// size (a 0.5 cm nudge on 3XL shrank the print by 5 % on M, 15 Nov 2026 review): such a print keeps its stored box,
// and a place on the screen is taken to the same place in it (a box's % are the same on every size).
const heldOn = (position, size) => !!position.clamped?.[size]?.length;

// Two prints on one side made one: the other one keeps its name when it is a free place too ("Front 1"), else the
// moved thing's print does; every thing keeps its cm size and place on the panel; the box is made round them all.
function joinPrints(elements, me, other, { size, garment, maxPrint, catalog }) {
  const keep = other.spot ? other : me;
  const gone = keep === other ? me : other;
  const kb = panelBox(keep, size, garment);
  const gb = panelBox(gone, size, garment);
  const held = heldOn(keep, size);
  const grows = keep.spot.scale === "G" || gone.spot?.scale === "G";
  const frame = { ...(held ? keep.spot : rebased(keep.spot, kb, size)), from: keep.spot.from ?? null, scale: grows ? "G" : keep.spot.scale };
  // (held: screen cm -> the stored box's cm, the same share of the box)
  const fx = held ? frame.wCm / kb.w : 1;
  const fy = held ? frame.hCm / kb.h : 1;
  const move = (e, b) => {
    const t = thingCm(e, b.w, b.h);
    const at = onTee(frameOf(b), t);
    const c = inFile(held ? frameOf(kb) : frame, at.across, at.down);
    const inKeep = held ? { ...t, cx: c.cx * fx, cy: c.cy * fy, w: t.w * fx, h: t.h * fy, font: t.font * fy } : { ...t, ...c };
    return { ...placeIn(e, inKeep, frame.wCm, frame.hCm), position: frame.key, side: frame.side, spot: frame };
  };
  const moved = elements.map((e) => (e.position === keep.key ? move(e, kb) : e.position === gone.key ? move(e, gb) : e));
  const done = reboxSpot(moved, frame, { garment, preset: presetOf(frame, catalog), maxPrint });
  return { key: keep.key, elements: withScale(done.elements, keep.key, grows || done.box.wCm > GROW_CM ? "G" : "F") };
}

// The print `key` joined with every print it overlaps (on any size) or comes within JOIN_CM of (on this size), one at
// a time, until none is left. Returns { elements, key, joined: [the names of the prints it was joined with], otherSize:
// true when one only touched it on another tee size (a logo near Centre Front on M meets it on 3XL, which is bigger) }.
function joinNear(elements, key, ctx) {
  const joined = [];
  let otherSize = false;
  let els = elements;
  for (let i = 0; i <= MAX_SPOTS + 1; i++) {
    const positions = withSpots(ctx.catalog, els, ctx.garment, ctx.maxPrint);
    const me = positions.find((p) => p.key === key);
    if (!me) break;
    const others = usedOn(positions, els, me.side, key);
    const hit = others.find((o) => overlapPair([me], [o], ctx.garment));
    const near = hit ? null : nearPairs(positions, [key, ...others.map((o) => o.key)], ctx.size, ctx.garment).find(([a, b]) => a.key === key || b.key === key);
    const other = hit || (near && (near[0].key === key ? near[1] : near[0]));
    if (!other) break;
    joined.push(other.label);
    if (hit && gapOnScreen(me, other, ctx) >= JOIN_CM) otherSize = true;
    ({ elements: els, key } = joinPrints(els, me, other, ctx));
  }
  return { elements: els, key, joined, otherSize };
}
// how far apart two prints are on the panel of the size on screen (cm; below 0 they overlap)
const gapOnScreen = (a, b, { size, garment }) => {
  const x = panelBox(a, size, garment);
  const y = panelBox(b, size, garment);
  return Math.max(Math.abs(x.across - y.across) - (x.w + y.w) / 2, x.down - (y.down + y.h), y.down - (x.down + x.h));
};

/**
 * The design after a thing was let go on the panel (or nudged), on the tee size on screen.
 * @param elements  the design as it was
 * @param next      the moved thing: the same element (same id, same position), its x / y / width / height / turn /
 *                  letter size now saying where it was let go, as % of its print's box on the panel (panelBox)
 * @param ctx       { catalog (the garment's print areas), garment, size (on screen), maxPrint, together (the print's
 *                  own editor: a thing in a free place stays with its print however far from its other things) }
 * @returns { elements, key (the thing's print now), name (its name, "Front 1"), left (the print area's name, when it
 *            left one), joined: [names], otherSize (joined only because they meet on another tee size), refused (why it
 *            went back; elements are then the old ones) }
 */
export function dropThing(elements, next, ctx = {}) {
  const { catalog = [], garment = null, size = "M", maxPrint = null, together = false } = ctx;
  const c = { catalog, garment, size, maxPrint };
  const positions = withSpots(catalog, elements, garment, maxPrint);
  const was = elements.find((e) => String(e.id) === String(next.id));
  const from = was && positions.find((p) => p.key === was.position);
  if (!from) return { elements, key: null, joined: [] };
  const replaced = elements.map((e) => (e === was ? next : e));
  const fb = panelBox(from, size, garment);
  const t = thingCm(next, fb.w, fb.h);
  const { hw, hh } = extentOf(t);
  const inside = t.cx - hw >= -EPS && t.cx + hw <= fb.w + EPS && t.cy - hh >= -EPS && t.cy + hh <= fb.h + EPS;
  // 1. still inside its print area: it stays there, exactly as today
  if (!from.spot && inside) return { elements: replaced, key: from.key, joined: [] };
  const at = onTee(frameOf(fb), t);
  const before = spotsIn(elements);
  let els = replaced;
  let key;
  let left = null;
  if (from.spot) {
    // (measured on the size on screen from now on — unless that size holds it in: heldOn)
    const box = heldOn(from, size) ? from.spot : rebased(from.spot, fb, size);
    els = els.map((e) => (e.position === from.key ? { ...e, spot: box } : e));
    const rest = els.filter((e) => e.position === from.key && String(e.id) !== String(next.id));
    const close = together || !rest.length || rest.some((e) => thingGap(next, e, fb.w, fb.h) < JOIN_CM);
    if (close) {
      // 2. the spot's box made again round its things
      els = reboxSpot(els, box, { garment, preset: presetOf(box, catalog), maxPrint }).elements;
      key = from.key;
    } else {
      // 3. taken away from the other things of its print: a print of its own; theirs is boxed round them again
      ({ key, elements: els } = ownSpot(els, els.find((e) => String(e.id) === String(next.id)), t, at, { ...c, side: from.side, from: from.spot.from ?? null, grows: from.spot.scale === "G" }));
      els = reboxSpot(els, box, { garment, preset: presetOf(box, catalog), maxPrint }).elements;
    }
  } else {
    // 3. out of its print area: a print of its own (and the area keeps its other things, exactly as they were)
    ({ key, elements: els } = ownSpot(els, els.find((e) => String(e.id) === String(next.id)), t, at, { ...c, side: from.side, from: from.key }));
    left = from.label;
  }
  const done = joinNear(els, key, c);
  els = done.elements;
  key = done.key;
  // 4. no more than MAX_SPOTS free places, and every print that changed must be one the print team can press
  const spots = spotsIn(els);
  if (spots.length > MAX_SPOTS && spots.length > before.length) return { elements, key: was.position, joined: [], refused: CAP_MSG };
  const changed = spots.filter((b) => !before.some((o) => sameBox(o, b)));
  for (const b of changed) {
    const problem = spotProblem(b, garment, { preset: presetOf(b, catalog), maxPrint });
    if (!problem) continue;
    const words = done.joined.length ? `${b.label} would be one print with ${done.joined.join(" and ")}, and ${problem}. Leave at least ${JOIN_CM} cm between them so they're pressed apart.` : `${b.label}: ${problem}.`;
    return { elements, key: was.position, joined: [], refused: words };
  }
  const name = spots.find((b) => b.key === key)?.label || null;
  return { elements: els, key, left: done.joined.length ? null : left, name, joined: done.joined, otherSize: done.otherSize };
}

/**
 * A thing moved in its print's own editor (AreaEditor.jsx) kept inside the panel's limit, ready for dropThing: that
 * editor lets a thing's middle reach its print's edge, and a print in a free place grows round it — dragged to the edge
 * again and again, it would grow past the safe zone and the biggest print. (next: the moved element, its % still of its
 * print's box as it was; the same element back when nothing needs to change.)
 */
export function keepInside(elements, next, ctx = {}) {
  const { catalog = [], garment = null, size = "M", maxPrint = null } = ctx;
  const pos = withSpots(catalog, elements, garment, maxPrint).find((p) => p.key === next.position);
  const view = pos && panelView(garment, size, pos.side, maxPrint);
  if (!view) return next;
  const b = panelBox(pos, size, garment);
  const t = thingOnPanel(next, b, view.w);
  const kept = clampToLimit(t, rulesFor(view, t, ruleHints(pos, next, b)).limit);
  return Math.abs(kept.x - t.x) < 1e-9 && Math.abs(kept.y - t.y) < 1e-9 ? next : placeOnPanel(next, b, view.w, t, kept.x, kept.y);
}
// what rulesFor needs to know about a thing's print: it grows (a G spot); a players' name keeps its area's width
export const ruleHints = (pos, el, b) => ({ grows: pos.spot?.scale === "G", nameW: el?.role ? (pos.spot ? NAME_MIN_CM : b.w) : 0 });

// a thing of the design on the panel: its print, the panel, its box and the thing in cm (null when it can't be found)
function thingIn(elements, id, { catalog = [], garment = null, size = "M", maxPrint = null }) {
  const el = elements.find((e) => String(e.id) === String(id));
  const pos = el && withSpots(catalog, elements, garment, maxPrint).find((p) => p.key === el.position);
  const view = pos && panelView(garment, size, pos.side, maxPrint);
  if (!view) return null;
  const b = panelBox(pos, size, garment);
  return { el, pos, view, b, t: thingOnPanel(el, b, view.w), area: pos.spot ? null : boxRect(pos.side, view.w, b) };
}

/**
 * The thing `id` moved on the panel by (dx, dy) cm (arrow keys: 0.5 cm, Shift 2 cm), or to the centre line
 * (centre: true), kept inside the limit: the moved element, ready for dropThing (null when it can't be found).
 */
export function movedThing(elements, id, { dx = 0, dy = 0, centre = false } = {}, ctx = {}) {
  const at = thingIn(elements, id, ctx);
  if (!at) return null;
  const { el, pos, view, b, t, area } = at;
  const raw = { ...t, x: centre ? view.w / 2 : t.x + dx, y: t.y + dy };
  const kept = keepThing(raw, rulesFor(view, t, ruleHints(pos, el, b)).limit, area);
  return placeOnPanel(el, b, view.w, t, kept.x, kept.y);
}

/**
 * The thing `id` made bigger or smaller by `f` round its middle (the phone panel's Bigger / Smaller), never bigger
 * than the biggest print (less the 0.5 cm its box adds round it) or the room inside the safe zone, and kept inside the
 * limit — as the panel's corner handles. { el (ready for dropThing), capped (it couldn't grow as far as asked) }, or
 * null when it can't be found.
 */
export function scaledThing(elements, id, f, ctx = {}) {
  const at = thingIn(elements, id, ctx);
  if (!at) return null;
  const { el, pos, view, b, t, area } = at;
  let k = Math.max(f, 0.4 / Math.max(1e-6, Math.min(t.w, t.h)));
  const grown = (n) => ({ ...t, w: t.w * n, h: t.h * n, font: t.font * n, hw: t.hw * n, hh: t.hh * n });
  const r = rulesFor(view, grown(k), ruleHints(pos, el, b));
  const L = r.limit;
  const cap = Math.min((r.maxW - 1) / (2 * t.hw), (r.maxH - 1) / (2 * t.hh), (L.x1 - L.x0) / (2 * t.hw), (L.y1 - L.y0) / (2 * t.hh));
  // (in its print area it may be as big as the area allows, as there)
  const inArea = area ? Math.min((area.x1 - area.x0) / (2 * t.hw), (area.y1 - area.y0) / (2 * t.hh)) : 0;
  const most = Math.max(1, cap, inArea);
  const capped = k > most + 1e-9;
  if (capped) k = most;
  const s = grown(k);
  const kept = keepThing(s, L, area);
  return { el: placeOnPanel(el, b, view.w, s, kept.x, kept.y), capped };
}

/* ---------- "Anywhere": a new print where the tee was tapped ---------- */
/**
 * A new, empty print (a spot box) START_CM square, centred on the tapped point { side, across, down } (cm), moved in /
 * made smaller to fit the safe zone of the tee size on screen.
 */
export function anywhereBox(point, { garment, size, maxPrint = null, elements = [], startCm = START_CM }) {
  const sleeve = isSleeve(point.side);
  const box = {
    key: nextSpotKey(elements),
    side: point.side,
    label: spotLabel(point.side, elements),
    from: null,
    downCm: r1(point.down - startCm / 2),
    acrossCm: sleeve ? 0 : r1(point.across),
    wCm: startCm,
    hCm: startCm,
    base: size,
    scale: "F",
  };
  return boxThatFits(box, garment, size, { maxPrint });
}

/**
 * The print already on the tee where a new box would go: one it overlaps on any size, or within JOIN_CM on the size on
 * screen (so a tap there opens that print instead of starting a second one on top of it). null = the place is free.
 */
export function printAt(box, elements, { catalog = [], garment = null, size = "M", maxPrint = null } = {}) {
  const positions = withSpots(catalog, elements, garment, maxPrint);
  const me = spotPosition(box, garment, { maxPrint });
  const others = usedOn(positions, elements, box.side, box.key);
  const hit = others.find((o) => overlapPair([me], [o], garment));
  if (hit) return hit;
  const near = nearPairs([...positions, me], [me.key, ...others.map((o) => o.key)], size, garment).find(([a, b]) => a.key === me.key || b.key === me.key);
  return near ? (near[0].key === me.key ? near[1] : near[0]) : null;
}

/**
 * "Anywhere": the new print for a tapped point. A START_CM box when that place is free; else a smaller one (8, then 6 cm
 * — its first thing is boxed tightly anyway), so a tap a few cm from a print still starts one there, also when a print
 * that grows (bigger and lower on 3XL) would meet the big box on another tee size. Then a 6 and a 4 cm box moved away
 * from that print, the tapped point still inside it near its edge (a tap 4 cm under a print was turned down, 15 Nov
 * 2026 review).
 * @returns {{ box }} the new print's box, or {{ hit, here, otherSize }}: the print in the way even then; here = the tap
 *   was on that print (on the tee size on screen); otherSize = they would only meet on another tee size
 */
export function startBox(point, ctx) {
  const size = ctx.size || "M";
  const sleeve = isSleeve(point.side);
  let last = null;
  const tryAt = (startCm, dx = 0, dy = 0) => {
    const box = anywhereBox({ ...point, across: point.across + dx, down: point.down + dy }, { ...ctx, startCm });
    const hit = printAt(box, ctx.elements || [], ctx);
    if (!hit) return box;
    last = { hit, box };
    return null;
  };
  // away from the print in the way: the tapped point 0.5 cm inside the box's edge nearest that print
  const away = (startCm) => {
    const hb = panelBox(last.hit, size, ctx.garment);
    const m = startCm / 2 - 0.5;
    const sy = point.down < hb.down + hb.h / 2 ? -1 : 1;
    const sx = point.across < hb.across ? -1 : 1;
    const moves = sleeve ? [[0, sy * m]] : [[0, sy * m], [sx * m, 0], [sx * m, sy * m]];
    for (const [dx, dy] of moves) {
      const box = tryAt(startCm, dx, dy);
      if (box) return box;
    }
    return null;
  };
  const box = tryAt(START_CM) || tryAt(8) || tryAt(6) || away(6) || tryAt(4) || away(4);
  if (box) return { box };
  const hb = panelBox(last.hit, size, ctx.garment);
  const here = point.down >= hb.down - EPS && point.down <= hb.down + hb.h + EPS && (sleeve || Math.abs(point.across - hb.across) <= hb.w / 2 + EPS);
  const otherSize = gapOnScreen(spotPosition(last.box, ctx.garment, { maxPrint: ctx.maxPrint ?? null }), last.hit, { size, garment: ctx.garment }) >= JOIN_CM;
  return { hit: last.hit, here, otherSize };
}

// How many free places a design uses (the 9th is refused, and "Anywhere" says "8 of 8 used")
export const spotCount = (elements) => spotsIn(elements).length;
