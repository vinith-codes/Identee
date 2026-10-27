// controllers/studioController.js — Admin → Shop your IDENTEE → Studio (25 Oct 2026). The admin designs a tee by hand
// in the Studio and publishes it to Shop your IDENTEE (a ReadyDesign, sold print on demand like the Collection
// maker's). The AI pictures are made in services/studioService.js.
import asyncHandler from "express-async-handler";
import crypto from "crypto";
import mongoose from "mongoose";
import ReadyDesign from "../models/readyDesignModel.js";
import Category from "../models/categoryModel.js";
import { KINDS, LOOKS, MAX_REFS, PHOTO_SETTINGS, PRINT_COST_FACTOR, PROMPT_MAX, changeStudioPicture, cleanProductDetails, enlargeStudioPicture, improveStudioPrompt, makeStudioPicture, modelPhoto, planStudioTee, removeStudioProduct, studioGarments, syncStudioProduct, wearersOf } from "../services/studioService.js";
import sharp from "sharp";
import fs from "fs/promises";
import path from "path";

// a print area's size in cm for a garment size (as the design room's areaCm)
const areaCmOf = (pos, size) => pos.cmBySize?.[size] || (Array.isArray(pos.cm) ? pos.cm : pos.cm?.standard) || [30, 40];
import { cleanDesign, storeMockups } from "./customizationController.js";
import { readSettings } from "./aiController.js";
import { aiImageConfigured } from "../services/aiImageService.js";
import { xaiConfigured } from "../services/xaiImageService.js";
import { rememberPictures } from "./myPictureController.js";

const notFound = (res, what = "Not found") => {
  res.status(404);
  throw new Error(what);
};
const designOr404 = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) notFound(res, "Design not found");
  const doc = await ReadyDesign.findOne({ _id: req.params.id, source: "studio" });
  if (!doc) notFound(res, "Design not found");
  return doc;
};
const slugify = (name) =>
  `${String(name).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "tee"}-${crypto.randomBytes(3).toString("hex")}`;
const text = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// GET /api/studio/setup  (admin) — the products (print areas, colours, sizes), picture kinds, looks and prices
export const getStudioSetup = asyncHandler(async (req, res) => {
  const settings = await readSettings();
  res.json({
    garments: await studioGarments(),
    kinds: Object.entries(KINDS).map(([key, k]) => ({ key, label: k.label, about: k.about })),
    looks: Object.keys(LOOKS),
    pricePerImageInr: settings.pricePerImageInr,
    grokPricePerImageInr: settings.grokPricePerImageInr,
    google: aiImageConfigured(),
    grok: xaiConfigured(),
    promptMax: PROMPT_MAX,
    maxRefs: MAX_REFS,
    printCostFactor: PRINT_COST_FACTOR,
    chatPriceInr: settings.chatPricePerMessageInr,
    designAddOnInr: settings.designAddOnInr, // added to a tee's price when it has an AI picture
    categories: await shopCategories(), // the ready-made shop's categories a tee can be listed under
    photoSettings: Object.keys(PHOTO_SETTINGS), // where the model photos are taken
  });
});

// the ready-made shop's categories (a tee is listed under one); hidden ones are shown but marked
const shopCategories = async () => (await Category.find({ kind: { $ne: "customizable" } }).sort({ displayOrder: 1, name: 1 }).select("name slug styles isActive comingSoon").lean()).map((c) => ({ slug: c.slug, name: c.name, styles: c.styles || [], hidden: c.isActive === false, comingSoon: !!c.comingSoon }));

// POST /api/studio/picture  (admin, multipart) prompt, kind, look, realPerson, shape (width ÷ height), garment, colour,
// images[] (up to 3 reference pictures) -> { url, width, height, service, cost, cut }
export const makePicture = asyncHandler(async (req, res) => {
  const garments = await studioGarments();
  const garment = garments.find((g) => g.key === String(req.body.garment || ""));
  const colour = garment?.colours.find((c) => c.slug === String(req.body.colour || "")) || garment?.colours[0];
  if (!garment || !colour) {
    res.status(400);
    throw new Error("Pick the product and its colour first.");
  }
  const refs = (Array.isArray(req.files) ? req.files : []).filter((f) => f.buffer).map((f) => ({ data: f.buffer, mime: f.mimetype }));
  try {
    const picture = await makeStudioPicture({
      userId: req.user._id,
      prompt: req.body.prompt,
      kind: String(req.body.kind || "whole"),
      look: String(req.body.look || ""),
      realPerson: String(req.body.realPerson) === "true",
      shape: Number(req.body.shape),
      teeColour: colour.name.toLowerCase(),
      teeIsDark: colour.dark,
      refs,
      variation: Math.max(1, Math.min(3, Number(req.body.variation) || 1)),
      of: Math.max(1, Math.min(3, Number(req.body.of) || 1)),
    });
    // kept in the admin's My pictures (the kind goes in `style`, so it is placed the same way when used again)
    await rememberPictures(req.user._id, [{ url: picture.url, kind: "ai", about: String(req.body.prompt || ""), style: String(req.body.kind || "whole"), width: picture.width, height: picture.height }]);
    res.json(picture);
  } catch (err) {
    res.status(err.status || 500);
    throw err;
  }
});

