// routes/customizationRoutes.js

import express from "express";
import {
  getPrintPositions,
  uploadDesignImage,
  createCustomization,
  getCustomizationById,
  updateCustomization,
  listMyCustomizations,
  duplicateCustomization,
  deleteCustomization,
} from "../controllers/customizationController.js";
import { uploadDesignFile } from "../multer/multer.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public: print positions + sizes for the customizer
router.get("/print-positions", getPrintPositions);

// Login required: uploading artwork and saving designs
router.post("/upload-design", protect, uploadDesignFile, uploadDesignImage);
router.post("/", protect, createCustomization);
// "My designs" (before "/:id" so "mine" isn't read as an id)
router.get("/mine", protect, listMyCustomizations);
router.get("/:id", protect, getCustomizationById);
router.put("/:id", protect, updateCustomization);
router.post("/:id/duplicate", protect, duplicateCustomization);
router.delete("/:id", protect, deleteCustomization);

export default router;
