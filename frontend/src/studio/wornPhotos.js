// studio/wornPhotos.js — "Photo of it worn" and "Try it on me" on every printed side (17 Nov 2026, the owner: "it must
// show all sides where the prints are available"). Which sides get a photo, what that costs of today's pictures, the
// words for it, and the "Share all" picture (all the photos side by side, sent with shareTee).

export const WORN_SIDES = ["front", "back", "left", "right"];
const LABEL = { front: "Front", back: "Back", left: "Left side", right: "Right side" };
const WORD = { front: "front", back: "back", left: "left side", right: "right side" };
export const sideLabel = (side) => LABEL[side] || LABEL.front;

/**
 * The sides of the tee that carry a print, in the order the photos are made (front, back, left, right).
 * A print on the co-ord set's shorts shows on the front photo. Nothing printed yet → the front.
 */
export function printedSides(elements) {
  const on = new Set((elements || []).map((e) => (e?.side === "shorts" ? "front" : e?.side)));
  const sides = WORN_SIDES.filter((s) => on.has(s));
  return sides.length ? sides : ["front"];
}

/** What fits in today's pictures, the first side first. left = null (not known yet) → all of them; the server still checks. */
export function planSides(sides, left) {
  const n = left == null ? sides.length : Math.max(0, Math.min(sides.length, Math.floor(Number(left)) || 0));
  return { make: sides.slice(0, n), skipped: sides.slice(n) };
}

/** "front", "front + back", "front, back + left side" */
export function sideWords(sides) {
  const w = sides.map((s) => WORD[s] || s);
  return w.length < 2 ? w.join("") : `${w.slice(0, -1).join(", ")} + ${w[w.length - 1]}`;
}

const photos = (n) => `${n} photo${n === 1 ? "" : "s"}`;

/**
 * The line under the two buttons, so nothing costs a surprise:
 * "This makes 2 photos (front + back) — 2 of your 10 pictures for today."
 */
export function costLine({ sides, left = null, daily = null }) {
  const { make, skipped } = planSides(sides, left);
  if (left != null && make.length === 0) return `You’ve made today’s${daily ? ` ${daily}` : ""} pictures — they come back tomorrow, and the photos of it worn with them.`;
  if (skipped.length) return `You have ${left} picture${left === 1 ? "" : "s"} left today, so this makes ${photos(make.length)} (${sideWords(make)}) — not the ${sideWords(skipped)}.`;
  const of = daily ? ` of your ${daily} pictures for today` : ` of today’s pictures`;
  return `This makes ${photos(make.length)} (${sideWords(make)}) — ${make.length}${of}.`;
}

/** The note in the photo window when fewer pictures were left than sides printed. */
export function skippedNote(skipped) {
  return skipped.length ? `Not made: the ${sideWords(skipped)} — today’s pictures ran out. They come back tomorrow.` : "";
}

/** The caption under one photo; me = Try it on me, from = "photo" (their own photo, dressed) | "ai" (made by the AI). */
export function wornCaption({ me = false, side = "front", from = "photo" } = {}) {
  if (!me) return "An AI photo of your design on a person — the print is as on your tee; the person and place are made up.";
  if (from === "ai") return `The ${WORD[side] || "back"} view is made by the AI from your photo — it guesses how you look from ${side === "back" ? "behind" : "the side"}. A preview, not a real photo.`;
  if (side === "back") return "Made from the photo of your back — a preview, not a real photo. The print is as on your tee.";
  return "An AI picture of you in your tee, made from your photo — a preview, not a real photo. The print is as on your tee.";
}

/** Where each photo sits on the "Share all" picture: all the same height, side by side, a label under each. */
export function sideBySideLayout(sizes, { photoH = 960, gap = 28, top = 28, labelH = 64, footH = 72 } = {}) {
  const widths = sizes.map(({ width, height }) => Math.max(1, Math.round((width / Math.max(1, height)) * photoH)));
  const W = widths.reduce((a, b) => a + b, 0) + gap * (sizes.length + 1);
  let x = gap;
  const boxes = widths.map((w) => {
    const box = { x, y: top, w, h: photoH };
    x += w + gap;
    return box;
  });
  return { W, H: top + photoH + labelH + footH, boxes, labelY: top + photoH + 44, footY: top + photoH + labelH + 40 };
}

// read through fetch (as the single photo's Share does), so the canvas may be saved even when the photos sit on the
// backend's own address
const load = async (src) => {
  const url = URL.createObjectURL(await (await fetch(src)).blob());
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("picture"));
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
};

/**
 * The "Share all" picture: the photos side by side, each labelled (Front, Back …), with a small IDENTEE line.
 * @param pics  [{ src, label }] — src is a url the page can read
 * @returns {Promise<Blob>} a PNG, for shareTee(blob, …)
 */
export async function makeSideBySide(pics, { title = "My IDENTEE tee", footer = "identee.co.in" } = {}) {
  const got = (await Promise.all(pics.map(async (p) => ({ ...p, img: await load(p.src).catch(() => null) })))).filter((p) => p.img);
  if (!got.length) throw new Error("The photos couldn’t be read just now.");
  const L = sideBySideLayout(got.map((p) => ({ width: p.img.naturalWidth || p.img.width, height: p.img.naturalHeight || p.img.height })));
  const c = document.createElement("canvas");
  c.width = L.W;
  c.height = L.H;
  const g = c.getContext("2d");
  g.fillStyle = "#F6F3EC";
  g.fillRect(0, 0, L.W, L.H);
  g.textAlign = "center";
  got.forEach((p, i) => {
    const b = L.boxes[i];
    g.drawImage(p.img, b.x, b.y, b.w, b.h);
    g.fillStyle = "#141110";
    g.font = "bold 34px Arial, sans-serif";
    g.fillText(p.label || "", b.x + b.w / 2, L.labelY);
  });
  g.font = "24px Arial, sans-serif";
  g.fillStyle = "#8A6F2E";
  g.fillText(`${title} · ${footer}`, L.W / 2, L.footY);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("The picture couldn’t be made."))), "image/png"));
}

/** A photo the customer chose, made small (1280 px) as a JPEG data URL for the AI. */
export function photoDataUrl(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1280 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That photo couldn’t be read."));
    };
    img.src = url;
  });
}