// POST /api/studio/picture/change  (admin) { url, instruction, kind, realPerson, garment, colour } -> a new picture
export const changePicture = asyncHandler(async (req, res) => {
  const garments = await studioGarments();
  const garment = garments.find((g) => g.key === String(req.body.garment || ""));
  const colour = garment?.colours.find((c) => c.slug === String(req.body.colour || "")) || garment?.colours[0];
  if (!garment || !colour) {
    res.status(400);
    throw new Error("Pick the product and its colour first.");
  }
  try {
    const picture = await changeStudioPicture({
        userId: req.user._id,
        url: String(req.body.url || ""),
        instruction: req.body.instruction,
        kind: String(req.body.kind || "whole"),
        realPerson: req.body.realPerson === true || String(req.body.realPerson) === "true",
        teeColour: colour.name.toLowerCase(),
        teeIsDark: colour.dark,
      });
    await rememberPictures(req.user._id, [{ url: picture.url, kind: "ai", about: `Change: ${String(req.body.instruction || "")}`, style: String(req.body.kind || "whole"), width: picture.width, height: picture.height }]);
    res.json(picture);
  } catch (err) {
    res.status(err.status || 500);
    throw err;
  }
});

// GET /api/studio/designs  (admin) — the Studio's tees, newest first
export const listStudioDesigns = asyncHandler(async (req, res) => {
  res.json(await ReadyDesign.find({ source: "studio" }).sort({ updatedAt: -1 }).limit(200).lean());
});

// GET /api/studio/designs/:id  (admin)
export const getStudioDesign = asyncHandler(async (req, res) => {
  res.json(await designOr404(req, res));
});

