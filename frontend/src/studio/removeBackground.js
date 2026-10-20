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
