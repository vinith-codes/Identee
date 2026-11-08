// routes/aiRoutes.js — the Design Room's AI design maker (see controllers/aiController.js)
import express from "express";
import { makeAssist, makeConcepts, makeDevelop, makeMatch, makeWorn } from "../controllers/assistantController.js";
import { dropPrintPicture, getAiAdmin, getAiRequests, getAiStatus, makeAiDesign, makeBackgroundRemoval, makeChat, makeEdit, makeImprovedIdea, makePhotoPlan, makePrintPicture, makeSlogans, saveAiAdmin } from "../controllers/aiController.js";
import { protect, adminOnly, adminOrSeller } from "../middleware/authMiddleware.js";
import optionalAuth from "../middleware/optionalAuthMiddleware.js";
import rateLimit from "../middleware/rateLimit.js";

const router = express.Router();

router.get("/status", optionalAuth, getAiStatus);
// each request costs money: on top of the per-customer daily limit, no more than 6 a minute from one address
router.post("/design", protect, rateLimit({ windowMs: 60_000, max: 6, message: "Slow down a little — try again in a minute." }), makeAiDesign);
// slogans cost almost nothing, so no login — but no more than 20 a minute from one address
router.post("/slogans", rateLimit({ windowMs: 60_000, max: 20, message: "Slow down a little — try again in a minute." }), makeSlogans);
// "Improve my idea" (text only, almost free): 20 a minute
router.post("/improve", rateLimit({ windowMs: 60_000, max: 20, message: "Slow down a little — try again in a minute." }), makeImprovedIdea);
// editing the tee by chat: same idea, 30 a minute
router.post("/edit", rateLimit({ windowMs: 60_000, max: 30, message: "Slow down a little — try again in a minute." }), makeEdit);
// the smart Assistant (23 Oct 2026): every typed message, no login needed and no daily limit for now (the owner's
// decision) — only a guard against automated flooding: 30 a minute from one address
router.post("/chat", optionalAuth, rateLimit({ windowMs: 60_000, max: 30, message: "Slow down a little — try again in a minute." }), makeChat);
// Assistant v2 (7 Nov 2026, docs/ASSISTANT_V2_PLAN.md): the brain answers with steps; concept sheets; developing a concept into artwork
router.post("/assist", protect, rateLimit({ windowMs: 60_000, max: 30, message: "Slow down a little — try again in a minute." }), makeAssist);
router.post("/concepts", protect, rateLimit({ windowMs: 60_000, max: 6, message: "Slow down a little — try again in a minute." }), makeConcepts);
router.post("/develop", protect, rateLimit({ windowMs: 60_000, max: 6, message: "Slow down a little — try again in a minute." }), makeDevelop);
// round 5 (8 Nov 2026): a matching piece from the tee's own picture; a photo of the finished tee worn
router.post("/match", protect, rateLimit({ windowMs: 60_000, max: 6, message: "Slow down a little — try again in a minute." }), makeMatch);
router.post("/worn", protect, rateLimit({ windowMs: 60_000, max: 4, message: "Slow down a little — try again in a minute." }), makeWorn);
// a photo sent in the chat: what the customer wants made from it (the text AI reads the photo; almost free)
router.post("/photo-plan", protect, rateLimit({ windowMs: 60_000, max: 20, message: "Slow down a little — try again in a minute." }), makePhotoPlan);
// "Remove the background" of a photo: done on this server (free — not an AI service, not a daily request)
router.post("/remove-background", protect, rateLimit({ windowMs: 60_000, max: 10, message: "Slow down a little — try again in a minute." }), makeBackgroundRemoval);
router.get("/admin", protect, adminOrSeller, getAiAdmin);
router.get("/admin/requests", protect, adminOrSeller, getAiRequests);
router.put("/admin", protect, adminOnly, saveAiAdmin);
// admin, from an order's print-files window: a large copy of an ordered picture for printing (costs about 3× a normal picture)
router.post("/admin/print-picture", protect, adminOnly, makePrintPicture);
router.delete("/admin/print-picture", protect, adminOnly, dropPrintPicture);

export default router;
