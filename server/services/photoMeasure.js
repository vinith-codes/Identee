// photoMeasure.js (21 Nov 2026) — where each part of a copied tee's side sits on the customer's photo, so the copy is
// laid out the same: the picture AI draws a laid-out side well but puts its parts only roughly where they go (a chest
// logo 11 cm too low on the first test). The text AI (Gemini, which marks things in a photo with boxes) is shown the
// photo AND the parts cut out of the drawing, and marks where each part is on that side of the tee, plus the collar and
// the whole tee; the neckline seam is then found exactly in the photo's own pixels (seamBelow). Each part's place comes
// back in the tee's own measure — "front lengths" (collar seam to hem at the centre = 1) — and the page turns that into
// cm on our tee of the chosen size.
import sharp from "sharp";
import { aiTextConfigured, askJsonWithImage } from "./aiTextService.js";

const SIDE_WORDS = {
  front: "the FRONT of the tee (the view showing the front neckline)",
  back: "the BACK of the tee (the view showing the back neckline)",
};
// (a box, not a point: the AI marks boxes well; a point "at the collar seam" came out on the neck label, 3 cm high)
const COLLAR_WORDS = {
  front: "a box tight round the collar rib as it shows in this view — the whole ring round the neck opening, from the top of the back of the neck down to the LOWEST point of the front rib, where it meets the body fabric at the centre front",
  back: "a box tight round the collar rib as it shows in this view — from its top edge down to the lower edge of the back rib at the centre back, where it meets the body fabric",
};

// (21 Nov 2026, the owner: "the customer expects the output as like in the mockup") the picture measured is the concept
// sheet the customer picked from — several concepts side by side, each numbered, each tee from the front and the back
// with its sleeve insets — or (no sheet) a photo of a tee
const SOURCE_WORDS = {
  sheet: (side, n) =>
    `Image 1 is a concept sheet: several t-shirt design concepts side by side, each labelled with a numeral in its top-left corner, each tee shown from the front and from the back, sleeve prints as small square insets beside them. Use ONLY concept ${n}'s whole view of ${SIDE_WORDS[side]} — not another concept, not its other view and not an inset.`,
  photo: (side) => `Image 1 is a photo of a t-shirt, maybe in several views (front, back, sleeves, close-ups). Use ONLY its main, whole view of ${SIDE_WORDS[side]} — not a close-up and not another view.`,
};

// (21 Nov 2026, the first real sheet read: the parts are shown blown up to one size, so a big chest logo and a tiny copy
// of it near the hem looked the same — the AI gave the logo's place to the tiny copy) each part's size and rough spot
// in the copy, so look-alike parts are told apart
const SIZE_WORDS = (share) => (share >= 0.5 ? "large" : share >= 0.15 ? "medium" : share >= 0.04 ? "small" : "tiny");
const SPOT_WORDS = (c, words) => words[c < 1 / 3 ? 0 : c < 2 / 3 ? 1 : 2];
export function layoutWords(layout) {
  if (!Array.isArray(layout) || !layout.length || !layout.every((l) => l && l.w > 0 && l.h > 0)) return null;
  const big = Math.max(...layout.map((l) => Math.sqrt(l.w * l.h)));
  const y0 = Math.min(...layout.map((l) => l.y));
  const y1 = Math.max(...layout.map((l) => l.y + l.h));
  const x0 = Math.min(...layout.map((l) => l.x));
  const x1 = Math.max(...layout.map((l) => l.x + l.w));
  return layout
    .map((l, i) => {
      const cy = y1 > y0 ? (l.y + l.h / 2 - y0) / (y1 - y0) : 0.5;
      const cx = x1 > x0 ? (l.x + l.w / 2 - x0) / (x1 - x0) : 0.5;
      return `part ${i + 1}: ${SIZE_WORDS(Math.sqrt(l.w * l.h) / big)}, ${SPOT_WORDS(cy, ["top", "middle", "bottom"])} ${SPOT_WORDS(cx, ["left", "centre", "right"])}`;
    })
    .join("; ");
}

