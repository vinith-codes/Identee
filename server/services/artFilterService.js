// services/artFilterService.js
//
// Art filters made by our own code — no AI service. They turn any photo into
// four t-shirt looks: Sketch, Stencil, Poster and Pop art.
//
// Why they exist: the picture service refuses some photos (a well-known
// person's face, for one). The customer then still gets art they can print,
// at once and for free. They can also be asked for directly.
//
// Sketch and Stencil come back as ink on a see-through background (dark ink
// for a light tee, light ink for a dark tee), so the tee's own colour shows
// through. Poster and Pop art keep the picture's colours.
//
// A photo taken against a plain background (a dark stage, a studio wall, a
// clear sky) has that background removed first, so only the person or thing
// is printed. A busy background is kept — the filters then cover the whole photo.
import sharp from "sharp";

export const FILTER_STYLE = "Art filters (free)";
export const FILTER_NAMES = ["Sketch", "Stencil", "Poster", "Pop art"];
const MAX_SIDE = 1600;
const MIN_SIDE = 1100;
const INK = { dark: [20, 17, 16], light: [255, 250, 240] };
// four bold flat colours from dark to light (a screen-print look)
const POP = [
  [27, 31, 94],
  [224, 33, 138],
  [255, 196, 0],
  [255, 244, 214],
];

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

// the value below which `share` of the pixels fall (0…255); pixels outside the subject are left out
function level(gray, share, alpha) {
  const hist = new Uint32Array(256);
  let total = 0;
  for (let i = 0; i < gray.length; i++) {
    if (alpha && alpha[i] < 128) continue;
    hist[gray[i]]++;
    total++;
  }
  let seen = 0;
  for (let v = 0; v < 256; v++) {
    seen += hist[v];
    if (seen >= total * share) return v;
  }
  return 255;
}

// Spreads the subject's tones over the full range (its darkest part → black, its lightest → white),
// so a dim photo gives the same strong picture as a bright one.
function stretch(gray, alpha) {
  const lo = level(gray, 0.02, alpha);
  const hi = Math.max(lo + 24, level(gray, 0.98, alpha));
  const out = Buffer.alloc(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = clamp(Math.round(((gray[i] - lo) * 255) / (hi - lo)));
  return out;
}

/**
 * The subject of a photo taken against a plain background: 255 = subject, 0 = background.
 * Returns null when the background is not plain (the whole photo is then used).
 * rgb: smoothed RGB pixels, w × h.
 */
function subjectMask(rgb, w, h) {
  const n = w * h;
  const edge = [];
  for (let x = 0; x < w; x++) edge.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) edge.push(y * w, y * w + w - 1);
  const mid = (k) => edge.map((p) => rgb[p * 3 + k]).sort((a, b) => a - b)[edge.length >> 1];
  const bg = [mid(0), mid(1), mid(2)];
  const far = (p) => Math.abs(rgb[p * 3] - bg[0]) + Math.abs(rgb[p * 3 + 1] - bg[1]) + Math.abs(rgb[p * 3 + 2] - bg[2]);
  const NEAR = 66;
  // plain enough: most of the photo's border is one colour (the subject may touch one side)
  if (edge.filter((p) => far(p) < NEAR).length < edge.length * 0.62) return null;

  // background = everything in that colour that is connected to the border
  const back = new Uint8Array(n);
  const stack = [];
  const push = (p) => {
    if (!back[p] && far(p) < NEAR) {
      back[p] = 1;
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
    if (p < n - w) push(p + w);
  }
  // of what is left, keep the large pieces (the person) and drop the specks (lights, dust, noise)
  const label = new Int32Array(n);
  const sizes = [0];
  for (let s = 0; s < n; s++) {
    if (back[s] || label[s]) continue;
    const id = sizes.length;
    let size = 0;
    label[s] = id;
    stack.push(s);
    while (stack.length) {
      const p = stack.pop();
      size++;
      const x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p >= w ? p - w : -1, p < n - w ? p + w : -1]) {
        if (q >= 0 && !back[q] && !label[q]) {
          label[q] = id;
          stack.push(q);
        }
      }
    }
    sizes.push(size);
  }
  const largest = sizes.reduce((a, b) => Math.max(a, b), 0);
  if (largest < n * 0.04 || largest > n * 0.92) return null; // nothing clear to keep, or almost no background
  const mask = Buffer.alloc(n);
  for (let p = 0; p < n; p++) if (label[p] && sizes[label[p]] >= largest * 0.12) mask[p] = 255;
  return mask;
}

/**
 * @param {Buffer} buffer  the customer's photo
 * @param {{ dark?: boolean }} opts  dark = the tee is a dark colour
 * @returns {Promise<Array<{ name, buffer, mime, width, height }>>}  one picture per filter, in FILTER_NAMES order
 */
