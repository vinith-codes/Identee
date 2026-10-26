// routes/collectionRoutes.js — Admin → Collection maker (see controllers/collectionController.js)
import express from "express";
import { protect, admin } from "../middleware/authMiddleware.js";
import rateLimit from "../middleware/rateLimit.js";
import { uploadCollectionImages } from "../multer/multer.js";
import {
  createBrief,
  finishDesign,
  getCollection,
  getSetup,
  listCollections,
  publishDesign,
  redoDesign,
  rejectDesign,
  restoreDesign,
  startCollection,
  unpublishDesign,
  updateDesignText,
  changeOneDesign,
  resumeCollection,
} from "../controllers/collectionController.js";

const router = express.Router();
// the AI steps cost money: a slip of the finger shouldn't start many
const aiLimit = rateLimit({ windowMs: 60_000, max: 10, message: "Too many AI requests — wait a minute." });

router.get("/setup", protect, admin, getSetup);
router.get("/", protect, admin, listCollections);
router.post("/brief", protect, admin, aiLimit, uploadCollectionImages, createBrief);
router.get("/:id", protect, admin, getCollection);
router.post("/:id/start", protect, admin, aiLimit, startCollection);
router.put("/designs/:id/finish", protect, admin, finishDesign);
router.put("/designs/:id", protect, admin, updateDesignText);
router.post("/designs/:id/publish", protect, admin, publishDesign);
router.post("/designs/:id/unpublish", protect, admin, unpublishDesign);
router.post("/designs/:id/reject", protect, admin, rejectDesign);
router.post("/designs/:id/restore", protect, admin, restoreDesign);
router.post("/designs/:id/redo", protect, admin, aiLimit, redoDesign);
router.post("/designs/:id/change", protect, admin, aiLimit, changeOneDesign);
router.post("/:id/resume", protect, admin, aiLimit, resumeCollection);

export default router;