// POST /api/studio/designs  (admin) and PUT /api/studio/designs/:id
// { garmentType, color, size, name, blurb, elements, mockups?: { front, back, left, right } (data URLs), issues?, costInr? }
// With the four mockup pictures the tee is "ready" (it can be published); without them it is a draft.
const saveBody = async (req, res, design) => {
  const body = req.body || {};
  let fields;
  try {
    fields = await cleanDesign({ garmentType: body.garmentType ?? design?.garmentType, color: body.color ?? design?.color, size: body.size ?? design?.size ?? "M", elements: body.elements, name: body.name || design?.name || "Studio tee" });
  } catch (err) {
    res.status(err.status || 400);
    throw err;
  }
  const mockups = body.mockups ? await storeMockups(body.mockups) : null;
  const name = text(body.name ?? design?.name, 60) || "Studio tee";
  // the details before publishing: category, sizes, colours (each with its own mockup pictures), price
  const garment = (await studioGarments()).find((g) => g.key === fields.garmentType);
  const garmentSizes = garment?.sizes?.length ? garment.sizes : ["S", "M", "L", "XL", "2XL", "3XL"];
  const category = body.category !== undefined ? text(body.category, 60) : design?.category || "";
  if (category && !(await shopCategories()).some((c) => c.slug === category)) throw Object.assign(new Error("That category doesn't exist any more — pick another."), { status: 400 });
  const sizes = Array.isArray(body.sizes) ? body.sizes.map(String).filter((s) => garmentSizes.includes(s)) : design?.sizes || [];
  const priceInr = body.priceInr !== undefined ? Math.max(0, Math.round(Number(body.priceInr) || 0)) : design?.priceInr || 0;
  let colours = null;
  if (Array.isArray(body.colours) && body.colours.length) {
    colours = [];
    for (const c of body.colours.slice(0, 12)) {
      const slug = text(c?.slug, 60);
      if (!garment?.colours.some((x) => x.slug === slug)) continue;
      const stored = await storeMockups(c?.mockups);
      // the model photos already made for this colour stay with it
      if (stored?.front && stored?.back) colours.push({ slug, mockups: stored, photos: design?.colours?.find((x) => x.slug === slug)?.photos || [] });
    }
  }
  const patch = {
    name,
    blurb: text(body.blurb ?? design?.blurb, 300),
    garmentType: fields.garmentType,
    color: fields.color,
    size: fields.size || "M",
    elements: fields.elements,
    issues: (Array.isArray(body.issues) ? body.issues : []).map((s) => String(s).slice(0, 200)).slice(0, 12),
    costInr: Math.max(0, Number(body.costInr) || design?.costInr || 0),
    service: text(body.service, 10) || design?.service || "",
    category,
    sizes,
    priceInr,
    product: cleanProductDetails(body.product, design?.product || {}),
  };
  // where it is listed: every ticked category must exist; the first one is the tee's own category (27 Oct 2026)
  const known = await shopCategories();
  patch.product.listings = (patch.product.listings || []).filter((l) => known.some((c) => c.slug === l.category));
  if (!patch.product.listings.length && patch.category && patch.product.style) patch.product.listings = [{ category: patch.category, style: patch.product.style }];
  if (patch.product.listings.length) {
    patch.category = patch.product.listings[0].category;
    patch.product.style = patch.product.listings[0].style;
  }
  if (colours?.length) {
    // the designed colour first (its pictures are the tee's main pictures); the others follow
    const main = colours.find((c) => c.slug === fields.color) || colours[0];
    patch.colours = [main, ...colours.filter((c) => c !== main)];
    patch.mockups = main.mockups;
    patch.status = "ready";
  } else if (mockups?.front && mockups?.back) {
    patch.mockups = mockups;
    patch.colours = [{ slug: fields.color, mockups }];
    patch.status = "ready";
  } else if (!design?.mockups?.front) {
    patch.status = "drafted";
  } else {
    // the design changed but no new pictures came: the old mockups no longer match
    patch.status = "drafted";
    patch.mockups = { front: null, back: null, left: null, right: null };
  }
  return patch;
};
export const createStudioDesign = asyncHandler(async (req, res) => {
  const patch = await saveBody(req, res, null);
  const design = await ReadyDesign.create({ ...patch, slug: slugify(patch.name), source: "studio", createdBy: req.user._id, collectionId: null, plan: { idea: "Designed by hand in the Studio" } });
  res.status(201).json(design);
});
const MAX_VERSIONS = 15;
export const updateStudioDesign = asyncHandler(async (req, res) => {
  const design = await designOr404(req, res);
  const inShop = design.status === "published";
  const main = Array.isArray(req.body.colours) ? req.body.colours.find((c) => c?.slug === req.body.color) || req.body.colours[0] : null;
  const picsSent = (req.body.mockups?.front && req.body.mockups?.back) || (main?.mockups?.front && main?.mockups?.back);
  if (inShop && !picsSent) {
    res.status(409);
    throw new Error("This tee is in the shop: press Review, then Update in the shop — its pictures are made again with the change.");
  }
  const patch = await saveBody(req, res, design);
  if (inShop) patch.status = "published"; // it stays on sale; customers who already bought it keep their copy as it was
  // the state being replaced is kept as a version (only when the design itself changed)
  const changed = JSON.stringify(design.elements) !== JSON.stringify(patch.elements) || design.color !== patch.color || design.size !== patch.size;
  if (changed && design.elements?.length) {
    design.versions = [...(design.versions || []), { at: design.updatedAt || new Date(), note: text(req.body.versionNote, 80), color: design.color, size: design.size, elements: design.elements }].slice(-MAX_VERSIONS);
  }
  Object.assign(design, patch);
  // on sale: its product in the shop follows the change (new pictures, price, sizes, colours, details)
  if (inShop) {
    const garment = (await studioGarments()).find((g) => g.key === design.garmentType);
    if (garment) design.productGroupId = await syncStudioProduct(design, garment, req.user._id);
  }
  await design.save();
  res.json(design);
});

// POST /api/studio/improve  (admin) { prompt, kind, look, garment, colour } -> { improved, understood, cost }
export const improvePrompt = asyncHandler(async (req, res) => {
  const garments = await studioGarments();
  const garment = garments.find((g) => g.key === String(req.body.garment || ""));
  const colour = garment?.colours.find((c) => c.slug === String(req.body.colour || "")) || garment?.colours[0];
  try {
    res.json(await improveStudioPrompt({ userId: req.user._id, prompt: req.body.prompt, kind: String(req.body.kind || "whole"), look: String(req.body.look || ""), teeColour: colour?.name.toLowerCase() || "white", teeIsDark: !!colour?.dark }));
  } catch (err) {
    res.status(err.status || 500);
    throw err;
  }
});

