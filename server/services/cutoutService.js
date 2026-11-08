// services/cutoutService.js
//
// Cuts an AI-made design out of its plain background, on the server, right
// after the picture is made. (The AI is asked for a flat white or black
// background for exactly this.) Doing it here means "Add to tee" in the
// Design Room is instant: the browser no longer has to download the picture,
// clear the background and upload the result every time.
//
// Same method as the browser's remover for plain backgrounds
// (frontend/src/studio/removeBackground.js): the background colour is cleared
// starting from the picture's edges, plus closed-in spots of exactly that
// colour, and the outline is softened.
import sharp from "sharp";

const NEAR = 44; // counts as background
const SOFT = 96; // edge pixels between NEAR and SOFT fade out
const EXACT = 14; // closed-in spots this close to the background colour go too

const dist = (d, i, c) => Math.abs(d[i] - c[0]) + Math.abs(d[i + 1] - c[1]) + Math.abs(d[i + 2] - c[2]);

/**
 * @param {Buffer} buffer  the picture as the AI returned it
 * @returns {Promise<{ buffer: Buffer, mime: string, width: number, height: number, cut: boolean }>}
 *          cut = false when the background was not plain (the picture is returned unchanged)
 */
export async function cutOutPlainBackground(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const unchanged = async () => ({ buffer, mime: `image/${(await sharp(buffer).metadata()).format === "png" ? "png" : "jpeg"}`, width: w, height: h, cut: false });

  // the picture's edge: is it one flat colour?
  const edge = [];
  for (let x = 0; x < w; x++) edge.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) edge.push(y * w, y * w + w - 1);
  const mid = (k) => edge.map((p) => data[p * 4 + k]).sort((a, b) => a - b)[edge.length >> 1];
  const colour = [mid(0), mid(1), mid(2)];
  const close = edge.filter((p) => dist(data, p * 4, colour) < 36).length;
  if (close < edge.length * 0.94) return unchanged();

  // everything connected to the edges in the background colour
  const gone = new Uint8Array(w * h);
  const stack = [];
  const push = (p) => {
    if (!gone[p] && dist(data, p * 4, colour) < NEAR) {
      gone[p] = 1;
      stack.push(p);
    }
  };
  edge.forEach(push);
  while (stack.length) {
    const p = stack.pop();
    const x = p % w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < w * (h - 1)) push(p + w);
  }
  // closed-in spots of the background colour (the hole between a JCB's arms, the inside of an O): on a white or
  // black background only an exact match goes (white highlights inside a drawing must stay); on the magenta
  // "green screen" (8 Nov 2026) nothing in a drawing is near magenta, so the usual nearness applies — JPEG shifts
  // magenta more than white, and an exact match missed a whole hole
  const keyColour = Math.max(...colour) - Math.min(...colour) > 120;
  // the edge is measured from the outside background; on the key colour from the closed-in holes too (on white or
  // black a closed-in exact match may be a highlight of the drawing, so its rim is left as it is)
  const edgeFrom = keyColour ? gone : Uint8Array.from(gone);
  const enclosed = keyColour ? NEAR : EXACT;
  // on the key colour, a sliver blended with it (between a bucket's teeth, inside a letter) is background too:
  // the key's hue, strongly — nothing a drawing uses, by the instruction the AI gets
  const lowCh = colour.indexOf(Math.min(...colour));
  const hi = [0, 1, 2].filter((k) => k !== lowCh);
  const keyHue = (i) => data[i + hi[0]] > data[i + lowCh] + 90 && data[i + hi[1]] > data[i + lowCh] + 90 && (data[i + hi[0]] + data[i + hi[1]]) / 2 > 80;
  for (let p = 0; p < w * h; p++) if (!gone[p] && (dist(data, p * 4, colour) < enclosed || (keyColour && keyHue(p * 4)))) gone[p] = 1;
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (gone[p]) {
      data[i + 3] = 0;
      continue;
    }
    const x = p % w;
    const touches = (x > 0 && gone[p - 1]) || (x < w - 1 && gone[p + 1]) || (p >= w && gone[p - w]) || (p < w * (h - 1) && gone[p + w]);
    if (touches) {
      const d = dist(data, i, colour);
      if (d < SOFT) data[i + 3] = Math.round((255 * (d - NEAR)) / (SOFT - NEAR));
    }
  }
  const orig = Buffer.from(data);
  defringe(data, w, h, gone, colour);
  edgeCoverage(data, orig, w, h, edgeFrom, colour);
  padClearPixels(data, w, h);
  const png = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
  return { buffer: png, mime: "image/png", width: w, height: h, cut: true };
}

