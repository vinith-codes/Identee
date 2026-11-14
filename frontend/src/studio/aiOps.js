// studio/aiOps.js
//
// "Edit the tee by chat": the text AI turns what the customer typed into a
// short list of changes (see server/services/aiTextService.js planEdit). This
// file applies them to the design — and checks every one first. The AI's
// answer is treated as a suggestion: unknown items, areas, fonts or values
// are simply skipped, so a wrong answer can never break a design.
import { blockersOf } from "./teeModel";
import { isSpotKey } from "./panelModel";

const HEX = /^#[0-9a-f]{6}$/i;
const SHAPES = { straight: "straight", "curved-up": "arc-up", "curved-down": "arc-down" };
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const turned = (el) => Math.abs((el.rotation || 0) % 180) === 90;
// Letters may fill a print in a free place's tight box (80–87 % of its height; the box grows round bigger ones:
// panelModel.js reboxChanged); a print area keeps its old cap.
const fontMax = (pos) => (pos?.spot ? 100 : 60);
// A thing added to or moved into a print in a free place that already has things goes just under them (or above, when
// asked for the top), centred, keeping its own size — not on top of them in the middle of a tight box. The box then
// grows round it when the room commits the change (reboxChanged).
function besideThings(el, pos, others, areaPx, above = false) {
  const { W, H, hCm } = areaPx(pos);
  const there = others.filter((e) => e.position === pos.key);
  if (!there.length) return el;
  const tall = (e) => (turned(e) ? (e.width * W) / H : e.height); // how tall it looks, in % of the box
  const mid = (e) => (e.y || 0) + (e.height || 0) / 2;
  const gap = (0.5 / (hCm || 1)) * 100; // 0.5 cm, in % of the box's height
  const h = tall(el);
  const cy = above ? Math.min(...there.map((e) => mid(e) - tall(e) / 2)) - gap - h / 2 : Math.max(...there.map((e) => mid(e) + tall(e) / 2)) + gap + h / 2;
  return { ...el, x: 50 - el.width / 2, y: cy - el.height / 2 };
}

/**
 * @param ops  the AI's list
 * @param d    { elements, positions, active, fonts, inkDefault, areaPx(pos), textBox(el, pos), makeId() }
 * @returns { elements, changed, focus }  focus = a print area to open (something moved or was added there)
 */
// Which side an area key belongs to — also for keys this garment doesn't have (the AI may name Full Back
// on a crop top that only has Top Back).
const sideOfKey = (key, positions) => {
  const known = positions.find((p) => p.key === key);
  if (known) return known.side;
  const k = String(key || "");
  if (/leg|shorts/.test(k)) return "shorts";
  if (/sleeve/.test(k)) return k.startsWith("right") ? "right" : "left";
  return /back|nape/.test(k) ? "back" : "front"; // the nape ("Back Neck") is on the back
};

// lower case, words only: "Bottom-left corner!" → "bottom left corner"
const plain = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const ON = "(?:on|at|to|onto|near|in|across|over|under|below|above)"; // a one-word other name needs one of these first

/**
 * The print area of this garment named in plain words — "the nape", "back of the neck", "bottom left corner", "a
 * line across the chest", "on the belly": its label ("Back Neck"), its key ("chest-line") or one of the other names
 * customers use (`aka`, server/data/printPositions.js). The longest name found wins ("left chest" over "chest"). A
 * one-word other name ("belly", "pocket") counts only after "on / at / to …" or as the whole text: "a cat with a
 * big belly" names no place. Only areas this garment offers can be found; null when none is named.
 */
export function areaInWords(text, positions = []) {
  const t = plain(text);
  if (!t) return null;
  let best = null;
  let bestLen = 0;
  for (const p of positions) {
    const own = [plain(p.label), plain(p.key)];
    for (const n of [...own, ...(p.aka || []).map(plain)]) {
      if (!n || n.length <= bestLen) continue;
      const loose = !own.includes(n) && !n.includes(" ");
      const hit = t === n || (!loose ? ` ${t} `.includes(` ${n} `) : new RegExp(`(?:^| )${ON} (?:the |my |your |its |his |her )?${n}(?: |$)`).test(t));
      if (hit) {
        best = p;
        bestLen = n.length;
      }
    }
  }
  return best;
}

/**
 * The print area to use for an area key the AI chose: that area when this garment has it and it is free,
 * else the biggest free area on the same side (front / back / a sleeve / the shorts), else null.
 * The AI may also name the place in words ("nape", "Back Neck", "bottom left corner"): those find the area too.
 * A free place ("spot-2") the design doesn't have is ignored (null), like an answer that names nothing usable.
 * @param used  area keys that already carry a print
 */
export function areaFor(key, positions, used) {
  const free = (p) => used.includes(p.key) || !blockersOf(p.key, positions, used).length;
  if (isSpotKey(key) && !positions.some((p) => p.key === key)) return null;
  const asked = positions.find((p) => p.key === key) || areaInWords(key, positions);
  if (asked && free(asked)) return asked;
  const side = asked?.side || sideOfKey(key, positions);
  const size = (p) => (p.cm?.standard ? p.cm.standard[0] * p.cm.standard[1] : 0);
  return positions.filter((p) => p.side === side && free(p)).sort((a, b) => size(b) - size(a))[0] || null;
}

