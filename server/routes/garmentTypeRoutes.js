import express from "express";
import {
  getGarmentTypes,
  getGarmentTypeByKey,
  createGarmentType,
  updateGarmentType,
  addColor,
  removeColor,
  deleteGarmentType,
} from "../controllers/garmentTypeController.js";
import { protect, admin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", getGarmentTypes);
router.get("/:key", getGarmentTypeByKey);
router.post("/", protect, admin, createGarmentType);
router.put("/:id", protect, admin, updateGarmentType);
router.post("/:id/colors", protect, admin, addColor);
router.delete("/:id/colors/:slug", protect, admin, removeColor);
router.delete("/:id", protect, admin, deleteGarmentType);

export default router;