// controllers/productAdminController.js
//
// Admin → Ready-made: the product wizard and the product list.
//
// A ready-made "product" the admin sees is a GROUP of Product documents that
// share productGroupId — one document per colour (each with its own photos,
// prices and stock per size). Shared details (name, description, style,
// fabric …) are copied to every colour.
//
// Sellers only see and change the products they added; admins see all.
import mongoose from "mongoose";
import asyncHandler from "express-async-handler";
import Product from "../models/productModel.js";
import Order from "../models/orderModel.js";
import Category from "../models/categoryModel.js";
import { assertCanManage, assertCanManageGroup, manageableFilter } from "../utils/productAccess.js";

const LOW_STOCK = 3; // a size with this many or fewer is "low"
const MAX_PHOTOS = 8;
const SIZE_RE = /^[\w\- ]{1,12}$/;

const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const text = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// style -> category name, from Admin → Storefront → Categories
const categoryLookup = async () => {
  const cats = await Category.find().select("name styles isActive").lean();
  return (style) => {
    const s = String(style || "").trim().toLowerCase();
    return cats.find((c) => c.styles.some((x) => x.trim().toLowerCase() === s))?.name || null;
  };
};

const stockTotal = (p) => (p.productdetails?.stockBySize || []).reduce((n, s) => n + (s.stock || 0), 0);

// One list card per group.
const summarise = (docs, categoryOf, owners) => {
  const base = docs[0];
  const prices = docs.map((d) => d.price);
  const sizes = [...new Set(docs.flatMap((d) => d.productdetails?.sizes || []))];
  const colours = docs.map((d) => ({
    _id: d._id,
    color: d.productdetails?.color,
    image: d.images?.[0] || null,
    price: d.price,
    oldPrice: d.oldPrice,
    hidden: !!d.isHidden,
    stockBySize: (d.productdetails?.sizes || []).map((size) => ({
      size,
      stock: d.productdetails.stockBySize?.find((s) => s.size === size)?.stock ?? 0,
    })),
  }));
  const low = colours.some((c) => c.stockBySize.some((s) => s.stock <= LOW_STOCK));
  return {
    groupId: base.productGroupId,
    name: base.brandname,
    style: base.productdetails?.garmentStyle,
    category: categoryOf(base.productdetails?.garmentStyle),
    image: base.images?.[0] || null,
    priceMin: Math.min(...prices),
    priceMax: Math.max(...prices),
    sizes,
    totalStock: docs.reduce((n, d) => n + stockTotal(d), 0),
    lowStock: low,
    hidden: docs.every((d) => d.isHidden),
    featured: !!base.isFeatured,
    colours,
    owner: owners.get(String(base.user)) || null,
    ownerId: String(base.user),
    updatedAt: docs.reduce((t, d) => (d.updatedAt > t ? d.updatedAt : t), base.updatedAt),
  };
};

// @desc  Products for Admin → Ready-made → All products
// @route GET /api/products/admin/groups?search=&category=&status=all|live|hidden|low
export const listGroups = asyncHandler(async (req, res) => {
  const filter = { ...manageableFilter(req.user) };
  const search = text(req.query.search, 60);
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ brandname: rx }, { SKU: rx }, { "productdetails.color": rx }, { "productdetails.garmentStyle": rx }];
  }
  // a search matches single colours — show the whole product they belong to
  const hits = await Product.find(filter).select("productGroupId").lean();
  const groupIds = [...new Set(hits.map((h) => h.productGroupId))];
  const docs = await Product.find({ productGroupId: { $in: groupIds }, retired: { $ne: true }, ...manageableFilter(req.user) })
    .select("-reviews -banners -VideoBanner")
    .sort({ createdAt: 1 })
    .lean();

  const byGroup = new Map();
  for (const d of docs) {
    if (!byGroup.has(d.productGroupId)) byGroup.set(d.productGroupId, []);
    byGroup.get(d.productGroupId).push(d);
  }
  const categoryOf = await categoryLookup();
  const ownerIds = [...new Set(docs.map((d) => String(d.user)))];
  const owners = new Map(
    (await mongoose.model("User").find({ _id: { $in: ownerIds } }).select("name").lean()).map((u) => [String(u._id), u.name]),
  );

  let groups = [...byGroup.values()].map((g) => summarise(g, categoryOf, owners));
  const category = text(req.query.category, 60);
  if (category) groups = groups.filter((g) => (category === "none" ? !g.category : g.category === category));
  const status = req.query.status;
  if (status === "live") groups = groups.filter((g) => !g.hidden);
  if (status === "hidden") groups = groups.filter((g) => g.hidden);
  if (status === "low") groups = groups.filter((g) => g.lowStock && !g.hidden);
  groups.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  // counts for the filter chips (before the status filter)
  const all = [...byGroup.values()].map((g) => summarise(g, categoryOf, owners));
  res.json({
    groups,
    counts: {
      all: all.length,
      live: all.filter((g) => !g.hidden).length,
      hidden: all.filter((g) => g.hidden).length,
      low: all.filter((g) => g.lowStock && !g.hidden).length,
    },
    lowStockAt: LOW_STOCK,
  });
});

