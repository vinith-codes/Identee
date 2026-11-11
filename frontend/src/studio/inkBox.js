// studio/inkBox.js: where the ink really is inside a print area (9 Nov 2026).
// The job card measured TOP to the top of each picture's frame. A picture with empty space around its art (the JCB on
// VF-2026-0076 had 5 cm of nothing above it) then gave a TOP 5 cm higher than the print the presser holds, who lines
// up what they can see. So the placement is measured on the drawn print itself: the box around every pixel with ink.

// rgba: the area drawn small (RGBA bytes, W x H). Returns the ink's box in % of the area { x0, y0, x1, y1 }, grown by
// one pixel each side (a pixel at this size is about 0.5 mm, and the edge must never be cut), or null with no ink.
// thr: how solid a pixel must be to count. Low on purpose: the print's edge is at half see-through, and a thin line
// drawn this small comes out fainter than it prints, so a slightly bigger box is safer than a smaller one.
export function alphaBox(rgba, W, H, thr = 40) {
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    const row = y * W * 4;
    for (let x = 0; x < W; x++) {
      if (rgba[row + x * 4 + 3] < thr) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  const c = (v) => Math.round(Math.max(0, Math.min(100, v)) * 100) / 100;
  return { x0: c(((x0 - 1) / W) * 100), y0: c(((y0 - 1) / H) * 100), x1: c(((x1 + 2) / W) * 100), y1: c(((y1 + 2) / H) * 100) };
}

// The ink box, but never outside the frames' box (artworkBox): a stray mark can't make it bigger than the artwork.
export function insideFrame(ink, frame) {
  if (!ink) return frame;
  if (!frame) return ink;
  const b = { x0: Math.max(ink.x0, frame.x0), y0: Math.max(ink.y0, frame.y0), x1: Math.min(ink.x1, frame.x1), y1: Math.min(ink.y1, frame.y1) };
  return b.x1 > b.x0 && b.y1 > b.y0 ? b : frame;
}
