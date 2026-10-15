// controllers/whatsappController.js — Admin → Settings → WhatsApp: is it set up, on / off, the order templates
// (what to create in Meta's WhatsApp Manager), the latest messages sent, and a test message.
import asyncHandler from "express-async-handler";
import Setting from "../models/settingModel.js";
import WhatsappLog from "../models/whatsappLogModel.js";
import { maskNumber, sendTemplate, toWhatsappNumber, whatsappConfigured, whatsappLanguage } from "../services/whatsappService.js";
import { ORDER_TEMPLATES, whatsappEnabled } from "../utils/orderWhatsapp.js";

// GET /api/whatsapp/admin
export const getWhatsappAdmin = asyncHandler(async (req, res) => {
  const recent = await WhatsappLog.find().sort({ createdAt: -1 }).limit(25).lean();
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const [sent, failed] = await Promise.all([
    WhatsappLog.countDocuments({ ok: true, createdAt: { $gte: since } }),
    WhatsappLog.countDocuments({ ok: false, createdAt: { $gte: since } }),
  ]);
  res.json({
    configured: whatsappConfigured(),
    enabled: await whatsappEnabled(),
    language: whatsappLanguage(),
    templates: Object.entries(ORDER_TEMPLATES).map(([event, t]) => ({ event, ...t })),
    last30: { sent, failed },
    recent: recent.map((r) => ({ at: r.createdAt, orderNumber: r.orderNumber, event: r.event, template: r.template, to: r.to, ok: r.ok, error: r.error })),
  });
});

// PUT /api/whatsapp/admin  { enabled }
export const saveWhatsappAdmin = asyncHandler(async (req, res) => {
  const enabled = req.body?.enabled !== false;
  await Setting.findOneAndUpdate(
    { key: "whatsapp.enabled" },
    { $set: { value: enabled, type: "boolean", category: "whatsapp", description: "Send order updates to customers on WhatsApp", updatedBy: req.user._id } },
    { upsert: true },
  );
  res.json({ enabled });
});

// POST /api/whatsapp/admin/test  { to }  — Meta's own "hello_world" template (every WhatsApp account has it)
export const sendWhatsappTest = asyncHandler(async (req, res) => {
  if (!whatsappConfigured()) {
    res.status(400);
    throw new Error("WhatsApp is not set up on the server yet (WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID).");
  }
  const to = toWhatsappNumber(req.body?.to);
  if (!to) {
    res.status(400);
    throw new Error("Enter a 10-digit Indian mobile number.");
  }
  try {
    const { id } = await sendTemplate({ to, name: "hello_world", language: "en_US" });
    await WhatsappLog.create({ event: "TEST", template: "hello_world", to: maskNumber(to), ok: true, messageId: id });
    res.json({ ok: true, message: `Sent to ${maskNumber(to)}. It should arrive in a few seconds.` });
  } catch (err) {
    await WhatsappLog.create({ event: "TEST", template: "hello_world", to: maskNumber(to), ok: false, error: String(err.message).slice(0, 300) });
    res.status(502);
    throw new Error(`WhatsApp didn’t send it: ${err.message}`);
  }
});
