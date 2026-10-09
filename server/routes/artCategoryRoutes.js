import express from "express";
import {
  getArtCategories,
  createArtCategory,
  deleteArtCategory,
} from "../controllers/artCategoryController.js";
import { uploadArtThumbnail } from "../multer/multer.js";
import { protect, adminOrSeller } from "../middleware/authMiddleware.js";

const router = express.Router();


router.get("/", getArtCategories);
// adding/removing needs an admin or seller login (uploads go to Cloudinary)
router.post("/", protect, adminOrSeller, uploadArtThumbnail, createArtCategory);
router.delete("/:id", protect, adminOrSeller, deleteArtCategory);

export default router;