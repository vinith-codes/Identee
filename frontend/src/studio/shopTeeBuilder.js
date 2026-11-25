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

// every print area the garments have (Create your IDENTEE's print areas), in plain words. 26 Nov 2026 the owner: "we can
// add many print areas in where they print" — a style without one gets the nearest (AREAS), and the tee says so
export const FRONT_SPOTS = [
  { key: "left-chest", label: "Small logo on the chest", hint: "Left chest, logo size" },
  { key: "right-chest", label: "Small logo, right chest", hint: "Right chest, logo size" },
  { key: "centre-front", label: "Centre of the chest", hint: "The usual front print" },
  { key: "chest-line", label: "A line across the chest", hint: "Wide and short: a word or a name" },
  { key: "mid-front", label: "Middle of the front", hint: "Lower than the chest print" },
  { key: "full-front", label: "Big on the front", hint: "The whole front" },
  { key: "vertical-front", label: "Down the middle", hint: "Tall and thin, down the centre" },
  { key: "front-left-vertical", label: "Down the left side", hint: "Tall and thin, on the wearer's left" },
  { key: "front-right-vertical", label: "Down the right side", hint: "Tall and thin, on the wearer's right" },
  { key: "lower-left", label: "Bottom left corner", hint: "Small, near the hem" },
  { key: "lower-right", label: "Bottom right corner", hint: "Small, near the hem" },
  { key: "none", label: "Nothing on the front", hint: "" },
];
export const BACK_SPOTS = [
  { key: "full-back", label: "Big on the back", hint: "Just under the collar, as big as it prints" },
  { key: "nape", label: "Small, under the collar", hint: "A small mark at the back of the neck" },
  { key: "top-back", label: "Top of the back", hint: "Across the shoulders" },
  { key: "centre-back", label: "Centre of the back", hint: "A medium print in the middle" },
  { key: "mid-back", label: "Middle of the back", hint: "A little lower" },
  { key: "lower-back", label: "Lower back", hint: "Near the hem" },
  { key: "vertical-back", label: "Down the back", hint: "Tall and thin, down the centre" },
  { key: "none", label: "Nothing on the back", hint: "" },
];
export const SLEEVE_SPOTS = [
  { key: "left-sleeve", label: "Left sleeve", hint: "The wearer's left arm" },
  { key: "right-sleeve", label: "Right sleeve", hint: "The wearer's right arm" },
  { key: "both-sleeves", label: "Both sleeves", hint: "The same picture on each arm" },
  { key: "none", label: "No sleeve print", hint: "" },
];
// the area each choice prints on, and the ones tried next when the style hasn't got it
const AREAS = {
  "left-chest": ["left-chest"],
  "right-chest": ["right-chest", "left-chest"],
  "centre-front": ["centre-front"],
  "chest-line": ["chest-line", "centre-front"],
  "mid-front": ["mid-front", "centre-front"],
  "full-front": ["full-front", "centre-front"],
  "vertical-front": ["vertical-front", "front-left-vertical"],
  "front-left-vertical": ["front-left-vertical", "vertical-front"],
  "front-right-vertical": ["front-right-vertical", "vertical-front", "front-left-vertical"],
  "lower-left": ["lower-left"],
  "lower-right": ["lower-right", "lower-left"],
  "full-back": ["full-back"],
  nape: ["nape", "top-back"],
  "top-back": ["top-back", "nape"],
  "centre-back": ["centre-back", "mid-back"],
  "mid-back": ["mid-back", "centre-back"],
  "lower-back": ["lower-back"],
  "vertical-back": ["vertical-back", "mid-back"],
};
const SLEEVES = { "left-sleeve": ["left-sleeve"], "right-sleeve": ["right-sleeve"], "both-sleeves": ["left-sleeve", "right-sleeve"] };

/**
 * A small note on a choice when not every ticked style has that print area (their areas: garment.positions).
 * -> "" | "Oversized only" | "not on Round Neck · Women" | "no ticked style has it"
 */
