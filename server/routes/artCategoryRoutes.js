import express from "express";
import {
  getArtCategories,
  createArtCategory,
  deleteArtCategory,
} from "../controllers/artCategoryController.js";
import { uploadArtThumbnail } from "../multer/multer.js";

const router = express.Router();


router.get("/", getArtCategories);
router.post("/", uploadArtThumbnail, createArtCategory);
router.delete("/:id", deleteArtCategory);

export default router;