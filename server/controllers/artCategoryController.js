import asyncHandler from "express-async-handler";
import { deleteStoredFile } from "../utils/imageStorage.js";
import path from "path";
import fs from "fs";
import ArtCategory from "../models/artCategoryModel.js";
import ArtDesign from "../models/artDesignModel.js";

// GET /api/art-categories
export const getArtCategories = asyncHandler(async (req, res) => {
  const categories = await ArtCategory.find({ isActive: true }).sort({
    createdAt: 1,
  });
  res.json(categories);
});

// POST /api/art-categories  (multipart, field name "thumbnail")
export const createArtCategory = asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    res.status(400);
    throw new Error("Category name is required");
  }
  if (!req.file) {
    res.status(400);
    throw new Error("Thumbnail image is required");
  }

  const exists = await ArtCategory.findOne({ name: name.trim() });
  if (exists) {
    res.status(400);
    throw new Error("A category with this name already exists");
  }

  const category = await ArtCategory.create({
    name: name.trim(),
    thumbnail: req.file.path,
  });
  res.status(201).json(category);
});

// DELETE /api/art-categories/:id
export const deleteArtCategory = asyncHandler(async (req, res) => {
  const category = await ArtCategory.findById(req.params.id);
  if (!category) {
    res.status(404);
    throw new Error("Category not found");
  }
  // its designs would be left in no group
  const inside = await ArtDesign.countDocuments({ category: category._id });
  if (inside) {
    res.status(409);
    throw new Error(`"${category.name}" still has ${inside} design${inside === 1 ? "" : "s"}. Delete or hide them first.`);
  }
  if (category.thumbnail) await deleteStoredFile(category.thumbnail);
  await category.deleteOne();
  res.json({ message: "Category deleted" });
});
