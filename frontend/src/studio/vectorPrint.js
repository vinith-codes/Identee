// studio/vectorPrint.js
//
// The vector print file: the same print as the PNG, as a PDF (and its .ai byte copy) that stays sharp however far the
// print team zooms in:
//   • words are shapes (no pixels, no font needed);
//   • a picture the admin made PRINT-READY (Orders → Designs & print files → Prepare for print, 6 Nov 2026) goes in at
//     600 DPI, cut by its own vector edge — the way the print team approved;
//   • any other picture stays plain pixels at 300 DPI.
// Everything is placed by Konva's own layout, so the PDF matches the PNG and the Design Room.
//
// A text that can't be made of shapes (a letter the font doesn't have, such as Tamil or an emoji; a font that isn't one
// of ours; a see-through text) goes in as pixels with the pictures, so the print is still right, and is named for the
// print team.
import { PDFDocument, PDFRawStream, LineJoinStyle, appendBezierCurve, clipEvenOdd, closePath, concatTransformationMatrix, drawObject, endPath, lineTo, moveTo, popGraphicsState, pushGraphicsState, rgb, setLineJoin } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { AreaRenderer, buildNodes } from "./konvaRender";
import { FONTS, fontsCssUrl } from "./fonts";
import { FAKE_ITALIC_SKEW, barToSvg, faceFor, fakeBoldWidth, hexToRgb, multiply, outlineToSvg, parseFontFaces, useOwnFiles } from "./vectorText";
import montserrat400 from "@fontsource/montserrat/files/montserrat-latin-400-normal.woff2?url";
import montserrat700 from "@fontsource/montserrat/files/montserrat-latin-700-normal.woff2?url";
import oswald400 from "@fontsource/oswald/files/oswald-latin-400-normal.woff2?url";
import oswald700 from "@fontsource/oswald/files/oswald-latin-700-normal.woff2?url";
import playfair400 from "@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff2?url";
import playfair700 from "@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff2?url";

const PT_PER_PX = 72 / 300; // the print files are laid out at 300 DPI (print-ready pictures carry their own 600 DPI)
const WIDTH_TOLERANCE = 0.03; // our letters must add up to the browser's line width, or the text goes in as pixels

// Google sends these three as one file holding every weight, and the font library can't read a weight out of that kind
// of file. So they use the same fonts' separate regular and bold files, which come with this website.
const OWN_FILES = {
  Montserrat: { 400: montserrat400, 700: montserrat700 },
  Oswald: { 400: oswald400, 700: oswald700 },
  "Playfair Display": { 400: playfair400, 700: playfair700 },
};

/* ---------- the font files (Google's, the same ones the browser draws with) ---------- */
let facesLoading;
const fontFaces = () =>
  (facesLoading ||= fetch(fontsCssUrl())
    .then((r) => {
      if (!r.ok) throw new Error(`Google Fonts answered ${r.status}`);
      return r.text();
    })
    .then((css) => useOwnFiles(parseFontFaces(css), OWN_FILES))
    .catch((err) => {
      facesLoading = null;
      throw err;
    }));

const fontFiles = new Map();
const fontFile = (url) => {
  const key = url;
  if (!fontFiles.has(key)) {
    const loading = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`The font file answered ${r.status}`);
        return r.arrayBuffer();
      })
      .then((bytes) => fontkit.create(new Uint8Array(bytes)))
      .catch((err) => {
        fontFiles.delete(key);
        throw err;
      });
    fontFiles.set(key, loading);
  }
  return fontFiles.get(key);
};

