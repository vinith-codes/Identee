// services/shopTeeSizes.js — add sizes to every Shop your IDENTEE tee at once (19 Nov 2026: the client's measurement
// sheet added XS, 4XL and 5XL to the Oversized Tee and both round necks; the owner: "add XS, 4XL and 5XL to the shop
// tees"). A shop tee's sizes are kept twice: on its ReadyDesign (what the shop page offers) and on each of its shop
// products (productdetails.sizes + stockBySize: the shop's size filter). Re-saving 208 tees in the Studio would make all
// their pictures again, so this only adds the sizes — pictures, prices and the design are not touched. A size is added
// only where the tee's own product (garment) sells it; the order follows the garment's list.
import ReadyDesign from "../models/readyDesignModel.js";
import Product from "../models/productModel.js";
import GarmentType from "../models/garmentTypeModel.js";

export const KNOWN_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];

/** have ∪ add, keeping only what the garment sells (`sold`), in the garment's order. An empty `sold` keeps `have`. */
export function withSizes(have = [], add = [], sold = []) {
  if (!sold.length) return [...have];
  const want = new Set([...have, ...add]);
  const extra = have.filter((s) => !sold.includes(s)); // a size the tee has but the garment no longer lists stays
  return [...sold.filter((s) => want.has(s)), ...extra];
}

/** Stock for each size: what it had, a new size gets the tee's highest stock (shop tees are printed on demand: 9999). */
export function withStock(stockBySize = [], sizes = []) {
  const fresh = Math.max(0, ...stockBySize.map((s) => Number(s.stock) || 0));
  return sizes.map((size) => ({ size, stock: stockBySize.find((s) => s.size === size)?.stock ?? fresh }));
}

const same = (a = [], b = []) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Adds `sizes` to every published shop tee (and its shop products). dryRun: count only, nothing is written.
 * -> { dryRun, sizes, designs: { seen, changed }, products: { seen, changed }, byGarment: { key: { designs, products, added } } }
 */
export async function addShopTeeSizes({ sizes, dryRun = true }) {
  const add = KNOWN_SIZES.filter((s) => sizes.includes(s));
  const garments = new Map((await GarmentType.find().select("key sizes").lean()).map((g) => [g.key, g.sizes || []]));
  const designs = await ReadyDesign.find({ status: "published" }).select("_id garmentType sizes").lean();
  const out = { dryRun, sizes: add, designs: { seen: designs.length, changed: 0 }, products: { seen: 0, changed: 0 }, byGarment: {} };
  const tally = (key) => (out.byGarment[key] ||= { designs: 0, products: 0, added: KNOWN_SIZES.filter((s) => add.includes(s) && (garments.get(key) || []).includes(s)) });
  const soldOf = new Map();
  for (const d of designs) {
    const sold = garments.get(d.garmentType) || [];
    soldOf.set(String(d._id), { key: d.garmentType, sold });
    // a tee saved with no sizes already offers all its garment's sizes
    if (!d.sizes?.length) continue;
    const next = withSizes(d.sizes, add, sold);
    if (same(next, d.sizes)) continue;
    out.designs.changed++;
    tally(d.garmentType).designs++;
    if (!dryRun) await ReadyDesign.updateOne({ _id: d._id }, { $set: { sizes: next } });
  }
  const products = await Product.find({ readyDesign: { $in: designs.map((d) => d._id) } })
    .select("_id readyDesign productdetails.sizes productdetails.stockBySize")
    .lean();
  out.products.seen = products.length;
  for (const p of products) {
    const of = soldOf.get(String(p.readyDesign));
    const have = p.productdetails?.sizes || [];
    const next = withSizes(have, add, of?.sold || []);
    if (same(next, have)) continue;
    out.products.changed++;
    tally(of.key).products++;
    if (!dryRun) {
      await Product.updateOne(
        { _id: p._id },
        { $set: { "productdetails.sizes": next, "productdetails.stockBySize": withStock(p.productdetails?.stockBySize || [], next) } },
      );
    }
  }
  return out;
}
