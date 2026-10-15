import asyncHandler from "express-async-handler";
import GarmentType from "../models/garmentTypeModel.js";
import GarmentColorImage from "../models/garmentColorImageModel.js";
import Customization from "../models/customizationModel.js";
import { deleteStoredFile } from "../utils/imageStorage.js";
import {
  CATALOG_BY_KEY,
  SIZES,
  catalogForGarment,
  cleanBySize,
} from "../data/printPositions.js";

function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// GET /api/garment-types
export const getGarmentTypes = asyncHandler(async (req, res) => {
  const items = await GarmentType.find({ isActive: true }).sort({
    createdAt: 1,
  });
  res.json(items);
});

// GET /api/garment-types/coming-soon
// Drafts announced as "Coming soon" — only what a card needs, never anything to design with.
export const getComingSoonGarments = asyncHandler(async (req, res) => {
  const items = await GarmentType.find({ isActive: false, comingSoon: true })
    .select("key label category description catalogueImage catalogueCode basePrice sizes fabrics fit colors")
    .sort({ createdAt: 1 })
    .lean();
  // the colours themselves aren't needed on a card — only how many there are
  res.json(items.map(({ colors, ...g }) => ({ ...g, colourCount: (colors || []).length })));
});

// GET /api/garment-types/:key
export const getGarmentTypeByKey = asyncHandler(async (req, res) => {
  const item = await GarmentType.findOne({
    key: req.params.key,
    isActive: true,
  });
  if (!item) {
    res.status(404);
    throw new Error("Garment type not found");
  }
  res.json(item);
});

// POST /api/garment-types
export const createGarmentType = asyncHandler(async (req, res) => {
  const { label, category, basePrice, draft, fit } = req.body;
  if (!label || !category) {
    res.status(400);
    throw new Error("label and category are required");
  }
  const key = slugify(label);

  const exists = await GarmentType.findOne({ key });
  if (exists) {
    res.status(400);
    throw new Error("A garment type with this name already exists");
  }

  const item = await GarmentType.create({
    key,
    label,
    category,
    basePrice: Number(basePrice) || 0,
    colors: [],
    // The admin wizard creates garments as drafts (hidden until published).
    isActive: draft ? false : true,
    fit: fit === "oversized" ? "oversized" : "regular",
  });
  res.status(201).json(item);
});

const HEX = /^#[0-9a-f]{6}$/i;
const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const badRequest = (res, message) => {
  res.status(400);
  throw new Error(message);
};

// PUT /api/garment-types/:id  — any of the fields below. The set-up wizard
// saves one step at a time; the old Garment Types page sends basePrice.
export const updateGarmentType = asyncHandler(async (req, res) => {
  const item = await GarmentType.findById(req.params.id);
  if (!item) {
    res.status(404);
    throw new Error("Garment type not found");
  }
  const b = req.body;

  if (b.label !== undefined) {
    if (!String(b.label).trim()) badRequest(res, "Name can't be empty");
    item.label = String(b.label).trim().slice(0, 80);
  }
  if (b.category) item.category = String(b.category).trim().slice(0, 60);
  if (b.basePrice !== undefined) {
    const price = num(b.basePrice);
    if (price === null || price < 0) badRequest(res, "Price must be 0 or more");
    item.basePrice = price;
  }
  if (b.description !== undefined) item.description = String(b.description).slice(0, 600);
  if (b.fit !== undefined) {
    if (!["oversized", "regular"].includes(b.fit)) badRequest(res, "Unknown fit");
    item.fit = b.fit;
  }
  if (b.fabrics !== undefined) {
    if (!Array.isArray(b.fabrics)) badRequest(res, "fabrics must be a list");
    item.fabrics = b.fabrics
      .filter((f) => f && String(f.name || "").trim())
      .slice(0, 10)
      .map((f) => ({ key: slugify(f.key || f.name), name: String(f.name).trim().slice(0, 60) }));
  }
  if (b.sizes !== undefined) {
    if (!Array.isArray(b.sizes)) badRequest(res, "sizes must be a list");
    item.sizes = SIZES.filter((sz) => b.sizes.includes(sz)); // keep XS → 3XL order
  }
  if (b.sizeChart !== undefined) {
    if (!Array.isArray(b.sizeChart)) badRequest(res, "sizeChart must be a list");
    item.sizeChart = b.sizeChart
      .filter((r) => SIZES.includes(r?.size))
      .map((r) => ({
        size: r.size,
        chest: num(r.chest),
        shoulder: num(r.shoulder),
        length: num(r.length),
      }));
  }
  if (b.colors !== undefined) {
    if (!Array.isArray(b.colors)) badRequest(res, "colors must be a list");
    const seen = new Set();
    const colors = [];
    for (const c of b.colors) {
      const name = String(c?.name || "").trim();
      const slug = slugify(c?.slug || name);
      if (!name || !slug || seen.has(slug)) continue;
      if (!HEX.test(c?.hex || "")) badRequest(res, `Colour "${name}" needs a hex code like #1C1C1D`);
      seen.add(slug);
      colors.push({ name: name.slice(0, 40), slug, hex: c.hex });
    }
    item.colors = colors;
  }
  if (b.printAreas !== undefined) {
    if (!Array.isArray(b.printAreas)) badRequest(res, "printAreas must be a list");
    item.printAreas = b.printAreas
      .filter((p) => CATALOG_BY_KEY[p?.key])
      .map((p) => {
        const width = num(p.width);
        const height = num(p.height);
        const sized = width >= 2 && width <= 80 && height >= 2 && height <= 80;
        // exact size per garment size (optional): { S: [w, h], … }
        const bySize = cleanBySize(p.bySize);
        if (p.offered && !sized && !bySize && !CATALOG_BY_KEY[p.key].cm) {
          badRequest(res, `${CATALOG_BY_KEY[p.key].label}: enter its size in cm before offering it`);
        }
        return { key: p.key, offered: !!p.offered, width: sized ? width : null, height: sized ? height : null, bySize };
      });
  }
  if (b.photoRuler !== undefined) {
    const top = num(b.photoRuler?.topPct);
    const hem = num(b.photoRuler?.hemPct);
    if (top === null || hem === null || top < 0 || hem > 100 || hem - top < 20) {
      badRequest(res, "Photo ruler: the hem line must be well below the shoulder line");
    }
    item.photoRuler = { topPct: Math.round(top * 100) / 100, hemPct: Math.round(hem * 100) / 100 };
  }
  if (b.isActive !== undefined) item.isActive = !!b.isActive;
  if (b.comingSoon !== undefined) item.comingSoon = !!b.comingSoon;

  await item.save();
  res.json(item);
});

