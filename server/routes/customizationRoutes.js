// routes/customizationRoutes.js

import express from "express";
import {
  uploadDesignImage,
  createCustomization,
  getCustomizationById,
} from "../controllers/customizationController.js";
import { uploadDesignFile } from "../multer/multer.js";

const router = express.Router();

// uploadDesignFile is already [upload.single("design"), rewritePaths]
router.post("/upload-design", uploadDesignFile, uploadDesignImage);
router.post("/", createCustomization);
router.get("/:id", getCustomizationById);

export default router;