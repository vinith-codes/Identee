// Admin → Studio: the DTF print rules (Step 3, 25 Oct 2026). The design room's print check (studio/designCheck.js)
// covers blurry pictures, tiny or faint words and items over the edge; these are the extra things a DTF (direct-to-
// film) transfer needs, said in plain words for the Review step. Nothing here changes the design.
import { areaCm } from "../../../studio/teeModel";

export const DTF_RULES = [
  "Solid colours print cleanest. See-through (less than 100 %) prints as fine dots, not a smooth fade — it works for a texture, not for a face.",
  "Keep everything at least 1 cm inside the print area's edge; the press can shift a little.",
  "Letters at least 8 mm tall; thin strokes under 0.4 mm break up or drop out.",
  "A picture with its own background prints as a rectangle — cut it out (Remove background) unless that is the look.",
  "Pictures print sharp at 150 DPI or more: a 1K AI picture is sharp up to about 17 cm wide — above that, use Sharpen for print (4K).",
  "Very fine details (hairlines, tiny text in a poster) are lost in the transfer; keep the design bold.",
  "White ink goes under every print on a dark tee: a large solid print feels heavier than a tee's own fabric.",
];

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Plain sentences for the admin about the DTF rules the design breaks. results: the assistant's pictures (for the
 * "has its own background" note).
 * @returns {string[]}
 */
export function dtfIssues(elements, positions, { size, results = [] } = {}) {
  const out = [];
  for (const el of elements) {
    const pos = positions.find((p) => p.key === el.position);
    if (!pos) continue;
    const [wCm, hCm] = areaCm(pos, size);
    const name = el.type === "text" ? `“${String(el.text || "").replace(/\s+/g, " ").trim().slice(0, 24)}”` : "The picture";
    if (el.opacity != null && el.opacity < 1 && el.type !== "image") out.push(`${name} on ${pos.label} is ${Math.round(el.opacity * 100)} % see-through: DTF prints that as fine dots, which can look rough on words.`);
    if (el.opacity != null && el.opacity < 0.35) out.push(`${name} on ${pos.label} is only ${Math.round(el.opacity * 100)} % strong — it will print very faint.`);
    // the margin: how far the (unrotated) box is from each edge
    const left = ((el.x || 0) / 100) * wCm;
    const top = ((el.y || 0) / 100) * hCm;
    const right = wCm - (((el.x || 0) + (el.width || 0)) / 100) * wCm;
    const bottom = hCm - (((el.y || 0) + (el.height || 0)) / 100) * hCm;
    const margin = Math.min(left, top, right, bottom);
    if (margin > -2 && margin < 1) out.push(`${name} on ${pos.label} is ${round1(Math.max(0, margin))} cm from the edge — keep 1 cm clear in case the press shifts.`);
    if (el.type === "text") {
      const letterMm = ((el.fontSizePct || 0) / 100) * hCm * 10;
      if (letterMm < 8 && letterMm >= 4) out.push(`${name} on ${pos.label} has ${Math.round(letterMm)} mm letters — DTF wants 8 mm or more to stay crisp.`);
      if (el.strokeWidthPct > 0) {
        const strokeMm = ((el.strokeWidthPct / 100) * ((el.fontSizePct || 0) / 100) * hCm * 10) / 2;
        if (strokeMm < 0.4) out.push(`${name} on ${pos.label} has a ${round1(strokeMm)} mm outline — under 0.4 mm it may drop out. Make it thicker or remove it.`);
      }
    }
    if (el.type === "image") {
      const made = results.find((r) => r.url === el.src);
      if (made && made.cut === false && made.kind !== "background") out.push(`${name} on ${pos.label} came back with its own background, so it prints as a rectangle. Ask for it again, or use Remove background.`);
    }
  }
  return [...new Set(out)];
}

// The one-button fix (26 Oct 2026, the client: "give one button, if I click it corrects all"): what to change on each
// item so the DTF rules above pass — every item at least 1 cm clear of the edge (shrunk around its centre only when
// it cannot fit), words at least 8 mm tall with an outline of 0.4 mm or more, nothing see-through or faint.
// A blurry picture is not here: the room sharpens it (4K) or shrinks it (designCheck's own fix).
// @returns [{ id, patch, measure }]  measure = re-measure the words after the change
const MARGIN_CM = 1.1; // a touch over the rule, so rounding never lands on 0.9
export function dtfFixes(elements, positions, { size } = {}) {
  const out = [];
  for (const el of elements) {
    const pos = positions.find((p) => p.key === el.position);
    if (!pos) continue;
    const [wCm, hCm] = areaCm(pos, size);
    const patch = {};
    let measure = false;
    if (el.opacity != null && el.opacity < 1 && (el.type !== "image" || el.opacity < 0.35)) patch.opacity = 1;
    if (el.type === "text") {
      const letterMm = ((el.fontSizePct || 0) / 100) * hCm * 10;
      if (letterMm < 8) {
        patch.fontSizePct = (0.85 / hCm) * 100;
        measure = true;
      }
      if (el.strokeWidthPct > 0) {
        const fontPct = patch.fontSizePct || el.fontSizePct || 0;
        const strokeMm = ((el.strokeWidthPct / 100) * (fontPct / 100) * hCm * 10) / 2;
        if (fontPct > 0 && strokeMm < 0.4) patch.strokeWidthPct = (0.45 * 2 * 100 * 100) / (fontPct * hCm * 10);
      }
    }
    const w = el.width || 0;
    const h = el.height || 0;
    const left = el.x || 0;
    const top = el.y || 0;
    const minCm = Math.min((left / 100) * wCm, (top / 100) * hCm, ((100 - left - w) / 100) * wCm, ((100 - top - h) / 100) * hCm);
    if (w > 0 && h > 0 && minCm < 1) {
      const mx = (MARGIN_CM / wCm) * 100;
      const my = (MARGIN_CM / hCm) * 100;
      const k = Math.min(1, (100 - 2 * mx) / w, (100 - 2 * my) / h);
      const nw = w * k;
      const nh = h * k;
      patch.x = Math.min(100 - mx - nw, Math.max(mx, left + w / 2 - nw / 2));
      patch.y = Math.min(100 - my - nh, Math.max(my, top + h / 2 - nh / 2));
      if (k < 1) {
        if (el.type === "text") {
          patch.fontSizePct = (patch.fontSizePct || el.fontSizePct || 10) * k;
          measure = true;
        } else {
          patch.width = nw;
          patch.height = nh;
        }
      }
    }
    if (Object.keys(patch).length) out.push({ id: el.id, patch, measure });
  }
  return out;
}

// How many of the AI pictures still print soft (no 4K copy and under 150 DPI at their size on the tee).
export function softPictures(elements, positions, { size } = {}) {
  return elements.filter((el) => {
    if (el.type !== "image" || !el.pxW || el.printSrc) return false;
    const pos = positions.find((p) => p.key === el.position);
    if (!pos) return false;
    const [wCm] = areaCm(pos, size);
    const printCm = ((el.width || 0) / 100) * wCm;
    return el.pxW / (printCm / 2.54) < 150;
  });
}
