import express from "express";
import {
  getCategories,
  getCategoryBySlug,
  getCategoryProducts,
  getCategoryGarments,
  adminGetCategories,
  createCategory,
  updateCategory,
  reorderCategories,
  deleteCategory,
} from "../controllers/categoryController.js";
import { protect, admin } from "../middleware/authMiddleware.js";
import optionalAuth from "../middleware/optionalAuthMiddleware.js";
import { uploadCategoryImages } from "../middleware/imageUpload.js";

const router = express.Router();

// Admin (declared before "/:slug" so "admin"/"reorder" aren't read as slugs)
router.get("/admin/all", protect, admin, adminGetCategories);
router.put("/reorder", protect, admin, reorderCategories);
router.post("/", protect, admin, uploadCategoryImages, createCategory);
router.put("/:id", protect, admin, uploadCategoryImages, updateCategory);
router.delete("/:id", protect, admin, deleteCategory);

// Public
router.get("/", getCategories);
router.get("/:slug", getCategoryBySlug);
router.get("/:slug/products", optionalAuth, getCategoryProducts);
router.get("/:slug/garments", getCategoryGarments);

export default router;