export function applyAiOps(ops, d) {
  let els = d.elements.map((e) => ({ ...e }));
  let changed = 0;
  let focus = null;
  const posOf = (key) => d.positions.find((p) => p.key === key);
  const find = (id) => els.find((e) => String(e.id) === String(id));
  // an area can take a print if it already has one, or no used area overlaps it
  const free = (key) => {
    const used = [...new Set(els.map((e) => e.position))];
    return used.includes(key) || !blockersOf(key, d.positions, used).length;
  };
  // put an item at the left / centre / right and top / middle / bottom of its area
  const place = (el, pos, px, py) => {
    const { W, H } = d.areaPx(pos);
    const w = turned(el) ? (el.height * H) / W : el.width; // how wide / tall it looks, in % of the area
    const h = turned(el) ? (el.width * W) / H : el.height;
    let cx = el.x + el.width / 2;
    let cy = el.y + el.height / 2;
    if (px === "left") cx = 4 + w / 2;
    if (px === "center" || px === "centre") cx = 50;
    if (px === "right") cx = 96 - w / 2;
    if (py === "top") cy = 5 + h / 2;
    if (py === "middle") cy = 50;
    if (py === "bottom") cy = 95 - h / 2;
    return { ...el, x: cx - el.width / 2, y: cy - el.height / 2 };
  };

  for (const op of Array.isArray(ops) ? ops : []) {
    if (!op || typeof op !== "object") continue;

    if (op.op === "update" && op.set && typeof op.set === "object") {
      const el = find(op.id);
      const pos = el && posOf(el.position);
      if (!el || !pos) continue;
      const s = op.set;
      let next = { ...el };
      if (el.type === "text") {
        if (typeof s.text === "string" && s.text.trim()) next.text = s.text.slice(0, 200);
        if (d.fonts.includes(s.fontFamily)) next.fontFamily = s.fontFamily;
        if (HEX.test(s.color)) next.color = s.color.toUpperCase();
        for (const k of ["bold", "italic", "underline"]) if (typeof s[k] === "boolean") next[k] = s[k];
        if (["left", "center", "right"].includes(s.align)) next.align = s.align;
        if (Number.isFinite(s.letterSpacingPct)) next.letterSpacingPct = clamp(s.letterSpacingPct, -5, 40);
        if (s.outlineColor === "none") next.strokeWidthPct = 0;
        else if (HEX.test(s.outlineColor)) {
          next.strokeColor = s.outlineColor.toUpperCase();
          next.strokeWidthPct = el.strokeWidthPct > 0 ? el.strokeWidthPct : 4;
        }
        if (SHAPES[s.shape]) {
          next.effect = SHAPES[s.shape];
          if (turned(next)) next.rotation = 0;
        } else if (s.shape === "vertical") {
          next.effect = "straight";
          next.rotation = 90;
        }
        if (Number.isFinite(s.scale)) next.fontSizePct = clamp((el.fontSizePct || 12) * clamp(s.scale, 0.3, 3), 2, fontMax(pos));
        if (Number.isFinite(s.rotation)) next.rotation = clamp(Math.round(s.rotation), -180, 180);
        next = d.textBox(next, pos); // its box follows the new words / size / font (the middle stays put)
      } else {
        if (Number.isFinite(s.scale)) {
          const k = clamp(s.scale, 0.3, 3);
          const width = clamp(el.width * k, 5, 140);
          const height = (el.height * width) / el.width;
          next = { ...next, width, height, x: el.x + (el.width - width) / 2, y: el.y + (el.height - height) / 2 };
        }
        if (Number.isFinite(s.rotation)) next.rotation = clamp(Math.round(s.rotation), -180, 180);
      }
      if (s.placeX || s.placeY) next = place(next, pos, s.placeX, s.placeY);
      els = els.map((e) => (e.id === el.id ? next : e));
      changed++;
      continue;
    }

    if (op.op === "move") {
      const el = find(op.id);
      const from = el && posOf(el.position);
      if (!el || !from) continue;
      const others = els.filter((e) => e.id !== el.id);
      const used = [...new Set(others.map((e) => e.position))];
      // that area, or the biggest free one on the same side (this garment may not have the one named)
      const to = areaFor(op.area, d.positions, used);
      if (!to || to.key === from.key) continue;
      // keep its real size (cm) in the new area, but never larger than the area
      const a = d.areaPx(from);
      const b = d.areaPx(to);
      // (a free place's box goes with it; a print area needs none)
      let next = { ...el, position: to.key, side: to.side, spot: to.spot };
      if (!to.spot) delete next.spot;
      if (to.spot && others.some((e) => e.position === to.key)) {
        // into a print in a free place that has things: its real size (cm) kept, just under them (the box grows)
        if (el.type === "text") next = d.textBox({ ...next, fontSizePct: clamp(((el.fontSizePct || 12) * a.hCm) / b.hCm, 2, fontMax(to)), x: 50, y: 50, width: 0, height: 0 }, to);
        else next = { ...next, width: (el.width * a.wCm) / b.wCm, height: (el.height * a.hCm) / b.hCm };
        next = besideThings(next, to, others, d.areaPx);
      } else if (el.type === "text") {
        next.fontSizePct = clamp(((el.fontSizePct || 12) * a.hCm) / b.hCm, 2, fontMax(to));
        next = d.textBox({ ...next, x: 50, y: 50, width: 0, height: 0 }, to);
        if (next.width > 92) next = d.textBox({ ...next, fontSizePct: (next.fontSizePct * 92) / next.width }, to);
      } else {
        let width = (el.width * a.wCm) / b.wCm;
        let height = (el.height * a.hCm) / b.hCm;
        const k = Math.min(1, 92 / width, 92 / height);
        width *= k;
        height *= k;
        next = { ...next, width, height, x: 50 - width / 2, y: 50 - height / 2 };
      }
      els = [...others, next];
      focus = to.key;
      changed++;
      continue;
    }

    if (op.op === "delete") {
      const el = find(op.id);
      if (!el) continue;
      els = els.filter((e) => e.id !== el.id);
      changed++;
      continue;
    }

    if (op.op === "duplicate") {
      const el = find(op.id);
      if (!el) continue;
      els = [...els, { ...el, id: d.makeId(), y: Math.min(90, el.y + 8), zIndex: els.length + 1 }];
      changed++;
      continue;
    }

    if (op.op === "add_text" && typeof op.text === "string" && op.text.trim()) {
      const used = [...new Set(els.map((e) => e.position))];
      const pos = (op.area && areaFor(op.area, d.positions, used)) || posOf(d.active);
      if (!pos || !free(pos.key)) continue;
      const count = els.filter((e) => e.position === pos.key).length;
      // words added to a print in a free place start at the size of its words already there (in its tight box 12 %
      // would be tiny), and go under its things (besideThings)
      const like = pos.spot ? Math.max(0, ...els.filter((e) => e.position === pos.key && e.type === "text").map((e) => e.fontSizePct || 0)) : 0;
      let el = {
        type: "text",
        text: op.text.slice(0, 200),
        fontFamily: d.fonts.includes(op.fontFamily) ? op.fontFamily : "Anton",
        fontSizePct: clamp((like || 12) * (Number.isFinite(op.scale) ? clamp(op.scale, 0.3, 3) : 1), 2, fontMax(pos)),
        color: HEX.test(op.color) ? op.color.toUpperCase() : d.inkDefault,
        align: "center",
        effect: SHAPES[op.shape] || "straight",
        x: 50,
        y: 18 + (count % 4) * 18,
        width: 0,
        height: 0,
      };
      el = d.textBox(el, pos);
      if (el.width > 90) el = d.textBox({ ...el, fontSizePct: (el.fontSizePct * 90) / el.width }, pos);
      el = { id: d.makeId(), position: pos.key, side: pos.side, rotation: 0, zIndex: els.length + 1, ...el, ...(pos.spot ? { spot: pos.spot } : {}) };
      if (pos.spot && count) el = besideThings(el, pos, els, d.areaPx, op.placeY === "top");
      else if (op.placeY) el = place(el, pos, null, op.placeY);
      els = [...els, el];
      focus = pos.key;
      changed++;
    }
  }
  return { elements: els, changed, focus };
}