export const measurePrompt = (side, parts, { concept = null, layout = null } = {}) =>
  [
    concept ? SOURCE_WORDS.sheet(side, concept) : SOURCE_WORDS.photo(side),
    `Images 2 to ${parts + 1} are parts 1 to ${parts} of a copy of that side's prints, each cut out on its own (shown on grey). Find each part on that side of the tee in image 1: the same print, or the same group of prints when a part holds several (a logo with its word, brush strokes with words beside them). Its colours or details may differ a little from the photo.`,
    ...(layoutWords(layout)
      ? [`The parts are shown blown up to one size; in the copy their sizes and places (as you look at the tee) are — ${layoutWords(layout)}. They match image 1 only roughly, but the sizes tell look-alike parts apart: a large logo and a tiny copy of it are different parts.`]
      : []),
    "Every position is in numbers from 0 to 1000 across the WHOLE of image 1: y from its top edge (0) to its bottom edge (1000), x from its left edge (0) to its right edge (1000). A box is [ymin, xmin, ymax, xmax], tight round the ink.",
    `Answer JSON only: {"found": true|false, "collar": box, "body": box, "parts": [{"part": 1 to ${parts}, "box": box or null}]}.`,
    `collar: ${COLLAR_WORDS[side]}. body: a box tight round the whole tee in this view, sleeves included — its top edge is the top of the shoulders, its bottom edge is the hem.`,
    "parts: one entry for every part, in order; box: where that part is on the BODY of that side of the tee in image 1 (round all of its prints when it holds several), null when it is not there. found: false when that side of the tee is not in image 1.",
  ].join("\n");

const num = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(1000, Number(v))) : null);
const bx = (b) => (Array.isArray(b) && b.length === 4 && b.every((v) => num(v) != null) && num(b[2]) > num(b[0]) && num(b[3]) > num(b[1]) ? b.map(num) : null);

/**
 * (21 Nov 2026) The AI's boxes checked against the copy's own layout: the same parts are the same sizes against each
 * other on the sheet as in the copy, and in about the same arrangement. Each box the AI gave is matched to the part it
 * fits best (the AI's own numbering wins when it fits about as well) — a box swapped onto a look-alike part is moved
 * back; a box that fits no part is dropped (that part then stays where the drawing put it, never put somewhere wrong).
 * @param answer  the AI's answer ({ parts: [{ part, box }] }, 0–1000 of the picture)
 * @param size    the picture's { width, height } px
 * @param layout  each part's place in the copy: { x, y, w, h } shares of the copy's picture
 * @param aspect  the copy's picture width / height
 * @returns { answer, moved, dropped } — answer with its parts re-numbered (or the same answer when nothing to check)
 */
export function matchLayout(answer, { width, height }, layout, aspect = 1) {
  const list = Array.isArray(answer?.parts) ? answer.parts : [];
  const n = layout?.length || 0;
  if (!n || n > 7 || !layout.every((l) => l && l.w > 0 && l.h > 0)) return { answer, moved: 0, dropped: 0 };
  // the boxes the AI gave (each once: the same box twice counts once, for the first part that had it)
  const boxes = [];
  list.forEach((p, k) => {
    const box = bx(p?.box);
    const said = Number(p?.part) >= 1 && Number(p?.part) <= n ? Number(p.part) - 1 : k;
    if (box && !boxes.some((o) => o.box.every((v, i) => Math.abs(v - box[i]) <= 3))) boxes.push({ box, said });
  });
  if (boxes.length < 2) return { answer, moved: 0, dropped: 0 }; // nothing to compare a lone box with
  const W = 1000;
  const H = 1000 / aspect;
  const part = layout.map((l) => ({ cx: (l.x + l.w / 2) * W, cy: (l.y + l.h / 2) * H, side: Math.sqrt(l.w * W * l.h * H) }));
  const seen = boxes.map(({ box }) => {
    const w = ((box[3] - box[1]) / 1000) * width;
    const h = ((box[2] - box[0]) / 1000) * height;
    return { cx: ((box[1] + box[3]) / 2 / 1000) * width, cy: ((box[0] + box[2]) / 2 / 1000) * height, side: Math.sqrt(w * h) };
  });
  const median = (v) => {
    const s = [...v].sort((a, b) => a - b);
    return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  };
  // how well one matching (box i -> part to[i]) fits: one scale for all (sizes), then one shift (places)
  const fit = (to) => {
    const logs = to.map((j, i) => Math.log(seen[i].side / part[j].side));
    const mid = median(logs);
    const s = Math.exp(mid);
    const tx = median(to.map((j, i) => seen[i].cx - s * part[j].cx));
    const ty = median(to.map((j, i) => seen[i].cy - s * part[j].cy));
    const span = s * Math.max(...part.map((p) => p.side)) * 2;
    const each = to.map((j, i) => ({ size: Math.abs(logs[i] - mid), place: Math.hypot(seen[i].cx - (s * part[j].cx + tx), seen[i].cy - (s * part[j].cy + ty)) / span }));
    const cost = each.reduce((t, e, i) => t + e.size + 0.5 * Math.min(e.place, 1) + (to[i] === boxes[i].said ? 0 : 0.15), 0);
    return { cost, each };
  };
  let best = null;
  const walk = (i, to, used) => {
    if (i === boxes.length) {
      const f = fit(to);
      if (!best || f.cost < best.cost) best = { ...f, to: [...to] };
      return;
    }
    for (let j = 0; j < n; j++) {
      if (used.has(j)) continue;
      used.add(j);
      to.push(j);
      walk(i + 1, to, used);
      to.pop();
      used.delete(j);
    }
  };
  walk(0, [], new Set());
  // a box over 1.7x too big or too small for its part against the others: not that part
  const keep = best.to.map((j, i) => best.each[i].size <= Math.log(1.7));
  const parts = Array.from({ length: n }, (_, j) => {
    const i = best.to.indexOf(j);
    return { part: j + 1, box: i >= 0 && keep[i] ? boxes[i].box : null };
  });
  const moved = best.to.filter((j, i) => keep[i] && j !== boxes[i].said).length;
  const dropped = keep.filter((k) => !k).length;
  return { answer: { ...answer, parts }, moved, dropped };
}

