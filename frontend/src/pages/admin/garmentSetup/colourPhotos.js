// pages/admin/garmentSetup/colourPhotos.js
//
// "Make colour photos" (wizard step 4): every colour's front / back / side photos from ONE white garment photo,
// in the admin's browser. The same method as server/scripts/garment-images/build_regular.py:
//   1. the photo is cut out (studio/removeBackground — free, in the browser),
//   2. sized to the size chart: the garment's top (highest shoulder point) and hem are found, the photo is widened
//      or narrowed so chest ÷ length = the chart's size M (flat chest ÷ length), and scaled so top → hem fills
//      LEN_PX on an 800 × 1000 canvas starting at TOP_Y (27.3% / 87.4% for a tee: the "photo ruler"),
//   3. recoloured: the photo's light and shadow are kept, only the fabric colour changes (a hanger stays natural).
export const CW = 800;
export const CH = 1000;
const BG = [241, 240, 236];
const TEE = { top: 273, len: 601 }; // shoulder top / length on the canvas, as the existing photos
const MAX_BODY_W = 560; // a wide, short garment (a crop) is drawn smaller so it fits the canvas
const CHEST_ROW = 0.55; // where the body width is measured (fraction of top → hem), below the sleeves

export const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That picture couldn't be opened."));
    img.src = src;
  });

const canvasOf = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

// The cut-out photo (transparent background) as a canvas, at most 1600 px tall (enough for an 800 × 1000 result).
export async function cutOut(file, onStage) {
  const url = URL.createObjectURL(file);
  try {
    let img = await loadImage(url);
    const { removeBackground } = await import("../../../studio/removeBackground");
    const out = await removeBackground(img, onStage);
    if (!out.already) img = await loadImage(URL.createObjectURL(out.blob));
    const k = Math.min(1, 1600 / img.naturalHeight);
    const c = canvasOf(Math.round(img.naturalWidth * k), Math.round(img.naturalHeight * k));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Where the garment is in a cut-out: top / hem rows (the hanger's narrow rows are skipped), and whether a hanger is there.
export function measure(cut) {
  const { width: w, height: h } = cut;
  const a = cut.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const widths = new Array(h).fill(0);
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (a[(y * w + x) * 4 + 3] > 10) n++;
    widths[y] = n;
  }
  const max = Math.max(...widths);
  let top = widths.findIndex((n) => n > max * 0.25);
  let hem = h - 1;
  while (hem > top && widths[hem] <= max * 0.25) hem--;
  const above = widths.slice(0, Math.max(0, top)).some((n) => n > 2); // something narrow above the shoulders = a hanger
  if (top < 0) top = 0;
  return { top, hem, hanger: above, w, h };
}

// The body's width (in the cut-out's pixels) and centre at the chest row.
function chestAt(cut, top, hem) {
  const { width: w } = cut;
  const y = Math.round(top + (hem - top) * CHEST_ROW);
  const row = cut.getContext("2d", { willReadFrequently: true }).getImageData(0, y, w, 1).data;
  let l = -1;
  let r = -1;
  for (let x = 0; x < w; x++) if (row[x * 4 + 3] > 10) (l < 0 && (l = x), (r = x));
  return l < 0 ? { chest: w / 2, cx: w / 2 } : { chest: r - l, cx: (l + r) / 2 };
}

// Where the garment goes on the canvas for this chart: a tee's top/length, or smaller for a wide, short one.
export function canvasFit(chestFlatIn, lengthIn) {
  const ratio = chestFlatIn / lengthIn;
  const len = Math.min(TEE.len, Math.round(MAX_BODY_W / ratio));
  const top = len === TEE.len ? TEE.top : Math.round(500 - len / 2);
  return { top, len, ruler: { topPct: Math.round(top / 10 * 10) / 10, hemPct: Math.round((top + len) / 10 * 10) / 10 } };
}

/**
 * The cut-out placed on the 800 × 1000 canvas, sized to the chart (transparent background).
 * @param marks  { top, hem } rows in the cut-out (found by measure(), moved by the admin)
 * @param widthPct  extra width (100 = as the chart says)
 * @param keepWidth a side photo: only scaled to length, not widened
 */
export function place(cut, marks, chart, widthPct = 100, keepWidth = false) {
  const fit = canvasFit(chart.chestFlatIn, chart.lengthIn);
  const len = Math.max(10, marks.hem - marks.top);
  const s = fit.len / len;
  const { chest, cx } = chestAt(cut, marks.top, marks.hem);
  const sx = keepWidth ? 1 : ((chart.chestFlatIn / chart.lengthIn) / (chest / len)) * (widthPct / 100);
  const c = canvasOf(CW, CH);
  const g = c.getContext("2d");
  g.imageSmoothingQuality = "high";
  g.drawImage(cut, Math.round(CW / 2 - cx * sx * s), Math.round(fit.top - marks.top * s), cut.width * sx * s, cut.height * s);
  return c;
}

// The parts recolouring needs, worked out once per view: which pixels are fabric, and their light / shadow.
export function analyse(placed, { hanger = false } = {}) {
  const img = placed.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, CW, CH);
  const d = img.data;
  const n = CW * CH;
  const fabric = new Uint8Array(n);
  const lum = new Float32Array(n);
  const hist = new Uint32Array(256);
  const rowCount = new Uint32Array(CH);
  for (let i = 0; i < n; i++) {
    const r = d[i * 4] / 255;
    const gr = d[i * 4 + 1] / 255;
    const b = d[i * 4 + 2] / 255;
    const al = d[i * 4 + 3] / 255;
    const mx = Math.max(r, gr, b);
    const mn = Math.min(r, gr, b);
    const sat = mx > 0 ? (mx - mn) / mx : 0;
    lum[i] = 0.2126 * r + 0.7152 * gr + 0.0722 * b;
    if (al > 0.02 && sat < 0.12) {
      fabric[i] = 1;
      rowCount[(i / CW) | 0]++;
    }
  }
  // a hanger above the shirt keeps its own colours (only rows wide enough to be the shirt are fabric)
  if (hanger) {
    const first = rowCount.findIndex((c) => c > CW * 0.12);
    if (first > 0) fabric.fill(0, 0, first * CW);
  }
  for (let i = 0; i < n; i++) if (fabric[i]) hist[Math.min(255, (lum[i] * 255) | 0)]++;
  const total = hist.reduce((a, b) => a + b, 0);
  let acc = 0;
  let p97 = 255;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= total * 0.97) {
      p97 = v;
      break;
    }
  }
  const white = Math.max(1, p97) / 255;
  const shade = new Float32Array(n);
  for (let i = 0; i < n; i++) shade[i] = Math.min(1.15, lum[i] / white);
  return { img, fabric, shade };
}

