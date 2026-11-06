// services/printRecipe.js — the print-file recipe the print team approved (6 Nov 2026).
//
// Proved on the laptop first (tools/pdf-check/make_print_sample3.py, three tees OK'd by the print team), then written
// for Node here and checked against those same files: whole-page difference 0.4–0.6/255, under 0.005 % of pixels off.
//
// In:  the enlarged picture (RGB, already at the size it prints at — 600 DPI), the design's see-through shape (alpha,
//      resized to the same size by a smooth resize, as the laptop tool did), the tee colour (white or black ink side).
// Out: the picture with no see-through at all (faint parts painted as they look on the tee: Illustrator showed a fade
//      mask as an empty page), and a VECTOR EDGE drawn only where solid ink meets the bare tee. The PDF is the picture
//      cut by that edge (even-odd clip); an .ai is a byte copy of the PDF. Words inside the picture are not retyped.
import zlib from "zlib";
import sharp from "sharp";
import { convertBuffer } from "@visioncortex/vtracer";

export const PRINT_DPI = 600;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// a square max filter on a 0/1 plane (separable sliding window)
export function maxFilter(src, W, H, radius) {
  const tmp = new Uint8Array(W * H);
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const row = y * W;
    let run = 0;
    for (let x = 0; x < W + radius; x++) {
      if (x < W && src[row + x]) run = 2 * radius + 1;
      if (run > 0) {
        const xo = x - radius;
        if (xo >= 0) tmp[row + xo] = 1;
        run--;
      }
    }
  }
  for (let x = 0; x < W; x++) {
    let run = 0;
    for (let y = 0; y < H + radius; y++) {
      if (y < H && tmp[y * W + x]) run = 2 * radius + 1;
      if (run > 0) {
        const yo = y - radius;
        if (yo >= 0) out[yo * W + x] = 1;
        run--;
      }
    }
  }
  return out;
}

// vtracer stops ("STUCK: shape should be broken down first without diagonally connected component") when two ink
// pixels touch only at a corner. Join such corners with one pixel: invisible at 600 DPI, and the tracer is happy.
export function fixDiagonals(plane, W, H) {
  let fixed = 0;
  for (let pass = 0; pass < 4; pass++) {
    let n = 0;
    for (let y = 0; y < H - 1; y++) {
      const r0 = y * W, r1 = r0 + W;
      for (let x = 0; x < W - 1; x++) {
        const a = plane[r0 + x], b = plane[r0 + x + 1], c = plane[r1 + x], d = plane[r1 + x + 1];
        if (a && d && !b && !c) { plane[r0 + x + 1] = 1; n++; }
        else if (b && c && !a && !d) { plane[r0 + x] = 1; n++; }
      }
    }
    fixed += n;
    if (!n) break;
  }
  return fixed;
}

// gaussian blur of a 0/1 plane, then a threshold (0..1) -> 0/1 plane
async function blurThreshold(plane, W, H, sigma, level) {
  const img = Buffer.alloc(W * H);
  for (let i = 0; i < img.length; i++) img[i] = plane[i] ? 255 : 0;
  // (.blur() alone hands back THREE channels for a one-channel picture: ask for one colour explicitly)
  const out = await sharp(img, { raw: { width: W, height: H, channels: 1 }, limitInputPixels: false }).blur(sigma).toColourspace("b-w").raw().toBuffer();
  if (out.length !== W * H) throw new Error(`blur gave ${out.length} bytes for ${W * H} pixels`);
  const res = new Uint8Array(W * H);
  const t = level * 255;
  for (let i = 0; i < res.length; i++) res[i] = out[i] >= t ? 1 : 0;
  return res;
}