// @desc  Choices for the wizard: storefront categories with their styles
// @route GET /api/products/admin/options
export const wizardOptions = asyncHandler(async (req, res) => {
  const cats = await Category.find().sort({ displayOrder: 1, name: 1 }).select("name styles isActive").lean();
  res.json({ categories: cats.map((c) => ({ name: c.name, styles: c.styles, isActive: c.isActive })) });
});

// @desc  One product (all colours) for the wizard
// @route GET /api/products/admin/groups/:groupId
export const getGroup = asyncHandler(async (req, res) => {
  const docs = await Product.find({ productGroupId: req.params.groupId, retired: { $ne: true } })
    .select("-reviews -banners -VideoBanner")
    .sort({ createdAt: 1 })
    .lean();
  if (!docs.length) throw bad("Product not found", 404);
  await assertCanManageGroup(req.user, req.params.groupId);
  const ordered = new Set(
    (await Order.distinct("orderItems.product", { "orderItems.product": { $in: docs.map((d) => d._id) } })).map(String),
  );
  const base = docs[0];
  res.json({
    groupId: base.productGroupId,
    name: base.brandname,
    description: base.description,
    sku: String(base.SKU || "").split("-")[0],
    style: base.productdetails.garmentStyle,
    gender: base.productdetails.gender,
    ageRange: base.productdetails.ageRange,
    type: base.productdetails.type,
    subcategory: base.productdetails.subcategory,
    fabric: base.productdetails.fabric,
    washCare: base.washCare || [],
    hsnCode: base.hsnCode,
    featured: !!base.isFeatured,
    hidden: docs.every((d) => d.isHidden),
    productType: base.productType,
    comboName: base.comboName,
    sizeChart: base.sizeChart || "",
    shipping: base.shippingDetails || {},
    colours: docs.map((d) => ({
      _id: d._id,
      color: d.productdetails.color,
      images: d.images || [],
      price: d.price,
      oldPrice: d.oldPrice,
      sizes: d.productdetails.sizes,
      stockBySize: Object.fromEntries((d.productdetails.stockBySize || []).map((s) => [s.size, s.stock])),
      hidden: !!d.isHidden,
      ordered: ordered.has(String(d._id)),
    })),
  });
});

/* ---------- create / save ---------- */