// The outline's own pixels are blended with the background colour by the AI's anti-aliasing and JPEG ringing (a
// magenta-tinted rim on a dark line is easy to see on a tee, 8 Nov 2026). The pixels along the cleared background take
// their colour from the pixels just inside them, ring by ring from the inside out: the two outer rings always, the
// next four only where the pixel is still tinted with the background colour (JPEG colour blur reaches 4-5 px in). Their see-through (alpha) stays as set.
const RINGS = 6;
function defringe(data, w, h, gone, colour) {
  const ring = new Uint8Array(w * h); // 1 = next to the background … RINGS = furthest in; 0 = deeper inside
  const each4 = (p, f) => {
    const x = p % w;
    if (x > 0) f(p - 1);
    if (x < w - 1) f(p + 1);
    if (p >= w) f(p - w);
    if (p < w * (h - 1)) f(p + w);
  };
  let edge = [];
  for (let p = 0; p < w * h; p++) if (gone[p]) edge.push(p);
  for (let r = 1; r <= RINGS; r++) {
    const next = [];
    for (const p of edge) each4(p, (q) => { if (!gone[q] && !ring[q]) { ring[q] = r; next.push(q); } });
    edge = next;
  }
  // tinted: closer to the background colour in hue than any real ink (magenta: more red and blue than green)
  const tinted = (i) => {
    const [r, g, b] = colour;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    if (sat < 60) return false; // a grey/white/black key: nothing to judge by, the two sure rings are enough
    const low = r <= g && r <= b ? 0 : g <= r && g <= b ? 1 : 2; // the key's weakest channel
    const others = [0, 1, 2].filter((k) => k !== low);
    return data[i + others[0]] > data[i + low] + 20 && data[i + others[1]] > data[i + low] + 20;
  };
  const src = Buffer.from(data);
  for (let r = RINGS; r >= 1; r--) {
    for (let p = 0; p < w * h; p++) {
      if (ring[p] !== r) continue;
      if (r > 2 && !tinted(p * 4)) continue;
      let cr = 0, cg = 0, cb = 0, n = 0;
      each4(p, (q) => {
        if (gone[q] || (ring[q] && ring[q] <= r)) return; // only from further inside
        cr += src[q * 4]; cg += src[q * 4 + 1]; cb += src[q * 4 + 2]; n++;
      });
      if (!n) continue;
      data[p * 4] = Math.round(cr / n); data[p * 4 + 1] = Math.round(cg / n); data[p * 4 + 2] = Math.round(cb / n);
    }
    src.set(data);
  }
}

