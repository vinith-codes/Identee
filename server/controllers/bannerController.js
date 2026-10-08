import { async } from "regenerator-runtime";
import Product from "../models/productModel.js";
import OfferBanner from "../models/offerBannerModel.js";
import VideoBanner from "../models/videoBannerModel.js";

import asyncHandler from "express-async-handler";
import { deleteStoredFile } from "../utils/imageStorage.js";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";

const VALID_VIDEO_SECTIONS = [
  "hero",
  "styleOutlookMain",
  "styleOutlookSide1",
  "styleOutlookSide2",
  "designYourOwn",
];

// @desc Create add banners
// @route POST /api/banners
// @access Private / Admin

const addBanner = asyncHandler(async (req, res) => {
  const { title, subtitle, productId, gender } = req.body;

  // ✅ 1. Basic validation
  if (!req.file || !title || !subtitle || !productId || !gender) {
    return res.status(400).json({
      message: "All fields are required.",
    });
  }

  // ✅ 2. Trim productId (FIX for ObjectId cast error)
  const trimmedProductId = productId.trim();

  // ✅ 3. Validate MongoDB ObjectId
  if (!mongoose.Types.ObjectId.isValid(trimmedProductId)) {
    return res.status(400).json({
      message: "Invalid Product ID format.",
    });
  }

  // ✅ 4. Find product safely
  const product = await Product.findById(trimmedProductId);

  if (!product) {
    return res.status(404).json({
      message: "Product not found.",
    });
  }

  // ✅ 5. Correct banner limit check (MAX = 3)
  if (product.banners.length >= 3) {
    return res.status(400).json({
      message: "Maximum of 3 banners allowed per product.",
    });
  }

  // ✅ 6. Create banner object
  const banner = {
    image: req.file.path,
    title: title.trim(),
    subtitle: subtitle.trim(),
    productId: trimmedProductId,
    gender: gender.trim(),
  };

  // ✅ 7. Push banner & save
  product.banners.push(banner);
  await product.save();

  // ✅ 8. Success response
  res.status(201).json({
    message: "Banner added successfully.",
    banner,
  });
});
// @desc deleteBanner
// @route delete /api/banners/:id
// @access Private/admin
const deleteBanner = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // 1️⃣ Find product containing this banner
  const product = await Product.findOne({ "banners._id": id });

  if (!product) {
    return res.status(404).json({ message: "Banner not found." });
  }

  // 2️⃣ Find banner object
  const bannerToDelete = product.banners.find((b) => b._id.toString() === id);

  // 3️⃣ Delete image file from server
  if (bannerToDelete?.image) await deleteStoredFile(bannerToDelete.image);

  // 4️⃣ Remove banner from DB
  product.banners = product.banners.filter(
    (banner) => banner._id.toString() !== id,
  );

  await product.save();

  res.status(200).json({ message: "Banner deleted successfully." });
});

// @desc getBanners
// @route get /api/banners
// @access Private
const getBanners = asyncHandler(async (req, res) => {
  try {
    const { gender } = req.query;
    const productsWithBanners = await Product.find({
      "banners.0": { $exists: true },
    }).select("banners");

    const banners = productsWithBanners.flatMap((product) =>
      product.banners
        .filter((banner) => banner.image && banner.title) // ← add this
        .map((banner) => ({
          _id: banner._id,
          image: banner.image,
          title: banner.title,
          subtitle: banner.subtitle,
          gender: banner.gender,
          productId: banner.productId,
        })),
    );

    res.status(200).json(banners);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch banners.", error: error.message });
  }
});

/* ------------------------------------------------------------------ */
/*  VIDEO BANNERS — now standalone, section-based, no product link.    */
/*  Sections: "hero" | "styleOutlook" | "designYourOwn"                */
/*  Exactly one video allowed per section (re-uploading replaces it).  */
/* ------------------------------------------------------------------ */

// @desc Add or replace the video banner for a given section
// @route POST /api/addvideobanner
// @access Private / Admin
const addvideobanner = asyncHandler(async (req, res) => {
  const { section } = req.body;

  if (!req.file) {
    return res.status(400).json({ message: "No video uploaded." });
  }

  if (!section || !VALID_VIDEO_SECTIONS.includes(section)) {
    return res.status(400).json({
      message: `Invalid or missing section. Must be one of: ${VALID_VIDEO_SECTIONS.join(", ")}`,
    });
  }

  const newVideoUrl = req.file.path;

  // A video for this section already exists → replace it (delete old file)
  const existing = await VideoBanner.findOne({ section });

  if (existing) {
    await deleteStoredFile(existing.videoUrl);

    existing.videoUrl = newVideoUrl;
    await existing.save();

    return res.status(200).json({
      message: "Video banner updated successfully",
      videoBanner: existing,
    });
  }

  // No video yet for this section → create new
  const videoBanner = await VideoBanner.create({
    section,
    videoUrl: newVideoUrl,
  });

  res.status(201).json({
    message: "Video banner added successfully",
    videoBanner,
  });
});

// @desc Get all video banners (one per section, however many exist)
// @route GET /api/getvideobanner
// @access Public
const getvideobanner = asyncHandler(async (req, res) => {
  const videoBanners = await VideoBanner.find({});
  res.json(videoBanners);
});

// @desc Delete a video banner by its _id
// @route DELETE /api/deletevideobanner/:videoId
// @access Private/admin
const deletevideobanner = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  const video = await VideoBanner.findById(videoId);

  if (!video) {
    return res.status(404).json({ message: "Video not found" });
  }

  await deleteStoredFile(video.videoUrl);

  await video.deleteOne();

  res.json({ message: "Video banner deleted successfully" });
});

export const addOfferBanner = asyncHandler(async (req, res) => {
  const { offerText } = req.body;

  // Check if any active offer already exists
  const existingActive = await OfferBanner.findOne({ isActive: true });

  const banner = await OfferBanner.create({
    offerText,
    isActive: existingActive ? false : true, // ⭐ KEY LOGIC
  });

  res.status(201).json(banner);
});

export const getActiveOfferBanner = asyncHandler(async (req, res) => {
  const banner = await OfferBanner.findOne({ isActive: true });
  res.json(banner);
});

export const getAllOfferBanners = asyncHandler(async (req, res) => {
  const banners = await OfferBanner.find().sort({ createdAt: -1 });
  res.json(banners);
});

export const updateOfferBanner = asyncHandler(async (req, res) => {
  const banner = await OfferBanner.findById(req.params.id);
  if (!banner) {
    res.status(404);
    throw new Error("Offer banner not found");
  }

  banner.offerText = req.body.offerText || banner.offerText;
  banner.isActive = req.body.isActive ?? banner.isActive;

  const updated = await banner.save();
  res.json(updated);
});

export const deleteOfferBanner = asyncHandler(async (req, res) => {
  await OfferBanner.findByIdAndDelete(req.params.id);
  res.json({ message: "Offer banner deleted" });
});
export const activateOfferBanner = asyncHandler(async (req, res) => {
  console.log("Activate Offer ID:", req.params.id);
  const { id } = req.params;

  // Deactivate all offers
  await OfferBanner.updateMany({}, { isActive: false });

  // Activate selected offer
  const banner = await OfferBanner.findByIdAndUpdate(
    id,
    { isActive: true },
    { new: true },
  );

  if (!banner) {
    res.status(404);
    throw new Error("Offer banner not found");
  }

  res.json(banner);
});

export {
  addBanner,
  deleteBanner,
  getBanners,
  addvideobanner,
  getvideobanner,
  deletevideobanner,
};
