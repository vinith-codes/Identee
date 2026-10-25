// routes/readyDesignRoutes.js — Shop your IDENTEE's ready designs (see controllers/readyDesignController.js)
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import rateLimit from "../middleware/rateLimit.js";
import { copyReadyDesign, getReadyDesign, listReadyDesigns } from "../controllers/readyDesignController.js";

const router = express.Router();
const copyLimit = rateLimit({ windowMs: 60_000, max: 20, message: "Slow down a little — try again in a minute." });

router.get("/", listReadyDesigns);
router.get("/:slug", getReadyDesign);
router.post("/:slug/copy", protect, copyLimit, copyReadyDesign);

export default router;