// POST /api/studio/plan  (admin) { prompt, garment, colour } -> { understood, name, colour, parts, cost }
// The whole tee from one prompt: a plan card the admin checks before any picture is drawn.
export const planTee = asyncHandler(async (req, res) => {
  const garments = await studioGarments();
  const garment = garments.find((g) => g.key === String(req.body.garment || ""));
  const colour = garment?.colours.find((c) => c.slug === String(req.body.colour || "")) || garment?.colours[0];
  if (!garment || !colour) {
    res.status(400);
    throw new Error("Pick the product and its colour first.");
  }
  const size = "M";
  const positions = garment.positions.filter((p) => p.side !== "shorts").map((p) => ({ key: p.key, label: p.label, side: p.side, main: !!p.main, cm: areaCmOf(p, size) }));
  try {
    res.json(await planStudioTee({ userId: req.user._id, prompt: req.body.prompt, positions, colours: garment.colours, colour: colour.slug, teeColour: colour.name.toLowerCase(), teeIsDark: colour.dark }));
  } catch (err) {
    res.status(err.status || 500);
    throw err;
  }
});

// The px width a picture needs to print sharp at its size on the tee (150 DPI), and what it has.
const GOOD_DPI = 150;
async function pictureWidthPx(src) {
  try {
    const buf = /^https?:\/\//.test(src) ? Buffer.from(await (await fetch(src)).arrayBuffer()) : await fs.readFile(path.join(process.cwd(), String(src).replace(/^\/+/, "")));
    return (await sharp(buf).metadata()).width || 0;
  } catch {
    return 0;
  }
}
// GET /api/studio/designs/:id/print-check  (admin) -> which pictures print soft and what sharpening would cost
export const printCheck = asyncHandler(async (req, res) => {
  const design = await designOr404(req, res);
  const garments = await studioGarments();
  const garment = garments.find((g) => g.key === design.garmentType);
  const settings = await readSettings();
  const soft = [];
  for (const [i, el] of (design.elements || []).entries()) {
    if (el.type !== "image" || el.printSrc) continue;
    const pos = garment?.positions.find((p) => p.key === el.position);
    if (!pos) continue;
    const [wCm] = areaCmOf(pos, design.size || "M");
    const printCm = ((el.width || 0) / 100) * wCm;
    const px = await pictureWidthPx(el.src);
    const dpi = px / (printCm / 2.54);
    if (px && dpi < GOOD_DPI) soft.push({ index: i, position: pos.label, printCm: Math.round(printCm), dpi: Math.round(dpi) });
  }
  res.json({ soft, costEach: Math.round(settings.pricePerImageInr * PRINT_COST_FACTOR * 100) / 100 });
});

// POST /api/studio/designs/:id/enlarge  (admin) — every picture that prints soft gets its 4K copy (printSrc);
// the tee's cost grows by each one. Returns the design and what was done.
export const enlargeDesign = asyncHandler(async (req, res) => {
  const design = await designOr404(req, res);
  // (26 Oct 2026: allowed on a published tee too — a 4K print copy changes nothing the customer sees, only what
  // the printer gets; the client wants "Fix all" to sharpen a picture at its full size)
  const garments = await studioGarments();
  const garment = garments.find((g) => g.key === design.garmentType);
  const colour = garment?.colours.find((c) => c.slug === design.color);
  const done = [];
  const failed = [];
  let spent = 0;
  for (const [i, el] of (design.elements || []).entries()) {
    if (el.type !== "image" || el.printSrc) continue;
    const pos = garment?.positions.find((p) => p.key === el.position);
    if (!pos) continue;
    const [wCm] = areaCmOf(pos, design.size || "M");
    const printCm = ((el.width || 0) / 100) * wCm;
    const px = await pictureWidthPx(el.src);
    if (!px || px / (printCm / 2.54) >= GOOD_DPI) continue;
    try {
      const out = await enlargeStudioPicture({ userId: req.user._id, src: el.src, teeIsDark: !!colour?.dark, note: `${design.name}, ${pos.label}` });
      design.elements[i] = { ...el, printSrc: out.printSrc, printW: out.width };
      spent += out.cost;
      done.push({ index: i, position: pos.label, width: out.width, cost: out.cost });
    } catch (err) {
      failed.push({ index: i, position: pos.label, message: err.message });
    }
  }
  design.markModified("elements");
  design.costInr = Math.round(((design.costInr || 0) + spent) * 100) / 100;
  await design.save();
  res.json({ design, done, failed, spent: Math.round(spent * 100) / 100 });
});

