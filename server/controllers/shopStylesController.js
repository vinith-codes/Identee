// controllers/shopStylesController.js — Admin → Shop your IDENTEE → Styles (25 Nov 2026)
//
// Each garment's Shop your IDENTEE settings (utils/shopStyles.js): used for shop tees or not, the name the shop shows,
// who it is for, its place among the styles, its category, the colours on sale and the sides the tee page shows. A new
// style (a Polo) is set up in Create your IDENTEE as before (photos, sizes, size chart, print areas, price), then
// switched on here — no code.
//
//   GET /api/studio/shop/styles         { styles: [...], categories: [{ slug, name }] }
//   PUT /api/studio/shop/styles/:key    the garment's settings -> { style }
import asyncHandler from "express-async-handler";
import GarmentType from "../models/garmentTypeModel.js";
import GarmentColorImage from "../models/garmentColorImageModel.js";
import Category from "../models/categoryModel.js";
import ReadyDesign from "../models/readyDesignModel.js";
import { forgetShopStyles, SIDES, styleOf, WEARERS } from "../utils/shopStyles.js";
import { positionsForGarment } from "../data/printPositions.js";

const KEY = /^[a-z0-9-]{2,60}$/;

/**
 * The admin's settings for one garment, checked. body: what the page sends; garment: the garment (lean, with colors);
 * categories: the active category slugs. -> { shop } | { error }
 */
export function cleanStyle(body = {}, garment, categories = []) {
  const b = body && typeof body === "object" ? body : {};
  const on = Boolean(b.on);
  const style = String(b.style || "").replace(/\s+/g, " ").trim();
  if (!/^[\p{L}\p{N}][\p{L}\p{N} '&-]{0,39}$/u.test(style)) return { error: "Give the style a short name, e.g. Polo (letters and numbers, up to 40)." };
  const wearer = WEARERS.includes(b.wearer) ? b.wearer : null;
  if (!wearer) return { error: "Choose who it is for: Unisex, Men or Women." };
  const order = Math.round(Number(b.order));
  if (!(order >= 1 && order <= 99)) return { error: "Its place must be a number from 1 to 99." };
  const category = String(b.category || "").trim().toLowerCase();
  if (!categories.includes(category)) return { error: "Choose the shop category its tees are listed in." };
  const all = (garment?.colors || []).map((c) => c.slug);
  const colours = [...new Set((Array.isArray(b.colours) ? b.colours : []).map(String))].filter((s) => all.includes(s));
  if (on && !colours.length) return { error: "Tick at least one colour to sell." };
  const sides = SIDES.includes(b.sides) ? b.sides : null;
  if (!sides) return { error: "Choose which sides the tee page shows." };
  const fitText = String(b.fitText || "").replace(/\s+/g, " ").trim().slice(0, 60);
  return { shop: { saved: true, on, style, wearer, order, category, colours, sides, fitText } };
}

// what the page needs to know about a garment besides its settings: its colours, whether it can be used (live, with a
// front and a back print area), its hanger photos (the shop pictures are made on them) and its shop tees
async function rowOf(garment) {
  const positions = positionsForGarment(garment).positions || [];
  const photos = await GarmentColorImage.find({ garmentType: garment.key, isActive: true }).select("colorSlug front.imageUrl back.imageUrl").lean();
  const white = photos.find((p) => p.colorSlug === "white");
  const tees = await ReadyDesign.countDocuments({ garmentType: garment.key, source: "studio", status: "published" });
  return {
    ...styleOf(garment),
    active: garment.isActive !== false,
    colourList: (garment.colors || []).map((c) => ({ slug: c.slug, name: c.name, hex: c.hex })),
    hasFront: positions.some((p) => p.side === "front"),
    hasBack: positions.some((p) => p.side === "back"),
    // the White photo is the one every colour's shop picture is made from (studio/hangerPhoto.js)
    photo: { front: Boolean(white?.front?.imageUrl), back: Boolean(white?.back?.imageUrl) },
    tees,
    price: garment.basePrice || 0,
    oldPrice: garment.comparePrice || 0,
    sizes: garment.sizes || [],
  };
}

// GET /api/studio/shop/styles  (admin)
export const listShopStyles = asyncHandler(async (req, res) => {
  const [garments, categories] = await Promise.all([
    GarmentType.find({}).sort({ isActive: -1, label: 1 }).lean(),
    Category.find({ isActive: true }).sort({ displayOrder: 1, name: 1 }).select("slug name").lean(),
  ]);
  const styles = [];
  for (const g of garments) styles.push(await rowOf(g));
  // the ones used for shop tees first, in their order
  styles.sort((a, b) => Number(b.on) - Number(a.on) || a.order - b.order || String(a.label).localeCompare(String(b.label)));
  res.json({ styles, categories: categories.map((c) => ({ slug: c.slug, name: c.name })) });
});

// PUT /api/studio/shop/styles/:key  (admin)
export const saveShopStyle = asyncHandler(async (req, res) => {
  const key = String(req.params.key || "");
  const garment = KEY.test(key) ? await GarmentType.findOne({ key }) : null;
  if (!garment) {
    res.status(404);
    throw new Error("That garment isn't there any more.");
  }
  const categories = (await Category.find({ isActive: true }).select("slug").lean()).map((c) => c.slug);
  const { shop, error } = cleanStyle(req.body, garment.toObject(), categories);
  if (error) {
    res.status(400);
    throw new Error(error);
  }
  if (shop.on && garment.isActive === false) {
    res.status(400);
    throw new Error(`${garment.label} is a draft in Create your IDENTEE — make it live there first.`);
  }
  garment.shop = shop;
  garment.markModified("shop");
  await garment.save();
  forgetShopStyles();
  res.json({ style: await rowOf(garment.toObject()) });
});