// Before enlarging: the colours hidden under a picture's FULLY see-through pixels (often black) must never reach the
// edge — an enlarger or a resize blends neighbours, and a dark fringe would appear around the shape. So those pixels
// take their nearest visible colour, pass by pass, up to `reach` px out. Nothing a customer can see is changed: a pixel
// with any see-through at all keeps its own colour (a faint haze over the whole design, as in the SCENE tees, is such
// a pixel — painting it with a neighbour's colour put grey halos around the words, 6 Nov 2026).
export function bleedEdges(rgba, W, H, reach = 12) {
  spread(rgba, W, H, 1, reach);
  return rgba;
}
function spread(rgba, W, H, solidFrom, reach) {
  const N = W * H;
  const filled = new Uint8Array(N);
  for (let i = 0; i < N; i++) filled[i] = rgba[i * 4 + 3] >= solidFrom ? 1 : 0;
  const next = new Uint8Array(N);
  for (let pass = 0; pass < reach; pass++) {
    next.set(filled);
    let n = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (filled[i]) continue;
        // the first filled neighbour (left, right, up, down, then the corners)
        let k = -1;
        if (x > 0 && filled[i - 1]) k = i - 1;
        else if (x < W - 1 && filled[i + 1]) k = i + 1;
        else if (y > 0 && filled[i - W]) k = i - W;
        else if (y < H - 1 && filled[i + W]) k = i + W;
        else if (x > 0 && y > 0 && filled[i - W - 1]) k = i - W - 1;
        else if (x < W - 1 && y > 0 && filled[i - W + 1]) k = i - W + 1;
        else if (x > 0 && y < H - 1 && filled[i + W - 1]) k = i + W - 1;
        else if (x < W - 1 && y < H - 1 && filled[i + W + 1]) k = i + W + 1;
        if (k < 0) continue;
        rgba[i * 4] = rgba[k * 4];
        rgba[i * 4 + 1] = rgba[k * 4 + 1];
        rgba[i * 4 + 2] = rgba[k * 4 + 2];
        next[i] = 1;
        n++;
      }
    }
    filled.set(next);
    if (!n) break;
  }
}

// vtracer's SVG (absolute M/L/C/Z with optimize 0) -> a compact path in picture pixels, y down:
// "M x y C x1 y1 x2 y2 x y … Z". The browser turns it into PDF operators under the picture's own transform.
export function svgToClip(svg) {
  const parts = [];
  const fmt = (v) => {
    const s = v.toFixed(2).replace(/\.?0+$/, "");
    return s === "-0" || s === "" ? "0" : s;
  };
  let shapes = 0, steps = 0;
  for (const m of svg.matchAll(/<path\b([^>]*)\/?>/g)) {
    const at = m[1];
    const tm = /translate\(([-\d.eE]+)[, ]\s*([-\d.eE]+)\)/.exec(at);
    const dx = tm ? +tm[1] : 0, dy = tm ? +tm[2] : 0;
    const d = (/\bd="([^"]*)"/.exec(at) || [])[1] || "";
    const toks = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
    let cmd = null, i = 0, cx = 0, cy = 0;
    while (i < toks.length) {
      if (/[A-Za-z]/.test(toks[i])) {
        cmd = toks[i++];
        if (cmd === "Z" || cmd === "z") { parts.push("Z"); steps++; continue; }
      }
      if (cmd === "M") { cx = +toks[i++] + dx; cy = +toks[i++] + dy; parts.push(`M${fmt(cx)} ${fmt(cy)}`); cmd = "L"; shapes++; steps++; }
      else if (cmd === "L") { cx = +toks[i++] + dx; cy = +toks[i++] + dy; parts.push(`L${fmt(cx)} ${fmt(cy)}`); steps++; }
      else if (cmd === "C") {
        const a = [+toks[i++] + dx, +toks[i++] + dy, +toks[i++] + dx, +toks[i++] + dy, +toks[i++] + dx, +toks[i++] + dy];
        parts.push(`C${a.map(fmt).join(" ")}`);
        cx = a[4]; cy = a[5]; steps++;
      }
      else if (cmd === "H") { cx = +toks[i++] + dx; parts.push(`L${fmt(cx)} ${fmt(cy)}`); steps++; }
      else if (cmd === "V") { cy = +toks[i++] + dy; parts.push(`L${fmt(cx)} ${fmt(cy)}`); steps++; }
      else throw new Error(`SVG path command not handled: ${cmd}`);
    }
  }
  return { clip: parts.join(" "), shapes, steps };
}