export async function artFilters(buffer, { dark = false } = {}) {
  // a small photo is made larger first (smoothly), so the lines and edges come out clean
  const meta = await sharp(buffer).rotate().metadata();
  const side = Math.min(MAX_SIDE, Math.max(MIN_SIDE, Math.max(meta.width || 0, meta.height || 0)));
  const sized = () => sharp(buffer).rotate().resize(side, side, { fit: "inside", kernel: "lanczos3" });
  const base = sized().flatten({ background: "#ffffff" });
  const soft = Math.max(1, Math.round(side / 500));
  // a calmed copy: a small or heavily saved photo is full of little blocks and speckles that would turn into lines
  const { data: calm, info } = await base
    .clone()
    .removeAlpha()
    .median(soft * 2 + 1)
    .blur(0.6 + soft * 0.4)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const n = w * h;
  const ink = dark ? INK.light : INK.dark;

  // What is printed: a cut-out picture (a logo, a see-through PNG) keeps its own outline; a photo on a
  // plain background keeps only its subject; any other photo is used whole.
  const stats = meta.hasAlpha ? await sharp(buffer).stats() : null;
  let alpha = stats && !stats.isOpaque ? await sized().ensureAlpha().extractChannel("alpha").raw().toBuffer() : null;
  if (!alpha) {
    const mask = subjectMask(calm, w, h);
    // soften the cut by a couple of pixels so the edge is not jagged
    // (extractChannel: a one-channel picture comes back from blur() as three equal channels)
    if (mask) alpha = await sharp(mask, { raw: { width: w, height: h, channels: 1 } }).blur(1.2 + soft * 0.5).extractChannel(0).raw().toBuffer();
  }
  const seen = (i, a) => (alpha ? Math.round((a * alpha[i]) / 255) : a);

  // grey versions of the calmed photo, with the subject's tones spread over the full range
  const grayRaw = Buffer.alloc(n);
  for (let i = 0; i < n; i++) grayRaw[i] = Math.round(0.299 * calm[i * 3] + 0.587 * calm[i * 3 + 1] + 0.114 * calm[i * 3 + 2]);
  const gray = stretch(grayRaw, alpha);
  const wide = await sharp(gray, { raw: { width: w, height: h, channels: 1 } })
    .blur(Math.max(4, side / 70))
    .extractChannel(0)
    .raw()
    .toBuffer();

  /* Sketch: pencil lines. Where the photo is darker than its surroundings there is a line; a little
     overall tone keeps a face round. On a dark tee it is turned round: light ink where the photo is light. */
  const sketch = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const strength = dark ? (gray[i] - wide[i]) * 4.4 - 12 + gray[i] * 0.34 : (wide[i] - gray[i]) * 4.4 - 12 + (255 - gray[i]) * 0.3;
    sketch[i * 4] = ink[0];
    sketch[i * 4 + 1] = ink[1];
    sketch[i * 4 + 2] = ink[2];
    sketch[i * 4 + 3] = seen(i, clamp(strength));
  }

  /* Stencil: one flat ink colour, like a spray-paint stencil. The cut between ink and no ink follows
     the surroundings a little, so a face keeps its eyes and mouth even in a dim photo. */
  const cut = level(gray, dark ? 0.52 : 0.48, alpha);
  const stencil = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const local = cut * 0.6 + wide[i] * 0.4;
    const d = dark ? gray[i] - local : local - gray[i];
    stencil[i * 4] = ink[0];
    stencil[i * 4 + 1] = ink[1];
    stencil[i * 4 + 2] = ink[2];
    stencil[i * 4 + 3] = seen(i, clamp(128 + d * 12)); // a soft edge a few tones wide
  }

  /* Poster: the photo's own colours, flattened to a few strong steps. */
  const rich = await sharp(calm, { raw: { width: w, height: h, channels: 3 } })
    .modulate({ saturation: 1.35 })
    .linear(1.15, -12)
    .raw()
    .toBuffer();
  const poster = Buffer.alloc(n * 4);
  const STEPS = 4;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) poster[i * 4 + k] = Math.round((Math.round((rich[i * 3 + k] / 255) * (STEPS - 1)) / (STEPS - 1)) * 255);
    poster[i * 4 + 3] = seen(i, 255);
  }

  /* Pop art: four tones, each printed as one bold colour. */
  const bands = [level(gray, 0.3, alpha), level(gray, 0.58, alpha), level(gray, 0.82, alpha)];
  const pop = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    const v = gray[i];
    const c = POP[v <= bands[0] ? 0 : v <= bands[1] ? 1 : v <= bands[2] ? 2 : 3];
    pop[i * 4] = c[0];
    pop[i * 4 + 1] = c[1];
    pop[i * 4 + 2] = c[2];
    pop[i * 4 + 3] = seen(i, 255);
  }

  // When the background was removed, the empty space around the subject goes too, so the art fills
  // the print area when it is added to the tee.
  let box = { left: 0, top: 0, width: w, height: h };
  if (alpha) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (alpha[y * w + x] > 10) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 >= x0 && y1 >= y0) {
      const pad = Math.round(side * 0.012);
      x0 = Math.max(0, x0 - pad);
      y0 = Math.max(0, y0 - pad);
      x1 = Math.min(w - 1, x1 + pad);
      y1 = Math.min(h - 1, y1 + pad);
      box = { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
    }
  }
  const cropped = (data) => sharp(data, { raw: { width: w, height: h, channels: 4 } }).extract(box).png({ compressionLevel: 9 }).toBuffer();
  const out = [
    ["Sketch", await cropped(sketch)],
    ["Stencil", await cropped(stencil)],
    ["Poster", await cropped(poster)],
    ["Pop art", await cropped(pop)],
  ];
  return out.map(([name, buf]) => ({ name, buffer: buf, mime: "image/png", width: box.width, height: box.height }));
}
