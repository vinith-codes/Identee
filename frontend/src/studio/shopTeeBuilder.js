// studio/shopTeeBuilder.js — one shop tee from a front picture and a back picture (25 Nov 2026)
//
// The owner: "Think as a admin and make it. It should be easy for them to add the product." Add a tee, Add many tees and
// "+ Add to a style" (Manage the shop) all make a tee the same way:
//   - the admin picks where each picture prints from a few plain choices (FRONT_SPOTS / BACK_SPOTS);
//   - the picture is placed as big as that print area allows, on the garment's own print area for size M — the print
//     team's files follow each size's true print area, as for every tee (panelModel);
//   - a big back goes just under the collar, the print team's biggest back print (trendTee.js putBigBack);
//   - a style without that print area gets the side's main one, and the tee says so (notes → the tee's "issues",
//     shown in Check and show);
//   - the shop-side words come from the style's settings (Admin → Shop your IDENTEE → Styles: name, wearer, category,
//     fit words — server/utils/shopStyles.js).
import { putBigBack, wholeFit } from "./trendTee";
import { withSpots } from "./panelModel";
import { areaCm } from "./teeModel";

export const FRONT_SPOTS = [
  { key: "left-chest", label: "Small logo on the chest", hint: "Left chest, logo size" },
  { key: "centre-front", label: "Centre of the chest", hint: "The usual front print" },
  { key: "full-front", label: "Big on the front", hint: "The whole front" },
  { key: "none", label: "Nothing on the front", hint: "" },
];
export const BACK_SPOTS = [
  { key: "full-back", label: "Big on the back", hint: "Just under the collar, as big as it prints" },
  { key: "nape", label: "Small, under the collar", hint: "A small mark at the back of the neck" },
  { key: "none", label: "Nothing on the back", hint: "" },
];
// the area each choice prints on, and the ones tried next when the style hasn't got it
const AREAS = { "left-chest": ["left-chest"], "centre-front": ["centre-front"], "full-front": ["full-front", "centre-front"], "full-back": ["full-back"], nape: ["nape", "top-back"] };
// how the picture sits in its area: a front print from the top of the area (like the shop's logos); a small mark centred
const AT_TOP = new Set(["centre-front", "full-front"]);

const areaFor = (catalog, spot, side, notes, styleName) => {
  for (const key of AREAS[spot] || []) {
    const pos = catalog.find((p) => p.key === key);
    if (pos) {
      if (key !== spot) notes.push(`${side === "front" ? "Front" : "Back"}: ${styleName} has no “${labelOf(spot)}” area — printed on ${pos.label} instead.`);
      return pos;
    }
  }
  const main = catalog.find((p) => p.side === side && p.main) || catalog.find((p) => p.side === side);
  if (main) notes.push(`${side === "front" ? "Front" : "Back"}: ${styleName} has no “${labelOf(spot)}” area — printed on ${main.label} instead.`);
  return main || null;
};
const labelOf = (spot) => [...FRONT_SPOTS, ...BACK_SPOTS].find((s) => s.key === spot)?.label || spot;

/**
 * The tee's prints. garment: from the Studio setup (studioGarments: positions, sizes, shop …); catalog / maxPrint: the
 * garment's print areas (GET /api/print-positions); front / back: { url, w, h } or null; frontSpot / backSpot: a key of
 * FRONT_SPOTS / BACK_SPOTS; lockFront: the customer can't move or remove the front picture (a collection's logo, as GTA).
 * -> { elements, positions, notes } — positions: the catalog with a big back's free place, for the mockup camera.
 */
/** The size a shop tee is placed and pictured on: M, or the middle size of a garment without M (kids 4-6 to 13-14). */
export function shopSize(garment) {
  const sizes = garment?.sizes || [];
  return !sizes.length || sizes.includes("M") ? "M" : sizes[Math.floor((sizes.length - 1) / 2)];
}

export function buildShopTee({ garment, catalog, maxPrint = null, size = "M", front = null, back = null, frontSpot = "centre-front", backSpot = "full-back", lockFront = false }) {
  const notes = [];
  const styleName = garment?.shop?.style || garment?.label || "This style";
  let elements = [];
  if (front?.url && frontSpot !== "none") {
    const pos = areaFor(catalog, frontSpot, "front", notes, styleName);
    if (!pos) throw new Error(`${styleName} has no front print area.`);
    const fit = wholeFit(pos, size, front.w, front.h, 100);
    if (AT_TOP.has(pos.key)) fit.y = 0;
    elements.push({ id: "shop-front", type: "image", src: front.url, position: pos.key, side: pos.side, zIndex: 1, pxW: front.w, ...(lockFront ? { fixed: true } : {}), ...fit });
  }
  if (back?.url && backSpot !== "none") {
    const pos = areaFor(catalog, backSpot, "back", notes, styleName);
    if (!pos) throw new Error(`${styleName} has no back print area.`);
    const el = { id: "shop-back", type: "image", src: back.url, position: pos.key, side: pos.side, zIndex: 2, pxW: back.w, aiLayout: "back", ...wholeFit(pos, size, back.w, back.h, pos.key === "full-back" ? 92 : 100) };
    elements = pos.key === "full-back" ? putBigBack(elements, el, { positions: catalog, garment, size, maxPrint, shape: back.w / back.h }).elements : [...elements, el];
  }
  if (!elements.length) throw new Error("Add a front or a back picture (or choose where it prints).");
  return { elements, positions: withSpots(catalog, elements, garment, maxPrint), notes };
}

