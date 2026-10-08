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
router.get("/all", getAllArtDesignsAdmin);

// ⚠️ Static path — must come before any future "/:id" route
router.post(
  "/bulk-upload",
  protect,
  adminOrSeller,
  zipUpload.single("file"),
  bulkUploadArtDesigns,
);

router.post("/", uploadArtImage, createArtDesign);
router.delete("/:id", deleteArtDesign);

export default router;
