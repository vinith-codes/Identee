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
  defringe(data, w, h, gone, colour);
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

/**
 * Cuts the see-through edges off a cut-out, so the picture is just the artwork (8 Nov 2026: Grok drew a concept's
 * front as a wide picture with the heroes in the middle; the Design Room sizes a picture by its whole frame, so the
 * empty sides filled the print area and "make it bigger" could hardly grow the heroes).
 * @param {{ buffer: Buffer, mime: string, width: number, height: number, cut: boolean }} c  what cutOutPlainBackground returned
 * @returns the same shape; unchanged when the picture was not cut out, or when nothing could be trimmed
 */
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