/** How sharp a picture prints where it goes: dots per inch on the printed size (under 150 prints soft). */
export function printDpi(pic, pos, size = "M", fill = 100) {
  if (!pic?.w || !pos) return null;
  const fit = wholeFit(pos, size, pic.w, pic.h, fill);
  const cmW = ((areaCm(pos, size)[0] || 30) * fit.width) / 100;
  return Math.round(pic.w / (cmW / 2.54));
}

/** "AYYAPPA" + "Tiger Saranam" → "AYYAPPA · Tiger Saranam" (the shop groups tees into collections by the first part). */
export const fullName = (collection, name) => {
  const c = String(collection || "").replace(/\s+/g, " ").trim();
  const n = String(name || "").replace(/\s+/g, " ").replace(/·/g, "-").trim();
  return c ? `${c} · ${n}` : n;
};

/**
 * What the Studio saves for a shop tee of one style (studioService.saveDesign): the tee's words from the style's
 * settings. t: { name, label, about, frontSpot, backSpot, hasFront, hasBack, price, oldPrice, description, featured,
 * family, notes }; garment: with .shop; tee: buildShopTee's result; colours: [{ slug, mockups }].
 */
export function shopTeeBody(t, garment, tee, colours) {
  const shop = garment.shop || {};
  const sides = [
    t.hasFront && t.frontSpot !== "none" ? `Front: ${labelOf(t.frontSpot).toLowerCase()}.` : "Front: plain.",
    t.hasBack && t.backSpot !== "none" ? `Back: ${labelOf(t.backSpot).toLowerCase()}.` : "Back: plain.",
  ].join(" ");
  const description = String(t.description || "").trim() || `${t.about ? `${t.about} tee: ` : ""}${t.label}. ${sides} ${shop.fitText || "Regular fit"}, 100% Cotton, DTF print, made to order.`;
  return {
    garmentType: garment.key,
    color: colours[0].slug,
    size: shopSize(garment),
    name: t.name,
    blurb: `${t.label} — ${sides.toLowerCase()}`.slice(0, 300),
    elements: tee.elements,
    colours,
    sizes: garment.sizes,
    category: shop.category,
    priceInr: t.price > 0 ? Math.round(t.price) : 0,
    issues: [...(tee.notes || []), ...(t.notes || [])].slice(0, 12),
    family: t.family || undefined,
    product: {
      listings: [{ category: shop.category, style: shop.style }],
      gender: shop.wearer || "Unisex",
      fabric: "100% Cotton",
      hsnCode: "6109",
      type: "Casual",
      ageRange: "Adult",
      washCare: [],
      oldPrice: t.oldPrice > 0 ? Math.round(t.oldPrice) : 0,
      description,
      featured: Boolean(t.featured),
    },
  };
}

/** The styles a tee can be made in: the live garments switched on in Styles, in their order. */
export const shopStyles = (garments = []) =>
  garments.filter((g) => g.shop?.on && g.shop.colours?.length).sort((a, b) => a.shop.order - b.shop.order || a.shop.style.localeCompare(b.shop.style) || String(a.shop.wearer).localeCompare(String(b.shop.wearer)));

/** "Round Neck · Women" — a style's short name in the admin (Unisex is left out). */
export const styleLabel = (g) => `${g.shop?.style || g.label}${g.shop?.wearer && g.shop.wearer !== "Unisex" ? ` · ${g.shop.wearer}` : ""}`;

const FRONT_KEYS = new Set(FRONT_SPOTS.map((s) => s.key));
/**
 * An existing shop tee's pictures and where they print, read back for "+ Add to a style" (Manage the shop): the first
 * picture on the front and on the back. Anything else on the tee (words, more pictures) isn't copied — `left` says how
 * many, so the new tee can say so. -> { front: { url } | null, back, frontSpot, backSpot, lockFront, left }
 */
export function picturesOf(design) {
  const all = design?.elements || [];
  const pics = all.filter((e) => e.type === "image" && e.src);
  const f = pics.find((e) => e.side === "front") || null;
  const b = pics.find((e) => e.side === "back") || null;
  return {
    front: f ? { url: f.src } : null,
    back: b ? { url: b.src } : null,
    frontSpot: f ? (FRONT_KEYS.has(f.position) && f.position !== "none" ? f.position : "centre-front") : "none",
    backSpot: b ? (["nape", "top-back"].includes(b.position) ? "nape" : "full-back") : "none",
    lockFront: Boolean(f?.fixed),
    left: all.filter((e) => e !== f && e !== b).length,
  };
}
