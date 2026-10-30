// controllers/readyDesignController.js — Shop your IDENTEE's ready designs (made by the Collection maker,
// 25 Oct 2026), for customers. Sold print on demand: "Buy" makes the customer their own copy of the design
// (a Customization with fromReady), which then goes through the usual cart, checkout and print sheets.
// Only shown, and only bought, while Shop your IDENTEE is open (Admin → Settings → Store Branding).
import asyncHandler from "express-async-handler";
import ReadyDesign from "../models/readyDesignModel.js";
import Customization from "../models/customizationModel.js";
import GarmentType from "../models/garmentTypeModel.js";
import Setting from "../models/settingModel.js";
import { shownInShop } from "../utils/shopRules.js";
import { aiDesignAddOn } from "../utils/aiPricing.js";

const shopOpen = async () => (await Setting.findOne({ key: "general.shopOpen" }).select("value").lean())?.value === true;
const SLUG = /^[a-z0-9-]{3,60}$/;

// what a customer pays per tee: the garment's price — the shop's own pictures add nothing (30 Oct 2026; a picture the
// customer adds when changing it does — checkoutService)
function priceOf(design, garment) {
  // the admin's own price for this tee (26 Oct 2026) wins over the garment's price
  if (design.priceInr > 0) return { price: design.priceInr, comparePrice: garment?.comparePrice > design.priceInr ? garment.comparePrice : 0 };
  const price = garment?.basePrice || 0;
  const was = garment?.comparePrice > price ? garment.comparePrice : 0;
  return { price, comparePrice: was };
}
// the colours a tee is sold in: the designed one, plus the ones the admin ticked (each with its own pictures) —
// only the dark ones and White, no Royal Blue on Round Neck (utils/shopRules.js)
const coloursOf = (design, garment) => {
  const list = design.colours?.length ? design.colours : [{ slug: design.color, mockups: design.mockups }];
  return list
    .map((c) => ({ slug: c.slug, name: colourOf(garment, c.slug)?.name || c.slug, hex: colourOf(garment, c.slug)?.hex || "#1C1C1D", mockups: c.mockups, photos: c.photos || [] }))
    .filter((c) => shownInShop(c.name, `${design.product?.style || ""} ${garment?.label || ""}`));
};
const sizesOf = (design, garment) => {
  const all = garment.sizes?.length ? garment.sizes : ["S", "M", "L", "XL", "2XL", "3XL"];
  const on = (design.sizes || []).filter((s) => all.includes(s));
  return on.length ? on : all;
};
const colourOf = (garment, slug) => garment?.colors?.find((c) => c.slug === slug) || null;
// the side the picture is printed on (the shop shows that side first)
const heroOf = (design) => (design.elements || []).find((e) => e.type === "image")?.side === "back" ? "back" : "front";

// GET /api/ready-designs  (public) -> { open, designs: [...] }
export const listReadyDesigns = asyncHandler(async (req, res) => {
  if (!(await shopOpen())) return res.json({ open: false, designs: [] });
  // ?category=<slug>: only the tees listed under that storefront category; "none": the ones without a category
  // (the Shop your IDENTEE page shows only those — a tee with a category lives on its category's page, 26 Oct 2026)
  const category = String(req.query.category || "").slice(0, 60);
  const where = category === "none" ? { $or: [{ category: "" }, { category: { $exists: false } }] } : category ? { category } : {};
  const designs = await ReadyDesign.find({ status: "published", ...where }).sort({ publishedAt: -1 }).limit(120).lean();
  const garments = await GarmentType.find({ key: { $in: [...new Set(designs.map((d) => d.garmentType))] }, isActive: true }).lean();
  const out = [];
  for (const d of designs) {
    const garment = garments.find((g) => g.key === d.garmentType);
    if (!garment) continue; // its garment is not on sale now
    if (!coloursOf(d, garment).length) continue; // none of its colours is shown in the shop
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
      category: d.category || "",
      colours: coloursOf(d, garment).map(({ slug, name, hex }) => ({ slug, name, hex })),
      photo: coloursOf(d, garment)[0]?.photos?.[0]?.url || null, // a person wearing it (the card shows it on hover)
      sizes: sizesOf(d, garment),
      ...priceOf(d, garment),
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
  if (!design || !garment || !coloursOf(design, garment).length) {
    res.status(404);
    throw new Error("This design isn't in the shop.");
  }
  const colour = colourOf(garment, design.color);
  res.json({
    _id: design._id,
    slug: design.slug,
    name: design.name,
    blurb: design.blurb,
    description: design.product?.description || "", // the product page text given when publishing (26 Oct 2026)
    style: design.product?.style || "",
    fabric: design.product?.fabric || "",
    washCare: design.product?.washCare || [],
    garmentType: design.garmentType,
    garmentLabel: garment.label,
    color: design.color,
    colourName: colour?.name || design.color,
    colourHex: colour?.hex || "#1C1C1D",
    mockups: design.mockups,
    hero: heroOf(design),
    elements: design.elements,
    category: design.category || "",
    colours: coloursOf(design, garment),
    sizes: sizesOf(design, garment),
    sizeChart: garment.sizeChart || [],
    ...priceOf(design, garment),
    pictureAddOn: await aiDesignAddOn(), // what a picture of the customer's own adds when they customize it
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
  // the colour the customer chose (one the tee is sold in); its own pictures go on the copy
  const garment = await GarmentType.findOne({ key: design.garmentType }).lean();
  const wanted = String(req.body?.colour || design.color);
  const chosen = coloursOf(design, garment).find((c) => c.slug === wanted) || coloursOf(design, garment)[0];
  if (!chosen) {
    res.status(404);
    throw new Error("This design isn't in the shop.");
  }
  const mine = await Customization.findOne({ user: req.user._id, fromReady: design._id, color: chosen.slug, orderedAt: null, hiddenAt: null }).sort({ updatedAt: -1 });
  if (mine) return res.json({ customizationId: mine._id, garmentType: mine.garmentType });
  const copy = await Customization.create({
    garmentType: design.garmentType,
    color: chosen.slug,
    size: design.size || "M",
    user: req.user._id,
    layoutVersion: 2,
    elements: design.elements,
    mockups: chosen.mockups || design.mockups,
    name: design.name,
    fromReady: design._id,
  });
  res.status(201).json({ customizationId: copy._id, garmentType: copy.garmentType });
});