export function spotNote(spot, styles = []) {
  const keys = SLEEVES[spot] || (spot === "none" ? [] : [spot]);
  if (!keys.length || !styles.length) return "";
  const has = styles.filter((g) => keys.every((k) => (g.positions || []).some((p) => p.key === k)));
  if (has.length === styles.length) return "";
  if (!has.length) return "no ticked style has it";
  return has.length === 1 && styles.length > 2 ? `${styleLabel(has[0])} only` : `not on ${styles.filter((g) => !has.includes(g)).map(styleLabel).join(", ")}`;
}
// how the picture sits in its area: a front print from the top of the area (like the shop's logos); a small mark centred
const AT_TOP = new Set(["centre-front", "full-front"]);

const areaFor = (catalog, spot, side, notes, styleName) => {
  for (const key of AREAS[spot] || []) {
    const pos = catalog.find((p) => p.key === key);
    if (pos) {
      if (key !== spot) notes.push(`${sideWord(side)}: ${styleName} has no “${labelOf(spot)}” area — printed on ${pos.label} instead.`);
      return pos;
    }
  }
  const main = catalog.find((p) => p.side === side && p.main) || catalog.find((p) => p.side === side);
  if (main) notes.push(`${sideWord(side)}: ${styleName} has no “${labelOf(spot)}” area — printed on ${main.label} instead.`);
  return main || null;
};
const sideWord = (side) => ({ front: "Front", back: "Back", left: "Left sleeve", right: "Right sleeve" })[side] || side;
const labelOf = (spot) => [...FRONT_SPOTS, ...BACK_SPOTS, ...SLEEVE_SPOTS].find((s) => s.key === spot)?.label || spot;

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

export function buildShopTee({ garment, catalog, maxPrint = null, size = "M", front = null, back = null, sleeve = null, frontSpot = "centre-front", backSpot = "full-back", sleeveSpot = "none", lockFront = false }) {
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
  // a sleeve picture: on one arm or both (the same picture on each), as big as the sleeve's print area allows
  if (sleeve?.url && SLEEVES[sleeveSpot]) {
    for (const key of SLEEVES[sleeveSpot]) {
      const side = key === "left-sleeve" ? "left" : "right";
      const pos = catalog.find((p) => p.key === key) || catalog.find((p) => p.side === side);
      if (!pos) {
        notes.push(`${sideWord(side)}: ${styleName} has no sleeve print area — not printed.`);
        continue;
      }
      elements.push({ id: `shop-${key}`, type: "image", src: sleeve.url, position: pos.key, side: pos.side, zIndex: 3, pxW: sleeve.w, ...wholeFit(pos, size, sleeve.w, sleeve.h, 100) });
    }
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
    t.hasSleeve && SLEEVES[t.sleeveSpot] ? `Sleeve: ${labelOf(t.sleeveSpot).toLowerCase()}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
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
const BACK_KEYS = new Set(BACK_SPOTS.map((s) => s.key));
/**
 * An existing shop tee's pictures and where they print, read back for "+ Add to a style" (Manage the shop): the first
 * picture on the front, on the back and on the sleeves (one picture on both arms counts once). Anything else on the tee
 * (words, more pictures) isn't copied — `left` says how many, so the new tee can say so.
 * -> { front: { url } | null, back, sleeve, frontSpot, backSpot, sleeveSpot, lockFront, left }
 */
export function picturesOf(design) {
  const all = design?.elements || [];
  const pics = all.filter((e) => e.type === "image" && e.src);
  const f = pics.find((e) => e.side === "front") || null;
  const b = pics.find((e) => e.side === "back") || null;
  const sl = pics.find((e) => e.side === "left" || e.side === "right") || null;
  const arms = sl ? pics.filter((e) => (e.side === "left" || e.side === "right") && e.src === sl.src) : [];
  const onLeft = arms.some((e) => e.side === "left");
  const onRight = arms.some((e) => e.side === "right");
  return {
    front: f ? { url: f.src } : null,
    back: b ? { url: b.src } : null,
    sleeve: sl ? { url: sl.src } : null,
    frontSpot: f ? (FRONT_KEYS.has(f.position) && f.position !== "none" ? f.position : "centre-front") : "none",
    backSpot: b ? (BACK_KEYS.has(b.position) && b.position !== "none" ? b.position : "full-back") : "none",
    sleeveSpot: onLeft && onRight ? "both-sleeves" : onLeft ? "left-sleeve" : onRight ? "right-sleeve" : "none",
    lockFront: Boolean(f?.fixed),
    left: all.filter((e) => e !== f && e !== b && !arms.includes(e)).length,
  };
}