// The outline's pixels are part artwork, part background (the AI's smoothing of its lines). Each one gets the
// see-through of its own mix: it is matched with the purest artwork colour close by (F), its alpha is how far it sits
// from the background colour (K) towards F, and it takes F's colour. Without this the outline was all-or-nothing, and
// the print file's vector cut line followed every pixel step (8 Nov 2026: the JCB's edge zigzagged when the print
// team zoomed in; with it the cut line is one smooth, sharp curve). bg = the cleared pixels the edge is measured from.
export function edgeCoverage(data, orig, w, h, bg, K, REACH = 1, LOOK = 3) {
  const zone = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    if (!bg[p]) continue;
    const x = p % w, y = (p / w) | 0;
    if (!((x > 0 && !bg[p - 1]) || (x < w - 1 && !bg[p + 1]) || (y > 0 && !bg[p - w]) || (y < h - 1 && !bg[p + w]))) continue;
    for (let Y = Math.max(0, y - REACH); Y <= Math.min(h - 1, y + REACH); Y++)
      for (let X = Math.max(0, x - REACH); X <= Math.min(w - 1, x + REACH); X++) zone[Y * w + X] = 1;
  }
  // on a coloured key (magenta) a thin line can be half magenta all through, so the colour an edge pixel takes has the
  // key's tint taken out (for magenta: red and blue both above green by the same amount is magenta, not artwork)
  const lowK = K.indexOf(Math.min(...K));
  const hiK = [0, 1, 2].filter((k) => k !== lowK);
  const keyTint = Math.max(...K) - Math.min(...K) >= 60;
  for (let p = 0; p < w * h; p++) {
    if (!zone[p]) continue; // (cleared pixels too: on magenta, a pixel that is mostly background was cleared whole)
    const i = p * 4;
    const x = p % w, y = (p / w) | 0;
    const p0 = orig[i] - K[0], p1 = orig[i + 1] - K[1], p2 = orig[i + 2] - K[2];
    const pp = p0 * p0 + p1 * p1 + p2 * p2;
    const tol = Math.max(900, 0.04 * pp); // how far off the straight mix a pixel may sit (JPEG noise)
    let best = -1, bestA = 1, bestFF = 0;
    for (let Y = Math.max(0, y - LOOK); Y <= Math.min(h - 1, y + LOOK); Y++) {
      for (let X = Math.max(0, x - LOOK); X <= Math.min(w - 1, x + LOOK); X++) {
        const q = Y * w + X;
        if (q === p || bg[q]) continue;
        const j = q * 4;
        const f0 = orig[j] - K[0], f1 = orig[j + 1] - K[1], f2 = orig[j + 2] - K[2];
        const ff = f0 * f0 + f1 * f1 + f2 * f2;
        if (ff < 3600 || ff < pp) continue; // only purer artwork than this pixel, and clearly not background
        const a = Math.max(0, Math.min(1, (p0 * f0 + p1 * f1 + p2 * f2) / ff));
        const r0 = p0 - a * f0, r1 = p1 - a * f1, r2 = p2 - a * f2;
        // of the colours this pixel is a mix of, the purest: a neighbour that is itself half background would leave
        // the edge too solid
        if (r0 * r0 + r1 * r1 + r2 * r2 <= tol && ff > bestFF) { best = j; bestA = a; bestFF = ff; }
      }
    }
    // no colour explains it as a mix (a thin line of another ink): left as it is
    if (best < 0) continue;
    if (bg[p]) {
      if (bestA < 0.06) continue; // background, apart from noise
      data[i + 3] = Math.round(255 * bestA);
    } else data[i + 3] = Math.min(data[i + 3], Math.round(255 * bestA));
    // its colour: that artwork colour as cleaned of the background tint (by defringe, on the server)
    if (bestA < 0.98) { data[i] = data[best]; data[i + 1] = data[best + 1]; data[i + 2] = data[best + 2]; }
    if (keyTint) {
      const spill = Math.min(data[i + hiK[0]], data[i + hiK[1]]) - data[i + lowK];
      if (spill > 0) { data[i + hiK[0]] -= spill; data[i + hiK[1]] -= spill; }
    }
  }
}

// The see-through pixels around the artwork keep a colour too, and anything that enlarges the picture (the print
// file's upscaler, a browser drawing it bigger) blends that colour into the edge. Left as the background colour it
// put a magenta rim on the print; the rings next to the artwork take the artwork's colour instead (still see-through).
export function padClearPixels(data, w, h, RINGS = 3) {
  const has = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) if (data[p * 4 + 3] > 0) has[p] = 1;
  for (let r = 0; r < RINGS; r++) {
    const next = [];
    for (let p = 0; p < w * h; p++) {
      if (has[p]) continue;
      const x = p % w;
      let cr = 0, cg = 0, cb = 0, n = 0;
      const take = (q) => { if (has[q]) { cr += data[q * 4]; cg += data[q * 4 + 1]; cb += data[q * 4 + 2]; n++; } };
      if (x > 0) take(p - 1);
      if (x < w - 1) take(p + 1);
      if (p >= w) take(p - w);
      if (p < w * (h - 1)) take(p + w);
      if (n) next.push(p, Math.round(cr / n), Math.round(cg / n), Math.round(cb / n));
    }
    for (let k = 0; k < next.length; k += 4) {
      const i = next[k] * 4;
      data[i] = next[k + 1]; data[i + 1] = next[k + 2]; data[i + 2] = next[k + 3];
      has[next[k]] = 1;
    }
  }
}

