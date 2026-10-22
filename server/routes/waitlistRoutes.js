import express from "express";
import { joinWaitlist, getWaitlist, notifyWaitlist, removeFromWaitlist } from "../controllers/waitlistController.js";
import { protect, admin } from "../middleware/authMiddleware.js";
import rateLimit from "../middleware/rateLimit.js";

const router = express.Router();

// anyone may join without logging in, so one visitor may try 5 times per 15 minutes (like the contact form)
const joinLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "You've tried a few times already. Please wait a few minutes.",
});

router.post("/", joinLimit, joinWaitlist);
router.get("/", protect, admin, getWaitlist);
router.post("/notify", protect, admin, notifyWaitlist);
router.delete("/:id", protect, admin, removeFromWaitlist);

export default router;
