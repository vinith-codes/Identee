// studio/halftone.js
//
// A printer can't print "half see-through". Where a background was removed the picture can keep soft, partly
// see-through parts (a fade, a glow, a shadow), and the printer's software then turns them into rough speckles.
// So a print file is cleaned as its last step: every pixel ends up fully solid or fully clear.
//   - a wide soft part becomes even dots (a halftone): 35 lines per inch at 45°, the classic screen at 300 DPI.
//     Half see-through = half of the area covered in dots, and the tee shows between them.
//   - a thin soft edge (a picture's or a letter's outline) is simply cut at half, so outlines stay clean, not dotted.
// Only the print files get this: what the customer sees on screen doesn't change. The colours aren't touched.

const TILE = 12; // px: two dots per tile, 12/√2 ≈ 8.5 px apart = 35 lines per inch at 300 DPI
const CLEAR_BELOW = 13; // almost clear (faint halo around a cut-out) goes clear
const SOLID_FROM = 243; // almost solid goes solid
const WIDE = 16; // px (1.4 mm): a soft part narrower than this, across or down, is an edge and gets no dots

// Each pixel's dot threshold: the dots grow from their centres, and ranking the pixels (rather than using the spot's
// own value) makes the covered area exactly follow the see-through amount.
const THRESHOLDS = (() => {
  const spots = [];
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const a = (2 * Math.PI * (x + 0.5 + y + 0.5)) / TILE;
      const b = (2 * Math.PI * (x - y)) / TILE;
      spots.push({ p: y * TILE + x, spot: Math.cos(a) + Math.cos(b) });
    }
  }
  spots.sort((m, n) => n.spot - m.spot || m.p - n.p);
  const out = new Uint8Array(TILE * TILE);
  spots.forEach((s, rank) => {
    out[s.p] = Math.round(((rank + 0.5) / spots.length) * 255);
  });
  return out;
})();

/**
 * Changes only the alpha values of RGBA pixels, in place.
 * @returns {{ dots: number, edges: number }} how many pixels became halftone and how many were a thin edge
 */
export function halftoneAlpha(data, W, H) {
  const SOFT = 1;
  const LONG_ACROSS = 2;
  const LONG_DOWN = 4;
  let soft = null;
  for (let p = 0, i = 3; p < W * H; p++, i += 4) {
    const a = data[i];
    if (a === 0 || a === 255) continue;
    if (a < CLEAR_BELOW) data[i] = 0;
    else if (a >= SOLID_FROM) data[i] = 255;
    else (soft ||= new Uint8Array(W * H))[p] = SOFT;
  }
  if (!soft) return { dots: 0, edges: 0 }; // nothing soft in this print (most text-only prints)

  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; ) {
      if (!soft[row + x]) {
        x++;
        continue;
      }
      let end = x;
      while (end < W && soft[row + end]) end++;
      if (end - x >= WIDE) for (let k = x; k < end; k++) soft[row + k] |= LONG_ACROSS;
      x = end;
    }
  }
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; ) {
      if (!soft[y * W + x]) {
        y++;
        continue;
      }
      let end = y;
      while (end < H && soft[end * W + x]) end++;
      if (end - y >= WIDE) for (let k = y; k < end; k++) soft[k * W + x] |= LONG_DOWN;
      y = end;
    }
  }

  let dots = 0;
  let edges = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (!soft[p]) continue;
      const i = p * 4 + 3;
      if (soft[p] & LONG_ACROSS && soft[p] & LONG_DOWN) {
        data[i] = data[i] > THRESHOLDS[(y % TILE) * TILE + (x % TILE)] ? 255 : 0;
        dots++;
      } else {
        data[i] = data[i] >= 128 ? 255 : 0;
        edges++;
      }
    }
  }
  return { dots, edges };
}

// The same on a finished print's canvas
export function halftoneCanvas(canvas) {
  const g = canvas.getContext("2d");
  const pixels = g.getImageData(0, 0, canvas.width, canvas.height);
  const made = halftoneAlpha(pixels.data, canvas.width, canvas.height);
  if (made.dots || made.edges) g.putImageData(pixels, 0, 0);
  return made;
}
