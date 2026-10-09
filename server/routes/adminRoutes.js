import express from "express";
import { getAdminHome, getAdminBadges } from "../controllers/adminHomeController.js";
import { protect, admin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/home", protect, admin, getAdminHome);
router.get("/badges", protect, admin, getAdminBadges);

export default router;
