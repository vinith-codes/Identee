// pages/admin/shop/shopAddUtils.js — the sums Add a tee and Add many tees share (25 Nov 2026)
const MAX_MB = 25; // the server's limit for a design picture (multer DESIGN_MAX_MB)
const PICTURE = /^image\/(png|jpe?g|webp)$/;

/** The collections already in use ("AYYAPPA", "GTA", "SCENE" …): the first part of the tees' names. */
export function collectionTitles(designs = []) {
  const seen = new Map();
  for (const d of designs) {
    if (d.status === "removed") continue;
    const parts = String(d.name || "").split(" · ");
    if (parts.length < 2) continue;
    const t = parts[0].trim();
    if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** A picked file, checked: { file, preview, w, h } — or throws with words for the admin. */
export async function readPicture(file) {
  if (!PICTURE.test(file.type)) throw new Error(`${file.name}: choose a PNG, JPG or WebP picture.`);
  if (file.size > MAX_MB * 1024 * 1024) throw new Error(`${file.name} is over ${MAX_MB} MB — save it as a JPG or a smaller PNG.`);
  let w;
  let h;
  try {
    const bmp = await createImageBitmap(file);
    w = bmp.width;
    h = bmp.height;
    bmp.close?.();
  } catch {
    throw new Error(`${file.name} couldn’t be opened — it may be damaged.`);
  }
  return { file, preview: URL.createObjectURL(file), w, h };
}

/** How sharp it prints, in plain words. */
export function sharpness(dpi) {
  if (!dpi) return null;
  if (dpi >= 200) return { ok: true, text: `Prints sharp (about ${dpi} dots per inch).` };
  if (dpi >= 150) return { ok: true, text: `Prints fine (about ${dpi} dots per inch).` };
  return { ok: false, text: `Small for this size (about ${dpi} dots per inch) — it may print a little soft. A bigger picture is better.` };
}


const SIDE = /(^|[\s._-]+)(front|back|sleeve)$/i; // a separator before it: "feedback.png" is not a back
/** A file's tee name: "tiger-saranam_front.png" -> "Tiger Saranam" (words already in capitals stay so). */
export function teeNameOf(fileName) {
  const base = String(fileName || "").replace(/\.[a-z0-9]+$/i, "").replace(SIDE, "");
  return base
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}
/** "front", "back", "sleeve" or "" from the end of a file's name. */
export function sideOf(fileName) {
  const m = String(fileName || "").replace(/\.[a-z0-9]+$/i, "").match(SIDE);
  return m ? m[2].toLowerCase() : "";
}

/**
 * Many files -> tees: "tiger-front.png" + "tiger-back.png" (+ "tiger-sleeve.png") make one tee "Tiger". A file without
 * -front / -back / -sleeve in its name, or a second front for the same name, is loose: the admin says what it is.
 * files: [{ file, ... }] (readPicture results) -> { rows: [{ name, front, back, sleeve }], loose: [pic] }
 */
export function pairPictures(pics) {
  const rows = new Map();
  const loose = [];
  for (const pic of pics) {
    const side = sideOf(pic.file.name);
    const name = teeNameOf(pic.file.name);
    const key = name.toLowerCase();
    if (!side || !name) {
      loose.push(pic);
      continue;
    }
    if (!rows.has(key)) rows.set(key, { name, front: null, back: null, sleeve: null });
    const row = rows.get(key);
    if (row[side]) loose.push(pic);
    else row[side] = pic;
  }
  return { rows: [...rows.values()], loose };
}
