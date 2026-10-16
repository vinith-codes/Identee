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
  addDesignToCart,
  setDesignCartQty,
  getOrderPrintPack,
  getPrintDay,
  markPrintDayDownloaded,
} from "../controllers/customizationController.js";
import { uploadDesignFile } from "../multer/multer.js";
import { protect, admin } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public: print positions + sizes for the customizer
router.get("/print-positions", getPrintPositions);

// Login required: uploading artwork and saving designs
router.post("/upload-design", protect, uploadDesignFile, uploadDesignImage);
router.post("/", protect, createCustomization);
// "My designs" (before "/:id" so "mine" isn't read as an id)
router.get("/mine", protect, listMyCustomizations);
// admin: print files for the custom designs in an order
router.get("/admin/order/:orderId", protect, admin, getOrderPrintPack);
// admin: a day's orders laid out on the print team's 58 × 100 cm sheets
router.get("/admin/print-day/:day", protect, admin, getPrintDay);
router.post("/admin/print-day/:day/downloaded", protect, admin, markPrintDayDownloaded);
// designs in the cart
router.put("/cart/:cartItemId", protect, setDesignCartQty);
router.get("/:id", protect, getCustomizationById);
router.put("/:id", protect, updateCustomization);
router.post("/:id/duplicate", protect, duplicateCustomization);
router.delete("/:id", protect, deleteCustomization);
router.post("/:id/cart", protect, addDesignToCart);

export default router;