// PNG-style Paeth row filtering, so the Flate stream compresses like a PNG (PDF /Predictor 15)
export function paethFilter(rgb, W, H) {
  const row = W * 3;
  const out = Buffer.alloc((row + 1) * H);
  for (let y = 0; y < H; y++) {
    out[y * (row + 1)] = 4;
    const src = y * row, dst = y * (row + 1) + 1;
    for (let x = 0; x < row; x++) {
      const a = x >= 3 ? rgb[src + x - 3] : 0;
      const b = y > 0 ? rgb[src - row + x] : 0;
      const c = x >= 3 && y > 0 ? rgb[src - row + x - 3] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      out[dst + x] = (rgb[src + x] - pred) & 255;
    }
  }
  return out;
}

/**
 * @param {object} a
 * @param {Buffer} a.rgb        raw RGB, W x H (the enlarged picture at its print size)
 * @param {Buffer} a.alpha      raw alpha, W x H (the design's see-through, smoothly resized to W x H)
 * @param {number} a.W
 * @param {number} a.H
 * @param {"white"|"black"} a.tee   the ink side: a light tee prints like white, a dark one like black
 * @param {(t:string)=>void} [a.log]
 * @returns {{ W, H, flate: Buffer, clip: string, shapes, steps, picture: Buffer }}  picture = the painted RGB (raw)
 */
