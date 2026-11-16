// Putting an AI copy back in the picture's own shape (16 Nov 2026).
//
// Google gives back the sheet's shape exactly. Grok picks its own picture shape and may zoom a little, so its copy was
// stretched into the customer's box: the VF-2026-0079 front came back 11% narrower (printed 13% too wide) and the
// VF-2026-0080 back 8% wider (printed 7.5% too narrow). Here the sheet that was sent is found inside the copy — at the
// same proportions, any size and position — by comparing the two pictures' light and dark patterns (normalised, so a
// darker or more colourful redraw still matches). The copy is then cut to the sheet's frame; where the
// AI left part of the sheet out, the sheet itself fills in. Nothing is shrunk: the copy keeps its own resolution.
import sharp from "sharp";

const grey = async (buffer, width, height) =>
  Float32Array.from(await sharp(buffer, { limitInputPixels: false }).removeAlpha().greyscale().resize(width, height, { fit: "fill", kernel: "lanczos3" }).raw().toBuffer());

// how alike the sent sheet (sw × sh, placed at x, y) and the copy (cw × ch) are where they overlap: -1 … 1
function likeness(sent, sw, sh, copy, cw, ch, x, y) {
  const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(cw, x + sw), y1 = Math.min(ch, y + sh);
  const n = (x1 - x0) * (y1 - y0);
  if (x1 <= x0 || y1 <= y0 || n < 0.6 * sw * sh) return -2; // most of the sheet must be inside the copy
  let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let yy = y0; yy < y1; yy++) {
    const ro = (yy - y) * sw - x, rc = yy * cw;
    for (let xx = x0; xx < x1; xx++) {
      const a = sent[ro + xx], b = copy[rc + xx];
      sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b;
    }
  }
  const va = saa - (sa * sa) / n, vb = sbb - (sb * sb) / n;
  if (va <= 1e-6 || vb <= 1e-6) return -2;
  return (sab - (sa * sb) / n) / Math.sqrt(va * vb);
}

// search: scales (copy px per sheet px) and positions at one work size; returns the best { s, x, y, score } in copy px
async function search({ sentBuf, copyBuf, sheetW, sheetH, copyW, copyH, work, scales, around }) {
  const c = work / Math.max(copyW, copyH); // copy px → work px
  const cw = Math.max(8, Math.round(copyW * c)), ch = Math.max(8, Math.round(copyH * c));
  const copy = await grey(copyBuf, cw, ch);
  let best = { score: -3 };
  for (const s of scales) {
    const sw = Math.max(4, Math.round(sheetW * s * c)), sh = Math.max(4, Math.round(sheetH * s * c));
    const sent = await grey(sentBuf, sw, sh);
    let xs, ys;
    if (around) {
      const ax = Math.round(around.x * c), ay = Math.round(around.y * c);
      xs = [ax - 4, ax + 4]; ys = [ay - 4, ay + 4];
    } else {
      xs = [-Math.round(0.25 * sw), cw - Math.round(0.75 * sw)]; ys = [-Math.round(0.25 * sh), ch - Math.round(0.75 * sh)];
    }
    for (let y = Math.min(...ys); y <= Math.max(...ys); y++)
      for (let x = Math.min(...xs); x <= Math.max(...xs); x++) {
        const score = likeness(sent, sw, sh, copy, cw, ch, x, y);
        if (score > best.score) best = { s, x: x / c, y: y / c, score };
      }
  }
  return best;
}

const range = (lo, hi, steps) => Array.from({ length: steps }, (_, i) => lo * Math.pow(hi / lo, i / (steps - 1)));

/**
 * Where the sent sheet sits in the AI's copy.
 * @returns {Promise<{ left, top, width, height, score }>} in copy pixels (may reach outside the copy)
 */
export async function findSheetInCopy({ sent, copy }) {
  const [sm, cm] = await Promise.all([sharp(sent).metadata(), sharp(copy, { limitInputPixels: false }).metadata()]);
  const sheetW = sm.width, sheetH = sm.height, copyW = cm.width, copyH = cm.height;
  const sW = copyW / sheetW, sH = copyH / sheetH;
  const lo = Math.min(sW, sH) * 0.85, hi = Math.max(sW, sH) * 1.15;
  const base = { sentBuf: sent, copyBuf: copy, sheetW, sheetH, copyW, copyH };
  // coarse everywhere, then finer and finer around the best place
  let best = await search({ ...base, work: 72, scales: range(lo, hi, 36) });
  best = await search({ ...base, work: 256, scales: range(best.s * 0.97, best.s * 1.03, 9), around: best });
  best = await search({ ...base, work: 640, scales: range(best.s * 0.992, best.s * 1.008, 5), around: best });
  return { left: Math.round(best.x), top: Math.round(best.y), width: Math.round(sheetW * best.s), height: Math.round(sheetH * best.s), score: best.score };
}

