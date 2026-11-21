// splitParts.js (21 Nov 2026) — a laid-out side of a tee (a chest logo, brush strokes down the side, a line of words,
// a small tag above the hem), drawn as ONE see-through picture for the whole print area, cut into its separate parts
// by the empty space between them. Each part is then its own print in a free place on the tee ("print anywhere"):
// smaller transfers, and the customer can move, resize or remove each one.
//
// Nothing is redrawn and nothing is made smaller: each part is cut straight out of the 4K picture, so it keeps every
// pixel it had. Parts closer than `gapCm` stay together (they would be pressed as one transfer anyway).
import sharp from "sharp";

const INK_ALPHA = 16; // a pixel at least this opaque is part of the print
const GRID = 1024; // the parts are found on a grid about this many cells on the long side (fast; a cell is ~4 px of 4K)
const MAX_PIECES = 4000; // more separate bits than this is noise or a texture: keep the picture whole
const SPECK_CM = 0.4; // a lone bit smaller than this, far from every part, is AI noise (a stray dot of the background)
const SPECK_SHARE = 0.0002; // ... and less than this share of all the ink

/**
 * The parts of a laid-out picture.
 * @param buffer  a see-through PNG (the cut-out), its edges = the print area's edges
 * @param opts    { widthCm: the print area's width (to turn cm into pixels), gapCm: parts closer than this stay one,
 *                  maxParts: more parts than this → the gap is widened until they fit, else null }
 * @returns { parts: [{ buffer, mime, width, height, x, y, w, h }], dropped } with x / y / w / h as fractions of the
 *          picture (0–1), in reading order (top to bottom, then left to right); null when it is one part (or can't be
 *          split cleanly) — then the picture is used whole.
 */
export async function splitParts(buffer, { widthCm = 35, gapCm = 2.5, maxParts = 8 } = {}) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const ch = info.channels;
  const f = Math.max(1, Math.ceil(Math.max(W, H) / GRID));
  const gw = Math.ceil(W / f);
  const gh = Math.ceil(H / f);
  // ink per grid cell
  const ink = new Uint32Array(gw * gh);
  let total = 0;
  for (let y = 0; y < H; y++) {
    const row = Math.floor(y / f) * gw;
    for (let x = 0; x < W; x++) {
      if (data[(y * W + x) * ch + 3] >= INK_ALPHA) {
        ink[row + Math.floor(x / f)]++;
        total++;
      }
    }
  }
  if (!total) return null;
  // the separate bits (8-connected cells with ink)
  const label = new Int32Array(gw * gh).fill(-1);
  const bits = [];
  const stack = [];
  for (let i = 0; i < ink.length; i++) {
    if (!ink[i] || label[i] !== -1) continue;
    if (bits.length >= MAX_PIECES) return null;
    const b = { x0: gw, y0: gh, x1: -1, y1: -1, ink: 0 };
    label[i] = bits.length;
    stack.push(i);
    while (stack.length) {
      const j = stack.pop();
      const cx = j % gw;
      const cy = (j - cx) / gw;
      b.ink += ink[j];
      if (cx < b.x0) b.x0 = cx;
      if (cx > b.x1) b.x1 = cx;
      if (cy < b.y0) b.y0 = cy;
      if (cy > b.y1) b.y1 = cy;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = cy + dy;
        if (ny < 0 || ny >= gh) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          if (nx < 0 || nx >= gw) continue;
          const k = ny * gw + nx;
          if (ink[k] && label[k] === -1) {
            label[k] = bits.length;
            stack.push(k);
          }
        }
      }
    }
    bits.push(b);
  }
  const cellsPerCm = W / widthCm / f;
  const speck = SPECK_CM * cellsPerCm;
  let groups = null;
  let dropped = 0;
  for (let gap = gapCm; gap <= gapCm * 4; gap *= 1.5) {
    const merged = mergeNear(bits, Math.ceil(gap * cellsPerCm));
    // lone specks of noise go (they would each become a print of their own)
    const kept = merged.filter((g) => !(g.x1 - g.x0 + 1 < speck && g.y1 - g.y0 + 1 < speck && g.ink < total * SPECK_SHARE));
    if (kept.length <= maxParts) {
      groups = kept;
      dropped = merged.length - kept.length;
      break;
    }
  }
  if (!groups || groups.length < 2) return null;
  groups.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const pad = 2; // px of clear edge round each part
  const parts = await Promise.all(
    groups.map(async (g) => {
      // the part's exact edges, to the pixel, inside its cells
      let x0 = W;
      let y0 = H;
      let x1 = -1;
      let y1 = -1;
      for (let y = g.y0 * f; y < Math.min(H, (g.y1 + 1) * f); y++)
        for (let x = g.x0 * f; x < Math.min(W, (g.x1 + 1) * f); x++)
          if (data[(y * W + x) * ch + 3] >= INK_ALPHA) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
      const left = Math.max(0, x0 - pad);
      const top = Math.max(0, y0 - pad);
      const width = Math.min(W, x1 + 1 + pad) - left;
      const height = Math.min(H, y1 + 1 + pad) - top;
      const out = await sharp(data, { raw: { width: W, height: H, channels: ch } })
        .extract({ left, top, width, height })
        .png({ compressionLevel: 9 })
        .toBuffer();
      return { buffer: out, mime: "image/png", width, height, x: left / W, y: top / H, w: width / W, h: height / H };
    }),
  );
  return { parts, dropped };
}

// Bits whose boxes come within `gap` cells of each other become one part (again and again, until none do).
export function mergeNear(bits, gap) {
  let list = bits.map((b) => ({ ...b }));
  let changed = true;
  while (changed) {
    changed = false;
    const next = [];
    for (const b of list) {
      const hit = next.find((g) => b.x0 <= g.x1 + gap && g.x0 <= b.x1 + gap && b.y0 <= g.y1 + gap && g.y0 <= b.y1 + gap);
      if (hit) {
        hit.x0 = Math.min(hit.x0, b.x0);
        hit.y0 = Math.min(hit.y0, b.y0);
        hit.x1 = Math.max(hit.x1, b.x1);
        hit.y1 = Math.max(hit.y1, b.y1);
        hit.ink += b.ink;
        changed = true;
      } else next.push(b);
    }
    list = next;
  }
  return list;
}