// a part mostly inside the collar ring (a neck label the picture AI drew anyway): never printed — IDENTEE's own woven
// neck label goes there (21 Nov 2026, the owner)
const IN_COLLAR = 0.5;
const overlap = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

/**
 * The parts' places on one side of the tee, in the tee's own measure.
 * @param answer   the text AI's answer ({ found, collar, body, parts }: boxes, 0–1000 of the picture; the collar box's
 *                 bottom is the neckline seam at the centre, its middle the centre line; the body box's bottom the hem)
 * @param size     the picture's { width, height } in px (the 0–1000 runs across each, so x and y differ in px)
 * @param count    how many parts were sent
 * @param seamPx   the seam found in the picture's pixels (seamBelow), when it was
 * @param outline  the tee's own outline in px (teeOutline: { top, hem, centre, half }), when it was found — then each
 *                 place is a share of the tee as it LOOKS (`from: "outline"`, 21 Nov 2026, the owner: "what we see in
 *                 the mockup the same in the 3D tee" — the mockup's tee and ours are cut differently): d / h shares of
 *                 the top of the shoulders to the hem, r / w shares of the body's half-width
 * @returns { at: [{ d, r, w, h, from? } | { inCollar: true } | null per part] } or null — d: the part's top edge below
 *          the collar seam (from "outline": below the top of the shoulders), r: its centre to the VIEWER's right of the
 *          centre line (front: the wearer's left; back: the wearer's right), w / h its size; in the tee's lengths
 *          (collar seam to hem at the centre = 1) — from "outline": see above.
 *          { inCollar: true }: a part inside the collar ring, left off the tee.
 */
export function toTeeMeasure(answer, { width, height }, count, { seamPx = null, outline = null } = {}) {
  if (!answer || answer.found === false) return null;
  const collar = bx(answer.collar);
  const body = bx(answer.body);
  if (!collar || !body) return null;
  const fromShoulder = Boolean(outline);
  const across = fromShoulder && outline.half > 0 ? outline.half : null; // r / w: shares of the body's half-width
  const cy = fromShoulder ? outline.top : seamPx ?? (collar[2] / 1000) * height; // the top of the shoulders / the neckline seam
  const hy = fromShoulder ? outline.hem : (body[2] / 1000) * height; // the hem
  const centreX = fromShoulder ? outline.centre : ((collar[1] + collar[3]) / 2 / 1000) * width;
  const len = hy - cy;
  if (len < 20 || (!fromShoulder && len < height * 0.15)) return null; // not a tee's length (a wrong box)
  const list = Array.isArray(answer.parts) ? answer.parts : [];
  const at = Array.from({ length: count }, (_, i) => {
    const box = bx((list.find((p) => Number(p?.part) === i + 1) || list[i])?.box);
    if (!box) return null;
    const area = (box[2] - box[0]) * (box[3] - box[1]);
    if (area > 0 && overlap(box, collar) / area >= IN_COLLAR) return { inCollar: true };
    const y0 = (box[0] / 1000) * height;
    const y1 = (box[2] / 1000) * height;
    const x0 = (box[1] / 1000) * width;
    const x1 = (box[3] / 1000) * width;
    const xs = across || len;
    const p = { d: (y0 - cy) / len, r: ((x0 + x1) / 2 - centreX) / xs, w: (x1 - x0) / xs, h: (y1 - y0) / len, ...(across ? { from: "outline" } : fromShoulder ? { from: "shoulder" } : {}) };
    // on the tee: below the collar (the shoulders), above the hem (a little room for a loose box), not a speck
    return p.d > -0.05 && p.d + p.h < 1.08 && p.w * (xs / len) > 0.005 && p.h > 0.005 ? p : null;
  });
  return at.some((a) => a && !a.inCollar) ? { at } : null;
}

