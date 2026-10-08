import express from "express";
import {
  getAllGarmentImages,
  getGarmentImage,
  uploadGarmentViewPhoto,
  updatePrintArea,
  deleteGarmentImage,
} from "../controllers/garmentColorImageController.js";
import { uploadGarmentPhoto } from "../multer/multer.js";
// import { protect, admin } from "../middleware/authMiddleware.js"; // uncomment if you want to guard admin-only routes

const router = express.Router();


router.get("/", getAllGarmentImages);
router.get("/:garmentType/:colorSlug", getGarmentImage);
router.post(
  "/upload-photo",
  /* protect, admin, */ uploadGarmentPhoto,
  uploadGarmentViewPhoto,
);
router.put("/print-area", /* protect, admin, */ updatePrintArea);
router.delete(
  "/:garmentType/:colorSlug",
  /* protect, admin, */ deleteGarmentImage,
);

export default router;
