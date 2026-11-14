// studio/neckLabelArt.js
//
// The neck label drawn as a picture for the 3D tee (see neckLabel.js). Since 14 Nov 2026 it is the owner's woven label:
// a black cloth tag sewn into the back neck seam — the tee-and-sparkles mark | "identee™", "—— DESIGN • CUSTOMIZE •
// WEAR ——" under it, in cream — with a small black size tab below ("— L —"). The same on every tee colour.
// Drawn at the real size (mm, the places measured off the owner's picture) and made to look woven: fine weft and warp
// threads in the cloth and in the words, a fine edge where the cloth turns, stitching down both ends of the tag and the
// tab, a slight shade where the top goes into the seam, and a soft shadow under it on the tee (it stands off the fabric
// a little). Browser only.
import montserrat600 from "@fontsource/montserrat/files/montserrat-latin-600-normal.woff2?url";
import montserrat700 from "@fontsource/montserrat/files/montserrat-latin-700-normal.woff2?url";
import { LABEL_TAG } from "./neckLabel";

const FAMILY = "IdenteeNeckLabel"; // its own name, so the design room's text fonts are never touched
const PX = 20; // pixels per mm
let fontsLoading = null;

function labelFonts() {
  if (!fontsLoading) {
    fontsLoading = Promise.all(
      [
        [montserrat600, "600"],
        [montserrat700, "700"],
      ].map(async ([url, weight]) => document.fonts.add(await new FontFace(FAMILY, `url(${url})`, { weight }).load())),
    ).catch((err) => {
      fontsLoading = null; // tried again next time
      throw err;
    });
  }
  return fontsLoading;
}

const font = (weight, sizePx) => `${weight} ${sizePx}px ${FAMILY}`;

// The ink of a word (not its advance): left and right of the pen, its top above the baseline.
function ink(g, text) {
  const m = g.measureText(text);
  return { left: m.actualBoundingBoxLeft, w: m.actualBoundingBoxLeft + m.actualBoundingBoxRight, up: m.actualBoundingBoxAscent };
}

// A line of letters spaced by hand (the same on every browser): its ink width, and drawing it with its ink from x.
function spacedWidth(g, chars, spacing) {
  const first = ink(g, chars[0]);
  const last = g.measureText(chars[chars.length - 1]);
  const pen = chars.slice(0, -1).reduce((sum, ch) => sum + g.measureText(ch).width + spacing, 0);
  return pen + last.actualBoundingBoxRight + first.left;
}
function drawSpaced(g, chars, x, y, spacing) {
  x += ink(g, chars[0]).left;
  for (const ch of chars) {
    g.fillText(ch, x, y);
    x += g.measureText(ch).width + spacing;
  }
}

// A four-point sparkle centred on (x, y), r = its half-height.
function sparkle(g, x, y, r) {
  const k = r * 0.22; // how pinched the sides are
  g.beginPath();
  g.moveTo(x, y - r);
  g.quadraticCurveTo(x + k, y - k, x + r, y);
  g.quadraticCurveTo(x + k, y + k, x, y + r);
  g.quadraticCurveTo(x - k, y + k, x - r, y);
  g.quadraticCurveTo(x - k, y - k, x, y - r);
  g.closePath();
  g.fill();
}

// The mark, as in the owner's picture: a wide tee outline with a sparkle on its chest and one above its right
// shoulder. (x, y) = top left, h = its height in px; it is 24.2 × 18.65 units (the tee 14.4 high, the sparkle above).
const MARK_W = 24.2;
const MARK_H = 18.65;
function teeMark(g, x, y, h) {
  const u = h / MARK_H;
  const P = (px, py) => [x + (px + 0.1) * u, y + (py + 3.8) * u];
  const right = [
    [14.8, 0], // the neck's right end
    [18.3, 0], // the shoulder
    [23.65, 5.0], // the sleeve's tip
    [18.9, 7.3], // the armpit
    [18.9, 14.4], // the hem's right corner
  ];
  const left = right.map(([px, py]) => [24 - px, py]).reverse();
  g.lineWidth = 0.9 * u;
  g.lineJoin = "round";
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(...P(...right[0]));
  for (const p of right.slice(1)) g.lineTo(...P(...p));
  for (const p of left) g.lineTo(...P(...p));
  // the neck: a soft scoop between the two ends
  const [nx, ny] = P(12, 2.1);
  const [ex, ey] = P(...right[0]);
  g.quadraticCurveTo(nx, ny, ex, ey);
  g.closePath();
  g.stroke();
  sparkle(g, ...P(14.67, 6.9), 2.35 * u); // on the chest
  sparkle(g, ...P(21.56, -1.3), 2.5 * u); // above the right shoulder
  return MARK_W * u; // its width
}

