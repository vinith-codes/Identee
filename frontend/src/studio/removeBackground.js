// studio/removeBackground.js
//
// Removes a picture's background — free (no paid service). Two ways, picked automatically:
//  1. Plain background (logos, drawings on white or one flat colour): cleared here in the browser, starting from
//     the picture's edges. Exact and instant.
//  2. Photos: { needsServer: true } — the caller asks the server (POST /api/ai/remove-background), which runs the
//     ORMBG model (Apache-2.0). It used to run here in the browser, but on iPhones the model (~44 MB) and the 3D
//     tee used more memory than Safari allows a page, and Safari reloaded the page.
//
// Not used on purpose: @imgly/background-removal and IS-Net (AGPL licences),
// RMBG-1.4 (non-commercial licence).

const MAX_SIDE = 2000; // bigger pictures are scaled down first (keeps the PNG well under the 10 MB upload limit)

const dist = (d, i, c) => Math.abs(d[i] - c[0]) + Math.abs(d[i + 1] - c[1]) + Math.abs(d[i + 2] - c[2]);

function toCanvas(img) {
  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;
  const k = Math.min(1, MAX_SIDE / Math.max(w0, h0));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w0 * k));
  canvas.height = Math.max(1, Math.round(h0 * k));
  canvas.getContext("2d", { willReadFrequently: true }).drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// The picture's edge: is it one flat colour, or already see-through?
function readEdge(data, w, h) {
  const idx = [];
  for (let x = 0; x < w; x++) idx.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) idx.push(y * w, y * w + w - 1);
  let clear = 0;
  const r = [];
  const g = [];
  const b = [];
  for (const p of idx) {
    const i = p * 4;
    if (data[i + 3] < 16) clear++;
    else {
      r.push(data[i]);
      g.push(data[i + 1]);
      b.push(data[i + 2]);
    }
  }
  if (clear > idx.length * 0.6) return { transparent: true };
  const mid = (a) => a.sort((x, y) => x - y)[a.length >> 1];
  const colour = [mid(r), mid(g), mid(b)];
  let close = 0;
  for (const p of idx) if (data[p * 4 + 3] < 16 || dist(data, p * 4, colour) < 36) close++;
  return { flat: close > idx.length * 0.94, colour, idx };
}

// 1. Clear a flat background colour: everything connected to the edges, plus
// closed-in spots of exactly that colour (the holes in letters like O and A).
function clearFlatColour(image, colour, edge) {
  const { data, width: w, height: h } = image;
  const NEAR = 44; // counts as background
  const SOFT = 96; // edge pixels between NEAR and SOFT fade out (smooth outline)
  const orig = new Uint8ClampedArray(data);
  const gone = new Uint8Array(w * h);
  const stack = [];
  const push = (p) => {
    if (!gone[p] && (data[p * 4 + 3] < 16 || dist(data, p * 4, colour) < NEAR)) {
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
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (gone[p] || dist(data, i, colour) < 14) {
      data[i + 3] = 0;
      continue;
    }
    // soften the outline: a kept pixel that touches the cleared area and is close to the background colour
    const x = p % w;
    const touches = (x > 0 && gone[p - 1]) || (x < w - 1 && gone[p + 1]) || (p >= w && gone[p - w]) || (p < w * (h - 1) && gone[p + w]);
    if (touches) {
      const d = dist(data, i, colour);
      if (d < SOFT) data[i + 3] = Math.round((data[i + 3] * (d - NEAR)) / (SOFT - NEAR));
    }
  }
  edgeCoverage(data, orig, w, h, gone, colour);
  padClearPixels(data, w, h);
}

// (the same as server/services/cutoutService.js) The see-through pixels around the artwork keep a colour too, and anything that enlarges the picture (the print
// file's upscaler, a browser drawing it bigger) blends that colour into the edge. Left as the background colour it
// put a magenta rim on the print; the rings next to the artwork take the artwork's colour instead (still see-through).
function padClearPixels(data, w, h, RINGS = 3) {
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

// (the same as server/services/cutoutService.js) The outline's pixels are part artwork, part background (the AI's smoothing of its lines). Each one gets the
// see-through of its own mix: it is matched with the purest artwork colour close by (F), its alpha is how far it sits
// from the background colour (K) towards F, and it takes F's colour. Without this the outline was all-or-nothing, and
// the print file's vector cut line followed every pixel step (8 Nov 2026: the JCB's edge zigzagged when the print
// team zoomed in; with it the cut line is one smooth, sharp curve). bg = the cleared pixels the edge is measured from.
function edgeCoverage(data, orig, w, h, bg, K, REACH = 1, LOOK = 3) {
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

/**
 * @param {HTMLImageElement} img  a loaded picture (CORS-safe)
 * @param {(text: string) => void} onStage  progress messages for the customer
 * @param {{ flatOnly?: boolean }} opts    flatOnly: only clear a plain background (never load the AI model)
 * @returns {Promise<{ blob: Blob, width: number, height: number, method: "colour" } | { already: true } | { needsServer: true }>}
 */
export async function removeBackground(img, onStage, { flatOnly = false } = {}) {
  const canvas = toCanvas(img);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const edge = readEdge(image.data, canvas.width, canvas.height);
  if (edge.transparent) return { already: true };

  let method = "colour";
  if (edge.flat) clearFlatColour(image, edge.colour, edge.idx);
  else if (flatOnly) return { already: true }; // (AI-made designs: no plain background to clear, use the picture as it is)
  else return { needsServer: true }; // a photo: the server's model does it
  ctx.putImageData(image, 0, 0);
  const blob = await new Promise((done) => canvas.toBlob(done, "image/png"));
  if (!blob) throw new Error("Could not make the picture");
  return { blob, width: canvas.width, height: canvas.height, method };
}
