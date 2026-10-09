import express from "express";
import {
  getArtDesigns,
  getAllArtDesignsAdmin,
  createArtDesign,
  deleteArtDesign,
  bulkUploadArtDesigns,
} from "../controllers/artDesignController.js";
import zipUpload from "../multer/zipUpload.js";
import { uploadArtImage } from "../multer/multer.js";
import { protect, adminOrSeller } from "../middleware/authMiddleware.js";

const router = express.Router();


router.get("/", getArtDesigns);
router.get("/all", protect, adminOrSeller, getAllArtDesignsAdmin); // includes hidden ones

// ⚠️ Static path — must come before any future "/:id" route
router.post(
  "/bulk-upload",
  protect,
  adminOrSeller,
  zipUpload.single("file"),
  bulkUploadArtDesigns,
);

// adding/removing needs an admin or seller login (uploads go to Cloudinary)
router.post("/", protect, adminOrSeller, uploadArtImage, createArtDesign);
router.delete("/:id", protect, adminOrSeller, deleteArtDesign);

export default router;
