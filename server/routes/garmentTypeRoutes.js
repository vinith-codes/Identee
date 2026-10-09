import express from "express";
import {
  getGarmentTypes,
  getGarmentTypeByKey,
  createGarmentType,
  updateGarmentType,
  addColor,
  removeColor,
  deleteGarmentType,
  adminGetGarmentTypes,
  adminGetGarmentType,
} from "../controllers/garmentTypeController.js";
import { protect, admin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", getGarmentTypes);
// admin routes go before "/:key" so "admin" is not read as a key
router.get("/admin/all", protect, admin, adminGetGarmentTypes);
router.get("/admin/:key", protect, admin, adminGetGarmentType);
router.get("/:key", getGarmentTypeByKey);
router.post("/", protect, admin, createGarmentType);
router.put("/:id", protect, admin, updateGarmentType);
router.post("/:id/colors", protect, admin, addColor);
router.delete("/:id/colors/:slug", protect, admin, removeColor);
router.delete("/:id", protect, admin, deleteGarmentType);

export default router;