const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(String(hex).slice(i, i + 2), 16) / 255);

/**
 * One colour of one view, on the shop's light background (canvas).
 * @param shadows  0–100: how strong the folds and shadows are (60 = like the existing photos)
 */
export function recolour(parts, hex, shadows = 60) {
  const { img, fabric, shade } = parts;
  const [cr, cg, cb] = hexRgb(hex);
  const baseL = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb;
  const k = baseL < 0.3 ? 0.85 : 1;
  const f = shadows / 60;
  const src = img.data;
  const c = canvasOf(CW, CH);
  const g = c.getContext("2d");
  const out = g.createImageData(CW, CH);
  const o = out.data;
  for (let i = 0; i < CW * CH; i++) {
    const p = i * 4;
    const a = src[p + 3] / 255;
    let r = src[p] / 255;
    let gr = src[p + 1] / 255;
    let b = src[p + 2] / 255;
    if (fabric[i]) {
      const s = 1 - (1 - shade[i]) * f; // the shadow strength the admin chose
      const lit = Math.pow(Math.max(0, s), k);
      const glow = baseL < 0.3 ? Math.max(0, s - 0.92) * 0.25 : 0; // dark colours keep a little highlight
      r = Math.min(1, cr * lit + glow);
      gr = Math.min(1, cg * lit + glow);
      b = Math.min(1, cb * lit + glow);
    }
    // on the light background
    o[p] = Math.round((r * a + (BG[0] / 255) * (1 - a)) * 255);
    o[p + 1] = Math.round((gr * a + (BG[1] / 255) * (1 - a)) * 255);
    o[p + 2] = Math.round((b * a + (BG[2] / 255) * (1 - a)) * 255);
    o[p + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  return c;
}

// The standard side view (a drawing of a tee seen from the side; the wearer's right). Left = mirrored.
export async function sideDrawing() {
  const img = await loadImage("/garment-tools/side_white.svg");
  const right = canvasOf(CW, CH);
  right.getContext("2d").drawImage(img, 0, 0, CW, CH);
  const left = canvasOf(CW, CH);
  const g = left.getContext("2d");
  g.translate(CW, 0);
  g.scale(-1, 1);
  g.drawImage(right, 0, 0);
  return { left, right };
}

export const toJpegFile = (canvas, name) =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(new File([b], name, { type: "image/jpeg" })) : reject(new Error("Couldn't make the photo"))), "image/jpeg", 0.9),
  );