// Reads and checks the wizard's JSON ("data") and returns clean values.
// images: each colour lists its photos in order — a saved URL (kept) or
// { file: n } = the n-th uploaded file in "images".
const readPayload = (req, categoryOf) => {
  let d;
  try {
    d = JSON.parse(req.body.data || "{}");
  } catch {
    throw bad("The product data couldn't be read");
  }
  const files = req.files?.images || [];

  const name = text(d.name, 80);
  const description = text(d.description, 3000);
  const style = text(d.style, 60);
  const fabric = text(d.fabric, 80);
  if (!name) throw bad("Give the product a name");
  if (!style) throw bad("Choose where it appears in the shop (category and style)");
  if (!description) throw bad("Add a short description");
  if (!fabric) throw bad("Add the fabric");

  const colours = Array.isArray(d.colours) ? d.colours : [];
  if (!colours.length) throw bad("Add at least one colour");
  const seen = new Set();
  const used = new Set();
  const clean = colours.map((c, i) => {
    const color = text(c.color, 40);
    const label = color || `Colour ${i + 1}`;
    if (!color) throw bad(`Colour ${i + 1}: give it a name`);
    if (seen.has(color.toLowerCase())) throw bad(`“${color}” is listed twice`);
    seen.add(color.toLowerCase());

    const images = (Array.isArray(c.images) ? c.images : []).map((img) => {
      if (typeof img === "string") {
        if (!/^https?:\/\/|^\/?uploads\//.test(img)) throw bad(`${label}: a photo is invalid`);
        return img;
      }
      const f = files[Number(img?.file)];
      if (!f) throw bad(`${label}: a new photo didn't upload — please add it again`);
      used.add(Number(img.file));
      return f.path;
    });
    if (!images.length) throw bad(`${label}: add at least one photo`);
    if (images.length > MAX_PHOTOS) throw bad(`${label}: at most ${MAX_PHOTOS} photos`);

    const sizes = [...new Set((Array.isArray(c.sizes) ? c.sizes : []).map((s) => text(s, 12)).filter(Boolean))];
    if (!sizes.length) throw bad(`${label}: choose at least one size`);
    if (sizes.some((s) => !SIZE_RE.test(s))) throw bad(`${label}: a size name is invalid`);
    const stockBySize = sizes.map((size) => {
      const n = Math.floor(num(c.stockBySize?.[size] ?? 0));
      if (!Number.isFinite(n) || n < 0 || n > 100000) throw bad(`${label}: stock for ${size} must be 0 or more`);
      return { size, stock: n };
    });

    const price = Math.round(num(c.price));
    if (!(price >= 1)) throw bad(`${label}: enter the selling price`);
    let oldPrice = Math.round(num(c.oldPrice));
    if (!Number.isFinite(oldPrice) || oldPrice < price) oldPrice = price; // no MRP = no discount
    const discount = oldPrice > price ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;

    return { _id: c._id && mongoose.isValidObjectId(c._id) ? String(c._id) : null, color, images, sizes, stockBySize, price, oldPrice, discount };
  });

  const sh = d.shipping || {};
  const optNum = (v) => (v === "" || v == null || !Number.isFinite(Number(v)) ? undefined : Number(v));
  const shipping = {
    weight: optNum(sh.weight),
    dimensions: { length: optNum(sh.dimensions?.length), width: optNum(sh.dimensions?.width), height: optNum(sh.dimensions?.height) },
    originAddress: {
      street1: text(sh.originAddress?.street1, 120) || undefined,
      city: text(sh.originAddress?.city, 60) || undefined,
      state: text(sh.originAddress?.state, 60) || undefined,
      zip: optNum(sh.originAddress?.zip),
      country: text(sh.originAddress?.country, 60) || undefined,
    },
  };

  const productType = d.productType === "combo" ? "combo" : "single";
  return {
    common: {
      brandname: name,
      description,
      hsnCode: text(d.hsnCode, 12) || "6109",
      washCare: (Array.isArray(d.washCare) ? d.washCare : []).map((w) => text(w, 60)).filter(Boolean).slice(0, 12),
      isFeatured: !!d.featured,
      productType,
      comboName: productType === "combo" ? text(d.comboName, 80) : "",
      shippingDetails: shipping,
      ...(req.files?.sizeChart?.[0] ? { sizeChart: req.files.sizeChart[0].path } : {}),
    },
    details: {
      gender: text(d.gender, 20) || "Unisex",
      ageRange: text(d.ageRange, 20) || "Adult",
      type: text(d.type, 30) || "Casual",
      category: categoryOf(style) || style,
      subcategory: productType === "combo" ? "Combo" : text(d.subcategory, 60) || style,
      garmentStyle: style,
      fabric,
    },
    sku: text(d.sku, 20).toUpperCase().replace(/[^A-Z0-9]/g, ""),
    hidden: !!d.hidden,
    colours: clean,
  };
};

const skuBase = (name) =>
  (String(name).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "IDT") + Math.floor(100 + Math.random() * 900);
const skuFor = (base, color) => `${base}-${color.toUpperCase().replace(/[^A-Z0-9]/g, "")}-${Date.now().toString(36).toUpperCase()}`;

const colourDoc = (p, c) => ({
  ...p.common,
  price: c.price,
  oldPrice: c.oldPrice,
  discount: c.discount,
  images: c.images,
  productdetails: { ...p.details, color: c.color, sizes: c.sizes, stockBySize: c.stockBySize },
});

// @desc  Create a product (all its colours)
// @route POST /api/products/admin/groups   (multipart: data + images[] + sizeChart)
export const createGroup = asyncHandler(async (req, res) => {
  const p = readPayload(req, await categoryLookup());
  const groupId = new mongoose.Types.ObjectId().toString();
  const base = p.sku || skuBase(p.common.brandname);
  if (p.sku && (await Product.exists({ SKU: { $regex: `^${escapeRegex(base)}-` } }))) {
    throw bad(`The code ${base} is already used by another product`);
  }
  const docs = p.colours.map((c) => ({
    ...colourDoc(p, c),
    user: req.user._id,
    productGroupId: groupId,
    SKU: skuFor(base, c.color),
    isHidden: p.hidden,
    rating: 0,
    numReviews: 0,
  }));
  await Product.insertMany(docs);
  res.status(201).json({ groupId });
});

// @desc  Save a product: shared details to every colour; colours added,
//        changed or removed. A removed colour that was ever ordered is
//        hidden instead of deleted (its orders still link to it).
// @route PUT /api/products/admin/groups/:groupId   (multipart)
export const saveGroup = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const existing = await Product.find({ productGroupId: groupId, retired: { $ne: true } });
  if (!existing.length) throw bad("Product not found", 404);
  await assertCanManageGroup(req.user, groupId);
  const p = readPayload(req, await categoryLookup());

  const byId = new Map(existing.map((d) => [String(d._id), d]));
  const base = String(existing[0].SKU || "").split("-")[0] || skuBase(p.common.brandname);
  const keep = new Set();
  for (const c of p.colours) {
    const doc = c._id && byId.get(c._id);
    if (doc) {
      keep.add(c._id);
      const fields = colourDoc(p, c);
      if (!fields.sizeChart) delete fields.sizeChart;
      doc.set({ ...fields, productdetails: { ...doc.productdetails.toObject(), ...fields.productdetails } });
      doc.isHidden = p.hidden;
      await doc.save();
    } else {
      const created = await Product.create({
        ...colourDoc(p, c),
        sizeChart: p.common.sizeChart || existing[0].sizeChart || "",
        user: existing[0].user,
        productGroupId: groupId,
        SKU: skuFor(base, c.color),
        isHidden: p.hidden,
        rating: 0,
        numReviews: 0,
      });
      keep.add(String(created._id));
    }
  }
  const removed = existing.filter((d) => !keep.has(String(d._id)));
  if (removed.length) {
    const ordered = new Set(
      (await Order.distinct("orderItems.product", { "orderItems.product": { $in: removed.map((d) => d._id) } })).map(String),
    );
    for (const d of removed) {
      if (ordered.has(String(d._id))) await Product.updateOne({ _id: d._id }, { $set: { isHidden: true, retired: true } });
      else await Product.deleteOne({ _id: d._id });
    }
  }
  res.json({ groupId, removed: removed.length });
});

