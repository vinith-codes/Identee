// controllers/readyDesignController.js — Shop your IDENTEE's ready designs (made by the Collection maker,
// 25 Oct 2026), for customers. Sold print on demand: "Buy" makes the customer their own copy of the design
// (a Customization with fromReady), which then goes through the usual cart, checkout and print sheets.
// Only shown, and only bought, while Shop your IDENTEE is open (Admin → Settings → Store Branding).
import asyncHandler from "express-async-handler";
import ReadyDesign from "../models/readyDesignModel.js";
import Customization from "../models/customizationModel.js";
import GarmentType from "../models/garmentTypeModel.js";
import Setting from "../models/settingModel.js";
import { aiDesignAddOn, hasPaidPicture } from "../utils/aiPricing.js";

const shopOpen = async () => (await Setting.findOne({ key: "general.shopOpen" }).select("value").lean())?.value === true;
const SLUG = /^[a-z0-9-]{3,60}$/;

// what a customer pays per tee: the garment's price, + the picture amount (as a design-room tee — checkoutService)
async function priceOf(design, garment, addOn) {
  const extra = (await hasPaidPicture(design.elements)) ? addOn : 0;
  const price = (garment?.basePrice || 0) + extra;
  const was = garment?.comparePrice > garment?.basePrice ? garment.comparePrice + extra : 0;
  return { price, comparePrice: was };
}
const colourOf = (garment, slug) => garment?.colors?.find((c) => c.slug === slug) || null;
// the side the picture is printed on (the shop shows that side first)
const heroOf = (design) => (design.elements || []).find((e) => e.type === "image")?.side === "back" ? "back" : "front";

// GET /api/ready-designs  (public) -> { open, designs: [...] }
export const listReadyDesigns = asyncHandler(async (req, res) => {
  if (!(await shopOpen())) return res.json({ open: false, designs: [] });
  const designs = await ReadyDesign.find({ status: "published" }).sort({ publishedAt: -1 }).limit(120).lean();
  const garments = await GarmentType.find({ key: { $in: [...new Set(designs.map((d) => d.garmentType))] }, isActive: true }).lean();
  const addOn = await aiDesignAddOn();
  const out = [];
  for (const d of designs) {
    const garment = garments.find((g) => g.key === d.garmentType);
    if (!garment) continue; // its garment is not on sale now
    const colour = colourOf(garment, d.color);
    out.push({
      _id: d._id,
      slug: d.slug,
      name: d.name,
      blurb: d.blurb,
      garmentType: d.garmentType,
      garmentLabel: garment.label,
      color: d.color,
      colourName: colour?.name || d.color,
      colourHex: colour?.hex || "#1C1C1D",
      mockups: d.mockups,
      hero: heroOf(d),
      ...(await priceOf(d, garment, addOn)),
    });
  }
  res.set("Cache-Control", "public, max-age=30");
  res.json({ open: true, designs: out });
});

// GET /api/ready-designs/:slug  (public) — one design, with its sizes and the elements (for "Change it")
export const getReadyDesign = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || "");
  const design = SLUG.test(slug) && (await shopOpen()) ? await ReadyDesign.findOne({ slug, status: "published" }).lean() : null;
  const garment = design ? await GarmentType.findOne({ key: design.garmentType, isActive: true }).lean() : null;
  if (!design || !garment) {
    res.status(404);
    throw new Error("This design isn't in the shop.");
  }
  const colour = colourOf(garment, design.color);
  res.json({
    _id: design._id,
    slug: design.slug,
    name: design.name,
    blurb: design.blurb,
    garmentType: design.garmentType,
    garmentLabel: garment.label,
    color: design.color,
    colourName: colour?.name || design.color,
    colourHex: colour?.hex || "#1C1C1D",
    mockups: design.mockups,
    hero: heroOf(design),
    elements: design.elements,
    sizes: garment.sizes?.length ? garment.sizes : ["S", "M", "L", "XL", "2XL", "3XL"],
    sizeChart: garment.sizeChart || [],
    ...(await priceOf(design, garment, await aiDesignAddOn())),
  });
});

// POST /api/ready-designs/:slug/copy  (login) -> { customizationId }
// The customer's own copy of the design, to put in the cart / buy now (the existing design checkout). A copy made
// earlier and not ordered yet is used again, so pressing Buy twice doesn't fill My designs with copies.
export const copyReadyDesign = asyncHandler(async (req, res) => {
  const slug = String(req.params.slug || "");
  if (!(await shopOpen())) {
    res.status(403);
    throw new Error("Shop your IDENTEE is coming soon — these tees can't be ordered yet.");
  }
  const design = SLUG.test(slug) ? await ReadyDesign.findOne({ slug, status: "published" }).lean() : null;
  if (!design) {
    res.status(404);
    throw new Error("This design isn't in the shop.");
  }
  const mine = await Customization.findOne({ user: req.user._id, fromReady: design._id, orderedAt: null, hiddenAt: null }).sort({ updatedAt: -1 });
  if (mine) return res.json({ customizationId: mine._id, garmentType: mine.garmentType });
  const copy = await Customization.create({
    garmentType: design.garmentType,
    color: design.color,
    size: design.size || "M",
    user: req.user._id,
    layoutVersion: 2,
    elements: design.elements,
    mockups: design.mockups,
    name: design.name,
    fromReady: design._id,
  });
  res.status(201).json({ customizationId: copy._id, garmentType: copy.garmentType });
});
