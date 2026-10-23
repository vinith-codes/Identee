// routes/designChatRoutes.js — the design room's saved chats (see controllers/designChatController.js)
import express from "express";
import { deleteChat, getChat, listChats, saveChat } from "../controllers/designChatController.js";
import { protect } from "../middleware/authMiddleware.js";
import rateLimit from "../middleware/rateLimit.js";

const router = express.Router();

// the page saves a few seconds after each change, so a busy chat saves several times a minute
const limit = rateLimit({ windowMs: 60_000, max: 60, message: "Slow down a little — try again in a minute." });

router.get("/", protect, listChats);
router.get("/:id", protect, getChat);
router.put("/:id", protect, limit, saveChat);
router.delete("/:id", protect, limit, deleteChat);

export default router;