/* ---------- one text as shapes ---------- */
// Lays out a piece of text: its letters with their outlines and places (px, from the start of the text).
// @returns null when a letter can't be made of shapes
async function layOut(text, el, fontSize, faces) {
  const runs = [];
  for (const ch of text) {
    const face = faceFor(faces, el.fontFamily, Boolean(el.bold), ch.codePointAt(0));
    if (!face) return null;
    const last = runs[runs.length - 1];
    if (last && last.face.url === face.url && last.face.weight === face.weight) last.text += ch;
    else runs.push({ face, text: ch });
  }
  const letters = [];
  let x = 0;
  for (const run of runs) {
    const font = await fontFile(run.face.url);
    if (font.directory.tables.fvar) return null; // Google has turned this font into one all-weights file: pixels are safe
    const scale = fontSize / font.unitsPerEm;
    const shaped = font.layout(run.text);
    const chars = Array.from(run.text);
    const oneEach = shaped.glyphs.length === chars.length; // not so when two letters join into one shape ("fi")
    for (const [i, glyph] of shaped.glyphs.entries()) {
      const place = shaped.positions[i];
      if (!glyph.id) return null; // the file doesn't really have this letter
      const nudge = place.xOffset * scale;
      letters.push({ commands: glyph.path.commands, chars: oneEach ? chars[i] : null, x: x + nudge, nudge, y: -place.yOffset * scale, scale, fakeBold: run.face.fakeBold });
      x += place.xAdvance * scale;
    }
  }
  return { letters, width: x };
}

// The distance from where Konva draws (the "middle" of the line) down to the letters' baseline
function baselineOffset(fontString) {
  const g = document.createElement("canvas").getContext("2d");
  g.font = fontString;
  g.textBaseline = "alphabetic";
  const a = g.measureText("M").fontBoundingBoxAscent;
  g.textBaseline = "middle";
  return a - g.measureText("M").fontBoundingBoxAscent;
}

const letterSvg = (letter, at, el) => {
  // a font's outlines go upward; the slant is the browser's own when the font has no italic
  const glyph = [letter.scale, 0, (el.italic ? FAKE_ITALIC_SKEW : 0) * letter.scale, -letter.scale, letter.x, letter.y];
  return outlineToSvg(letter.commands, multiply(at, glyph));
};

// @returns { d, fakeBold, fontSize, stroke } or null
async function textShapes(el, node, faces) {
  const inner = node.getClassName?.() === "Group" ? node.getChildren()[0] : node;
  const fontSize = inner.fontSize();
  const toLayer = inner.getAbsoluteTransform().getMatrix();
  const base = baselineOffset(inner._getContextFont());
  const spacing = inner.letterSpacing();
  let d = "";
  let fakeBold = false;

  if (inner.getClassName() === "TextPath") {
    if (el.underline) return null;
    for (const info of inner.glyphInfo) {
      const laid = await layOut(info.text, el, fontSize, faces);
      if (!laid) return null;
      const c = Math.cos(info.rotation);
      const s = Math.sin(info.rotation);
      const at = multiply(toLayer, [c, s, -s, c, info.p0.x, info.p0.y]);
      for (const letter of laid.letters) {
        fakeBold ||= letter.fakeBold;
        d += letterSvg({ ...letter, y: letter.y + base }, at, el);
      }
    }
  } else {
    if (inner.align() === "justify") return null;
    const lineHeight = inner.lineHeight() * fontSize;
    const total = inner.getWidth();
    let y = lineHeight / 2;
    for (const line of inner.textArr) {
      const startX = inner.align() === "right" ? total - line.width : inner.align() === "center" ? (total - line.width) / 2 : 0;
      if (spacing) {
        // letter by letter, the same sums as Konva's
        let x = startX;
        for (const ch of Array.from(line.text)) {
          const laid = await layOut(ch, el, fontSize, faces);
          if (!laid) return null;
          for (const letter of laid.letters) {
            fakeBold ||= letter.fakeBold;
            d += letterSvg({ ...letter, x: x + letter.x, y: y + base + letter.y }, toLayer, el);
          }
          x += inner.measureSize(ch).width + spacing;
        }
      } else {
        const laid = await layOut(line.text, el, fontSize, faces);
        if (!laid) return null;
        if (line.width > 0 && Math.abs(laid.width - line.width) / line.width > WIDTH_TOLERANCE) return null;
        // The shapes are ours, the places are the browser's: where the letter ends with everything before it, less its
        // own width. With joined letters, our own places stretched to the browser's line width.
        const browserPlaces = laid.letters.every((letter) => letter.chars !== null);
        const fit = laid.width > 0 ? line.width / laid.width : 1;
        let before = "";
        for (const letter of laid.letters) {
          fakeBold ||= letter.fakeBold;
          before += letter.chars;
          const x = browserPlaces ? inner.measureSize(before).width - inner.measureSize(letter.chars).width + letter.nudge : letter.x * fit;
          d += letterSvg({ ...letter, x: startX + x, y: y + base + letter.y }, toLayer, el);
        }
      }
      if (el.underline) d += barToSvg(startX, startX + Math.round(line.width), y + Math.round(fontSize / 2), fontSize / 15, toLayer);
      y += lineHeight;
    }
  }
  const stroke = inner.strokeWidth() > 0 && inner.stroke() ? { width: inner.strokeWidth(), colour: hexToRgb(inner.stroke()) } : null;
  if (stroke && !stroke.colour) return null;
  return { d, fakeBold, fontSize, stroke };
}