export async function runRecipe({ rgb, alpha: a8, W, H, tee, log = () => {} }) {
  const t0 = Date.now();
  const N = W * H;
  const teeV = tee === "white" ? 255 : 0;
  if (rgb.length !== N * 3 || a8.length !== N) throw new Error("picture and shape sizes do not match");

  // what the customer sees on the tee, and how far each pixel is from the tee colour
  const V = Buffer.alloc(N * 3);
  const clean = new Uint8Array(N); // ink that can be told apart from the tee (0..255)
  const high = new Uint8Array(N), empty = new Uint8Array(N), S = new Uint8Array(N);
  for (let i = 0, j = 0; i < N; i++, j += 3) {
    const a = a8[i] / 255;
    let vd = 0;
    for (let c = 0; c < 3; c++) {
      const v = Math.round(rgb[j + c] * a + teeV * (1 - a));
      V[j + c] = v;
      const d = Math.abs(v - teeV);
      if (d > vd) vd = d;
    }
    const s = clamp((vd - 4) / 10, 0, 1);
    clean[i] = Math.round(a8[i] * s * s * (3 - 2 * s));
    high[i] = a8[i] >= 200 ? 1 : 0;
    empty[i] = a8[i] <= 40 && vd < 10 ? 1 : 0;
    S[i] = a8[i] >= 128 ? 1 : 0;
  }
  // the hard-edge zone: solid ink right next to bare tee
  const hiMax = maxFilter(high, W, H, 5), emMax = maxFilter(empty, W, H, 5);
  const hard = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (hiMax[i] && emMax[i]) hard[i] = 1;
  const hz = await blurThreshold(hard, W, H, 2.0, 0.25);
  const Ssm = await blurThreshold(S, W, H, 1.0, 0.5);
  log(`edge zones, ${((Date.now() - t0) / 1000).toFixed(0)}s`);

  // colours: solid ink as seen; the rim of the hard edge takes the nearest solid colour; no-ink pixels are the tee
  const col = Buffer.from(V);
  for (let i = 0; i < N; i++) {
    if (hz[i] && !high[i]) {
      const x = i % W, y = (i - x) / W;
      let found = -1;
      for (let r = 1; r <= 24 && found < 0; r++) {
        for (let dy = -r; dy <= r && found < 0; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= H) continue;
          const step = Math.abs(dy) === r ? 1 : 2 * r;
          for (let dx = -r; dx <= r; dx += step) {
            const xx = x + dx;
            if (xx < 0 || xx >= W) continue;
            const k = yy * W + xx;
            if (high[k]) { found = k; break; }
          }
        }
      }
      if (found >= 0) { col[i * 3] = V[found * 3]; col[i * 3 + 1] = V[found * 3 + 1]; col[i * 3 + 2] = V[found * 3 + 2]; }
    } else if (!hz[i] && clean[i] < 1) {
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = teeV;
    }
  }

  // the vector edge: tight on hard edges, far out at the faintest ink on soft parts
  const C = new Uint8Array(N);
  for (let i = 0; i < N; i++) C[i] = (hz[i] && Ssm[i]) || (!hz[i] && clean[i] >= 20) || high[i] ? 1 : 0;
  const Cs = await blurThreshold(C, W, H, 0.8, 0.5);
  fixDiagonals(Cs, W, H);
  const edgeImg = Buffer.alloc(N);
  for (let i = 0; i < N; i++) edgeImg[i] = Cs[i] ? 0 : 255;
  const edgePng = await sharp(edgeImg, { raw: { width: W, height: H, channels: 1 }, limitInputPixels: false }).toColourspace("b-w").png({ compressionLevel: 1 }).toBuffer();
  const svg = convertBuffer(edgePng, { clustering: "bw", mode: "spline", filterSpeckle: 4, cornerThreshold: 60, lengthThreshold: 4.0, spliceThreshold: 45, pathPrecision: 2, optimize: 0 });
  const { clip, shapes, steps } = svgToClip(svg);
  log(`vector edge: ${shapes} shapes, ${steps} steps, ${((Date.now() - t0) / 1000).toFixed(0)}s`);

  const flate = zlib.deflateSync(paethFilter(col, W, H), { level: 6 });
  log(`picture packed: ${(flate.length / 1e6).toFixed(1)} MB, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  return { W, H, flate, clip, shapes, steps, picture: col };
}

// A one-page PDF of one recipe result: the picture over the whole page at 600 DPI, cut by the vector edge.
// (The order's print files are composed in the admin's browser; this stand-alone page is for checks and samples.)
export function recipePdf({ W, H, flate, clip }) {
  const PTW = (W * 72) / PRINT_DPI, PTH = (H * 72) / PRINT_DPI;
  const K = PTW / W;
  const fmt = (v) => {
    const s = v.toFixed(3).replace(/\.?0+$/, "");
    return s === "-0" || s === "" ? "0" : s;
  };
  const ops = [];
  for (const tok of clip.split(/ (?=[MLCZ])/)) {
    const k = tok[0];
    const n = tok.slice(1).trim().split(/\s+/).map(Number);
    const p = (x, y) => `${fmt(x * K)} ${fmt(PTH - y * K)}`;
    if (k === "M") ops.push(`${p(n[0], n[1])} m`);
    else if (k === "L") ops.push(`${p(n[0], n[1])} l`);
    else if (k === "C") ops.push(`${p(n[0], n[1])} ${p(n[2], n[3])} ${p(n[4], n[5])} c`);
    else if (k === "Z") ops.push("h");
  }
  const content = Buffer.from(`q\n${ops.join("\n")}\nW* n\nq ${PTW.toFixed(4)} 0 0 ${PTH.toFixed(4)} 0 0 cm /Im0 Do Q\nQ\n`, "latin1");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PTW.toFixed(4)} ${PTH.toFixed(4)}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`,
    [`<< /Length ${content.length} >>`, content],
    [`<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${W} >> /Length ${flate.length} >>`, flate],
  ];
  const parts = [Buffer.from("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n", "latin1")];
  const offsets = [];
  let pos = parts[0].length;
  objs.forEach((o, n) => {
    offsets.push(pos);
    const head = Buffer.from(`${n + 1} 0 obj\n${Array.isArray(o) ? o[0] : o}\n`, "latin1");
    const body = Array.isArray(o) ? [Buffer.from("stream\n", "latin1"), o[1], Buffer.from("\nendstream\n", "latin1")] : [];
    const tail = Buffer.from("endobj\n", "latin1");
    for (const b of [head, ...body, tail]) { parts.push(b); pos += b.length; }
  });
  let table = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) table += `${String(o).padStart(10, "0")} 00000 n \n`;
  table += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`;
  parts.push(Buffer.from(table, "latin1"));
  return Buffer.concat(parts);
}
