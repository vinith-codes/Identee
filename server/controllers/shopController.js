// controllers/shopController.js
//
// The customer's ready-made shop: one card per product (all colours of a
// productGroupId together), with filters and the options to filter by.
// Only live products (not hidden) whose style belongs to an active
// storefront category are shown — the same rule as the category pages.
import asyncHandler from "express-async-handler";
import Product, { LIVE } from "../models/productModel.js";
import Category from "../models/categoryModel.js";
import ReadyDesign from "../models/readyDesignModel.js";
import { applySubscriptionPrice } from "../utils/applySubscriptionPrice.js";

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL", "4XL", "5XL", "FREE SIZE"];
const sizeRank = (s) => {
  const kids = /^(\d+)(?:\s*-\s*\d+)?\s*(?:y|yrs?|years)?$/i.exec(String(s)); // "4-6", "10-12" (kids) come first
  if (kids) return -100 + Number(kids[1]);
  const i = SIZE_ORDER.indexOf(String(s).toUpperCase());
  return i === -1 ? 100 : i;
};
export const sortSizes = (list) => [...list].sort((a, b) => sizeRank(a) - sizeRank(b) || String(a).localeCompare(String(b)));

const norm = (s) => String(s || "").trim().toLowerCase();
const stockOf = (d) => (d.productdetails?.stockBySize || []).reduce((n, s) => n + (s.stock || 0), 0);
const titleCase = (s) => String(s || "").trim().replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const SORTS = {
  newest: (a, b) => b.createdAt - a.createdAt,
  popular: (a, b) => b.soldCount - a.soldCount || b.createdAt - a.createdAt,
  price_asc: (a, b) => a.price - b.price,
  price_desc: (a, b) => b.price - a.price,
  discount: (a, b) => b.discount - a.discount || a.price - b.price,
};

