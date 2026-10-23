import asyncHandler from "express-async-handler";
import DesignChat from "../models/designChatModel.js";

// The design room's saved chats (23 Oct 2026) — see models/designChatModel.js. Every route is the logged-in
// customer's own chats only.
export const CHATS_KEPT = 20; // per customer: saving the 21st drops the oldest
export const BODY_MAX = 1_000_000; // characters of one chat (pictures are links, so a long chat is ~50-150 KB)
const ID = /^[a-z0-9]{6,40}$/;

const summary = (c) => ({ id: c.chatId, type: c.garmentType, title: c.title, colour: c.colour, designId: c.designId, updatedAt: c.updatedAt });

const chatIdOf = (req, res) => {
  const id = String(req.params.id || "");
  if (!ID.test(id)) {
    res.status(400);
    throw new Error("Unknown chat.");
  }
  return id;
};

// @desc   The customer's chats, newest first (without the messages)
// @route  GET /api/chats
// @access Private
export const listChats = asyncHandler(async (req, res) => {
  const rows = await DesignChat.find({ user: req.user._id }).sort({ updatedAt: -1 }).limit(CHATS_KEPT).select("-body").lean();
  res.json(rows.map(summary));
});

// @desc   One chat with everything in it
// @route  GET /api/chats/:id
// @access Private
export const getChat = asyncHandler(async (req, res) => {
  const chat = await DesignChat.findOne({ user: req.user._id, chatId: chatIdOf(req, res) }).lean();
  if (!chat) {
    res.status(404);
    throw new Error("That chat isn't here any more.");
  }
  let body = {};
  try {
    body = JSON.parse(chat.body || "{}");
  } catch {
    body = {};
  }
  res.json({ ...summary(chat), body });
});

// @desc   Save a chat (made or updated — the page saves as the customer goes)
// @route  PUT /api/chats/:id   { type, title, colour, designId, body }
// @access Private
export const saveChat = asyncHandler(async (req, res) => {
  const chatId = chatIdOf(req, res);
  const b = req.body || {};
  const body = JSON.stringify(b.body && typeof b.body === "object" ? b.body : {});
  if (body.length > BODY_MAX) {
    res.status(413);
    throw new Error("This chat is too long to save.");
  }
  const designId = typeof b.designId === "string" && /^[a-f0-9]{24}$/.test(b.designId) ? b.designId : null;
  const saved = await DesignChat.findOneAndUpdate(
    { user: req.user._id, chatId },
    { $set: { garmentType: String(b.type || "").slice(0, 60), title: String(b.title || "").trim().slice(0, 80), colour: String(b.colour || "").slice(0, 60), designId, body } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  // keep the newest CHATS_KEPT
  const old = await DesignChat.find({ user: req.user._id }).sort({ updatedAt: -1 }).skip(CHATS_KEPT).select("_id").lean();
  if (old.length) await DesignChat.deleteMany({ _id: { $in: old.map((c) => c._id) } });
  res.json(summary(saved));
});

// @desc   Delete one of the customer's chats
// @route  DELETE /api/chats/:id
// @access Private
export const deleteChat = asyncHandler(async (req, res) => {
  await DesignChat.deleteOne({ user: req.user._id, chatId: chatIdOf(req, res) });
  res.json({ ok: true });
});