// @desc  Hide from / show in the shop (every colour)
// @route PATCH /api/products/admin/groups/:groupId/visibility  { hidden }
export const setGroupVisibility = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  if (!(await Product.exists({ productGroupId: groupId, retired: { $ne: true } }))) throw bad("Product not found", 404);
  await assertCanManageGroup(req.user, groupId);
  await Product.updateMany({ productGroupId: groupId, retired: { $ne: true } }, { $set: { isHidden: !!req.body.hidden } });
  res.json({ groupId, hidden: !!req.body.hidden });
});

// @desc  Quick restock of one colour
// @route PATCH /api/products/admin/colours/:id/stock  { stockBySize: { S: 4, M: 0 } }
export const setColourStock = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw bad("Product not found", 404);
  const doc = await Product.findById(req.params.id);
  if (!doc) throw bad("Product not found", 404);
  assertCanManage(req.user, doc);
  const wanted = req.body.stockBySize || {};
  doc.productdetails.stockBySize = doc.productdetails.sizes.map((size) => {
    const cur = doc.productdetails.stockBySize.find((s) => s.size === size)?.stock ?? 0;
    const v = wanted[size];
    const n = v === undefined ? cur : Math.floor(Number(v));
    if (!Number.isFinite(n) || n < 0 || n > 100000) throw bad(`Stock for ${size} must be 0 or more`);
    return { size, stock: n };
  });
  doc.markModified("productdetails.stockBySize");
  await doc.save();
  res.json({ _id: doc._id, stockBySize: doc.productdetails.stockBySize });
});

// @desc  Delete a product that was never ordered (otherwise hide it)
// @route DELETE /api/products/admin/groups/:groupId
export const deleteGroup = asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const docs = await Product.find({ productGroupId: groupId }).select("_id");
  if (!docs.length) throw bad("Product not found", 404);
  await assertCanManageGroup(req.user, groupId);
  if (await Order.exists({ "orderItems.product": { $in: docs.map((d) => d._id) } })) {
    throw bad("This product has been ordered, so it can't be deleted — hide it from the shop instead.", 409);
  }
  await Product.deleteMany({ productGroupId: groupId });
  res.json({ groupId, deleted: docs.length });
});