/**
 * Cuts the see-through edges off a cut-out, so the picture is just the artwork (8 Nov 2026: Grok drew a concept's
 * front as a wide picture with the heroes in the middle; the Design Room sizes a picture by its whole frame, so the
 * empty sides filled the print area and "make it bigger" could hardly grow the heroes).
 * @param {{ buffer: Buffer, mime: string, width: number, height: number, cut: boolean }} c  what cutOutPlainBackground returned
 * @returns the same shape; unchanged when the picture was not cut out, or when nothing could be trimmed
 */
// A picture cut out BEFORE 8 Nov 2026 (or by any tool with a hard edge) has its outline pixels fully solid but mixed
// with the old background — on an AI design cut from white, a light rim of half-white pixels, which the print recipe
// then prints as solid ink: a dotted light edge (VF-2026-0024, the print team's phone zoom, 8 Nov 2026). Prepare for
// print cleans it the same way the cut-out now does (edgeCoverage): the background colour is read from the removed
// pixels around the artwork, and each outline pixel keeps only its artwork share — the artwork's colour, the rest
// see-through. Only when the removed area is one plain colour (a cut-out); otherwise the picture is left as it is.
// rgba: raw RGBA (changed in place). Returns { key: [r, g, b], pixels } of what was cleaned, or null.
export function cleanCutEdge(rgba, w, h) {
  const bg = new Uint8Array(w * h);
  let nBg = 0;
  for (let p = 0; p < w * h; p++) if (rgba[p * 4 + 3] <= 8) { bg[p] = 1; nBg++; }
  if (!nBg || nBg === w * h) return null;
  // the removed pixels that touch the artwork: what colour was the background?
  const ring = [[], [], []];
  for (let p = 0; p < w * h; p++) {
    if (!bg[p]) continue;
    const x = p % w;
    if ((x > 0 && !bg[p - 1]) || (x < w - 1 && !bg[p + 1]) || (p >= w && !bg[p - w]) || (p < w * (h - 1) && !bg[p + w])) for (let c = 0; c < 3; c++) ring[c].push(rgba[p * 4 + c]);
  }
  const n = ring[0].length;
  if (n < 20) return null;
  const K = ring.map((v) => Float64Array.from(v).sort()[v.length >> 1]);
  let same = 0;
  for (let k = 0; k < n; k++) if (Math.max(Math.abs(ring[0][k] - K[0]), Math.abs(ring[1][k] - K[1]), Math.abs(ring[2][k] - K[2])) <= 24) same++;
  if (same < 0.9 * n) return null; // not one plain colour: a picture with a proper soft edge, or no cut-out
  const orig = Buffer.from(rgba);
  edgeCoverage(rgba, orig, w, h, bg, K);
  let pixels = 0;
  for (let p = 0; p < w * h; p++) if (rgba[p * 4 + 3] !== orig[p * 4 + 3] || rgba[p * 4] !== orig[p * 4]) pixels++;
  return { key: K, pixels };
}

export async function trimClearEdges(c) {
  if (!c?.cut) return c;
  try {
    const t = await sharp(c.buffer).trim({ threshold: 8 }).png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
    if (!t.info.width || !t.info.height || (t.info.width === c.width && t.info.height === c.height)) return c;
    return { ...c, buffer: t.data, width: t.info.width, height: t.info.height };
  } catch {
    return c; // an all-clear picture, or an odd one: keep it as it was
  }
}

// A cut-out put back on a plain background, for sending to the AI to be changed: the "green screen" colour the AI
// draws on (8 Nov 2026 — before, white or black, which also cleared white or black parts of the drawing afterwards).
export const KEY_BACKGROUND = "#FF00FF";
export const onPlainBackground = (buffer) =>
  sharp(buffer)
    .flatten({ background: KEY_BACKGROUND })
    .jpeg({ quality: 92 })
    .toBuffer();