// GET /api/garment-types/admin/all  — includes drafts, with photo progress
export const adminGetGarmentTypes = asyncHandler(async (req, res) => {
  const items = await GarmentType.find().sort({ createdAt: 1 }).lean();
  const photos = await GarmentColorImage.find({ isActive: true })
    .select("garmentType colorSlug front.imageUrl back.imageUrl left.imageUrl right.imageUrl")
    .lean();
  res.json(
    items.map((g) => {
      const mine = photos.filter((p) => p.garmentType === g.key);
      const slugs = new Set((g.colors || []).map((c) => c.slug));
      const photoCount = mine
        .filter((p) => slugs.has(p.colorSlug))
        .reduce((n, p) => n + ["front", "back", "left", "right"].filter((v) => p[v]?.imageUrl).length, 0);
      const withFront = mine.filter((p) => p.front?.imageUrl);
      const cover = (withFront.find((p) => slugs.has(p.colorSlug)) || withFront[0])?.front.imageUrl || null;
      return { ...g, photoCount, photoTotal: slugs.size * 4, cover };
    }),
  );
});

// GET /api/garment-types/admin/:key  — one garment (draft or live) plus all
// 15 print areas with this garment's settings, for the set-up wizard.
export const adminGetGarmentType = asyncHandler(async (req, res) => {
  // not .lean(): hydrating fills in defaults for fields older garments lack
  const doc = await GarmentType.findOne({ key: req.params.key });
  if (!doc) {
    res.status(404);
    throw new Error("Garment type not found");
  }
  const item = doc.toObject();
  res.json({ garment: item, printAreaCatalog: catalogForGarment(item) });
});

// POST /api/garment-types/:id/colors  — add a color
export const addColor = asyncHandler(async (req, res) => {
  const { name, hex } = req.body;
  if (!name || !hex) {
    res.status(400);
    throw new Error("name and hex are required");
  }
  const item = await GarmentType.findById(req.params.id);
  if (!item) {
    res.status(404);
    throw new Error("Garment type not found");
  }
  const slug = slugify(name);
  if (item.colors.some((c) => c.slug === slug)) {
    res.status(400);
    throw new Error("This color already exists on this garment type");
  }
  item.colors.push({ name, slug, hex });
  await item.save();
  res.status(201).json(item);
});

// DELETE /api/garment-types/:id/colors/:slug
export const removeColor = asyncHandler(async (req, res) => {
  const item = await GarmentType.findById(req.params.id);
  if (!item) {
    res.status(404);
    throw new Error("Garment type not found");
  }
  item.colors = item.colors.filter((c) => c.slug !== req.params.slug);
  await item.save();
  res.json(item);
});

// DELETE /api/garment-types/:id
export const deleteGarmentType = asyncHandler(async (req, res) => {
  const item = await GarmentType.findById(req.params.id);
  if (!item) {
    res.status(404);
    throw new Error("Garment type not found");
  }
  // A garment is deleted for good, with its photos — so only when nothing depends on it:
  // not while customers can see it, and not once anyone has saved or ordered a design on it
  // (those designs and their print files need the garment). Such a garment is unpublished instead.
  if (item.isActive) {
    res.status(400);
    throw new Error("This garment is live. Unpublish it first, then delete it.");
  }
  const designs = await Customization.countDocuments({ garmentType: item.key });
  if (designs > 0) {
    res.status(400);
    throw new Error(
      `${designs} saved design${designs === 1 ? " uses" : "s use"} this garment, so it can't be deleted. It is unpublished, so customers don't see it.`,
    );
  }
  const photos = await GarmentColorImage.find({ garmentType: item.key });
  for (const doc of photos) {
    await Promise.all(["front", "back", "left", "right"].map((v) => deleteStoredFile(doc[v]?.imageUrl)));
  }
  await GarmentColorImage.deleteMany({ garmentType: item.key });
  await item.deleteOne();
  res.json({ message: "Deleted", photos: photos.length });
});
