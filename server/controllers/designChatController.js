import asyncHandler from "express-async-handler";
import DesignChat, { DeletedChat } from "../models/designChatModel.js";
import { saveNewest, stampOf } from "../utils/chatStamps.js";

// The design room's saved chats (23 Oct 2026) — see models/designChatModel.js. Every route is the logged-in
// customer's own chats only.
export const CHATS_KEPT = 20; // per customer: saving the 21st drops the oldest (the frontend's chatStore.js says the same)
export const BODY_MAX = 1_000_000; // characters of one chat (the page keeps a long chat under 900,000: old version pictures go first)
const ID = /^[a-z0-9]{6,40}$/;

const summary = (c) => ({ id: c.chatId, type: c.garmentType, title: c.title, colour: c.colour, designId: c.designId, updatedAt: c.updatedAt, at: Number(c.at) || 0 });

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
  const chatId = chatIdOf(req, res);
  const chat = await DesignChat.findOne({ user: req.user._id, chatId }).lean();
  if (!chat) {
    // 410 = the customer deleted it (on another device); 404 = it went by itself (13 Nov 2026, models/designChatModel.js)
    const deleted = await DeletedChat.exists({ user: req.user._id, chatId });
    res.status(deleted ? 410 : 404);
    throw new Error(deleted ? "This chat was deleted." : "That chat isn't here any more.");
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
// @route  PUT /api/chats/:id   { type, title, colour, designId, at, body }
// @access Private
// 409 { stale: true, ...the saved one } = a newer copy of this chat is saved already (13 Nov 2026, utils/chatStamps.js)
export const saveChat = asyncHandler(async (req, res) => {
  const chatId = chatIdOf(req, res);
  const b = req.body || {};
  const body = JSON.stringify(b.body && typeof b.body === "object" ? b.body : {});
  if (body.length > BODY_MAX) {
    res.status(413);
    throw new Error("This chat is too long to save.");
  }
  const designId = typeof b.designId === "string" && /^[a-f0-9]{24}$/.test(b.designId) ? b.designId : null;
  const at = stampOf(b.at);
  const mine = { user: req.user._id, chatId };
  const fields = { garmentType: String(b.type || "").slice(0, 60), title: String(b.title || "").trim().slice(0, 80), colour: String(b.colour || "").slice(0, 60), designId, body, at };
  const done = await saveNewest(
    {
      // saved only over an older copy (or one from before the stamps)
      write: () => DesignChat.findOneAndUpdate({ ...mine, $or: [{ at: { $exists: false } }, { at: { $lt: at } }] }, { $set: fields }, { upsert: true, new: true, setDefaultsOnInsert: true }),
      current: () => DesignChat.findOne(mine).select("-body").lean(),
    },
    at,
  );
  if (done.stale) return res.status(409).json({ stale: true, message: "A newer copy of this chat is saved.", ...(done.stale.chatId ? summary(done.stale) : {}) });
  // a chat made again by this save (another device still had it open after it was deleted): no longer "deleted"
  if (done.saved.createdAt && +new Date(done.saved.createdAt) === +new Date(done.saved.updatedAt)) await DeletedChat.deleteOne(mine);
  // keep the newest CHATS_KEPT
  const old = await DesignChat.find({ user: req.user._id }).sort({ updatedAt: -1 }).skip(CHATS_KEPT).select("_id").lean();
  if (old.length) await DesignChat.deleteMany({ _id: { $in: old.map((c) => c._id) } });
  res.json(summary(done.saved));
});

// @desc   Delete one of the customer's chats
// @route  DELETE /api/chats/:id
// @access Private
export const deleteChat = asyncHandler(async (req, res) => {
  const mine = { user: req.user._id, chatId: chatIdOf(req, res) };
  await DesignChat.deleteOne(mine);
  // (marked, so a device that still has it open is told it was deleted — 13 Nov 2026)
  await DeletedChat.updateOne(mine, { $set: { at: new Date() } }, { upsert: true });
  res.json({ ok: true });
});
