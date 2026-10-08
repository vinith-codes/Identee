import asyncHandler from "express-async-handler";
import Category, { slugify } from "../models/categoryModel.js";
import Product from "../models/productModel.js";
import GarmentType from "../models/garmentTypeModel.js";
import { uploadImage, deleteImage } from "../utils/imageStorage.js";
import { applySubscriptionPrice } from "../utils/applySubscriptionPrice.js";

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Case-insensitive exact match on a list of style names.
const styleMatcher = (styles) => ({
  $in: styles.map((s) => new RegExp(`^\\s*${escapeRegex(s.trim())}\\s*$`, "i")),
});

const cleanStyles = (raw) => {
  const list = Array.isArray(raw) ? raw : String(raw || "").split(",");
  const seen = new Set();
  return list
    .map((s) => String(s).trim())
    .filter((s) => s && s.length <= 40 && !seen.has(s.toLowerCase()) && seen.add(s.toLowerCase()));
};

const toBool = (v, fallback) =>
  v === undefined ? fallback : v === true || v === "true" || v === "1" || v === "on";

const publicShape = (c, productCount) => ({
  _id: c._id,
  name: c.name,
  slug: c.slug,
  description: c.description,
  styles: c.styles,
  image: c.image?.url || "",
  bannerImage: c.bannerImage?.url || "",
  isCustomizable: c.isCustomizable,
  comingSoon: c.comingSoon,
  displayOrder: c.displayOrder,
  ...(productCount !== undefined ? { productCount } : {}),
});

// Number of distinct product groups (a product in 3 colours counts once).
const countProducts = async (styles) => {
  if (!styles.length) return 0;
  const groups = await Product.distinct("productGroupId", {
    "productdetails.garmentStyle": styleMatcher(styles),
  });
  return groups.length;
};

/* ======================== PUBLIC ======================== */

// @desc   Active categories for the home page / navbar
// @route  GET /api/categories
// @access Public
export const getCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find({ isActive: true }).sort({ displayOrder: 1, name: 1 });
  const withCounts = await Promise.all(
    categories.map(async (c) => publicShape(c, await countProducts(c.styles))),
  );
  res.set("Cache-Control", "public, max-age=60");
  res.json(withCounts);
});

// @desc   One category by slug. Old links like /category/Round%20Neck (a style
//         name) resolve to the category containing that style.
// @route  GET /api/categories/:slug
// @access Public
export const getCategoryBySlug = asyncHandler(async (req, res) => {
  const param = String(req.params.slug || "");
  let category = await Category.findOne({ slug: param.toLowerCase(), isActive: true });
  let matchedStyle = null;

  if (!category) {
    category = await Category.findOne({ styles: styleMatcher([param]), isActive: true });
    matchedStyle = category?.styles.find((s) => s.toLowerCase() === param.trim().toLowerCase()) || null;
  }
  if (!category) {
    res.status(404);
    throw new Error("Category not found");
  }
  res.json({ ...publicShape(category, await countProducts(category.styles)), matchedStyle });
});

const SORTS = {
  newest: { createdAt: -1 },
  popular: { soldCount: -1, createdAt: -1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
};

// @desc   Products in a category — one card per product (colours grouped),
//         filters: style, size; sort; pagination.
// @route  GET /api/categories/:slug/products?style=&size=&sort=&page=&limit=
// @access Public (optional auth for subscription prices)
export const getCategoryProducts = asyncHandler(async (req, res) => {
  const category = await Category.findOne({ slug: String(req.params.slug).toLowerCase(), isActive: true });
  if (!category) {
    res.status(404);
    throw new Error("Category not found");
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(48, Math.max(1, parseInt(req.query.limit, 10) || 12));
  const sort = SORTS[req.query.sort] || SORTS.newest;

  const style = req.query.style && category.styles.find(
    (s) => s.toLowerCase() === String(req.query.style).toLowerCase(),
  );
  const match = {
    "productdetails.garmentStyle": styleMatcher(style ? [style] : category.styles),
  };
  if (req.query.size) {
    match["productdetails.stockBySize"] = {
      $elemMatch: { size: String(req.query.size), stock: { $gt: 0 } },
    };
  }

  const empty = { items: [], total: 0, page, pages: 0, styles: [], sizes: [] };
  if (!category.styles.length) return res.json(empty);

  const [result] = await Product.aggregate([
    { $match: match },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: { $ifNull: ["$productGroupId", { $toString: "$_id" }] },
        doc: { $first: "$$ROOT" },
        colors: { $addToSet: "$productdetails.color" },
        totalStock: { $sum: { $sum: "$productdetails.stockBySize.stock" } },
        soldCount: { $sum: "$soldCount" },
      },
    },
    {
      $project: {
        _id: "$doc._id",
        brandname: "$doc.brandname",
        price: "$doc.price",
        oldPrice: "$doc.oldPrice",
        discount: "$doc.discount",
        images: { $slice: ["$doc.images", 2] },
        rating: "$doc.rating",
        numReviews: "$doc.numReviews",
        garmentStyle: "$doc.productdetails.garmentStyle",
        color: "$doc.productdetails.color",
        colors: 1,
        inStock: { $gt: ["$totalStock", 0] },
        soldCount: 1,
        createdAt: "$doc.createdAt",
      },
    },
    { $sort: sort },
    {
      $facet: {
        items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
        total: [{ $count: "n" }],
      },
    },
  ]);

  // Filter options: styles/sizes that actually have products in this category.
  const all = { "productdetails.garmentStyle": styleMatcher(category.styles) };
  const [presentStyles, presentSizes] = await Promise.all([
    Product.distinct("productdetails.garmentStyle", all),
    Product.distinct("productdetails.stockBySize.size", all),
  ]);

  const total = result.total[0]?.n || 0;
  res.json({
    items: result.items.map((p) => {
      const priced = applySubscriptionPrice(p, req.user);
      return { ...p, subscriptionPrice: priced.subscriptionPrice };
    }),
    total,
    page,
    pages: Math.ceil(total / limit),
    styles: category.styles.filter((s) =>
      presentStyles.some((p) => p?.trim().toLowerCase() === s.toLowerCase()),
    ),
    sizes: presentSizes.filter(Boolean),
  });
});