// POST /api/studio/designs/:id/publish  (admin) — into Shop your IDENTEE, once the details are there
export const publishStudioDesign = asyncHandler(async (req, res) => {
  const design = await designOr404(req, res);
  const missing = [];
  if (!design.mockups?.front || !design.mockups?.back) missing.push("the mockup pictures (press Review)");
  const listings = design.product?.listings?.length ? design.product.listings : design.category ? [{ category: design.category, style: design.product?.style }] : [];
  if (!listings.length) missing.push("a category");
  else if (listings.some((l) => !l.style)) missing.push("a style for every ticked category");
  if (!(design.product?.description || design.blurb)) missing.push("a description");
  if (!design.sizes?.length) missing.push("at least one size");
  if (!["ready", "published"].includes(design.status) || missing.length) {
    res.status(409);
    throw new Error(missing.length ? `Before publishing, add ${missing.join(", ")}.` : "This tee can't be published now.");
  }
  if (design.status !== "published") {
    design.status = "published";
    design.publishedAt = new Date();
  }
  // its product in the shop (one per colour): the category page, filters and search see it like any product
  const garment = (await studioGarments()).find((g) => g.key === design.garmentType);
  if (!garment) {
    res.status(409);
    throw new Error("This tee's product is not live any more.");
  }
  design.productGroupId = await syncStudioProduct(design, garment, req.user._id);
  await design.save();
  res.json(design);
});

// POST /api/studio/designs/:id/model-photos  (admin) { colour?, wearers?: ["man","woman"], sides?: ["front","back"], setting? }
// Photos of a person wearing the tee, made from that colour's mockups; one picture each, costed. A photo of the same
// wearer + side replaces the old one. -> { design, made: [...], failed: [...], spent }
export const makeModelPhotos = asyncHandler(async (req, res) => {
  const design = await designOr404(req, res);
  const garments = await studioGarments();
  const garment = garments.find((g) => g.key === design.garmentType);
  if (!garment) {
    res.status(409);
    throw new Error("This tee's product is not live any more.");
  }
  const colours = design.colours?.length ? design.colours : design.mockups?.front ? [{ slug: design.color, mockups: design.mockups, photos: [] }] : [];
  const slug = String(req.body.colour || design.color);
  const entry = colours.find((c) => c.slug === slug);
  if (!entry?.mockups?.front) {
    res.status(409);
    throw new Error("Press Review first — the photos are made from the tee's pictures.");
  }
  const allowed = wearersOf(garment);
  const wearers = (Array.isArray(req.body.wearers) ? req.body.wearers : allowed).filter((w) => ["man", "woman"].includes(w));
  const sides = (Array.isArray(req.body.sides) ? req.body.sides : ["front", "back"]).filter((s) => ["front", "back"].includes(s));
  const setting = PHOTO_SETTINGS[req.body.setting] ? req.body.setting : "studio";
  const colour = garment.colours.find((c) => c.slug === slug);
  const made = [];
  const failed = [];
  let spent = 0;
  for (const wearer of wearers) {
    for (const side of sides) {
      if (!entry.mockups[side]) continue;
      try {
        const out = await modelPhoto({ userId: req.user._id, mockupUrl: entry.mockups[side], wearer, side, setting, teeColour: (colour?.name || slug).toLowerCase(), garmentLabel: garment.label, note: design.name });
        entry.photos = [...(entry.photos || []).filter((p) => !(p.wearer === wearer && p.side === side)), { wearer, side, url: out.url }];
        spent += out.cost;
        made.push({ wearer, side, url: out.url, cost: out.cost });
      } catch (err) {
        failed.push({ wearer, side, message: err.message });
      }
    }
  }
  design.colours = colours;
  design.markModified("colours");
  design.costInr = Math.round(((design.costInr || 0) + spent) * 100) / 100;
  await design.save();
  res.json({ design, made, failed, spent: Math.round(spent * 100) / 100 });
});

// DELETE /api/studio/designs/:id/model-photos  (admin) { colour, url } — takes one photo off the tee
export const removeModelPhoto = asyncHandler(async (req, res) => {
  const design = await designOr404(req, res);
  const url = String(req.body.url || "");
  const slug = String(req.body.colour || design.color);
  design.colours = (design.colours || []).map((c) => (c.slug === slug ? { ...(c.toObject ? c.toObject() : c), photos: (c.photos || []).filter((p) => p.url !== url) } : c));
  design.markModified("colours");
  await design.save();
  res.json(design);
});

// DELETE /api/studio/designs/:id  (admin) — a draft or an unpublished tee
export const deleteStudioDesign = asyncHandler(async (req, res) => {
  const design = await designOr404(req, res);
  if (design.status === "published") {
    res.status(409);
    throw new Error("Unpublish the tee before deleting it.");
  }
  await removeStudioProduct(design._id);
  await design.deleteOne();
  res.json({ ok: true });
});
