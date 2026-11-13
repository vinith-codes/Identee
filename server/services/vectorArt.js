// services/vectorArt.js — print pictures as clean vector shapes (12 Nov 2026, the print team OK'd the samples).
//
// Proved on the laptop first (tools/print-ref/centre-back-S: the QUENN skull; centre-back: the cat poster), then written
// for Node here. Two parts:
//   1. artKind(): is a design picture DRAWN ART (cartoon, logo, illustration: few flat colours, sharp lines) or a PHOTO
//      (smooth shading)? Drawn art looks the same as vector shapes; a photo would get visible colour steps, so it stays
//      the approved sharp picture unless the admin switches it on the Orders page.
//   2. vectorizeArt(): the print-ready picture (enlarged, painted, see services/printRecipe.js) -> flat colours -> traced
//      colour shapes. The shapes are drawn INSIDE the recipe's own vector edge (the PDF clip), so the see-through
//      parts and the edge the print team approved stay exactly as they were — only the pixels become shapes.
//
// Out: the shapes as a PDF content stream (picture pixels, y down — drawn by the admin's browser as a form, under the
// same transform and clip as the picture) and as an SVG (for the admin's preview and the day sheets).
import zlib from "zlib";
import sharp from "sharp";
import { convertPixels } from "@visioncortex/vtracer";
import { bleedEdges, maxFilter } from "./printRecipe.js";

/* ---------- colour: sRGB -> Lab ---------- */
const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
const fLab = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
export function lab(r, g, b, out = [0, 0, 0]) {
  const R = LIN[r], G = LIN[g], B = LIN[b];
  const x = fLab((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047);
  const y = fLab(0.2126 * R + 0.7152 * G + 0.0722 * B);
  const z = fLab((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  out[0] = 116 * y - 16;
  out[1] = 500 * (x - y);
  out[2] = 200 * (y - z);
  return out;
}

/* ---------- 1. drawn art or photo? ---------- */
// Measured on the design's own picture at 768 px: of the visible pixels, how many sit in GENTLE shading (colour changing
// slowly — photos, metallic gold) against how many sit on SHARP edges (drawn lines). Calibrated 12 Nov 2026 on the
// shop's designs: drawn art (QUENN skull, cowboys, lion, footballer, JCB, DSP badge) 0.2–1.9; photos, gold metal
// lettering and the pencil-shaded portrait 2.3 and up — but a photo of a person in a busy-patterned saree scored 2.27,
// so a second test catches people: how much of the ink is smooth skin tone. When in doubt it stays a picture (the
// approved way); the admin can still switch it to shapes.
export const ART_LIMIT = 2.2;
// and less than this % of the ink is smooth skin (calibrated 12 Nov 2026: drawn art 0–6.8 %, a saree photo 13.4 %, a portrait 21.8 %)
export const SKIN_LIMIT = 10;
export async function artKind(rgba, W, H) {
  const s = Math.min(1, 768 / Math.max(W, H));
  const w = Math.max(8, Math.round(W * s)), h = Math.max(8, Math.round(H * s));
  const small = s < 1 ? await sharp(rgba, { raw: { width: W, height: H, channels: 4 }, limitInputPixels: false }).resize(w, h, { kernel: "cubic" }).raw().toBuffer() : rgba;
  const N = w * h;
  // visible, and not right at the cut edge (the cut itself is a sharp edge of every picture)
  const out = new Uint8Array(N);
  for (let i = 0; i < N; i++) out[i] = small[i * 4 + 3] > 200 ? 0 : 1;
  const nearOut = maxFilter(out, w, h, 2);
  const L = new Float32Array(N * 3);
  const t = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    lab(small[i * 4], small[i * 4 + 1], small[i * 4 + 2], t);
    L[i * 3] = t[0]; L[i * 3 + 1] = t[1]; L[i * 3 + 2] = t[2];
  }
  let vis = 0, soft = 0, hard = 0, skin = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (nearOut[i]) continue;
      vis++;
      let g2 = 0;
      for (let c = 0; c < 3; c++) {
        const p = (yy, xx) => L[(yy * w + xx) * 3 + c];
        const gx = p(y - 1, x + 1) + 2 * p(y, x + 1) + p(y + 1, x + 1) - p(y - 1, x - 1) - 2 * p(y, x - 1) - p(y + 1, x - 1);
        const gy = p(y + 1, x - 1) + 2 * p(y + 1, x) + p(y + 1, x + 1) - p(y - 1, x - 1) - 2 * p(y - 1, x) - p(y - 1, x + 1);
        g2 += gx * gx + gy * gy;
      }
      const g = Math.sqrt(g2) / 8;
      if (g >= 1 && g < 6) soft++;
      else if (g >= 12) hard++;
      // smooth skin: skin-tone colours with gentle shading — a face or arm in a photo, which shapes would make blotchy
      const l = L[i * 3], a = L[i * 3 + 1], b = L[i * 3 + 2];
      if (g < 4 && l > 25 && l < 85 && a > 6 && a < 30 && b > 8 && b < 35) skin++;
    }
  }
  if (vis < 500) return { kind: "drawn", score: 0, skin: 0 }; // (almost nothing visible: a tiny mark — vector is right for it)
  const score = Math.round(((soft / vis) / Math.max(hard / vis, 1e-3)) * 100) / 100;
  const skinPct = Math.round((skin / vis) * 1000) / 10;
  return { kind: score < ART_LIMIT && skinPct < SKIN_LIMIT ? "drawn" : "photo", score, skin: skinPct };
}

/* ---------- 2. picture -> flat colours -> shapes ---------- */
export const ART_COLOURS = 96; // drawn art (13 Nov 2026: 32 flattened two-tone areas; 48 lost thin highlights — the jeans — and made hard bands of soft shading; 128 left faint patches and rougher lines)
export const ART_CRISP = 2; // drawn art: light Kuwahara edge-cleaning (3+ greyed small white areas, wobbled lines)
const CRISP_EDGE = 56; // a strong edge: lightness changes by 56 (of 255) or more within the filter's reach
export const ART_MERGE = 6; // drawn art: colours closer than ΔE 6 (18 for very dark ones) become one — two nearly equal skin shades side by side read as an error (13 Nov 2026, the horse's mouth: "these two should be joined"; 4 left them apart)
export const ART_SMOOTH = 2.8; // drawn art: colour-area smoothing before tracing, px at full size (1.2 left bumps on outlines; 2.2 was right for 48 colours)
export const ART_ISLAND = 1500; // drawn art: areas under 1,500 px (about 11 mm² at 300 DPI) of nearly the surrounding colour join it (600 left a sliver beside the horse's mouth)
const ART_ISLAND_DE = 13;
const ISLAND_SEEN_DE = 18; // very dark colours joined at most this far apart where the check can see it (under its 20)
const ART_SOFT_DE = 18; // a scrap of soft shading may be this far from what it joins (under the check's 20)
const SOFT_EDGE = 0.5; // "no crisp edge": the picture changes across the border by less than half of how far apart the two colours are
export const ART_FLAT = { colours: 16, smooth: 0.8, corner: 40, snap: 0.5 }; // flat art: see vectorizeArt (snap: thin fringes, in the customer's pixels)
export const ART_CALM = 20; // drawn art: shades nearly alike are voted over 20 px (at full size) — wider than the bands it must calm (7 changed nothing: a 12 px band was still the majority around itself)
const ART_CALM_DE = 7;
const SNAP_DE = 10; // a thin fringe: within ΔE 10 of the line between the two colours beside it
const SNAP_PAST = 0.25; // … or up to a quarter past one end (a halo: a little brighter or darker than that side)
const SNAP_APART = 15; // the two sides at least this far apart (ΔE): a real edge
export const PHOTO_COLOURS = 96; // a photo the admin switched to vector: more colours, smaller steps
const MAX_WORK = 30e6; // the most pixels traced (about 400 DPI on a 30 cm print — far more than vector needs)
const TILE = 1536; // traced in tiles (the tracer runs out of memory on a whole big picture — 12 Nov 2026)
const MARGIN = 24; // each tile traced with this much extra, then trimmed just past its own edge (no seams)
const SEAM_REACH = 256; // a seam between tiles may move this far to where no edge runs along it (see vectorizeArt)
const hex2 = (v) => v.toString(16).padStart(2, "0");

// a small fixed-seed random, so the same picture always gives the same colours
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// k-means in Lab (a and b counted double: hue matters more than lightness for print colours)
function kmeans(samples, n, K, log) {
  const rnd = rng(12345);
  const C = new Float32Array(K * 3);
  // k-means++ start
  let first = Math.floor(rnd() * n);
  C.set(samples.subarray(first * 3, first * 3 + 3), 0);
  const d2 = new Float32Array(n).fill(Infinity);
  for (let k = 1; k < K; k++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const a = samples[i * 3] - C[(k - 1) * 3], b = samples[i * 3 + 1] - C[(k - 1) * 3 + 1], c = samples[i * 3 + 2] - C[(k - 1) * 3 + 2];
      const d = a * a + b * b + c * c;
      if (d < d2[i]) d2[i] = d;
      sum += d2[i];
    }
    let r = rnd() * sum, pick = n - 1;
    for (let i = 0; i < n; i++) if ((r -= d2[i]) <= 0) { pick = i; break; }
    C.set(samples.subarray(pick * 3, pick * 3 + 3), k * 3);
  }
  const lbl = new Int32Array(n), sums = new Float64Array(K * 3), cnt = new Int32Array(K);
  for (let it = 0; it < 20; it++) {
    sums.fill(0); cnt.fill(0);
    let moved = 0;
    for (let i = 0; i < n; i++) {
      let best = Infinity, bk = 0;
      for (let k = 0; k < K; k++) {
        const a = samples[i * 3] - C[k * 3], b = samples[i * 3 + 1] - C[k * 3 + 1], c = samples[i * 3 + 2] - C[k * 3 + 2];
        const d = a * a + b * b + c * c;
        if (d < best) { best = d; bk = k; }
      }
      if (lbl[i] !== bk) moved++;
      lbl[i] = bk; cnt[bk]++;
      sums[bk * 3] += samples[i * 3]; sums[bk * 3 + 1] += samples[i * 3 + 1]; sums[bk * 3 + 2] += samples[i * 3 + 2];
    }
    for (let k = 0; k < K; k++) if (cnt[k]) for (let c = 0; c < 3; c++) C[k * 3 + c] = sums[k * 3 + c] / cnt[k];
    if (moved < n * 0.001) break;
  }
  return C;
}

/**
 * @param {object} a
 * @param {Buffer} a.rgb     the print-ready picture, raw RGB, W x H
 * @param {Uint8Array} a.ink 0/1 per pixel: inside the recipe's vector edge (where ink prints)
 * @param {number} a.W
 * @param {number} a.H
 * @param {number} [a.colours]
 * @param {(t:string)=>void} [a.log]
 * @returns {{ content: Buffer, svg: string, shapes: number, colours: number, workScale: number }}
 *   content: the PDF operators (Flate packed), picture pixels with y down; svg: the same shapes, viewBox 0 0 W H
 */
/* ---------- crisp edges before tracing (13 Nov 2026) ---------- */
// An enlarged picture has soft in-between colours where a dark line meets a fill; traced, they became thin light rims
// beside the lines. Kuwahara filter: every pixel takes the average colour of whichever of its four (r+1)×(r+1) corner
// squares is the most even — so an edge pixel joins the side it belongs to, and the edge becomes a clean step.
// Box averages are kept as bytes (sums in 32-bit), about 9 bytes a pixel.
function boxMean(src, w, h, k, out, tmp) {
  // mean of src over [x, x+k-1] × [y, y+k-1], the window cut at the picture's edge
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let x = 0; x < k && x < w; x++) sum += src[row + x];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum;
      sum -= src[row + x];
      if (x + k < w) sum += src[row + x + k];
    }
  }
  const cnt = new Uint16Array(w);
  for (let x = 0; x < w; x++) cnt[x] = Math.min(k, w - x);
  const col = new Float64Array(w);
  for (let y = 0; y < k && y < h; y++) for (let x = 0; x < w; x++) col[x] += tmp[y * w + x];
  for (let y = 0; y < h; y++) {
    const rows = Math.min(k, h - y);
    for (let x = 0; x < w; x++) {
      out[y * w + x] = Math.round(col[x] / (cnt[x] * rows));
      col[x] -= tmp[y * w + x];
      if (y + k < h) col[x] += tmp[(y + k) * w + x];
    }
  }
}
function kuwahara(rgba, w, h, r) {
  const N = w * h, k = r + 1;
  const Y = new Uint8Array(N), Y2 = new Uint16Array(N);
  for (let i = 0; i < N; i++) {
    const v = (rgba[i * 4] * 77 + rgba[i * 4 + 1] * 150 + rgba[i * 4 + 2] * 29) >> 8;
    Y[i] = v; Y2[i] = v * v;
  }
  const tmp = new Uint32Array(N);
  const Ym = new Uint8Array(N), Vm = new Uint16Array(N);
  boxMean(Y, w, h, k, Ym, tmp);
  boxMean(Y2, w, h, k, Vm, tmp);
  for (let i = 0; i < N; i++) Vm[i] = Math.max(0, Vm[i] - Ym[i] * Ym[i]);
  // which corner square each pixel takes: its top-left corner is at (x - r or x, y - r or y)
  const at = new Int32Array(N);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      let best = y0 * w + x0, bv = Vm[best];
      for (const j of [y0 * w + x, y * w + x0, y * w + x]) if (Vm[j] < bv) { bv = Vm[j]; best = j; }
      at[y * w + x] = best;
    }
  }
  const ch = Y, m = Ym; // (reused: same size, no longer needed)
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < N; i++) ch[i] = rgba[i * 4 + c];
    boxMean(ch, w, h, k, m, tmp);
    for (let i = 0; i < N; i++) rgba[i * 4 + c] = m[at[i]];
  }
}

