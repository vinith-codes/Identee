// routes/customizationRoutes.js

import express from "express";
import {
  getPrintPositions,
  uploadDesignImage,
  createCustomization,
  getCustomizationById,
} from "../controllers/customizationController.js";
import { uploadDesignFile } from "../multer/multer.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public: print positions + sizes for the customizer
router.get("/print-positions", getPrintPositions);

// Login required: uploading artwork and saving designs
router.post("/upload-design", protect, uploadDesignFile, uploadDesignImage);
router.post("/", protect, createCustomization);
router.get("/:id", protect, getCustomizationById);

export default router;
