// routes/studioRoutes.js — Admin → Shop your IDENTEE → Studio (see controllers/studioController.js)
// Publish / unpublish / reject a Studio tee: the Collection maker's routes (/api/collections/designs/:id/publish …).
import express from "express";
import { protect, admin } from "../middleware/authMiddleware.js";
import rateLimit from "../middleware/rateLimit.js";
import { readStudioRefs } from "../multer/multer.js";
import { changePicture, createStudioDesign, deleteStudioDesign, enlargeDesign, getStudioDesign, getStudioSetup, improvePrompt, listStudioDesigns, makeModelPhotos, makePicture, planTee, printCheck, publishStudioDesign, removeModelPhoto, updateStudioDesign } from "../controllers/studioController.js";

const router = express.Router();
const aiLimit = rateLimit({ windowMs: 60_000, max: 12, message: "Too many pictures at once — wait a minute." });

router.get("/setup", protect, admin, getStudioSetup);
router.post("/picture", protect, admin, aiLimit, readStudioRefs, makePicture);
router.post("/picture/change", protect, admin, aiLimit, changePicture);
router.post("/improve", protect, admin, aiLimit, improvePrompt);
router.post("/plan", protect, admin, aiLimit, planTee);
router.get("/designs", protect, admin, listStudioDesigns);
router.post("/designs", protect, admin, createStudioDesign);
router.get("/designs/:id", protect, admin, getStudioDesign);
router.put("/designs/:id", protect, admin, updateStudioDesign);
router.delete("/designs/:id", protect, admin, deleteStudioDesign);
router.get("/designs/:id/print-check", protect, admin, printCheck);
router.post("/designs/:id/publish", protect, admin, publishStudioDesign);
router.post("/designs/:id/model-photos", protect, admin, aiLimit, makeModelPhotos);
router.delete("/designs/:id/model-photos", protect, admin, removeModelPhoto);
router.post("/designs/:id/enlarge", protect, admin, aiLimit, enlargeDesign);

export default router;