/* ---------- colours that look the same become one (13 Nov 2026) ---------- */
// k-means splits a big dark outline into 3–4 near-identical dark browns; where they meet, little patches made the
// line look rough and bumpy (user: "see in hand"). Pairs closer than `merge` (ΔE in Lab; twice that for dark colours,
// where the eye can't tell them apart) are joined, the bigger colour keeping most of its say.
function mergeClose(C, K, sample, n, merge) {
  const cnt = new Float64Array(K);
  for (let i = 0; i < n; i++) {
    let best = Infinity, bk = 0;
    for (let k = 0; k < K; k++) {
      const x = sample[i * 3] - C[k * 3], y = sample[i * 3 + 1] - C[k * 3 + 1], z = sample[i * 3 + 2] - C[k * 3 + 2];
      const d = x * x + y * y + z * z;
      if (d < best) { best = d; bk = k; }
    }
    cnt[bk]++;
  }
  const orig = Array.from({ length: K }, (_, k) => ({ l: C[k * 3], a: C[k * 3 + 1] / 2, b: C[k * 3 + 2] / 2, n: cnt[k] }));
  const near = (p, q) => {
    // (very dark colours: three times as far — a dark outline split into two or three dark browns looked dirty when
    // zoomed in, 13 Nov 2026; the eye and the print hardly tell them apart)
    const lim = Math.max(p.l, q.l) < 30 ? merge * 3 : merge;
    return Math.hypot(p.l - q.l, p.a - q.a, p.b - q.b) / lim; // under 1 = looks the same
  };
  // complete linkage: two groups join only if EVERY colour of one is close to EVERY colour of the other — so a chain
  // grey → light grey → white can never join grey with white (13 Nov 2026: a silver stirrup came out white)
  let groups = orig.map((c, k) => (c.n > 0 ? [k] : null)).filter(Boolean);
  for (;;) {
    let bi = -1, bj = -1, bd = 1;
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      let worst = 0;
      for (const a of groups[i]) for (const b of groups[j]) worst = Math.max(worst, near(orig[a], orig[b]));
      if (worst < bd) { bd = worst; bi = i; bj = j; }
    }
    if (bi < 0) break;
    groups[bi] = groups[bi].concat(groups[bj]);
    groups.splice(bj, 1);
  }
  const out = new Float32Array(groups.length * 3);
  groups.forEach((g, k) => {
    let l = 0, a = 0, b = 0, t = 0;
    for (const i of g) { const c = orig[i]; l += c.l * c.n; a += c.a * c.n; b += c.b * c.n; t += c.n; }
    out[k * 3] = l / t; out[k * 3 + 1] = (a / t) * 2; out[k * 3 + 2] = (b / t) * 2;
  });
  return { C: out, K: groups.length };
}

// Lab in bytes (L ×2.55, a/b +128) for every colour at 64 levels a channel, made once (a ΔE-20 test needs no more)
let LAB_BYTES = null;
function labBytes() {
  if (LAB_BYTES) return LAB_BYTES;
  LAB_BYTES = new Uint8Array(64 * 64 * 64 * 3);
  const t = [0, 0, 0];
  for (let r = 0; r < 64; r++) for (let g = 0; g < 64; g++) for (let b = 0; b < 64; b++) {
    lab(r * 4 + 2, g * 4 + 2, b * 4 + 2, t);
    const o = ((r << 12) | (g << 6) | b) * 3;
    LAB_BYTES[o] = Math.max(0, Math.min(255, Math.round(t[0] * 2.55)));
    LAB_BYTES[o + 1] = Math.max(0, Math.min(255, Math.round(t[1] + 128)));
    LAB_BYTES[o + 2] = Math.max(0, Math.min(255, Math.round(t[2] + 128)));
  }
  return LAB_BYTES;
}
// What the enlarger made up (13 Nov 2026, a flat yellow-and-blue badge: the enlarger drew a 1 px dark-brown line along
// the clean edge between them, and darker and brighter bands beside it; the shapes drew the line navy — the nearest
// list colour — so it was in neither picture, and the check flagged it): the ink pixels whose colour is found nowhere
// within `r` px in the customer's own picture (`ref`, enlarged plainly to the same size), not within ΔE 20 (the check's
// limit). A real detail is in the customer's picture too — even a 1-pixel line, which a plain enlargement keeps at its
// full colour at its centre; the blends along a soft edge are there as well (the plain enlargement makes the same ones).
function madeUp(pxRgb, stride, ref, mask, w, h, r) {
  const L = labBytes();
  const N = w * h;
  const at = (buf, i, st) => (((buf[i * st] >> 2) << 12) | ((buf[i * st + 1] >> 2) << 6) | (buf[i * st + 2] >> 2)) * 3;
  const R = new Uint8Array(N * 3);
  for (let i = 0; i < N; i++) { const o = at(ref, i, 3); R[i * 3] = L[o]; R[i * 3 + 1] = L[o + 1]; R[i * 3 + 2] = L[o + 2]; }
  const out = new Uint8Array(N);
  let n = 0;
  // the nearest places first: ring by ring
  const ring = [];
  for (let d = 0; d <= r; d++) for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === d) ring.push(dx, dy);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!mask[i]) continue;
    const o = at(pxRgb, i, stride), p0 = L[o] / 2.55, p1 = L[o + 1], p2 = L[o + 2];
    let ok = false;
    for (let q = 0; q < ring.length && !ok; q += 2) {
      const xx = x + ring[q], yy = y + ring[q + 1];
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = (yy * w + xx) * 3;
      const a = p0 - R[j] / 2.55, b = p1 - R[j + 1], c = p2 - R[j + 2];
      if (a * a + b * b + c * c <= 400) ok = true;
    }
    if (!ok) { out[i] = 1; n++; }
  }
  // A real thin line the enlarger made darker or crisper is not made up (13 Nov 2026 review: a faint grey 1 px outline
  // drawn solid black was flagged, then painted over with the fill beside it). In the customer's picture such a line
  // is there, only fainter: the customer's colour nearest the line's colour P (R*, within r) is a part-way blend of P
  // over the colours on BOTH sides of it — on the sRGB line F → P (within ΔE MADE_BLEND_DE, at least a quarter of the
  // way to P) for a customer colour F on each side, along one of four directions. The badge's line stays made up: the
  // customer's picture has only the yellow-to-blue blend there, no darker line (tried: one side only kept 83 % of the
  // badge's made-up line; both sides keep 0 %, and 100 % of faint hairlines drawn solid).
  const t = [0, 0, 0], u = [0, 0, 0];
  const onLine = (c, f, p) => {
    const dx = p[0] - f[0], dy = p[1] - f[1], dz = p[2] - f[2], len2 = dx * dx + dy * dy + dz * dz;
    if (len2 < 900) return false; // (F and P nearly alike: no blend to see)
    const a = ((c[0] - f[0]) * dx + (c[1] - f[1]) * dy + (c[2] - f[2]) * dz) / len2;
    if (a < 0.25 || a > 1.1) return false;
    const k = Math.min(1, a);
    lab(Math.round(f[0] + k * dx), Math.round(f[1] + k * dy), Math.round(f[2] + k * dz), u);
    return (t[0] - u[0]) ** 2 + (t[1] - u[1]) ** 2 + (t[2] - u[2]) ** 2 <= MADE_BLEND_DE * MADE_BLEND_DE;
  };
  const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
  const real = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!out[i]) continue;
    const P = [pxRgb[i * stride], pxRgb[i * stride + 1], pxRgb[i * stride + 2]];
    const o = at(pxRgb, i, stride), p0 = L[o] / 2.55, p1 = L[o + 1], p2 = L[o + 2];
    let bj = i, bd = Infinity;
    for (let q = 0; q < ring.length; q += 2) {
      const xx = x + ring[q], yy = y + ring[q + 1];
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = (yy * w + xx) * 3;
      const a = p0 - R[j] / 2.55, b = p1 - R[j + 1], c = p2 - R[j + 2], d = a * a + b * b + c * c;
      if (d < bd) { bd = d; bj = yy * w + xx; }
    }
    const Rs = [ref[bj * 3], ref[bj * 3 + 1], ref[bj * 3 + 2]];
    lab(Rs[0], Rs[1], Rs[2], t);
    let yes = false;
    for (const [dx, dy] of DIRS) {
      let plus = false, minus = false;
      for (let d = 1; d <= r && !(plus && minus); d++) for (const sg of [1, -1]) {
        if (sg > 0 ? plus : minus) continue;
        const xx = x + sg * dx * d, yy = y + sg * dy * d;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (!mask[j] || !onLine(Rs, [ref[j * 3], ref[j * 3 + 1], ref[j * 3 + 2]], P)) continue;
        if (sg > 0) plus = true;
        else minus = true;
      }
      if (plus && minus) { yes = true; break; }
    }
    if (yes) real.push(i);
  }
  for (const i of real) out[i] = 0;
  n -= real.length;
  return { out, n, refLab: R, ref, real: real.length };
}
const MADE_BLEND_DE = 12;
// src — the customer's picture before enlarging — has the picture's shape (W and H were each rounded on their own;
// 13 Nov 2026 review: a fixed ratio test silently dropped src for long name strips): |W0·H − W·H0| ≤ (W0 + H0) / 2
// for an honest rounding, so W0 + H0 leaves room and still turns away a different picture
const sameShape = (src, W, H) => Boolean(src && src.W > 0 && src.H > 0 && Math.abs(src.W * H - W * src.H) <= src.W + src.H);

// crisp: Kuwahara radius at full size (0 = off); merge: join colours closer than this ΔE (0 = off)
// The see-through areas wide enough to be the cut-out's background (13 Nov 2026): the outside and the big holes, at
// least 2r + 1 px across. Not the thin see-through lines inside a design — a badge made for a black tee often has its
// black outlines left out of the ink (the tee is the line), so its ink is full of them (a JCB badge: hundreds, many
// joined to the outside, 0.5–1.5 mm across). r = 0: every see-through pixel.
function wideOutside(mask, w, h, r) {
  const N = w * h, out = new Uint8Array(N);
  if (r <= 0) {
    for (let i = 0; i < N; i++) out[i] = mask[i] ? 0 : 1;
    return out;
  }
  const m = new Uint8Array(N);
  for (let i = 0; i < N; i++) m[i] = mask[i] ? 1 : 0;
  const near = maxFilter(m, w, h, r); // ink within r
  for (let i = 0; i < N; i++) out[i] = near[i] ? 0 : 1; // the core: r px or more from any ink
  return maxFilter(out, w, h, r); // grown back by r: only the wide areas, whole (their thin arms are not reached)
}
// the see-through areas narrower than 2 × this (mm at the print size) are lines of the design, not the cut-out's background
export const WIDE_MM = 1;

