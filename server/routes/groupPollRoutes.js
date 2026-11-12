// routes/groupPollRoutes.js — the group link (see controllers/groupPollController.js)
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import rateLimit from "../middleware/rateLimit.js";
import { closeGroup, createGroup, getGroup, groupEntries, joinGroup, myGroups } from "../controllers/groupPollController.js";

const router = express.Router();
const slow = (max, windowMs = 60_000) => rateLimit({ windowMs, max, message: "Slow down a little — try again in a minute." });

router.post("/", protect, slow(6, 10 * 60_000), createGroup);
router.get("/mine", protect, myGroups);
router.get("/:token", slow(60), getGroup);
// a whole class may answer from one college Wi-Fi (one address), so this limit is roomy
router.post("/:token/join", slow(60, 10 * 60_000), joinGroup);
router.get("/:token/entries", protect, groupEntries);
router.put("/:token/close", protect, closeGroup);

export default router;
