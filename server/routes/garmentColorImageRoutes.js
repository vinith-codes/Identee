import express from "express";
import {
  getAllGarmentImages,
  getGarmentImage,
  uploadGarmentViewPhoto,
  updatePrintArea,
  updatePrintAreaAllColours,
  deleteGarmentImage,
} from "../controllers/garmentColorImageController.js";
import { uploadGarmentPhoto } from "../multer/multer.js";
import { protect, admin } from "../middleware/authMiddleware.js";

const router = express.Router();


router.get("/", getAllGarmentImages);
router.get("/:garmentType/:colorSlug", getGarmentImage);
router.post(
  "/upload-photo",
  protect, admin, uploadGarmentPhoto,
  uploadGarmentViewPhoto,
);
router.put("/print-area", protect, admin, updatePrintArea);
// one box for every colour of a garment (set-up wizard)
router.put("/print-area-all", protect, admin, updatePrintAreaAllColours);
router.delete(
  "/:garmentType/:colorSlug",
  protect, admin, deleteGarmentImage,
);

export default router;