// Can this text be made of shapes at all? (the letters are checked when it is laid out)
const shapeable = (el) => el.type === "text" && FONTS.includes(el.fontFamily) && hexToRgb(el.color || "#000000") && (el.opacity == null || el.opacity >= 1);

/* ---------- pixels: plain pictures, and any text that can't be shapes ---------- */
async function embedPixels(pdf, page, elements, W, H) {
  const r = new AreaRenderer(W, H);
  try {
    const canvas = r.render(elements, { full: true });
    const { data } = canvas.getContext("2d").getImageData(0, 0, W, H);
    let [x0, y0, x1, y1] = [W, H, -1, -1];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!data[(y * W + x) * 4 + 3]) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
    if (x1 < 0) return;
    const cut = document.createElement("canvas");
    cut.width = x1 - x0 + 1;
    cut.height = y1 - y0 + 1;
    cut.getContext("2d").drawImage(canvas, x0, y0, cut.width, cut.height, 0, 0, cut.width, cut.height);
    const blob = await new Promise((resolve) => cut.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("The picture is too big for this browser.");
    const image = await pdf.embedPng(new Uint8Array(await blob.arrayBuffer()));
    page.drawImage(image, { x: x0, y: H - y1 - 1, width: cut.width, height: cut.height });
    cut.width = 0;
  } finally {
    r.destroy();
  }
}

/* ---------- a print-ready picture: its own pixels at 600 DPI, cut by its vector edge ---------- */
// clip: "M x y C x1 y1 x2 y2 x y … Z" in the picture's own pixels (y down), from the server's recipe
function clipOperators(clip) {
  const ops = [];
  for (const tok of clip.split(/ (?=[MLCZ])/)) {
    const k = tok[0];
    const n = tok.slice(1).trim().split(/\s+/).map(Number);
    if (k === "M") ops.push(moveTo(n[0], n[1]));
    else if (k === "L") ops.push(lineTo(n[0], n[1]));
    else if (k === "C") ops.push(appendBezierCurve(n[0], n[1], n[2], n[3], n[4], n[5]));
    else if (k === "Z") ops.push(closePath());
  }
  return ops;
}

// where the picture's node sits on the layer (its box, turned and mirrored as the customer placed it)
function picturePlace(el, r, W, H) {
  const byId = buildNodes(r.layer, [el], W, H, { full: true });
  const inner = byId.get(String(el.id)).getChildren()[0];
  const place = { m: inner.getAbsoluteTransform().getMatrix(), nw: inner.width(), nh: inner.height() };
  r.layer.destroyChildren();
  return place;
}

function drawPicture(pdf, page, pic, place, H) {
  const dict = pdf.context.obj({
    Type: "XObject",
    Subtype: "Image",
    Width: pic.width,
    Height: pic.height,
    ColorSpace: "DeviceRGB",
    BitsPerComponent: 8,
    Filter: "FlateDecode",
    DecodeParms: { Predictor: 15, Colors: 3, BitsPerComponent: 8, Columns: pic.width },
    Length: pic.flate.length,
  });
  const name = page.node.newXObject("Im", pdf.context.register(PDFRawStream.of(dict, pic.flate)));
  const [a, b, c, d, e, f] = place.m;
  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(1, 0, 0, -1, 0, H), // the layer's y runs down
    concatTransformationMatrix(a, b, c, d, e, f), // the node's box on the layer
    concatTransformationMatrix(place.nw / pic.width, 0, 0, place.nh / pic.height, 0, 0), // picture pixels in the box
    ...clipOperators(pic.clip),
    clipEvenOdd(),
    endPath(),
    concatTransformationMatrix(pic.width, 0, 0, -pic.height, 0, pic.height), // the picture, first row at the top
    drawObject(name),
    popGraphicsState(),
  );
}

