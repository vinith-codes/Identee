// studio/aiOps.js
//
// "Edit the tee by chat": the text AI turns what the customer typed into a
// short list of changes (see server/services/aiTextService.js planEdit). This
// file applies them to the design — and checks every one first. The AI's
// answer is treated as a suggestion: unknown items, areas, fonts or values
// are simply skipped, so a wrong answer can never break a design.
import { blockersOf } from "./teeModel";

const HEX = /^#[0-9a-f]{6}$/i;
const SHAPES = { straight: "straight", "curved-up": "arc-up", "curved-down": "arc-down" };
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const turned = (el) => Math.abs((el.rotation || 0) % 180) === 90;

/**
 * @param ops  the AI's list
 * @param d    { elements, positions, active, fonts, inkDefault, areaPx(pos), textBox(el, pos), makeId() }
 * @returns { elements, changed, focus }  focus = a print area to open (something moved or was added there)
 */
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
        if (Number.isFinite(s.scale)) next.fontSizePct = clamp((el.fontSizePct || 12) * clamp(s.scale, 0.3, 3), 2, 60);
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
      const to = posOf(op.area);
      if (!el || !from || !to || to.key === from.key) continue;
      const others = els.filter((e) => e.id !== el.id);
      const used = [...new Set(others.map((e) => e.position))];
      if (!used.includes(to.key) && blockersOf(to.key, d.positions, used).length) continue; // covered by another print
      // keep its real size (cm) in the new area, but never larger than the area
      const a = d.areaPx(from);
      const b = d.areaPx(to);
      let next = { ...el, position: to.key, side: to.side };
      if (el.type === "text") {
        next.fontSizePct = clamp(((el.fontSizePct || 12) * a.hCm) / b.hCm, 2, 60);
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
      const pos = posOf(op.area) || posOf(d.active);
      if (!pos || !free(pos.key)) continue;
      const count = els.filter((e) => e.position === pos.key).length;
      let el = {
        type: "text",
        text: op.text.slice(0, 200),
        fontFamily: d.fonts.includes(op.fontFamily) ? op.fontFamily : "Anton",
        fontSizePct: clamp(12 * (Number.isFinite(op.scale) ? clamp(op.scale, 0.3, 3) : 1), 2, 60),
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
      el = { id: d.makeId(), position: pos.key, side: pos.side, rotation: 0, zIndex: els.length + 1, ...el };
      if (op.placeY) el = place(el, pos, null, op.placeY);
      els = [...els, el];
      focus = pos.key;
      changed++;
    }
  }
  return { elements: els, changed, focus };
}

// A small description of the design for the text AI (no pictures, no positions in pixels).
export function describeDesign({ elements, positions, active, selectedId, fonts, teeName, teeColours = [], areaPx }) {
  const used = [...new Set(elements.map((e) => e.position))];
  return {
    tee: teeName,
    teeColours,
    openArea: active || "",
    selectedId: selectedId || null,
    fonts,
    areas: positions.map((p) => ({ key: p.key, label: p.label, free: used.includes(p.key) || !blockersOf(p.key, positions, used).length })),
    items: elements.map((e) => {
      const pos = positions.find((p) => p.key === e.position);
      const { wCm, hCm } = pos ? areaPx(pos) : { wCm: 0, hCm: 0 };
      return e.type === "text"
        ? { id: e.id, type: "text", area: e.position, text: e.text, font: e.fontFamily, color: e.color, sizeCm: Math.round(((e.fontSizePct || 0) / 100) * hCm * 10) / 10, shape: turned(e) ? "vertical" : e.effect === "arc-up" ? "curved-up" : e.effect === "arc-down" ? "curved-down" : "straight", bold: !!e.bold, italic: !!e.italic }
        : { id: e.id, type: "picture", area: e.position, widthCm: Math.round(((e.width || 0) / 100) * wCm * 10) / 10 };
    }),
  };
}
