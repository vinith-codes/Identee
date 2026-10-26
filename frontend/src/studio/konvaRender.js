// studio/konvaRender.js
//
// Draws a print area's elements with Konva — the same code feeds the flat
// editor (visible stage) and the 3D tee (an off-screen picture used as the
// decal texture), so what you edit is exactly what you see on the shirt.
//
// Elements use the saved "layout v2" format: x / y / width / height are % of
// the print box (top-left corner of the unrotated box), rotation is in
// degrees around the box centre, text size is fontSizePct (% of box height).
import Konva from "konva";
import { imageUrl } from "../utils/imageUrl";

/* ---------- images (CORS-safe so the 3D texture isn't "tainted") ---------- */
const imgCache = new Map(); // src (+ "#full") -> { img, ready: Promise }
// full: the original upload (print files) instead of a 1600 px screen copy
const cacheKey = (src, full) => (full ? `${src}#full` : src);
const originalUrl = (src) => (/^https?:\/\//.test(src) ? src : imageUrl(src));
export function loadImage(src, { full = false } = {}) {
  if (!src) return Promise.reject(new Error("no image"));
  const key = cacheKey(src, full);
  const hit = imgCache.get(key);
  if (hit) return hit.ready;
  const img = new Image();
  img.crossOrigin = "anonymous";
  const ready = new Promise((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image failed"));
  });
  img.src = src.startsWith("blob:") || src.startsWith("data:") ? src : full ? originalUrl(src) : imageUrl(src, 1600);
  imgCache.set(key, { img, ready });
  return ready;
}
export const cachedImage = (src, full = false) => {
  const hit = imgCache.get(cacheKey(src, full));
  return hit && hit.img.complete && hit.img.naturalWidth ? hit.img : null;
};

/* ---------- text helpers ---------- */
const fontStyle = (el) => [el.bold && "bold", el.italic && "italic"].filter(Boolean).join(" ") || "normal";

// Letter spacing and outline are saved in % of the letter size.
const letterPx = (el, H) => Math.max(4, ((el.fontSizePct || 15) / 100) * H);
const spacingPx = (el, H) => ((el.letterSpacingPct || 0) / 100) * letterPx(el, H);
const outline = (el, H) =>
  el.strokeWidthPct > 0 && el.strokeColor
    ? { stroke: el.strokeColor, strokeWidth: (el.strokeWidthPct / 100) * letterPx(el, H) * 2, fillAfterStrokeEnabled: true, lineJoin: "round" }
    : {};

// Size of a text element in px (unrotated), for a box of height H.
export function measureText(el, H) {
  const t = new Konva.Text({
    text: el.text || " ",
    fontFamily: el.fontFamily || "Arial",
    fontSize: Math.max(4, ((el.fontSizePct || 15) / 100) * H),
    fontStyle: fontStyle(el),
    align: el.align || "center",
    lineHeight: el.lineHeight || 1.05,
    letterSpacing: spacingPx(el, H),
  });
  const w = t.width();
  const h = t.height() * (el.effect && el.effect !== "straight" ? 1.25 : 1);
  t.destroy();
  return { w, h };
}

/* ---------- build one element's node ---------- */
function textNode(el, W, H) {
  const fontSize = Math.max(4, ((el.fontSizePct || 15) / 100) * H);
  const common = {
    fontFamily: el.fontFamily || "Arial",
    fontSize,
    fontStyle: fontStyle(el),
    textDecoration: el.underline ? "underline" : "",
    fill: el.color || "#000000",
    letterSpacing: spacingPx(el, H),
    ...outline(el, H),
  };
  if (el.effect === "arc-up" || el.effect === "arc-down") {
    const flat = measureText({ ...el, effect: "straight" }, H);
    const chord = flat.w * 1.06;
    const sag = chord * 0.16;
    const up = el.effect === "arc-up";
    const data = up
      ? `M0,${sag + fontSize * 0.8} Q${chord / 2},${-sag + fontSize * 0.8} ${chord},${sag + fontSize * 0.8}`
      : `M0,${fontSize * 0.8} Q${chord / 2},${2 * sag + fontSize * 0.8} ${chord},${fontSize * 0.8}`;
    const tp = new Konva.TextPath({ ...common, text: el.text || " ", data, align: "center" });
    const box = { w: chord, h: fontSize * 1.05 + sag * 1.6 };
    const g = new Konva.Group({ width: box.w, height: box.h });
    g.add(tp);
    return { node: g, w: box.w, h: box.h };
  }
  const t = new Konva.Text({ ...common, text: el.text || " ", align: el.align || "center", lineHeight: el.lineHeight || 1.05 });
  return { node: t, w: t.width(), h: t.height() };
}

function imageNode(el, W, H, full) {
  const img = cachedImage(el.src, full);
  const w = ((el.width || 50) / 100) * W;
  const h = ((el.height || 50) / 100) * H;
  if (!img) {
    // placeholder until the picture arrives
    return { node: new Konva.Rect({ width: w, height: h, stroke: "rgba(201,162,75,.8)", dash: [10, 8], strokeWidth: 3 }), w, h };
  }
  return { node: new Konva.Image({ image: img, width: w, height: h }), w, h };
}

/**
 * Adds the elements to a Konva layer, each wrapped in a group centred on
 * its box centre (so rotation and scaling happen around the centre).
 * @returns {Map<string, Konva.Group>} id -> group
 */
export function buildNodes(layer, elements, W, H, { full = false } = {}) {
  const byId = new Map();
  const sorted = [...elements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
  for (const el of sorted) {
    const { node, w, h } = el.type === "text" ? textNode(el, W, H) : imageNode(el, W, H, full);
    const bw = el.type === "text" ? w : ((el.width || 50) / 100) * W;
    const bh = el.type === "text" ? h : ((el.height || 50) / 100) * H;
    // stored box (top-left %) → centre in px
    const cx = ((el.x || 0) / 100) * W + (((el.width ?? (bw / W) * 100)) / 100) * W / 2;
    const cy = ((el.y || 0) / 100) * H + (((el.height ?? (bh / H) * 100)) / 100) * H / 2;
    // opacity and mirror (the admin's Studio, 25 Oct 2026): the group fades; the drawn node is mirrored inside it, so the
    // editor's handles (which read the group's scale) are not affected
    const g = new Konva.Group({ x: cx, y: cy, rotation: el.rotation || 0, offsetX: bw / 2, offsetY: bh / 2, id: String(el.id), name: "el", opacity: el.opacity == null ? 1 : Math.max(0.05, Math.min(1, el.opacity)) });
    if (el.flipH) node.setAttrs({ scaleX: -(node.scaleX() || 1), x: node.x() + bw });
    if (el.flipV) node.setAttrs({ scaleY: -(node.scaleY() || 1), y: node.y() + bh });
    g.setAttr("boxW", bw);
    g.setAttr("boxH", bh);
    g.add(node);
    layer.add(g);
    byId.set(String(el.id), g);
  }
  return byId;
}

/* ---------- off-screen renderer for the 3D decal textures ---------- */
export class AreaRenderer {
  constructor(W, H) {
    this.W = Math.round(W);
    this.H = Math.round(H);
    this.container = document.createElement("div");
    this.stage = new Konva.Stage({ container: this.container, width: this.W, height: this.H });
    this.layer = new Konva.Layer({ listening: false });
    this.stage.add(this.layer);
    // one canvas per area, redrawn in place (exactly W × H pixels), so the
    // 3D texture is only refreshed — never rebuilt — while you drag
    this.layer.getCanvas().setPixelRatio(1);
    this.stage.size({ width: this.W, height: this.H });
  }
  // opts.outline: also draw the print area's dashed gold border (the area
  // being edited). It is part of the layer, so Konva's own redraws keep it.
  render(elements, opts) {
    this.layer.destroyChildren();
    buildNodes(this.layer, elements, this.W, this.H, opts);
    if (opts?.outline) {
      // Two-tone border: dark and pale-gold dashes alternate, so it shows on
      // every tee colour (plain gold disappeared on lavender, beige, cream).
      const line = Math.max(5, this.W / 110);
      const dash = line * 4;
      const box = { x: line / 2, y: line / 2, width: this.W - line, height: this.H - line, strokeWidth: line, listening: false };
      this.layer.add(new Konva.Rect({ ...box, stroke: "rgba(21,19,15,0.82)", dash: [dash, dash] }));
      this.layer.add(new Konva.Rect({ ...box, stroke: "#F6DFA0", dash: [dash, dash], dashOffset: dash }));
    }
    this.layer.draw();
    return this.layer.getNativeCanvasElement();
  }
  destroy() {
    this.stage.destroy();
  }
}

// Every image src used by the elements (to preload before rendering).
export const imageSrcs = (elements) => [...new Set(elements.filter((e) => e.type === "image" && e.src).map((e) => e.src))];

/* ---------- team orders: one player's tee ---------- */
// The elements of ONE print area with a player's name and number in place of
// the texts marked for them (el.role). Each replaced text keeps its middle and
// its look; a long name is made smaller so it stays inside the print area.
// A player without a number (or name) simply has no such text on their tee.
// W, H: the area's size in px (any scale — only its shape matters).
export function playerElements(elements, player, W, H) {
  const out = [];
  for (const el of elements) {
    if (el.type !== "text" || !el.role) {
      out.push(el);
      continue;
    }
    const value = String((el.role === "name" ? player.name : player.number) || "").trim();
    if (!value) continue;
    const upper = el.text === el.text.toUpperCase() && el.text !== el.text.toLowerCase();
    let next = { ...el, text: upper ? value.toUpperCase() : value };
    const cx = (el.x || 0) + (el.width || 0) / 2;
    const cy = (el.y || 0) + (el.height || 0) / 2;
    const turned = Math.abs(el.rotation || 0) === 90; // vertical text runs down the area
    const lengthOf = (m) => (turned ? (m.w / H) * 100 : (m.w / W) * 100);
    let m = measureText(next, H);
    const room = Math.max(el.width && !turned ? el.width : 0, 92);
    if (lengthOf(m) > room) {
      next = { ...next, fontSizePct: (next.fontSizePct * room) / lengthOf(m) };
      m = measureText(next, H);
    }
    const width = (m.w / W) * 100;
    const height = (m.h / H) * 100;
    out.push({ ...next, width, height, x: cx - width / 2, y: cy - height / 2 });
  }
  return out;
}

// A print area's picture (the 3D tee's texture) made small, for the card of an area that has a design.
export function printThumb(canvas) {
  if (!canvas?.width) return null;
  const long = Math.max(canvas.width, canvas.height);
  const c = document.createElement("canvas");
  c.width = Math.max(8, Math.round((120 * canvas.width) / long));
  c.height = Math.max(8, Math.round((120 * canvas.height) / long));
  c.getContext("2d").drawImage(canvas, 0, 0, c.width, c.height);
  try {
    return c.toDataURL("image/png");
  } catch {
    return null; // a picture from another site cannot be copied; the card keeps its plain box
  }
}
