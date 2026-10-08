import mongoose from "mongoose";

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, default: "" },
    publicId: { type: String, default: "" }, // Cloudinary id ("" for local files)
  },
  { _id: false },
);

// Storefront category (T-Shirts, Polos, …), managed in Admin → Categories.
// Products and garment types are NOT linked by id: a product belongs to the
// category whose `styles` contain its productdetails.garmentStyle, and a
// garment type to the one whose styles contain its `category` string. Adding
// a style here therefore instantly brings matching products into the category.
const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: "", trim: true, maxlength: 200 },
    styles: { type: [String], default: [] }, // e.g. ["Round Neck", "V-Neck"]
    image: { type: imageSchema, default: () => ({}) }, // 4:5 home tile
    bannerImage: { type: imageSchema, default: () => ({}) }, // 16:5 category header
    displayOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isCustomizable: { type: Boolean, default: false }, // shows "Design your own"
    comingSoon: { type: Boolean, default: false },
  },
  { timestamps: true },
);

categorySchema.index({ displayOrder: 1 });

export const slugify = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const Category = mongoose.model("Category", categorySchema);
export default Category;
