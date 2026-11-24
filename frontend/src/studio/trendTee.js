// studio/trendTee.js — a trend's tee, built the same way everywhere (23 Nov 2026).
// The owner moved GTA into Shop your IDENTEE: "the front side is fixed and the remaining all they can customize",
// with ready tees made from the ready backs, "round neck too". So the admin's "Make GTA shop tees" (TrendsPage) and
// the design room's GTA assistant (a ready back tapped in the chat) put the pictures on the tee with the same rules:
//   - the trend's logo on Centre Front, as big as the area allows, locked (`fixed`: the customer can't move or remove it);
//   - a ready back printed big — the print team's biggest back print, just under the collar (panelModel bigBackPrint),
//     as a print in a free place of its own; Full Back as before when that can't be.
import { areaCm } from "./teeModel";
import { areaBoxCm, bigBackPrint, elementToSpot, isSpotKey, withSpots } from "./panelModel";

/** A picture as big as the print area allows (fill % of its width or height), centred — the design room's AI fit. */
export function wholeFit(pos, size, w, h, fill = 92) {
  const [aw, ah] = areaCm(pos, size);
  const shape = w / h;
  const width = shape > aw / ah ? fill : (fill * shape * ah) / aw;
  const height = (width * aw) / (shape * ah);
  return { rotation: 0, x: 50 - width / 2, y: 50 - height / 2, width, height };
}

/** The print area a trend's front logo goes on, and the one its back goes on (by key, else the side's main one). */
export const frontArea = (positions) => positions.find((p) => p.key === "centre-front") || positions.find((p) => p.side === "front" && p.main) || positions.find((p) => p.side === "front") || null;
export const backArea = (positions) => positions.find((p) => p.key === "full-back") || positions.find((p) => p.side === "back" && p.main) || positions.find((p) => p.side === "back") || null;

/**
 * A ready back printed big. el: the picture already on the back area (its src, id …); kept: the tee's other things;
 * shape: the picture's width ÷ height. -> { elements, el, key } — key: where it ended up (a free place, or the area).
 */
export function putBigBack(kept, el, { positions, garment, size, maxPrint, shape }) {
  const pos = positions.find((p) => p.key === el.position);
  const plain = { elements: [...kept, el], el, key: el.position };
  const big = pos && bigBackPrint(garment, size, maxPrint, shape);
  const area = big && areaBoxCm(pos, size, garment);
  if (!big || !area?.w || !area?.h) return plain;
  const put = { ...el, rotation: 0, x: ((area.w - big.w) / 2 / area.w) * 100, y: ((big.down - area.down) / area.h) * 100, width: (big.w / area.w) * 100, height: (big.h / area.h) * 100 };
  const spotted = elementToSpot([...kept, put], put.id, { positions, garment, size, maxPrint });
  const now = spotted.find((e) => e.id === put.id);
  return now && isSpotKey(now.position) ? { elements: spotted, el: now, key: now.position } : plain;
}

/**
 * A trend's shop tee: { elements, positions } — the logo locked on the front and (when given) the ready back big on
 * the back. catalog: the garment's print areas (GET /api/print-positions); logo / back: { url, w, h } (back: null for
 * the "Make your own" tee, which has only the logo). positions: the catalog with the back's free place added — what
 * the 3D mockup camera needs.
 */
export function trendShopTee({ garment, catalog, maxPrint = null, size = "M", logo, back = null }) {
  const front = frontArea(catalog);
  if (!front || !logo?.url) return null;
  const elements = [{ id: "trend-logo", type: "image", src: logo.url, position: front.key, side: front.side, zIndex: 1, pxW: logo.w, fixed: true, ...wholeFit(front, size, logo.w, logo.h) }];
  let out = elements;
  if (back?.url) {
    const area = backArea(catalog);
    if (!area) return null;
    const el = { id: "trend-back", type: "image", src: back.url, position: area.key, side: area.side, zIndex: 2, pxW: back.w, aiLayout: "back", ...wholeFit(area, size, back.w, back.h) };
    out = putBigBack(elements, el, { positions: catalog, garment, size, maxPrint, shape: back.w / back.h }).elements;
  }
  return { elements: out, positions: withSpots(catalog, out, garment, maxPrint) };
}

/**
 * A change to the tee, with a shop tee's locked logo kept as it was (the design room's commit): a locked thing that
 * the change moved, resized or took away is put back unchanged; a copy of it (Duplicate, Copy to…) is the customer's
 * own, so it is not locked. A tee without a locked thing is returned as it is.
 */
export function keepFixed(next, prev) {
  const locked = new Map(prev.filter((e) => e.fixed).map((e) => [String(e.id), e]));
  if (!locked.size && !next.some((e) => e.fixed)) return next;
  const out = next.map((e) => {
    if (locked.has(String(e.id))) return locked.get(String(e.id));
    if (!e.fixed) return e;
    const { fixed, ...own } = e; // eslint-disable-line no-unused-vars
    return own;
  });
  for (const [id, e] of locked) if (!out.some((x) => String(x.id) === id)) out.push(e);
  return out;
}