/**
 * The tee's outline in the picture, inside the AI's box round the whole tee: the tee stands out from the plain studio
 * background on any fabric colour (a black tee's collar seam hardly shows — 21 Nov 2026: the seam finder caught the
 * neck label's shadow on the concept sheet's black tees). The top of the shoulders (the highest point of the tee near
 * the centre), the hem (its lowest edge at the centre) and the centre line (half-way between the body's sides below
 * the sleeves), in px; or null when the tee doesn't stand out clearly.
 * @param rgb   { data, width, height, channels } raw pixels
 * @param body  the AI's box round the whole tee, in px [y0, x0, y1, x1]
 */
export function teeOutline(rgb, body, collarX = null) {
  const { data, width, height, channels: c } = rgb;
  const padX = Math.round((body[3] - body[1]) * 0.03);
  const padY = Math.round((body[2] - body[0]) * 0.03);
  const X0 = Math.max(0, Math.round(body[1]) - padX);
  const X1 = Math.min(width - 1, Math.round(body[3]) + padX);
  const Y0 = Math.max(0, Math.round(body[0]) - padY);
  const Y1 = Math.min(height - 1, Math.round(body[2]) + padY);
  if (X1 - X0 < 20 || Y1 - Y0 < 20) return null;
  const px = (x, y) => (y * width + x) * c;
  // the background: the middle colour along the region's edge
  const edge = [];
  for (let x = X0; x <= X1; x += 2) edge.push(px(x, Y0), px(x, Y1));
  for (let y = Y0; y <= Y1; y += 2) edge.push(px(X0, y), px(X1, y));
  const bg = [0, 1, 2].map((k) => {
    const v = edge.map((i) => data[i + k]).sort((a, b) => a - b);
    return v[v.length >> 1];
  });
  const dist = (x, y) => {
    const i = px(x, y);
    return Math.max(Math.abs(data[i] - bg[0]), Math.abs(data[i + 1] - bg[1]), Math.abs(data[i + 2] - bg[2]));
  };
  // how far the tee stands out: most of the box is tee — the threshold half-way to it (a soft shadow stays out)
  const inner = [];
  for (let y = Y0 + padY * 2; y <= Y1 - padY * 2; y += 4) for (let x = X0 + padX * 2; x <= X1 - padX * 2; x += 4) inner.push(dist(x, y));
  inner.sort((a, b) => a - b);
  const strong = inner[Math.floor(inner.length * 0.75)];
  if (!(strong >= 24)) return null;
  const cut = strong / 2;
  const on = (x, y) => dist(x, y) > cut;
  const median = (v) => (v.length ? [...v].sort((a, b) => a - b)[v.length >> 1] : null);
  // the hem and the shoulders: down and up each column of the middle of the box
  const midX = (X0 + X1) / 2;
  const span = X1 - X0;
  const hems = [];
  const tops = [];
  // (21 Nov 2026, the back of a live test: on a concept sheet the front tee hangs just above the back tee, and scanning
  // down from above the box caught the front tee's hem — the back's top came out 46 px too high, its print 6 % low.)
  // Each column is walked OUT from the middle of the box, through the tee, to where clear background starts (a gap of
  // a few px, so a thin print line the colour of the background doesn't stop it): another tee above or below, or its
  // shadow, is never reached.
  const gap = Math.max(3, Math.round((Y1 - Y0) * 0.015));
  const walk = (x, y, step) => {
    let last = y;
    for (let off = 0; y >= Y0 && y <= Y1; y += step) {
      if (on(x, y)) {
        last = y;
        off = 0;
      } else if (++off > gap) break;
    }
    return last;
  };
  const midY = Math.round((Y0 + Y1) / 2);
  for (let x = Math.round(midX - span * 0.3); x <= Math.round(midX + span * 0.3); x += 2) {
    if (!on(x, midY)) continue; // (not on the tee here: between the sleeve and the body)
    tops.push(walk(x, midY, -1));
    if (Math.abs(x - midX) <= span * 0.2) hems.push(walk(x, midY, 1));
  }
  if (tops.length < 5 || hems.length < 5) return null;
  tops.sort((a, b) => a - b);
  const top = tops[Math.floor(tops.length * 0.05)]; // the highest point: the shoulders at the neck
  let hem = median(hems);
  // the centre line and the body's half-width: half-way between / half of the body's two sides, from 60 % to 90 % of
  // the way down (below the sleeves, the oversized tee's narrowest — as our 3D tee's own `half` is measured)
  // (21 Nov 2026, the full-tee test: on the sheet the "L" / "R" sleeve close-ups sit beside or over the tees' lower
  // sides — scanning in from the box's edges took a close-up for the tee's side: the front came out 1.6x as wide as it
  // is (every print on the 3D tee 40 % too narrow, too near the middle) and the back's centre line 55 px off, its
  // centred print 4.7 cm to one side.) When the AI's collar box gives the centre (collarX — the collar ring is never
  // covered), that is the centre line, and each row is walked OUT from it to the tee's own side, on a map of the tee:
  // lighter than the sheet for a light tee (darker for a dark one — a shadow on the sheet is neither), or ink (on a dark
  // tee also anything clearly lighter than the sheet: white strokes — a shadow is never lighter), with the
  // holes inside it filled (a white tee's fold shadows are as grey as the sheet). A few px of sheet end the walk (the
  // gap before a close-up). The half-width is the NEARER side's: a close-up lying over one side only makes that side
  // look farther away.
  const cx = collarX != null && collarX > X0 && collarX < X1 ? Math.round(collarX) : null;
  let centre = null;
  let half = null;
  if (cx != null) {
    const RW = X1 - X0 + 1;
    const RH = Y1 - Y0 + 1;
    const bgLum = (bg[0] + bg[1] + bg[2]) / 3;
    const lumAt = (x, y) => {
      const i = px(x, y);
      return (data[i] + data[i + 1] + data[i + 2]) / 3 - bgLum;
    };
    // a light tee or a dark one: the sign of most of what stands out inside the box
    let up = 0;
    let down = 0;
    for (let y = Y0 + padY * 2; y <= Y1 - padY * 2; y += 4)
      for (let x = X0 + padX * 2; x <= X1 - padX * 2; x += 4) {
        if (!on(x, y)) continue;
        if (lumAt(x, y) > 0) up++;
        else down++;
      }
    const sign = up >= down ? 1 : -1;
    const tee = new Uint8Array(RW * RH); // 1: the tee (or ink on it)
    for (let y = 0; y < RH; y++)
      for (let x = 0; x < RW; x++) tee[y * RW + x] = sign * lumAt(X0 + x, Y0 + y) > 3 || dist(X0 + x, Y0 + y) > 60 || (sign < 0 && lumAt(X0 + x, Y0 + y) > 20) ? 1 : 0;
    // the sheet: everything not the tee that the region's edge reaches (the rest is a hole in the tee: filled)
    const seen = new Uint8Array(RW * RH);
    const queue = new Int32Array(RW * RH);
    let qh = 0;
    let qt = 0;
    const push = (i) => {
      if (!tee[i] && !seen[i]) {
        seen[i] = 1;
        queue[qt++] = i;
      }
    };
    for (let x = 0; x < RW; x++) push(x), push((RH - 1) * RW + x);
    for (let y = 0; y < RH; y++) push(y * RW), push(y * RW + RW - 1);
    while (qh < qt) {
      const i = queue[qh++];
      const x = i % RW;
      if (x > 0) push(i - 1);
      if (x < RW - 1) push(i + 1);
      if (i >= RW) push(i - RW);
      if (i < RW * (RH - 1)) push(i + RW);
    }
    const gapX = Math.max(3, Math.round(span * 0.01));
    const out = (y, step) => {
      let last = cx;
      for (let x = cx, off = 0; x >= X0 && x <= X1; x += step) {
        if (!seen[(y - Y0) * RW + (x - X0)]) {
          last = x;
          off = 0;
        } else if (++off > gapX) break;
      }
      return Math.abs(last - cx);
    };
    // the hem: a white tee's shaded bottom (as grey as the sheet) or big white strokes on a black tee stop the walk
    // down early (all 6 sheets: 3 of 36 hems 5–25 % too high, their tall prints then "past the hem" and left as
    // drawn); where the pixels gave one the AI's box agreed within 2.5 % — so more than 3 % above it, the AI's is used
    if (body[2] - hem > (hem - top) * 0.03 && body[2] <= Y1) hem = body[2];
    // (21 Nov 2026, all 6 laptop sheets read: on one sheet the L and R close-ups cover BOTH lower corners of the back
    // tee, from 65 % of the way down) rows from just below the sleeves (45 %) to the hem; each side's width is that of
    // its narrower rows (a tenth of the way up its sorted widths: there the sleeves reach 50 % down and the close-ups
    // start at 62 %) — a close-up or a sleeve only ever widens a row
    // A close-up over a side can make it look wider (its own picture continues the tee) or narrower (its grey inside
    // ends the walk) — so a row is trusted when its two sides agree (a tee is the same both sides of its collar, within
    // 10 %) and it isn't widened (within 15 % of the narrowest rows); the half-width is the middle of those rows' two
    // sides, from the rows 60–95 % down when there are enough (as our 3D tee's own half-width is measured: below the
    // pinch under the sleeves), else from all of them; none: the narrower side's narrow rows.
    const rows = [];
    for (let y = Math.round(top + (hem - top) * 0.45); y <= Math.round(top + (hem - top) * 0.95); y += 2) {
      const l = out(y, -1);
      const r = out(y, 1);
      rows.push({ low: y >= top + (hem - top) * 0.6, m: (l + r) / 2, l, r, agree: Math.abs(l - r) <= 0.1 * Math.max(l, r) });
    }
    const tenth = (v) => [...v].sort((p, q) => p - q)[Math.floor(v.length * 0.1)];
    let near = 0;
    let shift = 0;
    if (rows.length) {
      const narrow = tenth(rows.map((w) => w.m));
      const fit = rows.filter((w) => w.agree && w.m <= narrow * 1.15);
      const lowFit = fit.filter((w) => w.low);
      const use = lowFit.length >= 5 ? lowFit : fit;
      near = use.length >= 3 ? median(use.map((w) => w.m)) : Math.min(tenth(rows.map((w) => w.l)), tenth(rows.map((w) => w.r)));
      // (23 Nov 2026, the first real GTA mockup: a black back tee lying over the black front tee — the AI's collar box
      // was 12 of 1000 to one side of the tee's middle. No row's sides agreed, so the nearer side was taken for the
      // half-width: the tee 15 % too narrow, its centred poster 12 % too big and 3.7 cm off the centre.) No row
      // agrees, yet nearly every row is the same width and off to the same side by the same amount, all the way
      // down: it is the collar box that is off, not a close-up over one side (that widens or cuts only the rows it
      // covers). The centre line is then the middle of the body's own two sides — but only when the AI's own box
      // round the whole tee says so too: its middle is much nearer the new line than the collar's (two of the three
      // agree). A soft shadow down one side of the tee makes the rows lean the same way (one of the 6 laptop sheets:
      // all its tees 10 % wider on the left) — there the body box stays with the collar, and so does the centre.
      if (use.length < 3) {
        const same = rows.filter((w) => w.m <= narrow * 1.15);
        const offs = same.map((w) => (w.r - w.l) / 2).sort((p, q) => p - q);
        const mid = median(offs);
        const spread = offs.length ? offs[Math.floor(offs.length * 0.9)] - offs[Math.floor(offs.length * 0.1)] : Infinity;
        const boxMid = (body[1] + body[3]) / 2;
        const boxAgrees = Math.abs(boxMid - (collarX + mid)) < Math.abs(boxMid - collarX) * 0.5;
        if (boxAgrees && same.length >= rows.length * 0.7 && spread <= narrow * 0.06 && Math.abs(mid) <= narrow * 0.3) {
          shift = mid;
          near = median(same.map((w) => w.m));
        }
      }
    }
    if (near > span * 0.1) {
      centre = collarX + shift;
      half = near;
    }
  } else {
    const centres = [];
    const halves = [];
    for (let y = Math.round(top + (hem - top) * 0.6); y <= Math.round(top + (hem - top) * 0.9); y += 2) {
      let l = X0;
      while (l < X1 && !on(l, y)) l++;
      let r = X1;
      while (r > X0 && !on(r, y)) r--;
      if (r - l > span * 0.3) {
        centres.push((l + r) / 2);
        halves.push((r - l) / 2);
      }
    }
    centre = median(centres);
    half = median(halves);
  }
  if (centre == null || hem - top < (Y1 - Y0) * 0.6) return null;
  return { top, hem, centre, half };
}

