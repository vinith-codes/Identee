// studio/designCheck.js
//
// The "design check": looks over a design before review and lists things
// that would print badly, each with a one-tap fix. Plain rules, no AI.
//
//   blurry   an uploaded picture stretched beyond what its pixels allow
//   small    letters too small to read on fabric
//   contrast ink colour too close to the tee colour
//   outside  part of an item hangs over the print area's edge (it gets cut)

const MIN_DPI = 100; // below this a print looks soft
const GOOD_DPI = 150;
const MIN_LETTER_CM = 0.8; // letter size (font size) that still reads on fabric
const GOOD_LETTER_CM = 1.2;

const rgb = (hex) => {
  const n = parseInt(String(hex || "#000").replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const light = (hex) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => {
  const [hi, lo] = [light(a), light(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * @param elements   the design (layout v2: x / y / width / height in % of the print area)
 * @param positions  the garment's print areas
 * @param opts       { fabricHex, inkDefault, cmOf(position) -> { wCm, hCm } }
 * @returns [{ id, elId, position, kind, text, fixLabel, patch, measure }]
 *          patch is what the fix changes on the element; measure = re-measure the text after it
 */
export function checkDesign(elements, positions, { fabricHex, inkDefault, cmOf }) {
  const issues = [];
  for (const el of elements) {
    const pos = positions.find((p) => p.key === el.position);
    if (!pos) continue;
    const { wCm, hCm } = cmOf(pos);
    const name = el.type === "text" ? `“${String(el.text || "").replace(/\s+/g, " ").trim().slice(0, 24)}”` : "The picture";
    const add = (kind, text, fixLabel, patch, measure = false) => issues.push({ id: `${el.id}:${kind}`, elId: el.id, position: pos.key, area: pos.label, kind, text, fixLabel, patch, measure });

    if (el.type === "image" && el.pxW) {
      const printCm = ((el.width || 0) / 100) * wCm;
      const dpi = el.pxW / (printCm / 2.54);
      if (dpi < MIN_DPI) {
        const k = dpi / GOOD_DPI; // shrink until it is sharp, around its centre
        const width = Math.max(6, (el.width || 0) * k);
        const height = Math.max(6, (el.height || 0) * k);
        add("blurry", `${name} on ${pos.label} is stretched to ${printCm.toFixed(0)} cm and will print blurry.`, `Make it ${((width / 100) * wCm).toFixed(0)} cm wide (prints sharp)`, {
          width,
          height,
          x: (el.x || 0) + ((el.width || 0) - width) / 2,
          y: (el.y || 0) + ((el.height || 0) - height) / 2,
        });
      }
    }

    if (el.type === "text") {
      const letterCm = ((el.fontSizePct || 0) / 100) * hCm;
      if (letterCm < MIN_LETTER_CM) {
        add("small", `${name} on ${pos.label} is only about ${Math.round(letterCm * 10)} mm tall. It may be hard to read.`, "Make it bigger", { fontSizePct: (GOOD_LETTER_CM / hCm) * 100 }, true);
      }
      if (contrast(el.color || "#000000", fabricHex) < 1.6) {
        add("contrast", `${name} on ${pos.label} is almost the same colour as the tee. It will hardly show.`, "Use a colour that stands out", { color: inkDefault });
      }
    }

    // hanging over the edge (rotated a quarter turn: its width runs down the area)
    const turned = Math.abs((el.rotation || 0) % 180) === 90;
    const w = turned ? ((el.height || 0) * hCm) / wCm : el.width || 0;
    const h = turned ? ((el.width || 0) * wCm) / hCm : el.height || 0;
    const cx = (el.x || 0) + (el.width || 0) / 2;
    const cy = (el.y || 0) + (el.height || 0) / 2;
    const over = Math.max(w / 2 - cx, cx + w / 2 - 100, h / 2 - cy, cy + h / 2 - 100);
    if (over > 2) {
      const k = Math.min(1, 96 / w, 96 / h); // shrink only if it cannot fit at all
      const hw = (w * k) / 2;
      const hh = (h * k) / 2;
      const nx = Math.min(100 - hw - 1, Math.max(hw + 1, cx));
      const ny = Math.min(100 - hh - 1, Math.max(hh + 1, cy));
      const width = (el.width || 0) * k;
      const height = (el.height || 0) * k;
      add(
        "outside",
        `${name} hangs over the edge of ${pos.label}. That part would be cut off.`,
        "Move it inside",
        { x: nx - width / 2, y: ny - height / 2, ...(k < 1 ? (el.type === "text" ? { fontSizePct: (el.fontSizePct || 10) * k } : { width, height }) : {}) },
        el.type === "text" && k < 1,
      );
    }
  }
  return issues;
}

// Ink colours from the palette that show well on this tee, best first.
export const inksFor = (fabricHex, palette) =>
  [...palette]
    .map((c) => [c, contrast(c, fabricHex)])
    .filter(([, k]) => k >= 2.2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([c]) => c);