export async function vectorizeArt({ rgb, ink, W, H, colours = ART_COLOURS, crisp = 0, merge = 0, rim = 0, smooth = 1.2, corner = 60, len = 4, trace = {}, band = 0, wide = 0, island = 0, calm = 0, flat = null, src = null, keep = 4, printCm = 0, mapOnly = false, stopBeforeTrace = false, log = () => {} }) {
  // src: { rgb, W, H } the customer's own picture, as it went into the enlarger (on the tee as the picture is): what
  // the enlarger made up is left out (madeUp)
  // calm: the border between two nearly equal shades is smoothed this much (px, at full size) — see step 4
  // island: a colour area smaller than this (px, at full size) that is nearly the colour around it joins it (see below)
  // band: the outermost px of the ink (at full size) take the colour area just inside them (see below)
  // wide: the band runs only along see-through areas this many px (at full size) or more from any ink (wideOutside)
  // mapOnly: no shapes — only the colour map of the picture (st), for the repair step
  const t0 = Date.now();
  const secs = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`;
  // 1. the size it is traced at
  const s = Math.min(1, Math.sqrt(MAX_WORK / (W * H)));
  const w = Math.round(W * s), h = Math.round(H * s);
  const N = w * h;
  let pic = rgb, mask = ink;
  if (s < 1) {
    pic = await sharp(rgb, { raw: { width: W, height: H, channels: 3 }, limitInputPixels: false }).resize(w, h, { kernel: "lanczos3" }).raw().toBuffer();
    const m8 = Buffer.alloc(W * H);
    for (let i = 0; i < m8.length; i++) m8[i] = ink[i] ? 255 : 0;
    const small = await sharp(m8, { raw: { width: W, height: H, channels: 1 }, limitInputPixels: false }).resize(w, h, { kernel: "cubic" }).extractChannel(0).raw().toBuffer();
    mask = new Uint8Array(N);
    for (let i = 0; i < N; i++) mask[i] = small[i] >= 128 ? 1 : 0;
  }
  // 2. the colours just outside the ink take the nearest ink colour (the clip cuts there; no tee colour creeps in)
  const rgba = Buffer.alloc(N * 4);
  let nInk = 0;
  for (let i = 0; i < N; i++) {
    rgba[i * 4] = pic[i * 3]; rgba[i * 4 + 1] = pic[i * 3 + 1]; rgba[i * 4 + 2] = pic[i * 3 + 2];
    rgba[i * 4 + 3] = mask[i] ? 255 : 0;
    nInk += mask[i];
  }
  // the outermost `rim` px of the ink take the colour just inside them: the customer's cut-out left blended colours
  // there (light-brown flecks along a dark outline, 13 Nov 2026); the clip still cuts at the same place
  const rp = rim > 0 ? Math.max(1, Math.round(rim * s)) : 0;
  if (rp) {
    const out = new Uint8Array(N);
    for (let i = 0; i < N; i++) out[i] = mask[i] ? 0 : 1;
    const near = maxFilter(out, w, h, rp);
    for (let i = 0; i < N; i++) if (mask[i] && near[i]) rgba[i * 4 + 3] = 0;
  }
  bleedEdges(rgba, w, h, 6 + rp);
  const asIs = mapOnly && crisp > 0 ? Buffer.from(rgba) : rgba; // (the repair blocks use the picture as it is)
  // (and the picture untouched by the made-up step below: see exactBlocks' last resort)
  const plain = mapOnly ? Buffer.from(asIs) : null;
  if (crisp > 0) {
    // The edge-cleaning only where there is a strong edge (13 Nov 2026). Over soft shading it churns a gentle fade
    // into patches: the saddle horn's lighter crescent came out as a few tan blobs (the user's zoomed screenshot —
    // found by switching the steps off one at a time). So: where the picture's lightness changes by less than
    // CRISP_EDGE within a few pixels, the pixel stays as the picture has it.
    const r = Math.max(1, Math.round(crisp * s));
    const raw = Buffer.from(rgba);
    kuwahara(rgba, w, h, r);
    const lum = new Uint8Array(N);
    for (let i = 0; i < N; i++) lum[i] = (raw[i * 4] * 77 + raw[i * 4 + 1] * 150 + raw[i * 4 + 2] * 29) >> 8;
    const k = r + 2; // how far an edge reaches
    const lo = new Uint8Array(N), hi = new Uint8Array(N), lo2 = new Uint8Array(N), hi2 = new Uint8Array(N);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let a = 255, b = 0;
      for (let d = -k; d <= k; d++) { const xx = x + d; if (xx < 0 || xx >= w) continue; const v = lum[y * w + xx]; if (v < a) a = v; if (v > b) b = v; }
      lo[y * w + x] = a; hi[y * w + x] = b;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let a = 255, b = 0;
      for (let d = -k; d <= k; d++) { const yy = y + d; if (yy < 0 || yy >= h) continue; const j = yy * w + x; if (lo[j] < a) a = lo[j]; if (hi[j] > b) b = hi[j]; }
      lo2[y * w + x] = a; hi2[y * w + x] = b;
    }
    for (let i = 0; i < N; i++) if (hi2[i] - lo2[i] < CRISP_EDGE) { rgba[i * 4] = raw[i * 4]; rgba[i * 4 + 1] = raw[i * 4 + 1]; rgba[i * 4 + 2] = raw[i * 4 + 2]; }
  }
  log(`Vector: ${w}×${h} px, ${secs()}`);
  // what the enlarger made up (only when it enlarged: src smaller than the picture)
  let made = null;
  if (src && nInk && src.W < W * 0.9 && sameShape(src, W, H)) {
    const ref = await sharp(src.rgb, { raw: { width: src.W, height: src.H, channels: 3 }, limitInputPixels: false }).resize(w, h, { kernel: "cubic", fit: "fill" }).raw().toBuffer();
    // (about one of the customer's pixels around, and one more: the enlarged picture can sit a pixel off)
    made = madeUp(rgba, 4, ref, mask, w, h, Math.max(2, Math.ceil((w / src.W) + 1)));
    if (made.real) log(`Vector: ${made.real} px of thin lines the enlarger made darker or crisper are kept (the customer's picture has them, fainter)`);
    if (!made.n) made = null;
  } else if (src && nInk && src.W < W * 0.9) log(`Vector: the customer's picture (${src.W}×${src.H}) is not the shape of this one (${W}×${H}) — nothing is left out as made up`);

  // 3. the colour list: k-means on a sample of the ink
  const step = Math.max(1, Math.floor((nInk || N) / 150000));
  const sample = [];
  const t = [0, 0, 0];
  for (let i = 0, j = 0; i < N; i++) {
    if (nInk && !mask[i]) continue;
    if (made && made.out[i]) continue; // (no colour of the list for them)
    if (j++ % step) continue;
    lab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2], t);
    sample.push(t[0], t[1] * 2, t[2] * 2);
  }
  const n = sample.length / 3;
  let K = Math.max(2, Math.min(colours, n));
  let C;
  // (Tried and dropped, 13 Nov 2026: flat art's colours taken from the customer's own picture instead. Its edges carry
  // their own blended pixels, which became colours of their own: 1,067 shapes against 160, and notched edges.)
  C = kmeans(Float32Array.from(sample), n, K, log);
  if (merge > 0) ({ C, K } = mergeClose(C, K, Float32Array.from(sample), n, merge));
  // Flat art — a logo, text, a flat badge: few colours once alike ones are joined (13 Nov 2026, the 14-picture review:
  // the smoothing that calms a cartoon's outlines rounded the corners of letters and made straight edges wavy; light
  // smoothing and a sharper corner test kept them square and straight). The cowboy (about 45 colours) is not flat.
  let snap = 0;
  if (flat && K <= flat.colours) {
    smooth = flat.smooth; corner = flat.corner; snap = flat.snap || 0;
    // colours practically the same (under ΔE 3) are one: the merge above keeps two groups apart when some of their
    // members differ, and a flat badge's blue came out as three labels of one colour — each strip pixel joined one of
    // them, so the votes split and the strip stayed (13 Nov 2026)
    const keepK = [];
    for (let k = 0; k < K; k++) {
      let dup = false;
      for (const q of keepK) if (Math.hypot(C[k * 3] - C[q * 3], (C[k * 3 + 1] - C[q * 3 + 1]) / 2, (C[k * 3 + 2] - C[q * 3 + 2]) / 2) < 3) { dup = true; break; }
      if (!dup) keepK.push(k);
    }
    if (keepK.length < K) {
      const C2 = new Float32Array(keepK.length * 3);
      keepK.forEach((k, j) => { C2[j * 3] = C[k * 3]; C2[j * 3 + 1] = C[k * 3 + 1]; C2[j * 3 + 2] = C[k * 3 + 2]; });
      C = C2; K = keepK.length;
    }
    log(`Vector: flat art (${K} colours) — light smoothing, sharp corners`);
  }
  // (Tried and dropped, 13 Nov 2026: adding a list colour for every colour of the picture further than ΔE 6.5–9 from
  // the list. It gave the blended colours along edges their own entries — bumpy shading lines and patches inside
  // outlines — and the saddle horn's crescent did not need it.)
  // every colour (64 levels per channel) -> its nearest list colour, once; then each pixel is a look-up
  const lut = new Uint8Array(64 * 64 * 64);
  for (let r = 0; r < 64; r++) for (let g = 0; g < 64; g++) for (let b = 0; b < 64; b++) {
    lab(r * 4 + 2, g * 4 + 2, b * 4 + 2, t);
    const a0 = t[0], a1 = t[1] * 2, a2 = t[2] * 2;
    let best = Infinity, bk = 0;
    for (let k = 0; k < K; k++) {
      const x = a0 - C[k * 3], y = a1 - C[k * 3 + 1], z = a2 - C[k * 3 + 2];
      const d = x * x + y * y + z * z;
      if (d < best) { best = d; bk = k; }
    }
    lut[(r << 12) | (g << 6) | b] = bk;
  }
  const lbl = new Uint8Array(N);
  for (let i = 0; i < N; i++) lbl[i] = lut[((rgba[i * 4] >> 2) << 12) | ((rgba[i * 4 + 1] >> 2) << 6) | (rgba[i * 4 + 2] >> 2)];
  log(`Vector: ${K} colours chosen, ${secs()}`);
  if (made) {
    // Each made-up pixel takes the colour the customer's own colour there points to (13 Nov 2026 review): one of the
    // real pixels touching it when that is near it (ΔE 20) or when the customer's colour is a blend of two of them (the
    // badge's yellow-blue edge); else the list colour nearest the customer's colour. A pass at a time from the outside
    // in (a thicker made-up line is filled from both sides). The repair map's picture (asIs) gets the same colour — the
    // neighbour's own, or the customer's — so the repair blocks never draw the made-up line back in.
    const R = made.refLab, RGB = made.ref, open = Uint8Array.from(made.out);
    const dE2 = (r0, r1, r2, k) => { const a = r0 - C[k * 3], b = (r1 - C[k * 3 + 1]) / 2, c = (r2 - C[k * 3 + 2]) / 2; return a * a + b * b + c * c; };
    const tq = [0, 0, 0];
    const own = (i) => { asIs[i * 4] = RGB[i * 3]; asIs[i * 4 + 1] = RGB[i * 3 + 1]; asIs[i * 4 + 2] = RGB[i * 3 + 2]; };
    let list = [];
    for (let i = 0; i < N; i++) if (open[i]) list.push(i);
    const total = list.length;
    const js = [];
    for (let pass = 0; pass < 12 && list.length; pass++) {
      const got = [], rest = [];
      for (const i of list) {
        const x = i % w, y = (i - x) / w;
        const r0 = R[i * 3] / 2.55, r1 = (R[i * 3 + 1] - 128) * 2, r2 = (R[i * 3 + 2] - 128) * 2; // (C has a, b doubled)
        let bk = -1, bd = Infinity, bj = -1;
        js.length = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if ((!dx && !dy) || xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (open[j] || !mask[j]) continue;
          if (!made.out[j]) js.push(j); // (blends: of real pixels only — a filled one still has the made-up colour)
          const d = dE2(r0, r1, r2, lbl[j]);
          if (d < bd) { bd = d; bk = lbl[j]; bj = j; }
        }
        if (bk < 0) { rest.push(i); continue; }
        if (bd > 400) {
          // not near either: a blend of two of them (along the sRGB line, measured in Lab)?
          const cr = RGB[i * 3], cg = RGB[i * 3 + 1], cb = RGB[i * 3 + 2], cL = r0, ca = r1 / 2, cB = r2 / 2;
          let blend = false;
          for (let u = 0; u < js.length && !blend; u++) for (let v = u + 1; v < js.length && !blend; v++) {
            const ja = js[u], jb = js[v];
            if (lbl[ja] === lbl[jb]) continue;
            const ar = asIs[ja * 4], ag = asIs[ja * 4 + 1], ab = asIs[ja * 4 + 2];
            const dx = asIs[jb * 4] - ar, dy = asIs[jb * 4 + 1] - ag, dz = asIs[jb * 4 + 2] - ab, len2 = dx * dx + dy * dy + dz * dz;
            if (len2 < 300) continue;
            const a = ((cr - ar) * dx + (cg - ag) * dy + (cb - ab) * dz) / len2;
            if (a <= 0 || a >= 1) continue;
            lab(Math.round(ar + a * dx), Math.round(ag + a * dy), Math.round(ab + a * dz), tq);
            if ((cL - tq[0]) ** 2 + (ca - tq[1]) ** 2 + (cB - tq[2]) ** 2 > 225) continue;
            const pick = a < 0.5 ? ja : jb;
            bk = lbl[pick]; bj = pick; blend = true;
          }
          if (!blend) {
            // the list colour nearest the customer's own colour
            bk = 0; bd = Infinity; bj = -1;
            for (let k = 0; k < K; k++) { const d = dE2(r0, r1, r2, k); if (d < bd) { bd = d; bk = k; } }
          }
        }
        got.push(i, bk, bj);
      }
      for (let q = 0; q < got.length; q += 3) {
        const i = got[q], j = got[q + 2];
        lbl[i] = got[q + 1]; open[i] = 0;
        if (mapOnly) {
          if (j >= 0) { asIs[i * 4] = asIs[j * 4]; asIs[i * 4 + 1] = asIs[j * 4 + 1]; asIs[i * 4 + 2] = asIs[j * 4 + 2]; }
          else own(i);
        }
      }
      list = rest;
    }
    if (mapOnly) for (const i of list) own(i); // (none touching a real pixel after 12 passes: the customer's colour)
    log(`Vector: ${total} px the enlarger made up (no such colour near them in the customer's picture) took the colour beside them, ${secs()}`);
  }

  // The cut-out's fringe (13 Nov 2026, the user's zoomed screenshots: light flecks along the outer side of the dark
  // outline; later dashes along the bandana's edge and a brown blob on the hat's outline — the fringe is up to 3 of
  // the customer's own pixels deep). The customer's cut-out leaves a striped, blended fringe on the outermost pixels
  // of the ink. In that band (`band` px): where the band's main colour there is the colour just inside it (one thick
  // outline), every band pixel takes the colour just inside it — stripes and blobs go; elsewhere (a thin outline
  // round another colour) only a colour that is a small minority there (a stripe) takes the main colour, and
  // everything else stays as it is. Only the area map changes, no colour does.
  // (13 Nov 2026, the 14-picture test: a JCB badge and a line-art lion came out with square steps, half-filled holes
  // and leopard-spotted letters. Their ink is full of thin see-through lines and small holes, and this ran along every
  // one of them, in square cells. Now: only along the wide see-through areas (wideOutside); a soft vote instead of
  // cells; and a colour area that reaches deeper than the band is real — never repainted. Only flecks, stripes and
  // halos that live inside the band are.)
  const bp = band > 0 && nInk && !mapOnly ? Math.max(1, Math.round(band * s)) : 0;
  if (bp) {
    const nearOut = maxFilter(wideOutside(mask, w, h, wide > 0 ? Math.max(1, Math.round(wide * s)) : 0), w, h, bp);
    // 1. what grows outwards from just inside the band (one pixel a pass)
    const grown = Uint8Array.from(lbl), open = new Uint8Array(N);
    const all = [];
    for (let i = 0; i < N; i++) if (mask[i] && nearOut[i]) { open[i] = 1; all.push(i); }
    const inBand = Uint8Array.from(open);
    let list = all;
    for (let pass = 0; pass < bp + 2 && list.length; pass++) {
      const got = [], rest = [];
      for (const i of list) {
        const x = i % w, y = (i - x) / w;
        let k = -1;
        for (let dy = -1; dy <= 1 && k < 0; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (mask[j] && !open[j]) { k = grown[j]; break; }
        }
        if (k < 0) rest.push(i);
        else got.push(i, k);
      }
      for (let q = 0; q < got.length; q += 2) { grown[got[q]] = got[q + 1]; open[got[q]] = 0; }
      list = rest;
    }
    // 2. a band pixel whose colour area reaches past the band is part of something real (a letter, a stroke): kept
    const deep = new Uint8Array(N), seenC = new Uint8Array(N), stackC = new Int32Array(N), comp = [];
    for (const i0 of all) {
      if (seenC[i0]) continue;
      const k = lbl[i0];
      let top = 0, isDeep = false;
      comp.length = 0;
      stackC[top++] = i0; seenC[i0] = 1;
      while (top) {
        const i = stackC[--top], x = i % w;
        if (inBand[i]) comp.push(i);
        else isDeep = true;
        if (x > 0 && !seenC[i - 1] && mask[i - 1] && lbl[i - 1] === k) { seenC[i - 1] = 1; stackC[top++] = i - 1; }
        if (x < w - 1 && !seenC[i + 1] && mask[i + 1] && lbl[i + 1] === k) { seenC[i + 1] = 1; stackC[top++] = i + 1; }
        if (i >= w && !seenC[i - w] && mask[i - w] && lbl[i - w] === k) { seenC[i - w] = 1; stackC[top++] = i - w; }
        if (i + w < N && !seenC[i + w] && mask[i + w] && lbl[i + w] === k) { seenC[i + w] = 1; stackC[top++] = i + w; }
      }
      if (isDeep) for (const i of comp) deep[i] = 1;
    }
    // 3. the band's main colour around each band pixel: a soft vote among the band's pixels over about a band
    //    (cells of half a band left square steps — the badge, the lion — and cells of 2 bands notched the bandana)
    const sig = Math.max(1, bp * 0.75);
    const raw1 = { raw: { width: w, height: h, channels: 1 }, limitInputPixels: false };
    const pl = Buffer.alloc(N);
    for (const i of all) pl[i] = 255;
    const totV = await sharp(pl, raw1).blur(sig).toColourspace("b-w").raw().toBuffer();
    const mainV = new Uint8Array(N), mainK = new Uint8Array(N), ownV = new Uint8Array(N);
    const inB = new Uint8Array(K);
    for (const i of all) inB[lbl[i]] = 1;
    for (let k = 0; k < K; k++) {
      if (!inB[k]) continue;
      pl.fill(0);
      for (const i of all) if (lbl[i] === k) pl[i] = 255;
      const v = await sharp(pl, raw1).blur(sig).toColourspace("b-w").raw().toBuffer();
      for (const i of all) {
        if (v[i] > mainV[i]) { mainV[i] = v[i]; mainK[i] = k; }
        if (lbl[i] === k) ownV[i] = v[i];
      }
    }
    const alike = (a, b2) => {
      if (a === b2) return true;
      const dl = C[a * 3] - C[b2 * 3], da = (C[a * 3 + 1] - C[b2 * 3 + 1]) / 2, db = (C[a * 3 + 2] - C[b2 * 3 + 2]) / 2;
      // (really the same colour only: with a wider limit a dark-brown hoof counted as its own dark outline, and the
      // outline was painted over, 13 Nov 2026)
      return dl * dl + da * da + db * db <= 36;
    };
    // a stripe is fringe only if its colour is the main colour blended with grey — the cut-out's removed background,
    // white, black or between: lighter, darker or duller, not another colour (13 Nov 2026: a line-art lion's small
    // pink dot lost its red centre — all of it in the band, and a small share of it)
    const greyBlend = (p, t) => {
      const pa = C[p * 3 + 1], pb = C[p * 3 + 2], ta = C[t * 3 + 1], tb = C[t * 3 + 2]; // (a, b are doubled in C)
      const tt = ta * ta + tb * tb;
      const al = tt > 4 ? Math.max(0, (pa * ta + pb * tb) / tt) : 0;
      if (al > 1.15) return false; // more colourful than the main colour
      const ra = pa - al * ta, rb = pb - al * tb;
      return ra * ra + rb * rb <= 400; // (another hue: more than ΔE 10 aside)
    };
    // 4. each band pixel that is only fringe
    const fixed = Uint8Array.from(lbl);
    let changed = 0;
    for (const i of all) {
      if (deep[i] || !mainV[i]) continue;
      const m = mainK[i];
      if (!open[i] && alike(grown[i], m)) fixed[i] = grown[i]; // one thick edge: the colour just inside it
      else if (ownV[i] * 4 < totV[i] && greyBlend(lbl[i], m)) fixed[i] = m; // a stripe in something else: the main colour there
      if (fixed[i] !== lbl[i]) changed++;
    }
    lbl.set(fixed);
    log(`Vector: cut-out fringe — ${all.length} edge pixels, ${changed} took the colour beside them, ${secs()}`);
  }
  // 4. smooth the colour areas: each pixel takes the colour most of its close neighbours have (no lone specks, no jaggies)
  const best = new Uint16Array(N), out = Uint8Array.from(lbl);
  const plane = Buffer.alloc(N);
  const present = new Uint8Array(K);
  for (let i = 0; i < N; i++) present[lbl[i]] = 1;
  // Thin lines keep their width (13 Nov 2026, the 95-picture test: the dark line along the top of the cowboy's teeth
  // came out thinner, the check flagged it, and the repairs filled it in with little blocks; the reviewers saw thin
  // lines thinned and dashed everywhere). Where a line is only a few px wide the colours either side outvote it. So a
  // pixel of a thin part whose colour is clearly unlike everything next to it (more than the check's ΔE) counts its
  // own colour twice. Edges between two big areas are smoothed as before: a bump or notch of an edge touches the thick
  // part of its own area (13 Nov 2026 review: without that test, 1–4 px bumps on every outline were locked in).
  const keepLine = new Uint8Array(N);
  if (!mapOnly && smooth * s >= 1.5) {
    const tr = Math.max(1, Math.round(smooth * s * 0.75));
    const D = new Uint16Array(N);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) if (lbl[i + dy * w + dx] !== lbl[i]) { edge = true; break; }
      D[i] = edge ? 1 : 65535;
    }
    for (let y = 1; y < h; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (D[i] > 1) D[i] = Math.min(D[i], D[i - 1] + 1, D[i - w - 1] + 1, D[i - w] + 1, D[i - w + 1] + 1); }
    for (let y = h - 2; y >= 0; y--) for (let x = w - 2; x >= 1; x--) { const i = y * w + x; if (D[i] > 1) D[i] = Math.min(D[i], D[i + 1] + 1, D[i + w + 1] + 1, D[i + w] + 1, D[i + w - 1] + 1); }
    const core = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (D[i] > tr) core[i] = 1;
    const thick = maxFilter(core, w, h, tr);
    const unlike = new Uint8Array(K * K), lim = CHECK_DE * CHECK_DE;
    for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) {
      const dl = C[a * 3] - C[b * 3], da = (C[a * 3 + 1] - C[b * 3 + 1]) / 2, db = (C[a * 3 + 2] - C[b * 3 + 2]) / 2;
      unlike[a * K + b] = dl * dl + da * da + db * db > lim ? 1 : 0;
    }
    let n = 0;
    for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
      const i = y * w + x;
      if (thick[i] || (nInk && !mask[i])) continue;
      const k = lbl[i];
      let ok = true;
      for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2; dx++) { const q = lbl[i + dy * w + dx]; if (q !== k && !unlike[k * K + q]) { ok = false; break; } }
      for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2; dx++) { const j = i + dy * w + dx; if (lbl[j] === k && thick[j]) { ok = false; break; } }
      if (ok) { keepLine[i] = 1; n++; }
    }
    if (n) log(`Vector: ${n} px of thin lines keep their width, ${secs()}`);
  }
  for (let k = 0; k < K && !mapOnly; k++) {
    if (!present[k]) continue;
    for (let i = 0; i < N; i++) plane[i] = lbl[i] === k ? 255 : 0;
    const v = await sharp(plane, { raw: { width: w, height: h, channels: 1 }, limitInputPixels: false }).blur(Math.max(0.6, smooth * s)).toColourspace("b-w").raw().toBuffer();
    for (let i = 0; i < N; i++) {
      const vi = keepLine[i] && lbl[i] === k ? v[i] * 2 : v[i];
      if (vi > best[i]) { best[i] = vi; out[i] = k; }
    }
  }
  // Calm shading (13 Nov 2026, the user's zoomed screenshot of the horse's muzzle: soft pink shading as wobbly nested
  // bands, a lighter band hugging every dark line). The vote again, much wider (`calm` px) — but a pixel may only
  // change to a shade nearly its own (within ART_CALM_DE). So a thin band of a slightly different shade joins the
  // shade around it, and the border between two shades of a soft fade becomes one calm curve; a dark line beside it
  // has no say (a first try let every colour vote: next to a line the line won, and nothing changed), and clearly
  // different colours (outlines, highlights, details) keep their exact shape.
  if (calm > 0 && !mapOnly) {
    const lim = ART_CALM_DE * ART_CALM_DE;
    const alike = new Uint8Array(K * K);
    for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) {
      const dl = C[a * 3] - C[b * 3], da = (C[a * 3 + 1] - C[b * 3 + 1]) / 2, db = (C[a * 3 + 2] - C[b * 3 + 2]) / 2;
      alike[a * K + b] = dl * dl + da * da + db * db <= lim ? 1 : 0;
    }
    const best2 = new Uint8Array(N), next = Uint8Array.from(out);
    const has = new Uint8Array(K);
    for (let i = 0; i < N; i++) has[out[i]] = 1;
    for (let k = 0; k < K; k++) {
      if (!has[k]) continue;
      for (let i = 0; i < N; i++) plane[i] = out[i] === k ? 255 : 0;
      const v = await sharp(plane, { raw: { width: w, height: h, channels: 1 }, limitInputPixels: false }).blur(Math.max(1, calm * s)).toColourspace("b-w").raw().toBuffer();
      for (let i = 0; i < N; i++) if (v[i] > best2[i] && alike[out[i] * K + k]) { best2[i] = v[i]; next[i] = k; }
    }
    out.set(next);
  }
  // Thin fringes along edges (flat art; 13 Nov 2026, the 14-picture review: a flat badge's slanted edges came out
  // notched). Along a hard edge the enlarger leaves a strip a few px wide — a blend of the two colours, or a slightly
  // brighter or darker shade of one of them (its halo). It became a colour area of its own, too thin for the tracer to
  // follow: drawn broken, it bit into the edge. On the colour map as it is traced: a part thinner than one of the
  // customer's pixels (sr px) whose colour is nearly that of the area beside it (as for small islands), or lies on the
  // line between the two colours either side of it, joins that side. A real thin line — a dark outline, a highlight —
  // is clearly another colour, off that line, and stays.
  const sr = snap > 0 && !mapOnly && nInk ? Math.max(1, Math.round(snap * keep * s)) : 0;
  if (sr) {
    const before = Uint8Array.from(out);
    const dEk = (a, b2) => Math.hypot(C[a * 3] - C[b2 * 3], (C[a * 3 + 1] - C[b2 * 3 + 1]) / 2, (C[a * 3 + 2] - C[b2 * 3 + 2]) / 2);
    // where along the line a–b the colour p lies (0 at a, 1 at b), if within SNAP_DE of it; else -1
    const onLine = (p, a, b2) => {
      const ax = C[a * 3], ay = C[a * 3 + 1] / 2, az = C[a * 3 + 2] / 2, bx = C[b2 * 3] - ax, by = C[b2 * 3 + 1] / 2 - ay, bz = C[b2 * 3 + 2] / 2 - az;
      const len2 = bx * bx + by * by + bz * bz;
      if (len2 < SNAP_APART * SNAP_APART) return -1; // (the two sides nearly alike: no edge here)
      const px = C[p * 3] - ax, py = C[p * 3 + 1] / 2 - ay, pz = C[p * 3 + 2] / 2 - az;
      const t = (px * bx + py * by + pz * bz) / len2;
      const ex = px - t * bx, ey = py - t * by, ez = pz - t * bz;
      return t >= -SNAP_PAST && t <= 1 + SNAP_PAST && ex * ex + ey * ey + ez * ez <= SNAP_DE * SNAP_DE ? t : -1;
    };
    let snapped = 0;
    const cntL = new Uint16Array(K), seenL = [];
    for (let pass = 0; pass < 2; pass++) {
      // 1. thin: no (2r+1)-square of its own colour covers it (D: steps to the edge of its own colour area, 1 on the edge)
      const D = new Uint16Array(N);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!mask[i]) continue;
        let edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
        for (let dy = -1; dy <= 1 && !edge; dy++) for (let dx = -1; dx <= 1; dx++) {
          const j = i + dy * w + dx;
          if (!mask[j] || out[j] !== out[i]) { edge = true; break; }
        }
        D[i] = edge ? 1 : 65535;
      }
      for (let y = 1; y < h; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (D[i] > 1) D[i] = Math.min(D[i], D[i - 1] + 1, D[i - w - 1] + 1, D[i - w] + 1, D[i - w + 1] + 1);
      }
      for (let y = h - 2; y >= 0; y--) for (let x = w - 2; x >= 1; x--) {
        const i = y * w + x;
        if (D[i] > 1) D[i] = Math.min(D[i], D[i + 1] + 1, D[i + w + 1] + 1, D[i + w] + 1, D[i + w - 1] + 1);
      }
      const core = new Uint8Array(N);
      for (let i = 0; i < N; i++) if (D[i] > sr) core[i] = 1;
      const thick = maxFilter(core, w, h, sr);
      // 2. each thin pixel: the area it belongs to
      const next = Uint8Array.from(out);
      const wr = 2 * sr + 1; // (both sides of a strip up to 2 × sr wide are in view)
      let n0 = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!mask[i] || thick[i]) continue;
        const own = out[i];
        for (const k of seenL) cntL[k] = 0;
        seenL.length = 0;
        for (let dy = -wr; dy <= wr; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -wr; dx <= wr; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            const j = yy * w + xx;
            // (real areas only: two thin strips side by side swapped colours, 13 Nov 2026 review)
            if (!mask[j] || out[j] === own || !thick[j]) continue;
            if (!cntL[out[j]]) seenL.push(out[j]);
            cntL[out[j]]++;
          }
        }
        if (!seenL.length) continue;
        // (a) nearly the colour of an area beside it: the most alike of those (as small islands; dark ones twice as far)
        let to = -1, best = Infinity;
        for (const k of seenL) {
          if (cntL[k] < 2) continue;
          const lim = Math.max(C[own * 3], C[k * 3]) < 30 ? ISLAND_SEEN_DE : ART_ISLAND_DE;
          const d = dEk(own, k) / lim;
          if (d <= 1 && d < best) { best = d; to = k; }
        }
        // (b) a blend (or a halo just past one side) between two colours that are really apart: the nearer side
        if (to < 0) {
          let most = 1;
          for (let u = 0; u < seenL.length; u++) for (let v = u + 1; v < seenL.length; v++) {
            const a = seenL[u], b2 = seenL[v];
            if (Math.min(cntL[a], cntL[b2]) <= most) continue; // (the best-backed pair of sides)
            const t = onLine(own, a, b2);
            if (t === -1) continue;
            to = t < 0.5 ? a : b2;
            most = Math.min(cntL[a], cntL[b2]);
          }
        }
        if (to < 0) continue;
        next[i] = to;
        n0++;
      }
      out.set(next);
      if (!n0) break;
    }
    for (let i = 0; i < N; i++) if (out[i] !== before[i]) snapped++;
    log(`Vector: thin fringes — ${snapped} px of blends and halos along edges joined the area they belong to, ${secs()}`);
  }
  // Small islands of nearly the same colour (13 Nov 2026, the user's zoomed screenshots: lighter blobs inside a brown
  // area, patches of another dark brown inside an outline): soft, slightly noisy shading breaks into little areas of
  // a neighbouring shade. An area smaller than `island` px whose colour is within ART_ISLAND_DE of a colour it
  // touches (twice that for very dark colours) joins it. A real detail stays: it is either a clearly
  // different colour (an eye's shine) or bigger (a highlight band).
  if (island > 0 && !mapOnly) {
    const maxPx = Math.max(4, Math.round(island * s * s));
    const spotPx = printCm > 0 ? 0.1 * (w / (printCm * 10)) ** 2 : 0; // (the check's smallest lost spot, px)
    // How crisp the picture itself is at each pixel: how much its colour changes across 4 px (0–255), on a lightly
    // blurred copy. A real small detail (an eye's shine, a boot's highlight) has a crisp border in the picture; a
    // scrap of soft shading has none — its border is only where a gentle fade crossed a colour step.
    const soft3 = await sharp(pic, { raw: { width: w, height: h, channels: 3 }, limitInputPixels: false }).blur(1).raw().toBuffer();
    const edge = new Uint8Array(N);
    for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
      const i = y * w + x;
      let g = 0;
      for (let c = 0; c < 3; c++) {
        const dx = soft3[(i + 2) * 3 + c] - soft3[(i - 2) * 3 + c], dy = soft3[(i + 2 * w) * 3 + c] - soft3[(i - 2 * w) * 3 + c];
        g += dx * dx + dy * dy;
      }
      edge[i] = Math.min(255, Math.round(Math.sqrt(g)));
    }
    // each colour area's own colour in the picture (for how far apart two of them are, 0–255)
    const mean = new Float64Array(K * 3), mcnt = new Float64Array(K);
    for (let i = 0; i < N; i++) {
      if (nInk && !mask[i]) continue;
      const k = out[i];
      mean[k * 3] += pic[i * 3]; mean[k * 3 + 1] += pic[i * 3 + 1]; mean[k * 3 + 2] += pic[i * 3 + 2]; mcnt[k]++;
    }
    for (let k = 0; k < K; k++) if (mcnt[k]) { mean[k * 3] /= mcnt[k]; mean[k * 3 + 1] /= mcnt[k]; mean[k * 3 + 2] /= mcnt[k]; }
    const dE = (a2, b2) => Math.hypot(C[a2 * 3] - C[b2 * 3], (C[a2 * 3 + 1] - C[b2 * 3 + 1]) / 2, (C[a2 * 3 + 2] - C[b2 * 3 + 2]) / 2);
    const seen = new Uint8Array(N), stack = new Int32Array(N), part = new Int32Array(maxPx + 1);
    const tc = new Float64Array(K), tg = new Float64Array(K); // per touched colour: border pixels, their crispness summed
    let touched = [];
    let joined = 0, joinedSoft = 0;
    for (let i0 = 0; i0 < N; i0++) {
      if (seen[i0] || (nInk && !mask[i0])) continue;
      const k = out[i0];
      let top = 0, n = 0;
      stack[top++] = i0; seen[i0] = 1;
      for (const q of touched) { tc[q] = 0; tg[q] = 0; }
      touched = [];
      while (top) {
        const i = stack[--top], x = i % w;
        if (n <= maxPx) part[n] = i;
        n++;
        for (let d = 0; d < 4; d++) {
          if ((d === 0 && x === 0) || (d === 1 && x === w - 1)) continue;
          const j = d === 0 ? i - 1 : d === 1 ? i + 1 : d === 2 ? i - w : i + w;
          if (j < 0 || j >= N || (nInk && !mask[j])) continue;
          const q = out[j];
          if (q === k) { if (!seen[j]) { seen[j] = 1; stack[top++] = j; } }
          else if (n <= maxPx) {
            if (!tc[q]) touched.push(q);
            tc[q]++; tg[q] += Math.max(edge[i], edge[j]);
          }
        }
      }
      if (n > maxPx || !touched.length) continue;
      let all = 0;
      for (const q of touched) all += tc[q];
      // 1. nearly the colour of a neighbour: the neighbour it is most like, among those it really touches (a sixth of
      //    its border or more) — not the one it touches most: a sliver between the horse's orange coat and its skin
      //    touched the coat more, and stayed
      let nb = -1, least = Infinity;
      for (const q of touched) {
        if (tc[q] * 6 < all) continue;
        // (very dark colours: twice as far — but an island the check would see (0.1 mm² or more) only within
        // ISLAND_SEEN_DE: joined further, it was a lost detail, and the repairs drew it back as blocks — the dark
        // line along the top of the cowboy's teeth, 13 Nov 2026)
        const lim = Math.max(C[k * 3], C[q * 3]) < 30 ? (n < spotPx ? ART_ISLAND_DE * 2 : ISLAND_SEEN_DE) : ART_ISLAND_DE;
        const d = dE(k, q) / lim;
        if (d < least) { least = d; nb = q; }
      }
      let how = 1;
      if (nb < 0 || least > 1) {
        // 2. a scrap of soft shading: a little further in colour (up to ART_SOFT_DE), but the picture has no crisp
        //    edge along the border they share (13 Nov 2026: the brightest part of the saddle horn's crescent, 13.5
        //    from the crescent, came out as tan specks on it)
        nb = -1; least = Infinity; how = 2;
        for (const q of touched) {
          if (tc[q] * 6 < all) continue;
          const d = dE(k, q);
          if (d > ART_SOFT_DE || d >= least) continue;
          const apart = Math.hypot(mean[k * 3] - mean[q * 3], mean[k * 3 + 1] - mean[q * 3 + 1], mean[k * 3 + 2] - mean[q * 3 + 2]);
          if (tg[q] / tc[q] < SOFT_EDGE * apart) { least = d; nb = q; }
        }
      }
      if (nb < 0) continue;
      for (let q = 0; q < n; q++) out[part[q]] = nb;
      if (how === 2) joinedSoft++;
      joined++;
    }
    log(`Vector: ${joined} small islands joined their surroundings (${joinedSoft} of them scraps of soft shading), ${secs()}`);
  }
  // the list colours as printed: the average real colour of each area
  const sum = new Float64Array(K * 3), cnt = new Float64Array(K);
  for (let i = 0; i < N; i++) {
    if (nInk && !mask[i]) continue;
    if (made && made.out[i]) continue; // (their own colour is the enlarger's)
    const k = out[i];
    sum[k * 3] += rgba[i * 4]; sum[k * 3 + 1] += rgba[i * 4 + 1]; sum[k * 3 + 2] += rgba[i * 4 + 2]; cnt[k]++;
  }
  const pal = [];
  for (let k = 0; k < K; k++) {
    let c = cnt[k] ? [0, 1, 2].map((j) => Math.round(sum[k * 3 + j] / cnt[k])) : null;
    if (!c) {
      // a colour the smoothing left no area of: its own pixels' average (the repair step may still draw it)
      let r = 0, g = 0, bl = 0, n2 = 0;
      for (let i = 0; i < N; i++) if (lbl[i] === k && (!nInk || mask[i])) { r += rgba[i * 4]; g += rgba[i * 4 + 1]; bl += rgba[i * 4 + 2]; n2++; }
      c = n2 ? [Math.round(r / n2), Math.round(g / n2), Math.round(bl / n2)] : [0, 0, 0];
    }
    pal.push(c);
  }
  const palHex = pal.map((c) => `#${hex2(c[0])}${hex2(c[1])}${hex2(c[2])}`);
  if (mapOnly) return { st: { w, h, s, lbl, pal, mask, rgba: asIs, plain } };
  if (stopBeforeTrace) return { out, pal, w, h, s }; // (tests: the colour map exactly as it is traced)
  log(`Vector: colour areas smoothed, ${secs()}`);

  // 5. trace tile by tile; each tile trimmed just past its own edge, so neighbours overlap and no seam shows
  const inv = 1 / s;
  const fmt = (v) => {
    const q = (v * inv).toFixed(2).replace(/\.?0+$/, "");
    return q === "-0" || q === "" ? "0" : q;
  };
  const pdf = []; // PDF operators
  const svg = []; // SVG parts
  const used = new Set();
  let shapes = 0, tileNo = 0;
  const lw = (1 * inv).toFixed(2); // a 1 px outline in the shape's own colour closes hairline gaps between shapes
  // Where the tiles meet (13 Nov 2026): a long edge running right along a seam can be drawn a little differently by
  // the two tiles. So each seam moves (up to SEAM_REACH) to where the fewest edges run along it. (First suspected for
  // a flat badge's broken edge line at 3072 px — that turned out to be the enlarger's line, see madeUp.)
  const seams = (n, len, changes) => {
    const cuts = [0];
    for (let c = TILE; c < n - TILE / 4; c += TILE) {
      let best = c, bestV = Infinity;
      for (let d = 0; d <= SEAM_REACH; d = d > 0 ? -d : 1 - d) { // (0, 1, -1, 2, -2, …: the nearest of equals wins)
        const p = c + d;
        if (p < cuts[cuts.length - 1] + TILE / 2 || p > n - 8) continue;
        let v = 0;
        for (let k = -2; k <= 1 && v < bestV; k++) v += changes(p + k, len);
        if (v < bestV) { bestV = v; best = p; }
        if (!v) break;
      }
      cuts.push(best);
    }
    cuts.push(n);
    return cuts;
  };
  // (edges running along a row: label changes between it and the next row; along a column likewise)
  const rowCh = (y, len) => { let v = 0; const o = y * w; for (let x = 0; x < len; x++) if (out[o + x] !== out[o + w + x] && (!nInk || mask[o + x] || mask[o + w + x])) v++; return v; };
  const colCh = (x, len) => { let v = 0; for (let y = 0; y < len; y++) { const i = y * w + x; if (out[i] !== out[i + 1] && (!nInk || mask[i] || mask[i + 1])) v++; } return v; };
  const ys = seams(h, w, rowCh), xs = seams(w, h, colCh);
  for (let ty = 0; ty < ys.length - 1; ty++) {
    for (let tx = 0; tx < xs.length - 1; tx++) {
      const x0 = xs[tx], y0 = ys[ty], x1 = xs[tx + 1], y1 = ys[ty + 1];
      const cx0 = Math.max(0, x0 - MARGIN), cy0 = Math.max(0, y0 - MARGIN), cx1 = Math.min(w, x1 + MARGIN), cy1 = Math.min(h, y1 + MARGIN);
      const tw = cx1 - cx0, th = cy1 - cy0;
      // skip a tile with no ink near it at all
      let any = !nInk;
      for (let y = cy0; y < cy1 && !any; y++) for (let x = cx0; x < cx1; x++) if (mask[y * w + x]) { any = true; break; }
      if (!any) continue;
      const tile = Buffer.alloc(tw * th * 4);
      for (let y = 0; y < th; y++) {
        for (let x = 0; x < tw; x++) {
          const c = pal[out[(cy0 + y) * w + cx0 + x]], o = (y * tw + x) * 4;
          tile[o] = c[0]; tile[o + 1] = c[1]; tile[o + 2] = c[2]; tile[o + 3] = 255;
        }
      }
      // simplify 1: each curve straightened within 1 px (13 Nov 2026: a flat badge's straight diagonal edges came out
      // with fine saw-teeth at 5× zoom; 1 px made them straight with nothing lost, and the cowboy unchanged — 2 and 3
      // bent the line at a kink)
      const traced = convertPixels(tile, tw, th, { clustering: "color-cluster", hierarchical: "cutout", mode: "spline", filterSpeckle: 2, colorPrecision: 8, layerDifference: 1, cornerThreshold: corner, lengthThreshold: Math.max(3.5, len * s), maxIterations: 10, spliceThreshold: 45, simplify: 1, pathPrecision: 2, optimize: 0, palette: palHex, ...trace });
      const rx = x0 - 1.5, ry = y0 - 1.5, rw = x1 - x0 + 3, rh = y1 - y0 + 3;
      pdf.push("q", `${fmt(rx)} ${fmt(ry)} ${fmt(rw)} ${fmt(rh)} re W n`, `${lw} w 1 j 1 J`);
      svg.push(`<clipPath id="t${tileNo}"><rect x="${fmt(rx)}" y="${fmt(ry)}" width="${fmt(rw)}" height="${fmt(rh)}"/></clipPath><g clip-path="url(#t${tileNo})" stroke-width="${lw}" stroke-linejoin="round">`);
      let last = null;
      for (const m of traced.matchAll(/<path\b([^>]*)\/?>/g)) {
        const at = m[1];
        const d = (/\bd="([^"]*)"/.exec(at) || [])[1] || "";
        if (!d.trim()) continue;
        const fill = ((/fill="#([0-9A-Fa-f]{6})"/.exec(at) || [])[1] || "000000").toLowerCase();
        const tm = /translate\(([-\d.eE]+)[, ]\s*([-\d.eE]+)\)/.exec(at);
        const dx = (tm ? +tm[1] : 0) + cx0, dy = (tm ? +tm[2] : 0) + cy0;
        const toks = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
        const ops = [], sv = [];
        let cmd = null, i = 0;
        while (i < toks.length) {
          if (/[A-Za-z]/.test(toks[i])) {
            cmd = toks[i++];
            if (cmd === "Z" || cmd === "z") { ops.push("h"); sv.push("Z"); continue; }
          }
          if (cmd === "M" || cmd === "L") {
            const x = fmt(+toks[i++] + dx), y = fmt(+toks[i++] + dy);
            ops.push(`${x} ${y} ${cmd === "M" ? "m" : "l"}`); sv.push(`${cmd}${x} ${y}`);
            if (cmd === "M") cmd = "L";
          } else if (cmd === "C") {
            const v = [];
            for (let k = 0; k < 6; k++) v.push(fmt(+toks[i++] + (k % 2 ? dy : dx)));
            ops.push(`${v.join(" ")} c`); sv.push(`C${v.join(" ")}`);
          } else throw new Error(`Vector: path command not handled: ${cmd}`);
        }
        if (!ops.length) continue;
        if (fill !== last) {
          const rgbStr = [0, 2, 4].map((j) => (parseInt(fill.slice(j, j + 2), 16) / 255).toFixed(4).replace(/\.?0+$/, "") || "0").join(" ");
          pdf.push(`${rgbStr} rg ${rgbStr} RG`);
          last = fill;
        }
        pdf.push(...ops, "B");
        svg.push(`<path fill="#${fill}" stroke="#${fill}" d="${sv.join("")}"/>`);
        used.add(fill);
        shapes++;
      }
      pdf.push("Q");
      svg.push("</g>");
      tileNo++;
      log(`Vector: tile ${tileNo} traced (${shapes} shapes so far), ${secs()}`);
    }
  }
  const content = zlib.deflateSync(Buffer.from(pdf.join("\n") + "\n", "latin1"), { level: 6 });
  const svgText = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs/>${svg.join("")}</svg>`;
  log(`Vector: ${shapes} shapes in ${used.size} colours, ${(content.length / 1e6).toFixed(1)} MB, ${secs()}`);
  // st: the colour map before smoothing (each pixel's own nearest list colour) — the repair step draws from it
  return { content, svg: svgText, shapes, colours: used.size, workScale: s, st: { w, h, s, lbl, pal, mask } };
}

/* ---------- the detail check (13 Nov 2026, user: "Not even single bit detail should be missed … for all future images") ---------- */
// The shapes are compared with the print-ready picture both ways, at 10 px per mm of print (or the picture's own size):
// every colour of the picture must be found in the shapes within 0.2 mm, and every colour of the shapes in the picture
// (ΔE under 20 — a colour step of the shapes is about 5–10). An edge may sit up to 0.2 mm away; a missed spot of
// 0.1 mm² or more — the smallest dot the print film holds — is a LOST DETAIL. ok = none lost.
// The colour limit (ΔE). Tried 12 (13 Nov 2026): every step of soft shading and every blurred edge became a miss, and
// the repairs made a patchwork (the user's zoomed screenshots: blotches, squares). Also tried and dropped: comparing
// the local detail only (each minus its blurred copy) — it misfires near the cut edge and never settles.
export const CHECK_DE = 20;
// Not details (13 Nov 2026, the user's zoomed screenshots: bumpy, flecked outlines where the repair blocks rebuilt them):
// - the soft in-between pixels of an edge: a colour that is a blend of two colours found right there on the other side
//   (within CHECK_BLEND of the line between them) — the enlarger's blur, not a detail;
// - the outermost CHECK_RIM mm of the ink: the customer's cut-out leaves blended flecks there, and the vector edge
//   decides the cut anyway.
// - what the enlarger added (13 Nov 2026, a flat yellow-and-blue badge: the enlarger drew a 1 px dark line along the
//   clean edge between them; the shapes rightly left it out, the check called it a lost detail, and the repairs drew
//   it back in as a broken, blocky line). With `src` — the customer's own picture as it went into the enlarger — a
//   spot is lost only if the shapes miss it in the print-ready picture AND in the customer's picture: a real detail is
//   in both, the enlarger's ringing only in one.
const CHECK_BLEND = 15;
const CHECK_RIM = 0.3;
export async function detailCheck({ svg, rgb, ink, W, H, printCm, src = null, de = CHECK_DE, rimMm = CHECK_RIM, wideMm = 0, wantMask = false, log = () => {} }) {
  const t0 = Date.now();
  // the size it is checked at: at most 100 px per print cm, at least 64 px on the short side — one scale for both sides
  // (13 Nov 2026 review: each side was floored at 64 on its own, so a thin strip was checked squashed and failed)
  let sc = Math.min(1, (printCm * 100) / W);
  if (Math.min(W, H) * sc < 64) sc = Math.min(1, 64 / Math.min(W, H));
  const w = Math.max(1, Math.round(W * sc)), h = Math.max(1, Math.round(H * sc));
  const same = w === W && h === H;
  const pxMm = w / (printCm * 10);
  const R = Math.max(1, Math.round(0.2 * pxMm)); // edge tolerance, px
  const minPx = Math.max(2, Math.round(0.1 * pxMm * pxMm)); // 0.1 mm², px
  const pic = same ? rgb : await sharp(rgb, { raw: { width: W, height: H, channels: 3 }, limitInputPixels: false }).resize(w, h, { kernel: "lanczos3", fit: "fill" }).raw().toBuffer();
  const m8 = Buffer.alloc(W * H);
  for (let i = 0; i < m8.length; i++) m8[i] = ink[i] ? 255 : 0;
  const inkS = same ? m8 : await sharp(m8, { raw: { width: W, height: H, channels: 1 }, limitInputPixels: false }).resize(w, h, { kernel: "cubic", fit: "fill" }).extractChannel(0).raw().toBuffer();
  const sized = svg.replace(/<svg([^>]*?)\swidth="[^"]*"\s+height="[^"]*"/, `<svg$1 width="${w}" height="${h}" preserveAspectRatio="none"`);
  const vec = await sharp(Buffer.from(sized), { limitInputPixels: false, unlimited: true }).flatten({ background: "#000" }).removeAlpha().raw().toBuffer();
  const N = w * h;
  // Lab in bytes (L ×2.55, a/b +128): enough for a ΔE-20 test, a quarter of the memory
  const toLab = (src) => {
    const out = new Uint8Array(N * 3), t = [0, 0, 0];
    for (let i = 0; i < N; i++) {
      lab(src[i * 3], src[i * 3 + 1], src[i * 3 + 2], t);
      out[i * 3] = Math.max(0, Math.min(255, Math.round(t[0] * 2.55)));
      out[i * 3 + 1] = Math.max(0, Math.min(255, Math.round(t[1] + 128)));
      out[i * 3 + 2] = Math.max(0, Math.min(255, Math.round(t[2] + 128)));
    }
    return out;
  };
  const A = toLab(pic), B = toLab(vec);
  // the customer's picture at the same size (enlarged plainly: each of its pixels keeps its own colour at its centre)
  // (only when the picture was enlarged: with nothing enlarged there is nothing the enlarger added)
  let A0 = null, p0 = null;
  if (src && src.W < W * 0.9 && !sameShape(src, W, H)) log(`Detail check: the customer's picture (${src.W}×${src.H}) is not the shape of this one (${W}×${H}) — checked without it`);
  if (src && src.W < W * 0.9 && sameShape(src, W, H)) {
    p0 = await sharp(src.rgb, { raw: { width: src.W, height: src.H, channels: 3 }, limitInputPixels: false }).resize(w, h, { kernel: src.W < w ? "cubic" : "lanczos3", fit: "fill" }).raw().toBuffer();
    // The enlarger moves the picture a little (13 Nov 2026: a flat badge's edge sat 1 px lower in the plain
    // enlargement than in the enlarger's, so its soft edge pixels were out of reach): moved to where it fits best
    let fit = [0, 0], fitV = Infinity;
    for (let sy = -3; sy <= 3; sy++) for (let sx = -3; sx <= 3; sx++) {
      let v = 0;
      for (let y = 8; y < h - 8 && v < fitV; y += 3) for (let x = 8; x < w - 8; x += 3) {
        const i = y * w + x;
        if (inkS[i] < 250) continue;
        const j = (i + sy * w + sx) * 3;
        v += Math.abs(pic[i * 3] - p0[j]) + Math.abs(pic[i * 3 + 1] - p0[j + 1]) + Math.abs(pic[i * 3 + 2] - p0[j + 2]);
      }
      if (v < fitV) { fitV = v; fit = [sx, sy]; }
    }
    if (fit[0] || fit[1]) {
      const moved = Buffer.alloc(N * 3);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const xx = Math.min(w - 1, Math.max(0, x + fit[0])), yy = Math.min(h - 1, Math.max(0, y + fit[1]));
        const i = (y * w + x) * 3, j = (yy * w + xx) * 3;
        moved[i] = p0[j]; moved[i + 1] = p0[j + 1]; moved[i + 2] = p0[j + 2];
      }
      p0 = moved;
    }
    A0 = toLab(p0);
  }
  const deLim = de * de, deBlend = Math.min(CHECK_BLEND, de * 0.75) ** 2;
  const d2 = (P, i, Q, j) => {
    const x = (P[i] - Q[j]) / 2.55, y = P[i + 1] - Q[j + 1], z = P[i + 2] - Q[j + 2];
    return x * x + y * y + z * z;
  };
  // found(P at i) somewhere in Q within R px?
  // (PR, QR: the same pictures in sRGB — resizing and drawing blend two colours along the straight sRGB line, which
  // can lie ΔE 20 off the Lab line: a soft yellow-to-blue edge is grey-olive, and every such edge pixel was a miss)
  const tb = [0, 0, 0];
  const found = (P, PR, Q, QR, x, y, lim2, blend2) => {
    const i = (y * w + x) * 3;
    for (let dy = -R; dy <= R; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      for (let dx = -R; dx <= R; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= w) continue;
        if (d2(P, i, Q, (yy * w + xx) * 3) <= lim2) return true;
      }
    }
    // not found as it is: a blend of two colours that are there?
    const pL = P[i] / 2.55, p1 = P[i + 1], p2 = P[i + 2];
    const near = [], nearR = [];
    for (let dy = -R; dy <= R; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      for (let dx = -R; dx <= R; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= w) continue;
        const j = (yy * w + xx) * 3;
        near.push(Q[j] / 2.55, Q[j + 1], Q[j + 2]);
        nearR.push(QR[j], QR[j + 1], QR[j + 2]);
      }
    }
    const pr = PR[i], pg = PR[i + 1], pb = PR[i + 2];
    for (let a = 0; a < near.length; a += 3) {
      const ax = pL - near[a], ay = p1 - near[a + 1], az = p2 - near[a + 2];
      for (let b = a + 3; b < near.length; b += 3) {
        const bx = near[b] - near[a], by = near[b + 1] - near[a + 1], bz = near[b + 2] - near[a + 2];
        const len2 = bx * bx + by * by + bz * bz;
        if (len2 < 100) continue; // (the two are the same colour)
        const t = (ax * bx + ay * by + az * bz) / len2;
        if (t > 0 && t < 1) {
          const ex = ax - t * bx, ey = ay - t * by, ez = az - t * bz;
          if (ex * ex + ey * ey + ez * ez <= blend2) return true;
        }
        // along the sRGB line: the nearest point of it, measured in Lab
        const r0 = nearR[a], g0 = nearR[a + 1], b0 = nearR[a + 2], rx = nearR[b] - r0, ry = nearR[b + 1] - g0, rz = nearR[b + 2] - b0;
        const rl = rx * rx + ry * ry + rz * rz;
        if (rl < 300) continue;
        const u = ((pr - r0) * rx + (pg - g0) * ry + (pb - b0) * rz) / rl;
        if (u <= 0 || u >= 1) continue;
        const fx = pr - r0 - u * rx, fy = pg - g0 - u * ry, fz = pb - b0 - u * rz;
        if (fx * fx + fy * fy + fz * fz > 3600) continue; // (far off the line even in sRGB)
        lab(Math.round(r0 + u * rx), Math.round(g0 + u * ry), Math.round(b0 + u * rz), tb);
        const qx = pL - tb[0], qy = p1 - 128 - tb[1], qz = p2 - 128 - tb[2];
        if (qx * qx + qy * qy + qz * qz <= blend2) return true;
      }
    }
    return false;
  };
  // the outermost band of the ink is not checked — along the wide see-through areas only (wideMm: see wideOutside).
  // Along a thin see-through line of the design every pixel is checked, up to the line (13 Nov 2026: with the band
  // along every line, most of a badge whose black outlines are see-through was never checked)
  const off = new Uint8Array(N), inkB = new Uint8Array(N);
  for (let i = 0; i < N; i++) { off[i] = inkS[i] < 250 ? 1 : 0; inkB[i] = 1 - off[i]; }
  const rim = maxFilter(wideOutside(inkB, w, h, wideMm > 0 ? Math.max(1, Math.round(wideMm * pxMm)) : 0), w, h, Math.max(1, Math.round(Math.max(CHECK_RIM, rimMm) * pxMm)));
  for (let i = 0; i < N; i++) if (off[i]) rim[i] = 1;
  const miss = new Uint8Array(N);
  let nInk = 0, nMiss = 0, nAdded = 0;
  const differs = (P, PR, x, y) => !found(P, PR, B, vec, x, y, deLim, deBlend) || !found(B, vec, P, PR, x, y, deLim, deBlend);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (rim[i]) continue; // (the cut edge and the band just inside it)
    nInk++;
    if (differs(A, pic, x, y)) { miss[i] = 1; nMiss++; }
  }
  // Only the enlarger had it: a miss with no miss of the customer's picture within R px (13 Nov 2026 review: tested
  // pixel by pixel, the plain enlargement's softer, half-pixel-shifted copy of a small real dot or hairline shrank the
  // lost spot below 0.1 mm², and the detail went missing from the print)
  // (the misses before that test: the exact-block repairs draw the whole run of them a lost spot sits in)
  const raw = wantMask && A0 && nMiss ? Uint8Array.from(miss) : null;
  if (A0 && nMiss) {
    const zone = maxFilter(miss, w, h, R), m0 = new Uint8Array(N);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (zone[i] && !rim[i] && differs(A0, p0, x, y)) m0[i] = 1;
    }
    const g = maxFilter(m0, w, h, R);
    for (let i = 0; i < N; i++) if (miss[i] && !g[i]) { miss[i] = 0; nMiss--; nAdded++; }
  }
  if (nAdded) log(`Detail check: ${nAdded} px differ only from what the enlarger added — not counted`);
  // missed spots: touching missed pixels
  const seen = new Uint8Array(N), spots = [];
  const st = [];
  for (let i = 0; i < N; i++) {
    if (!miss[i] || seen[i]) continue;
    seen[i] = 1; st.push(i);
    let n = 0, sx = 0, sy = 0;
    while (st.length) {
      const k = st.pop(), kx = k % w, ky = (k - kx) / w;
      n++; sx += kx; sy += ky;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const qx = kx + dx, qy = ky + dy;
        if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
        const q = qy * w + qx;
        if (miss[q] && !seen[q]) { seen[q] = 1; st.push(q); }
      }
    }
    if (n >= minPx) spots.push({ mm2: Math.round((n / (pxMm * pxMm)) * 100) / 100, x: Math.round(((sx / n) * W) / w), y: Math.round(((sy / n) * H) / h) });
  }
  spots.sort((a, b) => b.mm2 - a.mm2);
  const res = { ok: spots.length === 0, lost: spots.length, biggestMm2: spots[0]?.mm2 || 0, spots: spots.slice(0, 20), matchPct: nInk ? Math.round((1 - nMiss / nInk) * 10000) / 100 : 100 };
  if (wantMask) Object.assign(res, { miss, raw, rim, mw: w, mh: h, R, vec }); // where (and the shapes as drawn): for the repair step
  log(`Detail check: ${res.ok ? "every detail kept" : `${res.lost} detail${res.lost === 1 ? "" : "s"} lost (biggest ${res.biggestMm2} mm²)`}, ${res.matchPct}% matched, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  return res;
}

/* ---------- the "no detail lost" rule (13 Nov 2026) ----------
   User: "We should make the whole image as vector without any details lost and with high quality."
   What the tests showed: choosing the colours loses nothing (the 96-colour map of the picture passes detailCheck with
   0 lost); the tracer is what drops a few thin bits (it merges thin areas into their neighbours — with any settings,
   even its pixel-exact mode), and tracing each colour by itself leaves gaps. So: the shapes are traced as before, the
   check finds every spot they miss, and those spots are drawn again as exact little vector blocks straight from a
   fine colour map of the picture (96 colours), on top. Then it is checked again. Only if that
   still loses something does a gentler try follow, and only if every try fails does the sharp picture print. */
export const ART_LADDER = [
  { colours: ART_COLOURS, crisp: ART_CRISP, merge: ART_MERGE, smooth: ART_SMOOTH, island: ART_ISLAND, calm: ART_CALM, flat: ART_FLAT }, // the clean drawn-art look
  { colours: PHOTO_COLOURS, smooth: 0.6, trace: { filterSpeckle: 1 } }, // gentler: closest to the picture
];
export const PHOTO_LADDER = [{ colours: PHOTO_COLOURS, smooth: 0.6, trace: { filterSpeckle: 1 } }];
const FRINGE = 3;
const REPAIR_ROUNDS = 4;
const REPAIR_MIN_MATCH = 99; // % of the ink the shapes must already match for repairs to be tried
// on the last try a lower bar (13 Nov 2026): the only other way out is the sharp picture, not vector at all — a line-art
// lion at 98.6% (hundreds of thin bright streaks under 0.4 mm that the tracer merges into the strands) had no repairs
const LAST_REPAIR_MIN_MATCH = 95;
const SMOOTH_ROUNDS = 2; // the first repairs are smooth shapes; later ones exact blocks
const REPAIR_COLOURS = 160; // the colour map of the picture the repair shapes are traced from
const REPAIR_CRISP = 1; // that map is made from a lightly cleaned copy: shading noise would come out as blobs
// The missed spots (grown by the check's edge tolerance) as exact blocks of the picture itself: runs of one colour
// along a row, joined downwards when the next row has the same run. PDF operators and SVG, like the shapes.
// The last resort, for what the smooth repair shapes still miss.
// The picture as it is (st.plain), even where the enlarger made a pixel up (13 Nov 2026: the made-up step gives such a
// pixel the colour beside it — but a spot the check still finds lost after the smooth repairs is a real detail of the
// customer's picture there, and that colour could never fix it: 5 of the 14 test pictures ended a few spots short).
// And not only the spot: the whole run of differing pixels it sits in (see joinedRun). (13 Nov 2026: blocks of the
// enlarger's own colours beside a spot made those pixels differ from the customer's picture, so a pixel next to them
// that the check had let pass as the enlarger's became a lost spot — each round of blocks made a new one, and 4 of 29
// test pictures ended 2–8 spots short. Drawn over the whole run, each of them was fixed in one round.)
// The check's lost pixels and every differing pixel joined to them (c.raw: its misses before the customer's-picture
// test), over gaps up to 2R + 1 px — as far as a block's colour can reach a pixel through that test
function joinedRun(c) {
  if (!c.raw) return c.miss;
  const { mw, mh } = c, G = 2 * c.R + 1, run = new Uint8Array(mw * mh), stack = [];
  for (let i = 0; i < mw * mh; i++) if (c.miss[i]) { run[i] = 1; stack.push(i); }
  while (stack.length) {
    const k = stack.pop(), kx = k % mw, ky = (k - kx) / mw;
    for (let dy = -G; dy <= G; dy++) {
      const qy = ky + dy;
      if (qy < 0 || qy >= mh) continue;
      for (let dx = -G; dx <= G; dx++) {
        const qx = kx + dx;
        if (qx < 0 || qx >= mw) continue;
        const q = qy * mw + qx;
        if (c.raw[q] && !run[q]) { run[q] = 1; stack.push(q); }
      }
    }
  }
  return run;
}
function exactBlocks(st, c, W, H, id) {
  const { w, h, s, mask } = st;
  const rgba = st.plain || st.rgba;
  // the picture's own colour, to 32 levels a channel (a step no eye sees): these blocks cannot miss
  const kAt = (i) => ((rgba[i * 4] >> 3) << 10) | ((rgba[i * 4 + 1] >> 3) << 5) | (rgba[i * 4 + 2] >> 3);
  const grown = maxFilter(joinedRun(c), c.mw, c.mh, c.R + 1);
  const inv = 1 / s, e = 0.15; // (blocks reach 0.15 px past their pixels: no hairline between neighbours)
  const fmt = (v) => (v * inv).toFixed(2).replace(/\.?0+$/, "") || "0";
  const rects = new Map(); // colour -> [x0, y0, x1, y1, …] (px, work size)
  let open = new Map(), n = 0, px = 0;
  // in a missed spot, and not in the cut edge's band (its flecks are not drawn again)
  const at = (gy, x) => {
    const g = gy + Math.min(c.mw - 1, Math.floor((x * c.mw) / w));
    return grown[g] && !c.rim[g];
  };
  const close = (key, y0, y1) => {
    const [x0, x1, k] = key.split(",").map(Number);
    if (!rects.has(k)) rects.set(k, []);
    rects.get(k).push(x0, y0, x1, y1);
    n++;
  };
  for (let y = 0; y <= h; y++) {
    const now = new Map();
    if (y < h) {
      const gy = Math.min(c.mh - 1, Math.floor((y * c.mh) / h)) * c.mw;
      let x = 0;
      while (x < w) {
        const i = y * w + x;
        if (!mask[i] || !at(gy, x)) { x++; continue; }
        const k = kAt(i), x0 = x;
        while (x < w && kAt(y * w + x) === k && mask[y * w + x] && at(gy, x)) x++;
        px += x - x0;
        const key = `${x0},${x},${k}`;
        now.set(key, open.has(key) ? open.get(key) : y);
        open.delete(key);
      }
    }
    for (const [key, y0] of open) close(key, y0, y);
    open = now;
  }
  const pdf = ["q"], svg = [`<g id="${id}">`];
  for (const [k, r] of rects) {
    const col = [(((k >> 10) & 31) << 3) | 4, (((k >> 5) & 31) << 3) | 4, ((k & 31) << 3) | 4];
    const rgbStr = col.map((v) => (v / 255).toFixed(4).replace(/\.?0+$/, "") || "0").join(" ");
    pdf.push(`${rgbStr} rg`);
    const d = [];
    for (let j = 0; j < r.length; j += 4) {
      const x0 = fmt(r[j] - e), y0 = fmt(r[j + 1] - e), x1 = fmt(r[j + 2] + e), y1 = fmt(r[j + 3] + e);
      pdf.push(`${x0} ${y0} m ${x1} ${y0} l ${x1} ${y1} l ${x0} ${y1} l h`);
      d.push(`M${x0} ${y0}H${x1}V${y1}H${x0}Z`);
    }
    pdf.push("f");
    svg.push(`<path fill="#${hex2(col[0])}${hex2(col[1])}${hex2(col[2])}" d="${d.join("")}"/>`);
  }
  pdf.push("Q");
  svg.push("</g>");
  return { pdf: pdf.join("\n") + "\n", svg: svg.join(""), blocks: n, px };
}
// The missed spots as smooth shapes (13 Nov 2026, the user's zoomed screenshot: the jeans highlight came back as
// stair-step blocks): in each spot every colour of the fine map is traced by itself, as a black-and-white shape, with
// curves. Between these shapes the clean shapes underneath show (nearly the same colour), so no gap matters here.
// Lone specks are smoothed away first; whatever this still misses, the next rounds draw as exact blocks.
const PATCH_TILE = 512, PATCH_MARGIN = 8;
const PATCH_DE = 8; // a repair pixel within this of the shapes already there is left alone
function smoothPatches(st, c, W, H, id, soft = true) {
  // soft: lone specks smoothed away first (the first round); without it every pixel keeps its own colour
  const { w, h, s, lbl, pal, mask } = st;
  const grown = maxFilter(c.miss, c.mw, c.mh, c.R + 1);
  const inv = 1 / s;
  const fmt = (v) => (v * inv).toFixed(2).replace(/\.?0+$/, "") || "0";
  const area = new Uint8Array(w * h);
  let px = 0;
  for (let y = 0; y < h; y++) {
    const gy = Math.min(c.mh - 1, Math.floor((y * c.mh) / h)) * c.mw;
    for (let x = 0; x < w; x++) {
      const g = gy + Math.min(c.mw - 1, Math.floor((x * c.mw) / w));
      if (mask[y * w + x] && grown[g] && !c.rim[g]) { area[y * w + x] = 1; px++; }
    }
  }
  // each pixel of a spot takes the colour most of its 5 × 5 neighbours have (no blobs from shading noise, softer steps)
  const lab2 = new Uint8Array(w * h);
  const votes = new Map();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!area[i]) continue;
    if (!soft) { lab2[i] = lbl[i]; continue; }
    votes.clear();
    let bestK = lbl[i], bestN = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const k = lbl[yy * w + xx], n = (votes.get(k) || 0) + (dx || dy ? 1 : 1.5);
      votes.set(k, n);
      if (n > bestN) { bestN = n; bestK = k; }
    }
    lab2[i] = bestK;
  }
  // Only what differs from the shapes already there is drawn (13 Nov 2026: a repair redrew its whole spot, plain
  // surroundings too, in the map's own very slightly different shade — a faint patch beside each repaired detail).
  const palLab = pal.map((c) => lab(c[0], c[1], c[2]));
  const t3 = [0, 0, 0];
  let kept = 0;
  for (let y = 0; y < h; y++) {
    const gy = Math.min(c.mh - 1, Math.floor((y * c.mh) / h)) * c.mw;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!area[i]) continue;
      const g = (gy + Math.min(c.mw - 1, Math.floor((x * c.mw) / w))) * 3;
      lab(c.vec[g], c.vec[g + 1], c.vec[g + 2], t3);
      const q = palLab[lab2[i]];
      if (Math.hypot(q[0] - t3[0], q[1] - t3[1], q[2] - t3[2]) < PATCH_DE) area[i] = 0;
      else kept++;
    }
  }
  px = kept;
  const lw = (0.5 * inv).toFixed(2);
  const pdf = ["q", `${lw} w 1 j 1 J`], svg = [`<g id="${id}" stroke-width="${lw}" stroke-linejoin="round">`];
  let shapes = 0, tileNo = 0;
  for (let y0 = 0; y0 < h; y0 += PATCH_TILE) for (let x0 = 0; x0 < w; x0 += PATCH_TILE) {
    const x1 = Math.min(w, x0 + PATCH_TILE), y1 = Math.min(h, y0 + PATCH_TILE);
    const cx0 = Math.max(0, x0 - PATCH_MARGIN), cy0 = Math.max(0, y0 - PATCH_MARGIN), cx1 = Math.min(w, x1 + PATCH_MARGIN), cy1 = Math.min(h, y1 + PATCH_MARGIN);
    const tw = cx1 - cx0, th = cy1 - cy0;
    const here = new Set();
    for (let y = cy0; y < cy1; y++) for (let x = cx0; x < cx1; x++) if (area[y * w + x]) here.add(lab2[y * w + x]);
    if (!here.size) continue;
    const rx = fmt(x0 - 0.5), ry = fmt(y0 - 0.5), rw = fmt(x1 - x0 + 1), rh = fmt(y1 - y0 + 1);
    pdf.push("q", `${rx} ${ry} ${rw} ${rh} re W n`);
    svg.push(`<clipPath id="${id}c${tileNo}"><rect x="${rx}" y="${ry}" width="${rw}" height="${rh}"/></clipPath><g clip-path="url(#${id}c${tileNo})">`);
    tileNo++;
    for (const k of here) {
      // (a 2 px empty border, so shapes close)
      const pw = tw + 4, ph = th + 4;
      const bw = Buffer.alloc(pw * ph * 4, 255);
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
        const i = (cy0 + y) * w + cx0 + x;
        if (!area[i] || lab2[i] !== k) continue;
        const o = ((y + 2) * pw + x + 2) * 4;
        bw[o] = 0; bw[o + 1] = 0; bw[o + 2] = 0;
      }
      const traced = convertPixels(bw, pw, ph, { clustering: "bw", binaryThreshold: 128, mode: "spline", filterSpeckle: soft ? 2 : 1, cornerThreshold: 60, lengthThreshold: 3.5, maxIterations: 10, spliceThreshold: 45, pathPrecision: 2, optimize: 0 });
      const col = pal[k];
      const hex = `#${hex2(col[0])}${hex2(col[1])}${hex2(col[2])}`;
      const rgbStr = col.map((v) => (v / 255).toFixed(4).replace(/\.?0+$/, "") || "0").join(" ");
      let first = true;
      for (const m of traced.matchAll(/<path\b([^>]*)\/?>/g)) {
        const d = (/\bd="([^"]*)"/.exec(m[1]) || [])[1] || "";
        const tm = /translate\(([-\d.eE]+)[, ]\s*([-\d.eE]+)\)/.exec(m[1]);
        const dx = (tm ? +tm[1] : 0) + cx0 - 2, dy = (tm ? +tm[2] : 0) + cy0 - 2;
        const toks = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
        const ops = [], sv = [];
        let cmd = null, i = 0;
        while (i < toks.length) {
          if (/[A-Za-z]/.test(toks[i])) {
            cmd = toks[i++];
            if (cmd === "Z" || cmd === "z") { ops.push("h"); sv.push("Z"); continue; }
          }
          if (cmd === "M" || cmd === "L") {
            const x = fmt(+toks[i++] + dx), y = fmt(+toks[i++] + dy);
            ops.push(`${x} ${y} ${cmd === "M" ? "m" : "l"}`); sv.push(`${cmd}${x} ${y}`);
            if (cmd === "M") cmd = "L";
          } else if (cmd === "C") {
            const v = [];
            for (let q = 0; q < 6; q++) v.push(fmt(+toks[i++] + (q % 2 ? dy : dx)));
            ops.push(`${v.join(" ")} c`); sv.push(`C${v.join(" ")}`);
          } else throw new Error(`Vector: path command not handled: ${cmd}`);
        }
        if (!ops.length) continue;
        if (first) { pdf.push(`${rgbStr} rg ${rgbStr} RG`); first = false; }
        pdf.push(...ops, "B");
        svg.push(`<path fill="${hex}" stroke="${hex}" d="${sv.join("")}"/>`);
        shapes++;
      }
    }
    pdf.push("Q");
    svg.push("</g>");
  }
  pdf.push("Q");
  svg.push("</g>");
  return { pdf: pdf.join("\n") + "\n", svg: svg.join(""), blocks: shapes, px };
}
// the repair shapes drawn after the shapes
function addOnTop(v, b) {
  const content = zlib.deflateSync(Buffer.concat([zlib.inflateSync(v.content), Buffer.from(b.pdf, "latin1")]), { level: 6 });
  const svg = v.svg.slice(0, v.svg.lastIndexOf("</svg>")) + b.svg + "</svg>";
  return { ...v, content, svg, shapes: v.shapes + b.blocks, repaired: (v.repaired || 0) + b.blocks };
}
// keep: how many times the picture was enlarged (the cut-out's fringe is up to 3 of the customer's own pixels deep)
// src: { rgb, W, H } the customer's own picture as it went into the enlarger (see detailCheck)
export async function vectorizeChecked({ rgb, ink, W, H, printCm, kind, keep = 4, src = null, ladder: own = null, maxRounds = REPAIR_ROUNDS, smoothRounds = SMOOTH_ROUNDS, log = () => {} }) {
  const ladder = own || (kind === "drawn" ? ART_LADDER : PHOTO_LADDER); // (own: for tests)
  const band = Math.max(2, Math.round(FRINGE * keep));
  const rimMm = (band / W) * printCm * 10 + 0.1; // the check leaves that band alone
  const wide = Math.max(1, Math.round((WIDE_MM * W) / (printCm * 10))); // (px: see wideOutside)
  let best = null, fine = null;
  for (let i = 0; i < ladder.length; i++) {
    log(`Making vector shapes (try ${i + 1} of ${ladder.length})…`);
    let v = await vectorizeArt({ rgb, ink, W, H, ...ladder[i], band, wide, src, keep, printCm, log });
    let c, rounds = 0;
    for (;;) {
      log(`Checking every detail at the print size (try ${i + 1}${rounds ? `, after repair ${rounds}` : ""})…`);
      c = await detailCheck({ svg: v.svg, rgb, ink, W, H, printCm, src, rimMm, wideMm: WIDE_MM, wantMask: true, log });
      if (c.ok || rounds >= maxRounds) break;
      // Repairs are for a few spots. Shapes that miss more than that are simply not right for this picture (a photo,
      // a soft painting): no patching — the next try, or the sharp picture.
      if (c.matchPct < (i === ladder.length - 1 ? LAST_REPAIR_MIN_MATCH : REPAIR_MIN_MATCH)) { log(`Only ${c.matchPct}% of the picture is matched by the shapes — too much to repair`); break; }
      // the blocks come from a fine colour map of the picture as it is (no edge-cleaning, no joined colours)
      if (!fine) fine = (await vectorizeArt({ rgb, ink, W, H, colours: REPAIR_COLOURS, crisp: REPAIR_CRISP, src, mapOnly: true })).st;
      // smooth shapes first; what they still miss, as exact blocks
      const smoothRound = rounds < smoothRounds;
      const b = smoothRound ? smoothPatches(fine, c, W, H, `fix${i}-${rounds}`, rounds === 0) : exactBlocks(fine, c, W, H, `fix${i}-${rounds}`);
      if (!b.blocks) break;
      log(`Repair ${rounds + 1}: the ${c.lost} missed spot${c.lost === 1 ? "" : "s"} drawn again as ${b.blocks} ${smoothRound ? "smooth vector shapes" : "exact vector blocks"} (${(b.px / 1000).toFixed(0)} thousand pixels of the picture)…`);
      v = addOnTop(v, b);
      rounds++;
    }
    const check = { ok: c.ok, lost: c.lost, biggestMm2: c.biggestMm2, matchPct: c.matchPct, level: i + 1, repairs: rounds, checkedAt: new Date().toISOString() };
    const { st, ...kept } = v; // (the colour map is big: not kept)
    if (!best || c.lost < best.check.lost) best = { v: kept, check };
    if (c.ok) break;
  }
  return best;
}
