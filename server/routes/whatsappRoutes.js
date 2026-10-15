import express from "express";
import { protect, adminOnly } from "../middleware/authMiddleware.js";
import { getWhatsappAdmin, saveWhatsappAdmin, sendWhatsappTest } from "../controllers/whatsappController.js";

const router = express.Router();

// Admin → Settings → WhatsApp (order updates to customers)
router.get("/admin", protect, adminOnly, getWhatsappAdmin);
router.put("/admin", protect, adminOnly, saveWhatsappAdmin);
router.post("/admin/test", protect, adminOnly, sendWhatsappTest);

export default router;