// A small description of the design for the text AI (no pictures, no positions in pixels).
// whereOf(position): a free place in words ("24 x 6 cm, 40 cm below the collar seam, centred"), so the AI knows it.
export function describeDesign({ elements, positions, active, selectedId, fonts, teeName, teeColours = [], areaPx, whereOf = null }) {
  const used = [...new Set(elements.map((e) => e.position))];
  return {
    tee: teeName,
    teeColours,
    openArea: active || "",
    selectedId: selectedId || null,
    fonts,
    areas: positions.map((p) => ({ key: p.key, label: p.label, side: p.side, free: used.includes(p.key) || !blockersOf(p.key, positions, used).length, ...(p.spot && whereOf ? { where: whereOf(p) } : {}) })),
    items: elements.map((e) => {
      const pos = positions.find((p) => p.key === e.position);
      const { wCm, hCm } = pos ? areaPx(pos) : { wCm: 0, hCm: 0 };
      return e.type === "text"
        ? { id: e.id, type: "text", ...(e.link === "team" ? { is: "team name" } : e.role === "name" ? { is: "player name" } : e.role === "number" ? { is: "player number" } : {}), area: e.position, text: e.text, font: e.fontFamily, color: e.color, sizeCm: Math.round(((e.fontSizePct || 0) / 100) * hCm * 10) / 10, shape: turned(e) ? "vertical" : e.effect === "arc-up" ? "curved-up" : e.effect === "arc-down" ? "curved-down" : "straight", bold: !!e.bold, italic: !!e.italic }
        : { id: e.id, type: "picture", area: e.position, widthCm: Math.round(((e.width || 0) / 100) * wCm * 10) / 10 };
    }),
  };
}
