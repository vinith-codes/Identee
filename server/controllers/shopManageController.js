// controllers/shopManageController.js — Admin → Shop your IDENTEE → Manage the shop (24 Nov 2026)
//
// The owner: "i want in the admin to remove the whole style, like that to manage shop your identee. I need all the
// required ones" — then picked: style on/off, colour + Men/Women on/off, a tee list with ticks, prices in bulk, the
// collections' name/text, order and home page, and "to remove completely even from the admin".
//
//   GET  /api/studio/shop              every shop tee (in the shop or taken out) + the collections' settings
//   POST /api/studio/shop/bulk         { ids, action, colour?, price?, oldPrice? } — one action on many tees
//   PUT  /api/studio/shop/collections  { order, items } — names, text, order, home page
//
// Taking out never loses anything (the tee stays here and goes back in one click). "Delete for good" removes the tee
// from the admin too; a colour someone ordered stays as a hidden product, so the order still shows it.
import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import ReadyDesign from "../models/readyDesignModel.js";
import { applyShopHidden, backFirst, removeStudioProduct, studioGarments, studioPrice, syncStudioProduct } from "../services/studioService.js";
import { collectionOf, collectionTitle } from "../utils/shopRules.js";
import { readCollections, saveCollections, DEFAULT_HOME } from "../utils/shopCollections.js";

export const ACTIONS = ["out", "back", "delete", "colourOut", "colourBack", "price"];
const MAX_IDS = 1000;

// a tee that is (or was) in the shop: published, or taken out after being published
const SHOP_TEE = { source: "studio", $or: [{ status: "published" }, { status: "ready", publishedAt: { $ne: null } }] };

const styleOf = (d) => d.product?.style || d.product?.listings?.[0]?.style || "";

// one tee, as the manage page lists it
export function teeRow(d, garment, price) {
  const colours = d.colours?.length ? d.colours : [{ slug: d.color, mockups: d.mockups }];
  const hidden = new Set(d.hiddenColours || []);
  const first = colours[0]?.mockups || d.mockups || {};
  return {
    _id: d._id,
    name: d.name,
    slug: d.slug,
    collection: collectionOf(d.name) || "none",
    collectionName: collectionTitle(d.name) || "No collection",
    inShop: d.status === "published",
    style: styleOf(d),
    gender: d.product?.gender || "Unisex",
    garmentType: d.garmentType,
    garmentLabel: garment?.label || d.garmentType,
    family: d.family || "", // its other styles share this (25 Nov 2026)
    colours: colours.map((c) => {
      const g = garment?.colours?.find((x) => x.slug === c.slug);
      return { slug: c.slug, name: g?.name || c.slug, hex: g?.hex || "#1C1C1D", hidden: hidden.has(c.slug) };
    }),
    price: price.price,
    oldPrice: price.oldPrice,
    picture: (backFirst(d) ? first.back || first.front : first.front || first.back) || null,
    updatedAt: d.updatedAt,
  };
}

// GET /api/studio/shop  (admin)
export const listShopTees = asyncHandler(async (req, res) => {
  const [docs, garments, conf] = await Promise.all([
    ReadyDesign.find(SHOP_TEE).select("name slug status family garmentType color colours.slug colours.mockups mockups product priceInr hiddenColours elements.side elements.fixed elements.type updatedAt publishedAt").sort({ publishedAt: -1 }).lean(),
    studioGarments(),
    readCollections(),
  ]);
  const tees = [];
  for (const d of docs) {
    const garment = garments.find((g) => g.key === d.garmentType);
    tees.push(teeRow(d, garment, await studioPrice(d, garment)));
  }
  res.json({ tees, collections: conf || { order: [], items: {} }, defaultHome: DEFAULT_HOME });
});

// what a bulk price change asks for: a whole rupee price, and a "was" price above it (or none)
export function cleanPrice(body = {}) {
  const price = Math.round(Number(body.price));
  const oldPrice = Math.round(Number(body.oldPrice) || 0);
  if (!(price >= 1 && price <= 99999)) return { error: "Give a price between ₹1 and ₹99,999." };
  if (oldPrice && oldPrice <= price) return { error: "The struck “was” price must be more than the price (or leave it empty)." };
  return { price, oldPrice };
}

// POST /api/studio/shop/bulk  (admin) -> { done, failed: [{ name, message }] }
export const bulkShopTees = asyncHandler(async (req, res) => {
  const { action } = req.body || {};
  const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(String))].filter((id) => mongoose.isValidObjectId(id));
  if (!ACTIONS.includes(action) || !ids.length || ids.length > MAX_IDS) {
    res.status(400);
    throw new Error("Choose the tees and what to do with them.");
  }
  const colour = String(req.body.colour || "").toLowerCase();
  if (["colourOut", "colourBack"].includes(action) && !/^[a-z0-9-]{1,40}$/.test(colour)) {
    res.status(400);
    throw new Error("Choose a colour.");
  }
  const money = action === "price" ? cleanPrice(req.body) : null;
  if (money?.error) {
    res.status(400);
    throw new Error(money.error);
  }
  const garments = action === "price" ? await studioGarments() : [];
  const designs = await ReadyDesign.find({ _id: { $in: ids }, ...SHOP_TEE });
  let done = 0;
  const failed = [];
  for (const design of designs) {
    try {
      if (action === "out" || action === "back") {
        const to = action === "out" ? "ready" : "published";
        if (design.status !== to) {
          design.status = to;
          if (to === "published") design.publishedAt = design.publishedAt || new Date();
          await design.save();
        }
        await applyShopHidden(design);
      } else if (action === "colourOut" || action === "colourBack") {
        const has = (design.colours?.length ? design.colours.map((c) => c.slug) : [design.color]).includes(colour);
        if (!has) continue; // (not sold in that colour: nothing to do)
        const set = new Set(design.hiddenColours || []);
        if (action === "colourOut") set.add(colour);
        else set.delete(colour);
        design.hiddenColours = [...set];
        await design.save();
        await applyShopHidden(design);
      } else if (action === "price") {
        const garment = garments.find((g) => g.key === design.garmentType);
        if (!garment) throw new Error("its product is not live any more");
        design.priceInr = money.price;
        design.product = { ...(design.product || {}), oldPrice: money.oldPrice };
        design.markModified("product");
        await design.save();
        await syncStudioProduct(design, garment, req.user._id);
        await design.save();
      } else if (action === "delete") {
        // gone from the shop and from the admin. The record itself is kept, marked "removed", so an order or a
        // customer's cart copy made from it still works (its pictures stay the tee's own, no picture add-on)
        await removeStudioProduct(design._id);
        design.status = "removed";
        design.removedAt = new Date();
        await design.save();
      }
      done += 1;
    } catch (err) {
      failed.push({ name: design.name, message: err.message });
    }
  }
  res.json({ done, failed });
});

// PUT /api/studio/shop/collections  (admin) { order, items: { key: { name, text, home } } }
export const saveShopCollections = asyncHandler(async (req, res) => {
  res.json(await saveCollections(req.body || {}, req.user._id));
});
