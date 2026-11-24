// studio/hangerPhoto.js — the shop pictures on the tee's hanger photo (24 Nov 2026)
//
// The owner, showing two SCENE tees on a wooden hanger: "make the front image like this for all the tees in Shop your
// IDENTEE". So a shop tee's pictures are no longer the 3D tee on its stand: each print is put on the garment's own
// colour photo (Admin → Create your IDENTEE → the colour photos, a real tee on a hanger), true to size — where the
// print team presses it, measured from the collar seam (panelModel.js areaBoxCm), at the photo ruler's cm scale for
// the tee's size. The fabric's folds from the White photo are laid over the print, so it looks printed, not pasted.
// A garment or colour without a photo (or a garment whose collar isn't measured below) keeps the 3D pictures.
import { chartRow } from "./panelModel";
import { photoBoxes, seamOf } from "./hangerBoxes";
import { loadImage } from "./konvaRender";
import garmentImageService from "../services/garmentImageService";
import garmentTypeService from "../services/garmentTypeService";

const SIDES = ["front", "back", "left", "right"];

/* ---------- the photos (each asked for once) ---------- */
let typesOnce = null;
const rulerOf = async (key) => {
  typesOnce ||= garmentTypeService.getGarmentTypes().catch(() => {
    typesOnce = null;
    return [];
  });
  return ((await typesOnce) || []).find((g) => g.key === key)?.photoRuler || null;
};
const docs = new Map();
const photoDoc = (key, slug) => {
  const id = `${key}/${slug}`;
  if (!docs.has(id)) {
    docs.set(
      id,
      garmentImageService.getGarmentImage(key, slug).catch(() => {
        docs.delete(id);
        return null;
      }),
    );
  }
  return docs.get(id);
};
const picture = (url) => (url ? loadImage(url, { full: true }).catch(() => null) : Promise.resolve(null));

// the fabric's light and shade under a print, from the White photo (1 = flat; under 1 = a fold's shadow)
function shadeLayer(layer, white, W, H) {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const wctx = c.getContext("2d", { willReadFrequently: true });
  wctx.drawImage(white, 0, 0, W, H);
  const light = wctx.getImageData(0, 0, W, H).data;
  const lctx = layer.getContext("2d", { willReadFrequently: true });
  const img = lctx.getImageData(0, 0, W, H);
  const px = img.data;
  // the fabric's usual brightness under the prints
  const seen = [];
  for (let i = 0; i < px.length; i += 4 * 7) if (px[i + 3] > 8) seen.push(0.299 * light[i] + 0.587 * light[i + 1] + 0.114 * light[i + 2]);
  if (seen.length < 50) return;
  seen.sort((a, b) => a - b);
  const usual = seen[Math.floor(seen.length * 0.75)] || 255;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const l = 0.299 * light[i] + 0.587 * light[i + 1] + 0.114 * light[i + 2];
    const k = Math.min(1.04, Math.max(0.62, 1 - 0.85 * (1 - l / usual)));
    px[i] = Math.min(255, px[i] * k);
    px[i + 1] = Math.min(255, px[i + 1] * k);
    px[i + 2] = Math.min(255, px[i + 2] * k);
  }
  lctx.putImageData(img, 0, 0);
}

/**
 * The four shop pictures on the hanger photo, or null (no photo for this garment / colour: the 3D pictures are used).
 * areas: MockupCamera's painted areas ([{ key, canvas }]); job: { garment, positions, size, colourHex, colourSlug? }.
 */
export async function hangerPictures(job, model, areas) {
  const garment = job.garment;
  if (!garment?.key || !seamOf(model)) return null;
  const hex = String(job.colourHex || "").toLowerCase();
  const slug = job.colourSlug || (garment.colours || []).find((c) => String(c.hex || "").toLowerCase() === hex)?.slug;
  if (!slug) return null;
  const [ruler, doc, whiteDoc] = await Promise.all([rulerOf(garment.key), photoDoc(garment.key, slug), photoDoc(garment.key, "white")]);
  if (!ruler || !doc?.front?.imageUrl || !doc?.back?.imageUrl) return null;
  const lengthIn = Number(chartRow(garment, job.size)?.length);
  const photos = {};
  const whites = {};
  await Promise.all(
    SIDES.map(async (side) => {
      photos[side] = await picture(doc[side]?.imageUrl);
      whites[side] = await picture(whiteDoc?.[side]?.imageUrl);
    }),
  );
  if (!photos.front || !photos.back) return null;
  const W = photos.front.naturalWidth;
  const H = photos.front.naturalHeight;
  const zones = { left: doc.left?.printArea, right: doc.right?.printArea };
  const boxes = photoBoxes({ positions: job.positions, size: job.size, garment, model, ruler, lengthIn, aspect: W / H, zones });
  if (!Object.keys(boxes).length) return null;
  const out = {};
  for (const side of SIDES) {
    // a side without its photo: the front's (only the front and back are shown in the shop)
    const photo = photos[side] || photos.front;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    ctx.drawImage(photo, 0, 0, W, H);
    const layer = document.createElement("canvas");
    layer.width = W;
    layer.height = H;
    const lctx = layer.getContext("2d");
    lctx.imageSmoothingQuality = "high";
    let any = false;
    for (const a of areas || []) {
      const box = boxes[a.key];
      if (!a.canvas || !box || box.side !== side || !photos[side]) continue;
      lctx.drawImage(a.canvas, (box.left / 100) * W, (box.top / 100) * H, (box.width / 100) * W, (box.height / 100) * H);
      any = true;
    }
    if (any) {
      if (whites[side]) shadeLayer(layer, whites[side], W, H);
      ctx.drawImage(layer, 0, 0);
    }
    out[side] = c.toDataURL("image/jpeg", 0.88);
  }
  return out;
}
