// controllers/shopController.js
//
// The customer's ready-made shop: one card per product (all colours of a
// productGroupId together), with filters and the options to filter by.
// Only live products (not hidden) whose style belongs to an active
// storefront category are shown — the same rule as the category pages.
// Shop your IDENTEE (the client, 30 Oct 2026): no Men / Women split — a Studio tee listed in both is ONE card
// (Unisex), grouped into collections ("SCENE · …"), filtered by Unisex / Men / Women; only dark colours and White.
import asyncHandler from "express-async-handler";
import Product, { LIVE } from "../models/productModel.js";
import Category from "../models/categoryModel.js";
import ReadyDesign from "../models/readyDesignModel.js";
import GarmentType from "../models/garmentTypeModel.js";
import { applySubscriptionPrice } from "../utils/applySubscriptionPrice.js";
import { collectionOf, collectionTitle, shownInShop } from "../utils/shopRules.js";
import { studioPrice, wearerFor } from "../services/studioService.js";

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
// @route  GET /api/shop/products?category=&collection=&style=&gender=&size=&color=&maxPrice=&q=&sort=&page=&limit=&exclude=&featured=1
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
  const ownCategory = (d) => categoryByName.get(norm(d.productdetails?.category)) || categoryOfStyle.get(norm(d.productdetails?.garmentStyle)) || null;
  const categoryOf = (d) => {
    const c = ownCategory(d);
    return c && inPage.has(c.slug) ? c : null;
  };
  const wearerOf = (d) => wearerFor(`${ownCategory(d)?.name || ""} ${ownCategory(d)?.slug || ""}`);

  // every live colour document (light colours, and Royal Blue Round Neck, are not on sale in this shop)
  const all = (
    await Product.find(LIVE)
      .select("brandname price oldPrice discount images productGroupId productdetails rating numReviews soldCount createdAt isFeatured readyDesign")
      .lean()
  ).filter((d) => shownInShop(d.productdetails?.color, d.productdetails?.garmentStyle));
  // a Studio tee (printed to order) opens its own page: its slug goes on the card. Its price is worked out here from
  // its garment (Round Neck ₹499, Oversized ₹699), so a tee saved before a price change shows the right price.
  const designIds = [...new Set(all.filter((d) => d.readyDesign).map((d) => String(d.readyDesign)))];
  const designs = designIds.length ? await ReadyDesign.find({ _id: { $in: designIds } }).select("slug priceInr garmentType product.oldPrice").lean() : [];
  const garments = designs.length ? await GarmentType.find({ key: { $in: [...new Set(designs.map((r) => r.garmentType))] } }).select("key basePrice comparePrice").lean() : [];
  const designOf = new Map();
  for (const r of designs) designOf.set(String(r._id), { slug: r.slug, ...(await studioPrice(r, garments.find((g) => g.key === r.garmentType))) });
  for (const d of all) {
    const r = d.readyDesign && designOf.get(String(d.readyDesign));
    if (!r?.price) continue;
    d.price = r.price;
    d.oldPrice = r.oldPrice || r.price;
  }

  // who a product is for: a Studio tee listed for both men and women is Unisex; else its category's wearer
  const wearers = new Map(); // design id → Set of "man" / "woman"
  for (const d of all) {
    if (!d.readyDesign) continue;
    if (!wearers.has(String(d.readyDesign))) wearers.set(String(d.readyDesign), new Set());
    if (wearerOf(d)) wearers.get(String(d.readyDesign)).add(wearerOf(d));
  }
  const genderOf = (d) => {
    const set = d.readyDesign ? wearers.get(String(d.readyDesign)) : new Set([wearerOf(d)].filter(Boolean));
    if (set?.size === 1) return set.has("man") ? "Men" : "Women";
    if (set?.size === 2) return "Unisex";
    const g = norm(d.productdetails?.gender);
    return g.startsWith("wom") || g.startsWith("girl") ? "Women" : g.startsWith("men") || g.startsWith("boy") ? "Men" : "Unisex";
  };
  // one card per tee and style: a Studio tee in two categories is one card (its colours from both)
  const cardKey = (d) => (d.readyDesign ? `${d.readyDesign}|${norm(d.productdetails?.garmentStyle)}` : d.productGroupId);

  // ?collection=scene: one collection's tees; "none": the tees with no collection name
  const collection = norm(req.query.collection);
  const inScope = all.filter((d) => categoryOf(d) && (!collection || (collectionOf(d.brandname) || "none") === collection));

  // filters
  const style = norm(req.query.style);
  const gender = norm(req.query.gender);
  const size = String(req.query.size || "").trim();
  const color = norm(req.query.color);
  const maxPrice = Number(req.query.maxPrice) || 0;
  const q = norm(req.query.q);
  const exclude = String(req.query.exclude || "");
  const excluded = new Set(exclude ? inScope.filter((d) => d.productGroupId === exclude).map(cardKey) : []);
  const featuredOnly = req.query.featured === "1";
  const matches = inScope.filter((d) => {
    const pd = d.productdetails || {};
    if (style && norm(pd.garmentStyle) !== style) return false;
    if (gender && norm(genderOf(d)) !== gender) return false;
    if (color && norm(pd.color) !== color) return false;
    if (size && !(pd.stockBySize || []).some((s) => s.size === size && s.stock > 0)) return false;
    if (maxPrice && d.price > maxPrice) return false;
    if (excluded.has(cardKey(d))) return false;
    if (featuredOnly && !d.isFeatured) return false;
    if (q) {
      const hay = [d.brandname, pd.garmentStyle, pd.color, pd.fabric, categoryOf(d)?.name, genderOf(d)].map(norm).join(" ");
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  });

  // group colours into products; a colour that is in two categories counts once (the women's category's pictures
  // first when the Women filter is on, the men's with Men, else the first category's)
  const wanted = gender === "women" ? "woman" : gender === "men" ? "man" : null;
  const rank = (d) => (wanted && wearerOf(d) === wanted ? 0 : 1000) + Math.max(0, active.indexOf(ownCategory(d)));
  const byRank = (a, b) => rank(a) - rank(b) || a.createdAt - b.createdAt;
  const groupBy = (docs) => {
    const map = new Map();
    for (const d of docs) {
      if (!map.has(cardKey(d))) map.set(cardKey(d), []);
      map.get(cardKey(d)).push(d);
    }
    return map;
  };
  const byCard = groupBy(inScope);
  const matchedCards = groupBy(matches);
  const oneEach = (docs) => {
    const seen = new Set();
    return [...docs].sort(byRank).filter((d) => {
      const n = norm(d.productdetails?.color);
      if (seen.has(n)) return false;
      seen.add(n);
      return true;
    });
  };

  const cards = [...matchedCards.entries()].map(([key, hits]) => {
    const docs = byCard.get(key);
    const colours = oneEach(docs).sort((a, b) => a.createdAt - b.createdAt);
    // the card shows the first matching colour (the one you filtered for)
    const rep = [...hits].sort(byRank)[0];
    const priced = applySubscriptionPrice(rep, req.user);
    const cat = categoryOf(rep);
    return {
      _id: rep._id,
      groupId: rep.productGroupId,
      key,
      brandname: rep.brandname,
      price: rep.price,
      oldPrice: rep.oldPrice,
      discount: rep.oldPrice > rep.price ? Math.round(((rep.oldPrice - rep.price) / rep.oldPrice) * 100) : 0,
      subscriptionPrice: priced.subscriptionPrice,
      images: (rep.images || []).slice(0, 2),
      garmentStyle: rep.productdetails?.garmentStyle,
      category: cat ? { name: cat.name, slug: cat.slug } : null,
      gender: genderOf(rep),
      collection: collectionOf(rep.brandname) || "none",
      color: rep.productdetails?.color,
      colors: colours.map((c) => ({ _id: c._id, name: c.productdetails?.color, image: c.images?.[0] || null })),
      inStock: docs.some((c) => stockOf(c) > 0),
      rating: rep.rating || 0,
      numReviews: rep.numReviews || 0,
      soldCount: docs.reduce((n, c) => n + (c.soldCount || 0), 0),
      createdAt: Math.max(...docs.map((c) => new Date(c.createdAt).getTime())),
      featured: !!rep.isFeatured,
      customisable: !!rep.readyDesign, // a Studio tee: the customer can change it in the design room
      readyDesignSlug: rep.readyDesign ? designOf.get(String(rep.readyDesign))?.slug || null : null,
    };
  });
  cards.sort(SORTS[sort]);
  // in-stock first, keeping the chosen order within each part
  cards.sort((a, b) => Number(b.inStock) - Number(a.inStock));

  const total = cards.length;
  const items = cards.slice((page - 1) * limit, page * limit).map((c) => ({ ...c, createdAt: new Date(c.createdAt) }));

  // filter options from everything in scope (so a filter never hides the others)
  const facetDocs = inScope;
  const countCards = (docs) => new Set(docs.map(cardKey)).size;
  // the colours and Unisex / Men / Women within the chosen style (Round Neck has no Bottle Green to offer)
  const styleDocs = style ? facetDocs.filter((d) => norm(d.productdetails?.garmentStyle) === style) : facetDocs;
  const colourNames = new Map();
  for (const d of styleDocs) {
    const n = norm(d.productdetails?.color);
    if (n && !colourNames.has(n)) colourNames.set(n, titleCase(d.productdetails.color));
  }
  const prices = facetDocs.map((d) => d.price).filter((p) => p > 0);
  // the collections ("none" = tees with no collection name): how many tees, its styles, and a few tees' pictures for its card
  const collections = new Map();
  for (const d of all.filter((x) => categoryOf(x)).sort((a, b) => b.createdAt - a.createdAt)) {
    const key = collectionOf(d.brandname) || "none";
    if (!collections.has(key)) collections.set(key, { key, name: collectionTitle(d.brandname), docs: [], styles: new Set(), photos: [], tees: new Set() });
    const c = collections.get(key);
    c.docs.push(d);
    if (d.productdetails?.garmentStyle) c.styles.add(d.productdetails.garmentStyle);
    if (!c.tees.has(norm(d.brandname)) && d.images?.[0] && c.photos.length < 4) {
      c.tees.add(norm(d.brandname));
      c.photos.push(d.images[0]);
    }
  }
  res.json({
    items,
    total,
    page,
    pages: Math.ceil(total / limit),
    facets: {
      categories: fixed
        ? []
        : categories
            .map((c) => ({ name: c.name, slug: c.slug, count: countCards(facetDocs.filter((d) => categoryOf(d)?.slug === c.slug)) }))
            .filter((c) => c.count > 0),
      collections: [...collections.values()].map((c) => ({ key: c.key, name: c.name, count: countCards(c.docs), styles: [...c.styles].sort(), photos: c.photos })),
      styles: [...new Set(facetDocs.map((d) => d.productdetails?.garmentStyle).filter(Boolean))].sort(),
      genders: ["Unisex", "Men", "Women"]
        .map((name) => ({ name, count: countCards(styleDocs.filter((d) => genderOf(d) === name)) }))
        .filter((g) => g.count > 0),
      sizes: sortSizes([...new Set(facetDocs.flatMap((d) => (d.productdetails?.stockBySize || []).filter((s) => s.stock > 0).map((s) => s.size)))]),
      colors: [...colourNames.values()].sort(),
      priceMin: prices.length ? Math.min(...prices) : 0,
      priceMax: prices.length ? Math.max(...prices) : 0,
    },
  });
});
