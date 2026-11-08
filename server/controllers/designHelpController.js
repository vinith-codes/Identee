// controllers/designHelpController.js — "Ask the IDENTEE team to finish it" (Assistant round 6, 8 Nov 2026).
// POST /api/ai/help        (login)          the customer's request: their note, the tee, the chat, a mock-up picture
// GET  /api/ai/help        (admin / seller) the list, newest first
// PUT  /api/ai/help/:id    (admin / seller) { status: "done" | "new" }
import asyncHandler from "express-async-handler";
import DesignHelp from "../models/designHelpModel.js";
import User from "../models/userModel.js";
import { uploadFile } from "../utils/imageStorage.js";
import { createNotification } from "./notificationController.js";

const text = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export const requestHelp = asyncHandler(async (req, res) => {
  const note = text(req.body?.note, 1000);
  if (note.length < 3) {
    res.status(400);
    throw new Error("Tell us in a line what you'd like the tee to be.");
  }
  // one open request per customer at a time (a second one updates the first)
  const open = await DesignHelp.findOne({ user: req.user._id, status: "new" });
  const who = await User.findById(req.user._id).select("name phone email").lean();
  const chat = (Array.isArray(req.body?.chat) ? req.body.chat : [])
    .slice(-30)
    .map((m) => ({ who: m?.who === "customer" ? "customer" : "assistant", text: text(m?.text, 1500) }))
    .filter((m) => m.text);
  // the front of the tee as the customer saw it (a data URL from the room), stored as a picture
  let mockupUrl = open?.mockupUrl || "";
  const m = String(req.body?.mockup || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (m && m[2].length < 4_000_000) {
    try {
      mockupUrl = (await uploadFile(Buffer.from(m[2], "base64"), m[1], "design-help")).url;
    } catch (err) {
      console.error("[design-help] mock-up not stored:", err?.message || err);
    }
  }
  const fields = {
    user: req.user._id,
    name: who?.name || "",
    phone: who?.phone || "",
    email: who?.email || "",
    garment: text(req.body?.garment, 60),
    colour: text(req.body?.colour, 60),
    size: text(req.body?.size, 10),
    note,
    chat,
    design: req.body?.design && typeof req.body.design === "object" ? JSON.parse(JSON.stringify(req.body.design).slice(0, 200_000)) : null,
    mockupUrl,
    status: "new",
  };
  const doc = open ? await DesignHelp.findByIdAndUpdate(open._id, fields, { new: true }) : await DesignHelp.create(fields);
  await createNotification({ type: "NEW_ENQUIRY", title: "A customer asked the team to finish their tee", message: `${fields.name || "A customer"}: ${note.slice(0, 120)}`, link: "/admin/design-help" });
  res.status(201).json({ ok: true, id: doc._id, updated: Boolean(open) });
});

export const listHelp = asyncHandler(async (req, res) => {
  const rows = await DesignHelp.find().sort({ status: 1, createdAt: -1 }).limit(100).lean();
  res.json({ requests: rows, open: rows.filter((r) => r.status === "new").length });
});

export const setHelpStatus = asyncHandler(async (req, res) => {
  const status = req.body?.status === "done" ? "done" : "new";
  const doc = await DesignHelp.findByIdAndUpdate(req.params.id, { status, doneAt: status === "done" ? new Date() : null }, { new: true }).lean();
  if (!doc) {
    res.status(404);
    throw new Error("That request is gone.");
  }
  res.json({ ok: true, request: doc });
});