// @desc   Ready-made products, one card per product
// @route  GET /api/shop/products?category=&style=&size=&color=&maxPrice=&q=&sort=&page=&limit=&exclude=&featured=1
// @access Public (optional login for member prices)
export const listShopProducts = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(48, Math.max(1, parseInt(req.query.limit, 10) || 12));
  const sort = SORTS[req.query.sort] ? req.query.sort : "newest";

  // which styles are in the shop (and which category each belongs to)
  const active = await Category.find({ isActive: true })
    .sort({ displayOrder: 1, name: 1 })
    .select("name slug styles comingSoon")
    .lean();
  const fixed = req.query.category ? active.find((c) => c.slug === String(req.query.category).toLowerCase()) : null;
  if (req.query.category && !fixed) return res.status(404).json({ message: "Category not found" });
  // "coming soon" categories are left out of the all-products shop
  const categories = fixed ? [fixed] : active.filter((c) => !c.comingSoon);
  // which category a product belongs to — decided against EVERY active category, so a product lands in exactly one
  // whatever page asks (27 Oct 2026): the category name written on it first (Men and Women can both have
  // "Oversized"); the style only decides for products that carry no known category name. Then the page's scope.
  const categoryByName = new Map(active.map((c) => [norm(c.name), c]));
  const categoryOfStyle = new Map();
  for (const c of active) for (const s of c.styles) if (!categoryOfStyle.has(norm(s))) categoryOfStyle.set(norm(s), c);
  const inPage = new Set(categories.map((c) => c.slug));
  const categoryOf = (d) => {
    const c = categoryByName.get(norm(d.productdetails?.category)) || categoryOfStyle.get(norm(d.productdetails?.garmentStyle));
    return c && inPage.has(c.slug) ? c : null;
  };

  // every live colour document in scope
  const all = await Product.find(LIVE)
    .select("brandname price oldPrice discount images productGroupId productdetails rating numReviews soldCount createdAt isFeatured readyDesign")
    .lean();
  // a Studio tee (printed to order) opens its own page: its slug goes on the card
  const designIds = [...new Set(all.filter((d) => d.readyDesign).map((d) => String(d.readyDesign)))];
  const designSlug = new Map(designIds.length ? (await ReadyDesign.find({ _id: { $in: designIds } }).select("slug").lean()).map((r) => [String(r._id), r.slug]) : []);
  const inScope = all.filter((d) => categoryOf(d));

  // filters
  const style = norm(req.query.style);
  const size = String(req.query.size || "").trim();
  const color = norm(req.query.color);
  const maxPrice = Number(req.query.maxPrice) || 0;
  const q = norm(req.query.q);
  const exclude = String(req.query.exclude || "");
  const featuredOnly = req.query.featured === "1";
  const matches = inScope.filter((d) => {
    const pd = d.productdetails || {};
    if (style && norm(pd.garmentStyle) !== style) return false;
    if (color && norm(pd.color) !== color) return false;
    if (size && !(pd.stockBySize || []).some((s) => s.size === size && s.stock > 0)) return false;
    if (maxPrice && d.price > maxPrice) return false;
    if (exclude && d.productGroupId === exclude) return false;
    if (featuredOnly && !d.isFeatured) return false;
    if (q) {
      const hay = [d.brandname, pd.garmentStyle, pd.color, pd.fabric, categoryOf(d)?.name].map(norm).join(" ");
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  });

  // group colours into products
  const byGroup = new Map();
  for (const d of inScope) {
    if (!byGroup.has(d.productGroupId)) byGroup.set(d.productGroupId, []);
    byGroup.get(d.productGroupId).push(d);
  }
  const matchedGroups = new Map();
  for (const d of matches) {
    if (!matchedGroups.has(d.productGroupId)) matchedGroups.set(d.productGroupId, []);
    matchedGroups.get(d.productGroupId).push(d);
  }

  const cards = [...matchedGroups.entries()].map(([groupId, hits]) => {
    const colours = [...byGroup.get(groupId)].sort((a, b) => a.createdAt - b.createdAt);
    // the card shows the first matching colour (the one you filtered for)
    const rep = [...hits].sort((a, b) => a.createdAt - b.createdAt)[0];
    const priced = applySubscriptionPrice(rep, req.user);
    const cat = categoryOf(rep);
    return {
      _id: rep._id,
      groupId,
      brandname: rep.brandname,
      price: rep.price,
      oldPrice: rep.oldPrice,
      discount: rep.oldPrice > rep.price ? Math.round(((rep.oldPrice - rep.price) / rep.oldPrice) * 100) : 0,
      subscriptionPrice: priced.subscriptionPrice,
      images: (rep.images || []).slice(0, 2),
      garmentStyle: rep.productdetails?.garmentStyle,
      category: cat ? { name: cat.name, slug: cat.slug } : null,
      color: rep.productdetails?.color,
      colors: colours.map((c) => ({ _id: c._id, name: c.productdetails?.color, image: c.images?.[0] || null })),
      inStock: colours.some((c) => stockOf(c) > 0),
      rating: rep.rating || 0,
      numReviews: rep.numReviews || 0,
      soldCount: colours.reduce((n, c) => n + (c.soldCount || 0), 0),
      createdAt: Math.max(...colours.map((c) => new Date(c.createdAt).getTime())),
      featured: !!rep.isFeatured,
      readyDesignSlug: rep.readyDesign ? designSlug.get(String(rep.readyDesign)) || null : null,
    };
  });
  cards.sort(SORTS[sort]);
  // in-stock first, keeping the chosen order within each part
  cards.sort((a, b) => Number(b.inStock) - Number(a.inStock));

  const total = cards.length;
  const items = cards.slice((page - 1) * limit, page * limit).map((c) => ({ ...c, createdAt: new Date(c.createdAt) }));

  // filter options from everything in scope (so a filter never hides the others)
  const facetDocs = inScope;
  const countGroups = (pred) => new Set(facetDocs.filter(pred).map((d) => d.productGroupId)).size;
  const colourNames = new Map();
  for (const d of facetDocs) {
    const n = norm(d.productdetails?.color);
    if (n && !colourNames.has(n)) colourNames.set(n, titleCase(d.productdetails.color));
  }
  const prices = facetDocs.map((d) => d.price).filter((p) => p > 0);
  res.json({
    items,
    total,
    page,
    pages: Math.ceil(total / limit),
    facets: {
      categories: fixed
        ? []
        : categories
            .map((c) => ({ name: c.name, slug: c.slug, count: countGroups((d) => categoryOf(d)?.slug === c.slug) }))
            .filter((c) => c.count > 0),
      styles: [...new Set(facetDocs.map((d) => d.productdetails?.garmentStyle).filter(Boolean))].sort(),
      sizes: sortSizes([...new Set(facetDocs.flatMap((d) => (d.productdetails?.stockBySize || []).filter((s) => s.stock > 0).map((s) => s.size)))]),
      colors: [...colourNames.values()].sort(),
      priceMin: prices.length ? Math.min(...prices) : 0,
      priceMax: prices.length ? Math.max(...prices) : 0,
    },
  });
});