// @desc   Garment types the customizer can start with, for "Design your own"
// @route  GET /api/categories/:slug/garments
// @access Public
export const getCategoryGarments = asyncHandler(async (req, res) => {
  const category = await Category.findOne({ slug: String(req.params.slug).toLowerCase(), isActive: true });
  if (!category) {
    res.status(404);
    throw new Error("Category not found");
  }
  const garments = category.styles.length
    ? await GarmentType.find({ isActive: true, category: styleMatcher(category.styles) })
    : [];
  res.json(garments);
});

/* ======================== ADMIN ======================== */

// @route  GET /api/categories/admin/all   (includes hidden)
export const adminGetCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find().sort({ displayOrder: 1, name: 1 });
  res.json(
    await Promise.all(
      categories.map(async (c) => ({
        ...c.toObject(),
        productCount: await countProducts(c.styles),
      })),
    ),
  );
});

const applyBody = (category, body) => {
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 2 || name.length > 40) {
      throw Object.assign(new Error("Name must be 2–40 characters"), { status: 400 });
    }
    category.name = name;
  }
  if (body.slug !== undefined || !category.slug) {
    const slug = slugify(body.slug || category.name);
    if (!slug) throw Object.assign(new Error("Invalid web address (slug)"), { status: 400 });
    category.slug = slug;
  }
  if (body.description !== undefined) category.description = String(body.description).slice(0, 200);
  if (body.styles !== undefined) {
    category.styles = cleanStyles(typeof body.styles === "string" && body.styles.startsWith("[")
      ? JSON.parse(body.styles)
      : body.styles);
  }
  if (body.displayOrder !== undefined) category.displayOrder = Number(body.displayOrder) || 0;
  category.isActive = toBool(body.isActive, category.isActive);
  category.isCustomizable = toBool(body.isCustomizable, category.isCustomizable);
  category.comingSoon = toBool(body.comingSoon, category.comingSoon);
};

const saveImages = async (category, files = {}, body = {}) => {
  for (const field of ["image", "bannerImage"]) {
    const file = files[field]?.[0];
    if (file) {
      const old = category[field];
      category[field] = await uploadImage(file.buffer, file.mimetype, "categories");
      await deleteImage(old);
    } else if (toBool(body[`remove_${field}`], false)) {
      await deleteImage(category[field]);
      category[field] = { url: "", publicId: "" };
    }
  }
};

const saveCategory = async (category, res) => {
  try {
    return await category.save();
  } catch (err) {
    if (err.code === 11000) {
      res.status(400);
      throw new Error(`Another category already uses the web address "${category.slug}"`);
    }
    throw err;
  }
};

// @route  POST /api/categories   (multipart: fields + image + bannerImage)
export const createCategory = asyncHandler(async (req, res) => {
  const category = new Category();
  applyBody(category, req.body);
  if (req.body.displayOrder === undefined) {
    const last = await Category.findOne().sort({ displayOrder: -1 });
    category.displayOrder = (last?.displayOrder ?? -1) + 1;
  }
  await saveImages(category, req.files, req.body);
  res.status(201).json(await saveCategory(category, res));
});

// @route  PUT /api/categories/:id
export const updateCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) {
    res.status(404);
    throw new Error("Category not found");
  }
  applyBody(category, req.body);
  await saveImages(category, req.files, req.body);
  res.json(await saveCategory(category, res));
});

// @route  PUT /api/categories/reorder   { ids: [...] } in display order
export const reorderCategories = asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  await Promise.all(ids.map((id, i) => Category.updateOne({ _id: id }, { displayOrder: i })));
  res.json({ message: "Order saved" });
});

// @route  DELETE /api/categories/:id
// Products are never deleted — they just stop showing under this category.
export const deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) {
    res.status(404);
    throw new Error("Category not found");
  }
  await deleteImage(category.image);
  await deleteImage(category.bannerImage);
  await category.deleteOne();
  res.json({ message: "Category deleted" });
});
