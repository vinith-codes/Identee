// routes/aiRoutes.js — the Design Room's AI design maker (see controllers/aiController.js)
import express from "express";
import { dropPrintPicture, getAiAdmin, getAiStatus, makeAiDesign, makeEdit, makePrintPicture, makeSlogans, saveAiAdmin } from "../controllers/aiController.js";
import { protect, adminOnly, adminOrSeller } from "../middleware/authMiddleware.js";
import optionalAuth from "../middleware/optionalAuthMiddleware.js";
import rateLimit from "../middleware/rateLimit.js";

const router = express.Router();

router.get("/status", optionalAuth, getAiStatus);
// each request costs money: on top of the per-customer daily limit, no more than 6 a minute from one address
router.post("/design", protect, rateLimit({ windowMs: 60_000, max: 6, message: "Slow down a little — try again in a minute." }), makeAiDesign);
// slogans cost almost nothing, so no login — but no more than 20 a minute from one address
router.post("/slogans", rateLimit({ windowMs: 60_000, max: 20, message: "Slow down a little — try again in a minute." }), makeSlogans);
// editing the tee by chat: same idea, 30 a minute
router.post("/edit", rateLimit({ windowMs: 60_000, max: 30, message: "Slow down a little — try again in a minute." }), makeEdit);
router.get("/admin", protect, adminOrSeller, getAiAdmin);
router.put("/admin", protect, adminOnly, saveAiAdmin);
// admin, from an order's print-files window: a large copy of an ordered picture for printing (costs about 3× a normal picture)
router.post("/admin/print-picture", protect, adminOnly, makePrintPicture);
router.delete("/admin/print-picture", protect, adminOnly, dropPrintPicture);

export default router;