/**
 * The AI's copy cut to exactly the sheet that was sent (the same picture shape); any part it left out is filled from the sheet.
 * Copies already of the sheet's shape (Google) are returned unchanged.
 * @returns {Promise<{ buffer, changed, box?, score? }>}
 */
export async function fitCopyToSheet({ sent, copy }) {
  const [sm, cm] = await Promise.all([sharp(sent).metadata(), sharp(copy, { limitInputPixels: false }).metadata()]);
  if (Math.abs(Math.log((cm.width / cm.height) / (sm.width / sm.height))) < 0.01) return { buffer: copy, changed: false };
  const box = await findSheetInCopy({ sent, copy });
  // too unlike to trust: leave it as it was (the admin compares the copy with the original anyway)
  if (box.score < 0.5) return { buffer: copy, changed: false, box, score: box.score };
  // the part of the copy inside the sheet's frame
  const x0 = Math.max(0, box.left), y0 = Math.max(0, box.top);
  const x1 = Math.min(cm.width, box.left + box.width), y1 = Math.min(cm.height, box.top + box.height);
  const inside = await sharp(copy, { limitInputPixels: false }).extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 }).png().toBuffer();
  // where the AI left part of the sheet out (Grok zoomed into the VF-2026-0080 back, cutting 4% off the top and bottom),
  // the sent sheet itself fills in, enlarged — so nothing of the customer's picture is lost; the AI's copy goes on top
  const under = await sharp(sent).resize(box.width, box.height, { fit: "fill", kernel: "lanczos3" }).png().toBuffer();
  const buffer = await sharp(under, { limitInputPixels: false })
    .composite([{ input: inside, left: x0 - box.left, top: y0 - box.top }])
    .png()
    .toBuffer();
  const filled = 1 - ((x1 - x0) * (y1 - y0)) / (box.width * box.height);
  return { buffer, changed: true, box, score: box.score, filled };
}

/**
 * A print copy made BEFORE the shape fix (the Studio's SCENE tees, older orders) put back in the original picture's
 * shape when Prepare for print uses it (16 Nov 2026). Unlike fitCopyToSheet, both pictures may be see-through (the
 * copy's background was taken out): the two are compared on the same plain grey, and the copy keeps its own
 * see-through inside the frame; only where the AI left part out does the original (with its own see-through) show.
 * @returns {Promise<{ buffer, changed, offBy, box?, score?, filled? }>} offBy = how far the shape was off (0.041 = 4.1%)
 */
export async function fitStoredCopy({ original, copy }) {
  const [om, cm] = await Promise.all([sharp(original, { limitInputPixels: false }).rotate().metadata(), sharp(copy, { limitInputPixels: false }).metadata()]);
  // (rotate(): a phone photo's turn is applied, as everywhere else the original is drawn)
  const turned = (om.orientation || 1) >= 5;
  const ow = turned ? om.height : om.width, oh = turned ? om.width : om.height;
  const offBy = Math.abs(Math.exp(Math.abs(Math.log((cm.width / cm.height) / (ow / oh)))) - 1);
  if (offBy < 0.01) return { buffer: copy, changed: false, offBy };
  const BG = { r: 0, g: 0, b: 0 }; // black: every colour is lighter than it in both pictures, even in a darker redraw
  const [sentFlat, copyFlat] = await Promise.all([
    sharp(original, { limitInputPixels: false }).rotate().flatten({ background: BG }).png().toBuffer(),
    sharp(copy, { limitInputPixels: false }).flatten({ background: BG }).png().toBuffer(),
  ]);
  const box = await findSheetInCopy({ sent: sentFlat, copy: copyFlat });
  if (box.score < 0.5) return { buffer: copy, changed: false, offBy, box, score: box.score };
  const x0 = Math.max(0, box.left), y0 = Math.max(0, box.top);
  const x1 = Math.min(cm.width, box.left + box.width), y1 = Math.min(cm.height, box.top + box.height);
  const inside = await sharp(copy, { limitInputPixels: false }).ensureAlpha().extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 }).png().toBuffer();
  const under = await sharp(original, { limitInputPixels: false }).rotate().ensureAlpha().resize(box.width, box.height, { fit: "fill", kernel: "lanczos3" }).png().toBuffer();
  // a hole is cut where the copy goes, so the copy's own see-through stays see-through (not the original showing through)
  const hole = await sharp({ create: { width: x1 - x0, height: y1 - y0, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
  const holed = await sharp(under, { limitInputPixels: false }).composite([{ input: hole, left: x0 - box.left, top: y0 - box.top, blend: "dest-out" }]).png().toBuffer();
  const buffer = await sharp(holed, { limitInputPixels: false }).composite([{ input: inside, left: x0 - box.left, top: y0 - box.top }]).png().toBuffer();
  const filled = 1 - ((x1 - x0) * (y1 - y0)) / (box.width * box.height);
  return { buffer, changed: true, offBy, box, score: box.score, filled };
}
