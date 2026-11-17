// routes/designChatRoutes.js — the design room's saved chats (see controllers/designChatController.js)
import express from "express";
import { deleteChat, getChat, listChats, saveChat } from "../controllers/designChatController.js";
import { protect } from "../middleware/authMiddleware.js";
import rateLimit from "../middleware/rateLimit.js";

const router = express.Router();

// the page saves a few seconds after each change, so a busy chat saves several times a minute. Counted per customer
// (13 Nov 2026), not per address: customers on one mobile network share an address, and moving a visitor's chats
// to the account at login is several saves at once. (protect runs first, so req.user is there.)
const limit = rateLimit({ windowMs: 60_000, max: 120, key: (req) => req.user?._id, message: "Slow down a little — try again in a minute." });

router.get("/", protect, listChats);
router.get("/:id", protect, getChat);
router.put("/:id", protect, limit, saveChat);
router.delete("/:id", protect, limit, deleteChat);

export default router;