// Repeatable random numbers, so the same label always looks the same.
function randoms(seed) {
  return () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

// The woven look on a flat canvas: every pixel of the cloth and the words gets the weft (rows ~0.22 mm) and warp
// (~0.16 mm) of a damask label, a little light and shade along each thread, and a fine grain — shading the cream
// words and lighting the black cloth alike.
function weave(img, W, H, rnd) {
  const d = img.data;
  const WEFT = 0.22 * PX;
  const WARP = 0.16 * PX;
  for (let y = 0; y < H; y++) {
    const weft = 0.5 + 0.5 * Math.cos(2 * Math.PI * ((y / WEFT) % 1));
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i + 3] === 0) continue;
      const warp = 0.5 + 0.5 * Math.cos(2 * Math.PI * ((x / WARP) % 1));
      const k = 0.92 + 0.06 * weft + 0.02 * warp + (rnd() - 0.5) * 0.05;
      const add = (weft - 0.5) * 9 + (warp - 0.5) * 3 + (rnd() - 0.5) * 8;
      for (let ch = 0; ch < 3; ch++) d[i + ch] = Math.max(0, Math.min(255, d[i + ch] * k + add));
    }
  }
}

/**
 * The label picture: the tag (and its size tab) on a see-through background with its shadow. Its size is the label's
 * decal box (LABEL_TAG.boxW × boxH mm); the tag's top edge is the canvas's top edge (it goes into the neck seam).
 * @param {{ size: string }} words  neckLabel.js labelWords
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function neckLabelCanvas(words) {
  await labelFonts();
  const T = LABEL_TAG;
  const W = Math.round(T.boxW * PX);
  const H = Math.round(T.boxH * PX);
  const mm = (v) => v * PX;
  const tagX = (W - mm(T.w)) / 2;
  const size = String(words.size || "").trim();

  // the size tab: "— L —" for the short sizes; long ones ("13-14", "5XL") without the dashes, the tab as wide as needed
  const sizeFont = (T.sizeCapMm / 0.7) * PX; // Montserrat's capitals are 0.7 of the font size
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = font(700, sizeFont);
  const sizeInk = size ? ink(probe, size) : { left: 0, w: 0 };
  const dashes = size.length <= 2;
  const tabW = size ? Math.max(mm(T.tabMinW), sizeInk.w + (dashes ? 2 * mm(T.dashMm + T.dashGapMm) : 0) + 2 * mm(T.tabPadMm)) : 0;
  const tabX = (W - tabW) / 2;
  const tabTop = mm(T.h) - mm(T.tabTuck);
  const tabBottom = mm(T.h) + mm(T.tabH);

  // 1. the cloth: tag and tab shapes, in the tag colour (the tab is sewn behind the tag, so drawn first)
  const cloth = document.createElement("canvas");
  cloth.width = W;
  cloth.height = H;
  const c = cloth.getContext("2d", { willReadFrequently: true });
  c.fillStyle = T.cloth;
  if (size) c.fillRect(tabX, tabTop, tabW, tabBottom - tabTop);
  c.fillRect(tagX, 0, mm(T.w), mm(T.h));

  // 2. the words and the mark, in the thread colour
  c.fillStyle = T.thread;
  c.strokeStyle = T.thread;
  c.textBaseline = "alphabetic";
  // row 1: the mark | identee™, centred on the tag. "identee" as tall as its d may be, unless that makes it too wide.
  c.font = font(600, 100);
  const at100 = ink(c, "identee");
  const dAt100 = ink(c, "d").up;
  const wordFont = 100 * Math.min(mm(T.wordMm) / dAt100, mm(T.wordWMm) / at100.w);
  c.font = font(600, wordFont);
  const word = ink(c, "identee");
  const markH = mm(T.markMm);
  const markW = (MARK_W / MARK_H) * markH;
  const tmFont = (T.tmCapMm / 0.7) * PX;
  c.font = font(700, tmFont);
  const tm = ink(c, "TM");
  const rowW = markW + mm(T.gapMarkMm) + mm(T.barWMm) + mm(T.gapWordMm) + word.w - mm(T.tmBackMm) + tm.w;
  let x = (W - rowW) / 2;
  teeMark(c, x, mm(T.markTopMm), markH);
  x += markW + mm(T.gapMarkMm);
  c.fillRect(x, mm(T.barTopMm), mm(T.barWMm), mm(T.barMm));
  x += mm(T.barWMm) + mm(T.gapWordMm);
  c.font = font(600, wordFont);
  // the owner's word has taller small letters than Montserrat: when its width limits it, it is drawn a little taller
  // (up to 12 %) so its d still reaches wordMm, and a hair bolder
  const tall = Math.min(1.12, mm(T.wordMm) / ink(c, "d").up);
  c.save();
  c.translate(x + word.left, mm(T.baseMm));
  c.scale(1, tall);
  c.fillText("identee", 0, 0);
  c.lineWidth = mm(0.06);
  c.strokeText("identee", 0, 0);
  c.restore();
  x += word.w - mm(T.tmBackMm);
  c.font = font(700, tmFont);
  c.fillText("TM", x + tm.left, mm(T.tmTopMm) + tm.up);
  // row 2: —— DESIGN • CUSTOMIZE • WEAR ——, the letters spaced out to the line's width
  const line = [..."DESIGN • CUSTOMIZE • WEAR"];
  c.font = font(600, (T.lineCapMm / 0.7) * PX);
  const natural = spacedWidth(c, line, 0);
  const spacing = (mm(T.lineWMm) - natural) / (line.length - 1);
  const lineX = (W - mm(T.lineWMm)) / 2;
  drawSpaced(c, line, lineX, mm(T.lineBaseMm), spacing);
  const ruleY = mm(T.lineBaseMm - T.lineCapMm / 2 - T.ruleThickMm / 2);
  c.fillRect(lineX - mm(T.ruleGapMm + T.ruleMm), ruleY, mm(T.ruleMm), mm(T.ruleThickMm));
  c.fillRect(lineX + mm(T.lineWMm + T.ruleGapMm), ruleY, mm(T.ruleMm), mm(T.ruleThickMm));
  // the size tab: — size —
  if (size) {
    c.font = font(700, sizeFont);
    const mid = mm(T.h + T.sizeMidMm);
    c.fillText(size, (W - sizeInk.w) / 2 + sizeInk.left, mid + mm(T.sizeCapMm) / 2);
    if (dashes) {
      const t = mm(T.ruleThickMm);
      c.fillRect((W - sizeInk.w) / 2 - mm(T.dashGapMm + T.dashMm), mid - t / 2, mm(T.dashMm), t);
      c.fillRect((W + sizeInk.w) / 2 + mm(T.dashGapMm), mid - t / 2, mm(T.dashMm), t);
    }
  }

  // 3. woven texture over cloth and threads alike
  const img = c.getImageData(0, 0, W, H);
  weave(img, W, H, randoms(11));
  c.putImageData(img, 0, 0);

  // 4. the top goes into the neck seam (a soft shade there); the fine edge where the cloth turns; the lower edges
  const seam = c.createLinearGradient(0, 0, 0, mm(1.6));
  seam.addColorStop(0, "rgba(0,0,0,0.35)");
  seam.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = seam;
  c.fillRect(tagX, 0, mm(T.w), mm(1.6));
  c.strokeStyle = T.edge;
  c.lineWidth = mm(0.22);
  c.strokeRect(tagX + mm(0.11), -mm(1), mm(T.w) - mm(0.22), mm(T.h) + mm(1) - mm(0.11));
  if (size) {
    c.beginPath();
    c.moveTo(tabX + mm(0.11), mm(T.h));
    c.lineTo(tabX + mm(0.11), tabBottom - mm(0.11));
    c.lineTo(tabX + tabW - mm(0.11), tabBottom - mm(0.11));
    c.lineTo(tabX + tabW - mm(0.11), mm(T.h));
    c.stroke();
  }
  // the stitching down both ends of the tag and of the tab
  c.fillStyle = T.stitch;
  const stitches = (sx, top, bottom) => {
    for (let sy = top; sy < bottom - mm(0.45); sy += mm(0.7)) c.fillRect(sx - mm(0.09), sy, mm(0.18), mm(0.45));
  };
  stitches(tagX + mm(T.stitchInMm), mm(0.6), mm(T.h) - mm(0.5));
  stitches(tagX + mm(T.w - T.stitchInMm), mm(0.6), mm(T.h) - mm(0.5));
  if (size) {
    stitches(tabX + mm(T.stitchInMm), mm(T.h) + mm(0.3), tabBottom - mm(0.5));
    stitches(tabX + tabW - mm(T.stitchInMm), mm(T.h) + mm(0.3), tabBottom - mm(0.5));
  }

  // 5. on the tee: a soft shadow under the tag and tab (it stands off the fabric), then the tag on top
  const out = document.createElement("canvas");
  out.width = W;
  out.height = H;
  const g = out.getContext("2d");
  if ("filter" in g) g.filter = `blur(${mm(0.9)}px)`;
  g.fillStyle = "rgba(20,17,16,0.32)";
  g.fillRect(tagX - mm(0.3), mm(0.5), mm(T.w) + mm(0.6), mm(T.h) + mm(0.4));
  if (size) g.fillRect(tabX - mm(0.2), tabTop, tabW + mm(0.4), tabBottom - tabTop + mm(0.7));
  g.filter = "none";
  g.drawImage(cloth, 0, 0);
  return out;
}
