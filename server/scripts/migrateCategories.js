// Creates the launch storefront categories and reports how existing
// products / garment types map onto them. Nothing is deleted.
//
//   node scripts/migrateCategories.js            # dry run: report only
//   node scripts/migrateCategories.js --apply    # create missing categories
//
// Products/garment types join a category through its `styles` list
// (matched against productdetails.garmentStyle / GarmentType.category,
// case-insensitive), so anything not listed simply doesn't appear on the
// storefront (e.g. old test values like "Blacers", "JUMP SUITS").
import dotenv from "dotenv";
import mongoose from "mongoose";
import Category from "../models/categoryModel.js";

dotenv.config();
const apply = process.argv.includes("--apply");

const LAUNCH = [
  {
    name: "T-Shirts",
    slug: "t-shirts",
    description: "Round neck, V-neck, oversized and full sleeve tees.",
    styles: ["Round Neck", "V-Neck", "Oversized", "Full Sleeve"],
    isCustomizable: true,
  },
  {
    name: "Polos",
    slug: "polos",
    description: "Collared polos for teams, offices and everyday wear.",
    styles: ["Polo", "Full Sleeve Polo"],
    isCustomizable: true,
  },
  {
    name: "Hoodies",
    slug: "hoodies",
    description: "Pullover and zip hoodies.",
    styles: ["Hoodie", "Zip Hoodie"],
    isCustomizable: true,
  },
  {
    name: "Sweatshirts",
    slug: "sweatshirts",
    description: "Crew neck sweatshirts.",
    styles: ["Sweatshirt"],
    isCustomizable: true,
  },
  {
    name: "Kids' Wear",
    slug: "kids-wear",
    description: "T-shirts and hoodies for kids.",
    styles: ["Kids T-Shirt", "Kids Hoodie"],
    isCustomizable: false,
  },
];

const norm = (s) => String(s || "").trim().toLowerCase();

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection;
  console.log(`Connected. Mode: ${apply ? "APPLY" : "DRY RUN"}\n`);

  const styleToCategory = new Map();
  LAUNCH.forEach((c) => c.styles.forEach((s) => styleToCategory.set(norm(s), c.name)));

  // Products by garmentStyle (counting product groups, i.e. colours once)
  const productStyles = await db.collection("products").aggregate([
    { $group: { _id: "$productdetails.garmentStyle", groups: { $addToSet: "$productGroupId" } } },
    { $project: { groups: { $size: "$groups" } } },
    { $sort: { _id: 1 } },
  ]).toArray();

  console.log("PRODUCTS (by garment style):");
  for (const p of productStyles) {
    const target = styleToCategory.get(norm(p._id));
    console.log(`  ${String(p._id).padEnd(16)} ${String(p.groups).padStart(3)} product(s) -> ${target || "NOT SHOWN (no category)"}`);
  }

  const garments = await db.collection("garmenttypes").find({}).project({ label: 1, category: 1, key: 1 }).toArray();
  console.log("\nCUSTOMIZER GARMENT TYPES:");
  for (const g of garments) {
    const target = styleToCategory.get(norm(g.category));
    console.log(`  ${String(g.label).padEnd(22)} (category "${g.category}") -> ${target ? `${target} — "Design your own"` : "NOT SHOWN"}`);
  }

  const banners = await db.collection("categorybanners").find({}).project({ category: 1 }).toArray();
  console.log(`\nOld category banners (${banners.length}): no longer used on Home; left untouched.`);
  console.log(`  ${banners.map((b) => b.category).join(", ")}`);

  console.log("\nCATEGORIES:");
  for (const [i, c] of LAUNCH.entries()) {
    const exists = await Category.findOne({ slug: c.slug });
    console.log(`  ${i + 1}. ${c.name.padEnd(12)} styles: ${c.styles.join(", ")}${exists ? "  (already exists — skipped)" : ""}`);
    if (apply && !exists) await Category.create({ ...c, displayOrder: i, isActive: true });
  }

  if (!apply) console.log("\nDry run only. Re-run with --apply to create the categories.");
  else console.log("\nDone. Add images in Admin → Categories.");
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
