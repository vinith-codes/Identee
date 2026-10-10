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

// Size of a text element in px (unrotated), for a box of height H.
export function measureText(el, H) {
  const t = new Konva.Text({
    text: el.text || " ",
    fontFamily: el.fontFamily || "Arial",
    fontSize: Math.max(4, ((el.fontSizePct || 15) / 100) * H),
    fontStyle: fontStyle(el),
    align: el.align || "center",
    lineHeight: 1.05,
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
  const t = new Konva.Text({ ...common, text: el.text || " ", align: el.align || "center", lineHeight: 1.05 });
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
    const g = new Konva.Group({ x: cx, y: cy, rotation: el.rotation || 0, offsetX: bw / 2, offsetY: bh / 2, id: String(el.id), name: "el" });
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
