// studio/vectorText.js
//
// The plain sums behind the vector print file (vectorPrint.js): reading Google's font list, finding the file that has
// a letter, and turning a letter's outline into the path drawn in the PDF. No browser needed, so they can be tested.

// Google's stylesheet: one @font-face per font file. A font is split in files by alphabet, each with a unicode-range.
export function parseFontFaces(css) {
  const faces = [];
  for (const [, block] of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const family = /font-family:\s*['"]?([^;'"]+)/.exec(block)?.[1]?.trim();
    const weight = Number(/font-weight:\s*(\d+)/.exec(block)?.[1] || 400);
    const style = /font-style:\s*(\w+)/.exec(block)?.[1] || "normal";
    const url = /url\(['"]?([^'")]+)/.exec(block)?.[1];
    const range = /unicode-range:\s*([^;]+)/.exec(block)?.[1];
    if (!family || !url) continue;
    const ranges = range
      ? range.split(",").map((part) => {
          const [from, to] = part.trim().replace(/^U\+/i, "").split("-");
          const start = parseInt(from.replace(/\?/g, "0"), 16);
          const end = to ? parseInt(to, 16) : parseInt(from.replace(/\?/g, "F"), 16);
          return [start, end];
        })
      : [[0, 0x10ffff]];
    faces.push({ family, weight, style, url, ranges });
  }
  return faces;
}

const inRanges = (ranges, cp) => ranges.some(([a, b]) => cp >= a && cp <= b);

// Swaps a font's English-alphabet file for our own copy, by weight. Its other alphabets have no copy of ours, so they
// are dropped: those letters then go in as pixels.
export const useOwnFiles = (faces, own) =>
  faces.flatMap((f) => {
    if (!own[f.family]) return [f];
    return inRanges(f.ranges, 0x41) && own[f.family][f.weight] ? [{ ...f, url: own[f.family][f.weight] }] : [];
  });

/**
 * The font file the browser uses for one letter.
 * @returns {{ url: string, weight: number, fakeBold: boolean } | null} fakeBold: the font has no bold of its own, so the
 *   browser thickens it, and so must we. null: none of the font's files has this letter.
 */
export function faceFor(faces, family, bold, codePoint) {
  const own = faces.filter((f) => f.family === family && f.style === "normal" && inRanges(f.ranges, codePoint));
  const wanted = bold ? 700 : 400;
  const exact = own.find((f) => f.weight === wanted);
  if (exact) return { url: exact.url, weight: wanted, fakeBold: false };
  const regular = own.find((f) => f.weight === 400) || own[0];
  return regular ? { url: regular.url, weight: regular.weight, fakeBold: bold } : null;
}

// How much the browser thickens a font with no bold of its own (Skia's "fake bold"): a line this wide, in px, drawn
// around the letter. Between 9 px and 36 px letters the share slides from 1/24 to 1/32.
export function fakeBoldWidth(fontSize) {
  const k = fontSize <= 9 ? 1 / 24 : fontSize >= 36 ? 1 / 32 : 1 / 24 + ((fontSize - 9) / 27) * (1 / 32 - 1 / 24);
  return fontSize * k;
}
export const FAKE_ITALIC_SKEW = 0.25; // the browser's slant for a font with no italic of its own

// [a, b, c, d, e, f] is the usual canvas transform: x' = a·x + c·y + e, y' = b·x + d·y + f
export const multiply = (m, n) => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

const num = (v) => {
  const s = v.toFixed(3);
  return s.includes(".") ? s.replace(/\.?0+$/, "") || "0" : s;
};

// A letter's outline (fontkit's path commands) as SVG path data, moved by the transform.
export function outlineToSvg(commands, m) {
  const pt = (x, y) => `${num(m[0] * x + m[2] * y + m[4])} ${num(m[1] * x + m[3] * y + m[5])}`;
  let d = "";
  for (const { command, args: a } of commands) {
    if (command === "moveTo") d += `M${pt(a[0], a[1])}`;
    else if (command === "lineTo") d += `L${pt(a[0], a[1])}`;
    else if (command === "quadraticCurveTo") d += `Q${pt(a[0], a[1])} ${pt(a[2], a[3])}`;
    else if (command === "bezierCurveTo") d += `C${pt(a[0], a[1])} ${pt(a[2], a[3])} ${pt(a[4], a[5])}`;
    else if (command === "closePath") d += "Z";
  }
  return d;
}

// A straight bar (an underline) as SVG path data, moved by the transform.
export function barToSvg(x0, x1, y, width, m) {
  const h = width / 2;
  return outlineToSvg(
    [
      { command: "moveTo", args: [x0, y - h] },
      { command: "lineTo", args: [x1, y - h] },
      { command: "lineTo", args: [x1, y + h] },
      { command: "lineTo", args: [x0, y + h] },
      { command: "closePath", args: [] },
    ],
    m,
  );
}

// "#abc" / "#aabbcc" -> { r, g, b } from 0 to 1; anything else (a see-through colour) -> null
export function hexToRgb(hex) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, "$&$&") : m[1];
  return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255 };
}