export const measureReady = () => aiTextConfigured();

/**
 * The neckline seam, found in the photo's own pixels just below where the AI put it: the AI's collar box ends about
 * 1.5–2 cm short of the real seam (21 Nov 2026: 4 tries, always 14–16 px high on a 1,200 px photo), and the seam shows
 * as a thin shadow line across the centre line. The darkest such line in the stretch below the AI's guess, when it is
 * clearly darker than the fabric round it; else null (the AI's guess stays — a dark tee may show no line).
 * @param grey  { data, width, height } one byte per pixel
 */
export function seamBelow(grey, centreX, guessY, len) {
  const { data, width, height } = grey;
  const half = Math.max(3, Math.round(len * 0.03)); // a band about 2 cm wide down the centre line
  const x0 = Math.max(0, Math.round(centreX - half));
  const x1 = Math.min(width - 1, Math.round(centreX + half));
  const from = Math.max(0, Math.round(guessY - len * 0.005));
  const to = Math.min(height - 1, Math.round(guessY + len * 0.06)); // up to about 4 cm lower
  if (to - from < 6) return null;
  const rows = [];
  for (let y = from; y <= to; y++) {
    let sum = 0;
    for (let x = x0; x <= x1; x++) sum += data[y * width + x];
    rows.push(sum / (x1 - x0 + 1));
  }
  const sorted = [...rows].sort((a, b) => a - b);
  const fabric = sorted[Math.floor(sorted.length / 2)]; // the plain fabric
  let best = null;
  for (let i = 1; i < rows.length - 1; i++) {
    const dip = fabric - rows[i];
    // a thin line: darker than the fabric and than the rows 3 above and below it
    const above = rows[Math.max(0, i - 3)];
    const below = rows[Math.min(rows.length - 1, i + 3)];
    if (dip >= 4 && rows[i] < above - 2 && rows[i] < below - 2 && (!best || dip > best.dip)) best = { y: from + i, dip };
  }
  return best ? best.y : null;
}