/* ---------- the PDF ---------- */
/**
 * @param elements  one print area's elements
 * @param W, H      the print's size in px at 300 DPI
 * @param title
 * @param opts.pictures  Map: element id -> { width, height, clip, flate } of its print-ready picture (printFileService)
 * @returns {{ bytes: Uint8Array|null, vectorTexts: number, vectorPictures: number, pixelTexts: string[] }}
 *   bytes: null when the PDF would add nothing to the PNG (no shapes, no print-ready picture)
 */
export async function buildVectorPdf(elements, W, H, title = "IDENTEE print", { pictures = new Map() } = {}) {
  const sorted = [...elements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
  const texts = sorted.filter((e) => e.type === "text");
  const prepared = (el) => el.type === "image" && pictures.has(String(el.id));
  const vectorPictures = sorted.filter(prepared).length;
  if (!texts.some(shapeable) && !vectorPictures) return { bytes: null, vectorTexts: 0, vectorPictures: 0, pixelTexts: texts.map((e) => e.text) };

  const faces = texts.some(shapeable) ? await fontFaces() : null;
  // every text's shapes and every print-ready picture's place first, so the pixels can be grouped around them in order
  const r = new AreaRenderer(W, H);
  const shapes = new Map();
  const places = new Map();
  try {
    for (const el of sorted) {
      if (prepared(el)) {
        places.set(el, picturePlace(el, r, W, H));
        continue;
      }
      if (!shapeable(el)) continue;
      const byId = buildNodes(r.layer, [el], W, H, { full: true });
      const made = await textShapes(el, byId.get(String(el.id)).getChildren()[0], faces);
      if (made?.d) shapes.set(el, made);
      r.layer.destroyChildren();
    }
  } finally {
    r.destroy();
  }
  const pixelTexts = texts.filter((e) => !shapes.has(e)).map((e) => e.text);
  if (!shapes.size && !vectorPictures) return { bytes: null, vectorTexts: 0, vectorPictures: 0, pixelTexts };

  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setProducer("IDENTEE print files");
  pdf.setCreator("IDENTEE");
  const page = pdf.addPage([W * PT_PER_PX, H * PT_PER_PX]);
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(PT_PER_PX, 0, 0, PT_PER_PX, 0, 0));

  let pixels = []; // elements waiting to go in together, in their order
  const flush = async () => {
    if (pixels.length) await embedPixels(pdf, page, pixels, W, H);
    pixels = [];
  };
  for (const el of sorted) {
    if (prepared(el)) {
      await flush();
      drawPicture(pdf, page, pictures.get(String(el.id)), places.get(el), H);
      continue;
    }
    const made = shapes.get(el);
    if (!made) {
      pixels.push(el);
      continue;
    }
    await flush();
    const place = { x: 0, y: H, scale: 1 };
    const { r: red, g, b } = hexToRgb(el.color || "#000000");
    const colour = rgb(red, g, b);
    page.pushOperators(pushGraphicsState(), setLineJoin(LineJoinStyle.Round));
    // the outline goes under the letters, as on the canvas
    const thicken = made.fakeBold ? fakeBoldWidth(made.fontSize) : 0;
    if (made.stroke) page.drawSvgPath(made.d, { ...place, borderColor: rgb(made.stroke.colour.r, made.stroke.colour.g, made.stroke.colour.b), borderWidth: made.stroke.width + thicken });
    if (made.fakeBold) page.drawSvgPath(made.d, { ...place, color: colour, borderColor: colour, borderWidth: thicken });
    else page.drawSvgPath(made.d, { ...place, color: colour });
    page.pushOperators(popGraphicsState());
  }
  await flush();
  page.pushOperators(popGraphicsState());
  return { bytes: await pdf.save({ useObjectStreams: false }), vectorTexts: shapes.size, vectorPictures, pixelTexts };
}
