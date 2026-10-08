import asyncHandler from "express-async-handler";
import { deleteStoredFile } from "../utils/imageStorage.js";
import path from "path";
import fs from "fs";
import CategoryBanner from "../models/categoryBannerModel.js";
import Product from "../models/productModel.js";

// @desc Add or replace a category's banner image
// @route POST /api/categorybanner
// @access Private/Admin
export const upsertCategoryBanner = asyncHandler(async (req, res) => {
  const { category } = req.body;

  if (!req.file || !category || !category.trim()) {
    return res
      .status(400)
      .json({ message: "Category and image are required." });
  }
  const trimmedCategory = category.trim();
  const imagePath = req.file.path;
  const existing = await CategoryBanner.findOne({ category: trimmedCategory });

  if (existing?.image) await deleteStoredFile(existing.image);

  const banner = await CategoryBanner.findOneAndUpdate(
    { category: trimmedCategory },
    { image: imagePath },
    { new: true, upsert: true },
  );

  res.status(200).json(banner);
});

// @desc Get all category banners (admin list)
// @route GET /api/categorybanner
// @access Private/Admin
export const getCategoryBanners = asyncHandler(async (req, res) => {
  const banners = await CategoryBanner.find().sort({ createdAt: 1 });
  res.json(banners);
});

// @desc Delete a category's banner
// @route DELETE /api/categorybanner/:category
// @access Private/Admin
export const deleteCategoryBanner = asyncHandler(async (req, res) => {
  const category = decodeURIComponent(req.params.category);
  const banner = await CategoryBanner.findOne({ category });
  if (!banner) {
    res.status(404);
    throw new Error("Category banner not found");
  }
  if (banner.image) await deleteStoredFile(banner.image);
  await banner.deleteOne();
  res.json({ message: "Category banner deleted" });
});

// @desc Banner + featured products per category — for Home page
// @route GET /api/categorybanner/showcase
// @access Public
export const getCategoryShowcase = asyncHandler(async (req, res) => {
  const banners = await CategoryBanner.find().sort({ createdAt: 1 });

  const showcase = await Promise.all(
    banners.map(async (b) => {
      const products = await Product.find({
        "productdetails.garmentStyle": b.category,
      })
        .sort({ isFeatured: -1, createdAt: -1 })
        .limit(4)
        .select("brandname images price oldPrice SKU productdetails.color");

      return {
        category: b.category,
        image: b.image,
        productCount: products.length,
        products,
      };
    }),
  );

  res.json(showcase);
});