// a part as the AI is shown it: on mid grey (white words and black strokes both show), at most 512 px
const partImage = async (buffer) => ({ data: await sharp(buffer).flatten({ background: "#8a8a8a" }).resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer(), mime: "image/jpeg" });

/**
 * Where each part is on one side of the tee in a picture of it (one text-AI request with the picture and the parts,
 * about a chat message's cost): the concept sheet the customer picked from (`concept`: its number on the sheet), or a
 * photo of a tee.
 * @param picture  { data: Buffer, mime } (a smaller copy is fine: positions are 0–1000)
 * @param parts    the parts' see-through PNG buffers, in order
 * @param layout   (optional) each part's place in the copy: { x, y, w, h } shares of the copy's picture; `aspect` its
 *                 width / height — told to the AI and used to check its answer (matchLayout)
 * @returns { at: [...], how } (toTeeMeasure; how: "outline" | "seam" | "collar"), or null when it can't be measured
 *          (no key, the side isn't in the picture, an error) — the parts then stay where the drawing put them
 */
export async function measureParts(picture, parts, side, { concept = null, layout = null, aspect = 1 } = {}) {
  if (!SIDE_WORDS[side] || !parts?.length || !measureReady()) return null;
  try {
    const meta = await sharp(picture.data).metadata();
    const shown = await Promise.all(parts.map(partImage));
    const t0 = Date.now();
    // (laptop checks only: AI_MOCK_MEASURE = a file with an answer saved from a real run — no AI call, no cost; the
    // file may hold one answer for each side, { front: answer, back: answer }, so a whole tee can be replayed)
    const mockFile = process.env.AI_MOCK_MEASURE?.trim();
    // (40 s, then once more: the AI sometimes hangs — 21 Nov 2026, 2 of 4 real tries ran past 40 / 90 s, the others
    // answered in 9–12 s; a customer shouldn't wait long for nothing)
    const ask = () => askJsonWithImage(measurePrompt(side, parts.length, { concept, layout }), [picture, ...shown], 0.1, undefined, { timeoutMs: 40_000, thinking: "low" });
    const said = mockFile
      ? ((all) => all?.[side] || all)(JSON.parse(await (await import("fs/promises")).readFile(mockFile, "utf8")))
      : await ask().catch((err) => {
          if (err?.message !== "unreachable") throw err;
          console.log(`[ai:v2] the ${side}: no answer in 40 s — asking once more`);
          return ask();
        });
    console.log(`[ai:v2] the ${side}'s answer: ${JSON.stringify(said)}`);
    console.log(`[ai:v2] the ${concept ? `sheet's concept ${concept}` : "photo's"} ${side} read in ${Math.round((Date.now() - t0) / 1000)} s`);
    const size = { width: meta.width, height: meta.height };
    const checked = matchLayout(said, size, layout, aspect);
    const answer = checked.answer;
    if (checked.moved || checked.dropped) console.log(`[ai:v2] the ${side}: checked against the copy — ${checked.moved} part(s) re-matched, ${checked.dropped} left as drawn (${JSON.stringify(answer.parts)})`);
    const first = toTeeMeasure(answer, size, parts.length);
    if (!first) {
      console.log(`[ai:v2] the ${side}: no usable boxes (${JSON.stringify(answer).slice(0, 300)})`);
      return null;
    }
    // 1. the tee's own outline (any fabric colour)
    const b = answer.body.map(Number);
    const bodyPx = [(b[0] / 1000) * meta.height, (b[1] / 1000) * meta.width, (b[2] / 1000) * meta.height, (b[3] / 1000) * meta.width];
    const rgb = await sharp(picture.data).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const cl = answer.collar.map(Number);
    const outline = teeOutline({ data: rgb.data, width: rgb.info.width, height: rgb.info.height, channels: rgb.info.channels }, bodyPx, ((cl[1] + cl[3]) / 2 / 1000) * meta.width);
    if (outline) {
      const m = toTeeMeasure(answer, size, parts.length, { outline });
      if (m) return { ...m, how: "outline" };
    }
    // 2. the collar seam, from the picture's pixels (see seamBelow); 3. the AI's collar box
    const g = await sharp(picture.data).greyscale().raw().toBuffer({ resolveWithObject: true });
    const collar = answer.collar.map(Number);
    const guess = (collar[2] / 1000) * meta.height;
    const seamPx = seamBelow({ data: g.data, width: g.info.width, height: g.info.height }, ((collar[1] + collar[3]) / 2 / 1000) * meta.width, guess, (b[2] / 1000) * meta.height - guess);
    return seamPx == null ? { ...first, how: "collar" } : { ...toTeeMeasure(answer, size, parts.length, { seamPx }), how: "seam" };
  } catch (err) {
    console.log(`[ai:v2] the ${side} could not be measured (${err.message})`);
    return null;
  }
}

/* ---------- a sleeve print on the concept sheet (21 Nov 2026) ---------- */
// The sheet shows each sleeve print in a small close-up inset ("L", "R") that cuts the sleeve off above the print, so
// boxes can't place it: the text AI is asked for its place ALONG the sleeve instead — top and bottom from the shoulder
// seam (0) to the sleeve's hem (1) — and how much of the sleeve's width it covers (the owner: "the same mockup in the
// 3D tee", sleeves included).
const SLEEVE_WHICH = {
  sleeve: (both) => (both ? "its LEFT sleeve's print (the inset marked L)" : "its sleeve print (the inset that shows a print, marked L or R)"),
  sleeve2: () => "its RIGHT sleeve's print (the inset marked R)",
};
export const sleevePrompt = (piece, concept, both = false) =>
  [
    `Image 1 is a concept sheet: several t-shirt design concepts side by side, each labelled with a numeral in its top-left corner, each tee shown from the front and from the back, sleeve prints as small square close-up insets marked L (left sleeve) and R (right sleeve). Look ONLY at concept ${concept}: ${SLEEVE_WHICH[piece](both)}, in its inset and wherever it also shows on that concept's front or back view.`,
    "Image 2 is that print drawn flat on its own (on grey); its colours or details may differ a little.",
    "Say where it sits on the sleeve as it is worn: top and bottom are its top and bottom edges as shares of the sleeve's length, from the shoulder seam where the sleeve meets the body (0) to the sleeve's hem (1); width is how much of the sleeve's width (across the outside of the sleeve, at that height) it covers, from 0 to 1 (a band right round the sleeve: 1).",
    'Answer JSON only: {"found": true|false, "top": number, "bottom": number, "width": number}. found: false when concept ' + concept + " has no such sleeve print.",
  ].join("\n");

/** The text AI's sleeve answer checked: { top, bottom, width } (0–1), or null. */
export function toSleevePlace(answer) {
  if (!answer || answer.found === false) return null;
  const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  let [top, bottom, width] = [n(answer.top), n(answer.bottom), n(answer.width)];
  if (top == null || bottom == null) return null;
  top = Math.max(0, Math.min(1, top));
  bottom = Math.max(0, Math.min(1, bottom));
  if (!(bottom - top >= 0.03)) return null;
  width = width == null ? null : Math.max(0.05, Math.min(1, width));
  return { top: Math.round(top * 1000) / 1000, bottom: Math.round(bottom * 1000) / 1000, ...(width != null ? { width: Math.round(width * 1000) / 1000 } : {}) };
}

/**
 * Where a sleeve piece sits on its sleeve on the sheet's concept: { top, bottom, width? } or null (then it goes on the
 * sleeve's usual print area).
 * @param picture  { data, mime } the concept sheet
 * @param part     the drawn sleeve piece (cut out)
 * @param piece    "sleeve" | "sleeve2"
 */
export async function measureSleeve(picture, part, piece, { concept = 1, both = false } = {}) {
  if (!SLEEVE_WHICH[piece] || !part || !measureReady()) return null;
  try {
    const shown = await partImage(part);
    const t0 = Date.now();
    // (laptop checks only: AI_MOCK_MEASURE's "sleeves": { sleeve: answer, sleeve2: answer } — no AI call, no cost)
    const mockFile = process.env.AI_MOCK_MEASURE?.trim();
    const ask = () => askJsonWithImage(sleevePrompt(piece, concept, both), [picture, shown], 0.1, undefined, { timeoutMs: 40_000, thinking: "low" });
    const said = mockFile
      ? JSON.parse(await (await import("fs/promises")).readFile(mockFile, "utf8"))?.sleeves?.[piece] || null
      : await ask().catch((err) => {
          if (err?.message !== "unreachable") throw err;
          console.log(`[ai:v2] the ${piece}: no answer in 40 s — asking once more`);
          return ask();
        });
    const place = toSleevePlace(said);
    console.log(`[ai:v2] the sheet's concept ${concept} ${piece}: ${JSON.stringify(said)} in ${Math.round((Date.now() - t0) / 1000)} s -> ${place ? JSON.stringify(place) : "not placed (stays on the sleeve's print area)"}`);
    return place;
  } catch (err) {
    console.log(`[ai:v2] the ${piece} could not be measured (${err.message})`);
    return null;
  }
}
