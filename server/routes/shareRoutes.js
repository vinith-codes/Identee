// routes/shareRoutes.js — "Share my tee" links for WhatsApp (17 Nov 2026; see controllers/shareController.js)
import express from "express";
import rateLimit from "../middleware/rateLimit.js";
import { createShare, showShare } from "../controllers/shareController.js";

const router = express.Router();
router.post("/", rateLimit({ windowMs: 60_000, max: 6, message: "Slow down a little — try again in a minute." }), createShare);
router.get("/:id", showShare);
export default router;
