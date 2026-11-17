// controllers/aiController.js
//
// The Design Room's "Make a design": a customer describes a picture, the
// image AI draws it, the pictures are stored in Cloudinary (identee/ai-designs)
// and their addresses go back to the assistant chat.
//
// Kept in check by three limits the admin can change (Admin → Settings → AI):
//   • requests per customer per day
//   • pictures per request
//   • a monthly spending cap for Google — past it, the feature pauses until next month
//   • a separate monthly spending cap for Grok — past it, Grok stops standing in for
//     pictures Google refuses (refused photos get the free art filters instead)
//
// Customers may ask for anything (the shop owner's decision, 12 Oct 2026): this
// code does not filter subjects. The image AI still applies its own rules and
// may refuse some requests. The Review step tells the customer that ordering
// means they have the right to print the design.
import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import Setting from "../models/settingModel.js";
import { AI_ADDON_DEFAULT, AI_ADDON_KEY, isAiDesignUrl } from "../utils/aiPricing.js";
import AiUsage from "../models/aiUsageModel.js";
import AiChatUsage from "../models/aiChatUsageModel.js";
import { MEMORY_MAX, chatConfigured, chatModel, chatReply } from "../services/aiChatService.js";
import { brainConfigured } from "../services/assistantBrain.js";
import { conceptSummary, unfinishedDesigns } from "../services/conceptSheets.js";
import Order from "../models/orderModel.js";
import Customization from "../models/customizationModel.js";
import GarmentType from "../models/garmentTypeModel.js";
import { uploadFile, deleteStoredFile } from "../utils/imageStorage.js";
import { clearKeyColour, cutOutPlainBackground, KEY_BACKGROUND, onPlainBackground } from "../services/cutoutService.js";
import { fitCopyToSheet } from "../services/alignCopy.js";
import { aiTextConfigured, improveIdea, planEdit, readPhotoRequest, writeSlogans } from "../services/aiTextService.js";
import { removePhotoBackground } from "../services/backgroundService.js";
import MyPicture from "../models/myPictureModel.js";
import { rememberPictures } from "./myPictureController.js";
import sharp from "sharp";
import { artFilters, FILTER_STYLE } from "../services/artFilterService.js";
import { GROK_BEST, xaiConfigured, xaiEditImage, xaiModel, xaiNewImage } from "../services/xaiImageService.js";
import { replicateConfigured, replicateModel, topazModel } from "../services/replicateService.js";
import { AI_AREAS_MAX, spotWhereOf } from "../data/printPositions.js";
import { AI_STYLES, PHOTO_STYLES, aiImageConfigured, aiImageModel, changeDesignPrompt, copyDesignPrompt, inspiredDesignPrompt, generateImage, nearestRatio, newDesignPrompt, photoArtPrompt, FIX_KINDS, fixPrompt, printPrompt, RATIO_VALUES } from "../services/aiImageService.js";

const CATEGORY = "ai";
const DEFAULTS = {
  "ai.enabled": { value: true, type: "boolean", description: "Customers can make designs with AI" },
  "ai.dailyPerUser": { value: 20, type: "number", description: "Pictures one customer may make per day (a concept sheet counts as one, each piece of a developed concept as one; automatic redraws are free)" },
  "ai.imagesPerRequest": { value: 1, type: "number", description: "Pictures shown for each new design request" },
  // (the key keeps its old name: before 18 Oct 2026 it was one cap for both services)
  "ai.monthlyCapInr": { value: 2000, type: "number", description: "Monthly spending cap for Google, in rupees" },
  "ai.grokMonthlyCapInr": { value: 500, type: "number", description: "Monthly spending cap for Grok, in rupees" },
  "ai.pricePerImageInr": { value: 2.9, type: "number", description: "What one picture costs, in rupees (for the spending figures)" },
  // Grok (xAI) redraws photos Google refuses; $5 of credit ≈ 71 pictures
  "ai.grokPricePerImageInr": { value: 6, type: "number", description: "What one Grok picture costs, in rupees (for the spending figures)" },
  // the enlarger for print files (Real-ESRGAN on Replicate, 6 Nov 2026): about ₹0.20–₹1 a picture
  "ai.replicatePricePerImageInr": { value: 1, type: "number", description: "What one enlarged print picture costs on Replicate, in rupees (for the spending figures)" },
  // (15 Nov 2026) the print enlarger: Topaz draws real detail and keeps faces; Real-ESRGAN smooths small pictures.
  // Topaz is billed in units of $0.05 (one unit up to 24 MP of result) ≈ ₹4.5; Real-ESRGAN stays Topaz's backup
  "ai.printEnlarger": { value: "topaz", type: "string", description: "Print files: the enlarger (topaz or real-esrgan)" },
  "ai.topazPricePerUnitInr": { value: 4.5, type: "number", description: "What one Topaz unit costs on Replicate, in rupees (for the spending figures)" },
  // (15 Nov 2026) customers' AI designs are drawn at 4K (about 3,600 × 4,800), about 3× a 1K picture
  "ai.price4kPerImageInr": { value: 8.7, type: "number", description: "What one 4K picture costs, in rupees (for the spending figures)" },
  // what the CUSTOMER pays extra per tee with a picture — AI-made, art library or upload (utils/aiPricing.js)
  [AI_ADDON_KEY]: { value: AI_ADDON_DEFAULT, type: "number", description: "Extra price per tee with a picture (₹)" },
  // the smart Assistant (23 Oct 2026): Google reads every typed message; off = the fixed replies, as before
  "ai.assistantV2": { value: true, type: "boolean", description: "The new Assistant (7 Nov 2026): concept sheets, picks by number, several moves per message. Off = the older chat with plan cards" },
  "ai.smartChat": { value: true, type: "boolean", description: "Smart Assistant: Google reads every typed message" },
  "ai.chatPricePerMessageInr": { value: 0.2, type: "number", description: "What one smart Assistant message costs, in rupees (for the spending figures)" },
  // delivery answers (11 Nov 2026): the Assistant works out "order today, get it by …" from these (utils/deliveryDates.js)
  "ai.makingDays": { value: 4, type: "number", description: "Delivery answer: working days to make an order" },
  "ai.teamMakingDays": { value: 7, type: "number", description: "Delivery answer: working days to make a team or bulk order" },
  "ai.shippingDays": { value: 7, type: "number", description: "Delivery answer: working days on the road after dispatch" },
  // print files (8 Nov 2026, the print team's needs): both apply when a picture is prepared for print
  "print.knockout": { value: false, type: "boolean", description: "Print files: leave out black on black tees and white on white tees (the shirt shows through)" },
  "print.dropSpecks": { value: true, type: "boolean", description: "Print files: leave out bits of ink under 0.1 mm² (about 0.3 × 0.3 mm), too small for DTF film" },
  // (16 Nov 2026) a picture under 4K is first copied at 4K by the AI (same picture, nothing changed), then Topaz
  // enlarges that copy — the cleanest print in the logo tests
  "print.aiCopy": { value: true, type: "boolean", description: "Print files: copy a picture under 4K with AI at 4K before Topaz enlarges it" },
};
// how much a customer may type for the AI (a long, detailed idea is fine; 2,000 characters ≈ 300 words — the
// cut-off only stops something pasted by mistake, like a whole page, from being sent to the AI)
const PROMPT_MAX = 2000;
const LIMITS = { "ai.makingDays": [1, 30], "ai.teamMakingDays": [1, 45], "ai.shippingDays": [1, 30], "ai.dailyPerUser": [1, 50], "ai.imagesPerRequest": [1, 4], "ai.monthlyCapInr": [0, 1000000], "ai.grokMonthlyCapInr": [0, 1000000], "ai.pricePerImageInr": [0, 100], "ai.grokPricePerImageInr": [0, 100], "ai.replicatePricePerImageInr": [0, 100], "ai.topazPricePerUnitInr": [0, 100], "ai.price4kPerImageInr": [0, 100], [AI_ADDON_KEY]: [0, 5000], "ai.chatPricePerMessageInr": [0, 10] };
const BOOLEAN_KEYS = ["ai.enabled", "ai.smartChat", "ai.assistantV2", "print.knockout", "print.dropSpecks", "print.aiCopy"];
// settings that are one of a few words (15 Nov 2026)
export const CHOICES = { "ai.printEnlarger": ["topaz", "real-esrgan"] };
// The size customers' AI designs are drawn at (15 Nov 2026, the owner's choice: "customer designs only"): a 1K picture
// enlarged for print came out soft; drawn at 4K and then enlarged by Topaz it is the sharpest. Concept sheets, the
// one-line banner lettering, the admin's Studio and the Collection maker keep their own sizes.
export const DESIGN_SIZE = "4K";
// what one Google picture of the customer's design costs (for the spending figures)
export const designPictureCost = (s) => (DESIGN_SIZE === "4K" ? s.price4kPerImageInr : s.pricePerImageInr);


const startOfDay = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const startOfMonth = () => {
  const d = startOfDay();
  d.setDate(1);
  return d;
};

export async function readSettings() {
  const rows = await Setting.find({ category: CATEGORY }).select("key value").lean();
  const saved = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const get = (key) => (saved[key] === undefined || saved[key] === null ? DEFAULTS[key].value : saved[key]);
  return {
    enabled: get("ai.enabled") !== false,
    dailyPerUser: Number(get("ai.dailyPerUser")),
    imagesPerRequest: Number(get("ai.imagesPerRequest")),
    monthlyCapInr: Number(get("ai.monthlyCapInr")),
    grokMonthlyCapInr: Number(get("ai.grokMonthlyCapInr")),
    pricePerImageInr: Number(get("ai.pricePerImageInr")),
    grokPricePerImageInr: Number(get("ai.grokPricePerImageInr")),
    replicatePricePerImageInr: Number(get("ai.replicatePricePerImageInr")),
    printEnlarger: get("ai.printEnlarger") === "real-esrgan" ? "real-esrgan" : "topaz",
    topazPricePerUnitInr: Number(get("ai.topazPricePerUnitInr")),
    price4kPerImageInr: Number(get("ai.price4kPerImageInr")),
    designAddOnInr: Number(get(AI_ADDON_KEY)),
    smartChat: get("ai.smartChat") !== false,
    assistantV2: get("ai.assistantV2") !== false,
    chatPricePerMessageInr: Number(get("ai.chatPricePerMessageInr")),
    makingDays: Number(get("ai.makingDays")),
    teamMakingDays: Number(get("ai.teamMakingDays")),
    shippingDays: Number(get("ai.shippingDays")),
    printKnockout: get("print.knockout") === true,
    printDropSpecks: get("print.dropSpecks") !== false,
    printAiCopy: get("print.aiCopy") !== false,
  };
}
// a Grok row's model starts with "grok"
const IS_GROK = { $regexMatch: { input: { $ifNull: ["$model", ""] }, regex: /^grok/ } };
// a memory note or the Collection maker's text steps are costed, but they are not messages
const IS_MESSAGE = { $cond: [{ $in: ["$kind", ["memory", "collection"]] }, 0, 1] };
// This month's use, in total and for Grok alone.
export async function monthSpend() {
  const rows = await AiUsage.aggregate([
    { $match: { createdAt: { $gte: startOfMonth() } } },
    { $group: { _id: IS_GROK, cost: { $sum: "$costInr" }, images: { $sum: "$images" }, requests: { $sum: 1 } } },
  ]);
  const part = (r) => ({ cost: r?.cost || 0, images: r?.images || 0, requests: r?.requests || 0 });
  const grok = part(rows.find((r) => r._id === true));
  const google = part(rows.find((r) => r._id === false));
  // the smart Assistant's messages (Google's text AI): their cost counts toward Google's cap, not as picture requests
  const [chatRow] = await AiChatUsage.aggregate([{ $match: { createdAt: { $gte: startOfMonth() } } }, { $group: { _id: null, cost: { $sum: "$costInr" }, messages: { $sum: IS_MESSAGE } } }]);
  const chat = { cost: chatRow?.cost || 0, messages: chatRow?.messages || 0 };
  google.cost += chat.cost;
  return { cost: grok.cost + google.cost, images: grok.images + google.images, requests: grok.requests + google.requests, grok, google, chat };
}
// Every month's use since the very first request, newest month first, each shaped like monthSpend's answer; allTime adds them up.
// Months follow the server's own clock, the same one the monthly caps use. These figures are never used for a cap.
async function usageHistory() {
  const month = { $dateToString: { format: "%Y-%m", date: "$createdAt", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } };
  const [pictures, chats] = await Promise.all([
    AiUsage.aggregate([{ $group: { _id: { month, grok: IS_GROK }, cost: { $sum: "$costInr" }, images: { $sum: "$images" }, requests: { $sum: 1 } } }]),
    AiChatUsage.aggregate([{ $group: { _id: month, cost: { $sum: "$costInr" }, messages: { $sum: IS_MESSAGE } } }]),
  ]);
  const blank = () => ({ cost: 0, images: 0, requests: 0, grok: { cost: 0, images: 0, requests: 0 }, google: { cost: 0, images: 0, requests: 0 }, chat: { cost: 0, messages: 0 } });
  const months = new Map();
  const monthRow = (key) => months.get(key) || months.set(key, { month: key, ...blank() }).get(key);
  for (const r of pictures) {
    const row = monthRow(r._id.month);
    const part = row[r._id.grok ? "grok" : "google"];
    part.cost += r.cost;
    part.images += r.images;
    part.requests += r.requests;
    row.cost += r.cost;
    row.images += r.images;
    row.requests += r.requests;
  }
  for (const r of chats) {
    const row = monthRow(r._id);
    row.chat = { cost: r.cost, messages: r.messages };
    row.google.cost += r.cost; // as in monthSpend: the Assistant is Google's text AI
    row.cost += r.cost;
  }
  const allTime = blank();
  for (const row of months.values()) {
    allTime.cost += row.cost;
    allTime.images += row.images;
    allTime.requests += row.requests;
    allTime.chat.cost += row.chat.cost;
    allTime.chat.messages += row.chat.messages;
    for (const service of ["grok", "google"]) {
      allTime[service].cost += row[service].cost;
      allTime[service].images += row[service].images;
      allTime[service].requests += row[service].requests;
    }
  }
  return { allTime, months: [...months.values()].sort((a, b) => b.month.localeCompare(a.month)) };
}
// Each service has its own cap (0 = no cap).
export const googleCapped = (settings, month) => settings.monthlyCapInr > 0 && month.google.cost >= settings.monthlyCapInr;
export const grokCapped = (settings, month) => settings.grokMonthlyCapInr > 0 && month.grok.cost >= settings.grokMonthlyCapInr;
// Why the feature is off (null = it is on). Google makes every picture, so its cap pauses the feature;
// Grok's cap only stops Grok standing in for refused pictures.
export async function whyOff(settings) {
  if (!aiImageConfigured()) return "setup";
  if (!settings.enabled) return "off";
  if (googleCapped(settings, await monthSpend())) return "cap";
  return null;
}
// (16 Nov 2026, the owner: "10 pictures a day", not 10 requests) the PICTURES a customer made today: each row counts
// its pictures; a developed concept's automatic redraws (spelling put right) are free, so its row says what is
// counted. Rows from before have no `counted`: their pictures (at least 1) count.
export const usedToday = async (userId) => {
  const [row] = await AiUsage.aggregate([
    { $match: { user: mongoose.isValidObjectId(userId) ? new mongoose.Types.ObjectId(String(userId)) : userId, createdAt: { $gte: startOfDay() } } },
    { $group: { _id: null, n: { $sum: { $ifNull: ["$counted", { $max: ["$images", 1] }] } } } },
  ]);
  return row?.n || 0;
};
// the words when today's pictures are used up (or too few are left for what was asked)
export const noPicturesLeft = (all, left, need = 1) =>
  left <= 0
    ? `You’ve made today’s ${all} pictures. They come back tomorrow.`
    : `You have ${left} picture${left === 1 ? "" : "s"} left today, and this needs ${need}. Ask for fewer, or come back tomorrow.`;

// GET /api/ai/status  (login optional)
export const getAiStatus = asyncHandler(async (req, res) => {
  const settings = await readSettings();
  const reason = await whyOff(settings);
  const left = req.user ? Math.max(0, settings.dailyPerUser - (await usedToday(req.user._id))) : null;
  // text: the assistant can write slogans to order (same key; switched off together with the design maker)
  // designAddOnInr: what an AI-made or uploaded picture adds to the tee's price (art library: free; the Design Room shows it)
  // smart: typed messages go to the smart Assistant (switch in Admin → Settings → AI; paused with Google's cap)
  const smart = settings.enabled && settings.smartChat && chatConfigured() && reason !== "cap";
  // v2: typed messages go to the Assistant v2 brain (steps, concept sheets); login needed (services/assistantBrain.js)
  const v2 = smart && settings.assistantV2 && brainConfigured();
  res.json({ available: !reason, reason, text: aiTextConfigured() && settings.enabled, smart, v2, styles: Object.keys(AI_STYLES), photoStyles: Object.keys(PHOTO_STYLES) /* (the free art filters were taken away, 20 Oct 2026) */, dailyPerUser: settings.dailyPerUser, left, designAddOnInr: settings.designAddOnInr });
});

// POST /api/ai/chat  (login optional) — the smart Assistant: one typed message, answered by Google's text AI
// { message, history: [{ who, text }], earlier?, memory?, design, facts, areas: [{ key, label, free }] }
//   -> { reply, ideas, do, chips, memory? }   (earlier / memory: a long chat's older messages and its note)
// Not a picture request: it is counted apart (AiChatUsage) and its cost is part of Google's monthly cap.
export const makeChat = asyncHandler(async (req, res) => {
  const settings = await readSettings();
  if (!settings.enabled || !settings.smartChat || !chatConfigured()) {
    res.status(503);
    throw new Error("The smart Assistant is off.");
  }
  if (googleCapped(settings, await monthSpend())) {
    res.status(503);
    throw new Error("The Assistant is taking a break until next month.");
  }
  const message = String(req.body?.message || "").trim();
  if (message.length < 1) {
    res.status(400);
    throw new Error("Type a message.");
  }
  const said = (list, n) =>
    (Array.isArray(list) ? list : [])
      .slice(-n)
      .map((h) => ({ who: h?.who === "customer" ? "customer" : "assistant", text: String(h?.text || "").slice(0, 500) }))
      .filter((h) => h.text);
  const history = said(req.body?.history, 14);
  // a long chat: the older messages not in its memory note yet, and the note (aiChatService.chatReply)
  const earlier = said(req.body?.earlier, 40);
  const memory = String(req.body?.memory || "").slice(0, MEMORY_MAX);
  const areas = (Array.isArray(req.body?.areas) ? req.body.areas : [])
    .slice(0, AI_AREAS_MAX) // (every place a garment can offer: none is silently left out)
    .map((a) => ({ key: String(a?.key || "").slice(0, 40), label: String(a?.label || "").slice(0, 60), free: a?.free !== false, ...spotWhereOf(a) }))
    .filter((a) => a.key);
  // what the page shows the customer (prices, shipping, the tee): only these fields, each kept short
  const FACT_KEYS = ["garment", "teeColour", "teeColours", "size", "sizes", "price", "wasPrice", "pictureAddOn", "shipping", "offer", "picturesLeft", "canDraw", "pieces"];
  const given = req.body?.facts && typeof req.body.facts === "object" ? req.body.facts : {};
  const facts = Object.fromEntries(
    FACT_KEYS.filter((k) => given[k] !== undefined && given[k] !== null).map((k) => [k, Array.isArray(given[k]) ? given[k].slice(0, 20).map((x) => String(x).slice(0, 40)) : typeof given[k] === "number" || typeof given[k] === "boolean" ? given[k] : String(given[k]).slice(0, 200)]),
  );
  let answer;
  try {
    answer = await chatReply({ message: message.slice(0, PROMPT_MAX), history, earlier, memory, design: req.body?.design || {}, facts: { ...facts, loggedIn: Boolean(req.user) }, areas, styles: Object.keys(AI_STYLES) });
  } catch (err) {
    console.error("💥 ERROR: smart Assistant failed:", err?.message || err);
    res.status(err.status === 503 ? 503 : 502);
    throw new Error("The Assistant couldn’t answer just now.");
  }
  await AiChatUsage.create({ user: req.user?._id || null, costInr: settings.chatPricePerMessageInr, model: chatModel() }).catch(() => {});
  // the memory note was rewritten too: a second, smaller text request (counted at the same price, to be safe)
  if (answer.memory) await AiChatUsage.create({ user: req.user?._id || null, costInr: settings.chatPricePerMessageInr, model: chatModel(), kind: "memory" }).catch(() => {});
  res.json(answer);
});

// Only pictures this feature made may be sent back to be changed.
const isAiDesign = isAiDesignUrl;
// A picture the customer uploaded in the Design Room (for photo to art).
export const isOurUpload = (url) => {
  const cloud = process.env.CLOUDINARY_NAME?.trim();
  const s = String(url || "");
  return (cloud && s.startsWith(`https://res.cloudinary.com/${cloud}/`) && s.includes("/identee/")) || /^\/?uploads\/[\w\-./]+$/.test(s);
};
export async function fetchOurImage(url, req) {
  const path = url.startsWith("uploads/") ? `/${url}` : url;
  const full = path.startsWith("/") ? `${req.protocol}://${req.get("host")}${path}` : path;
  const r = await fetch(full);
  if (!r.ok) throw Object.assign(new Error("That design could not be found. Make a new one."), { status: 404 });
  return { data: Buffer.from(await r.arrayBuffer()), mime: r.headers.get("content-type") || "image/png" };
}

// Art made by our own filters (services/artFilterService.js) — no AI service, no cost, not counted
// against the daily requests. Used when the customer picks "Art filters (free)", and by itself when
// the picture service refuses a photo (it refuses well-known faces, for one).
async function sendFilterArt(req, res, { refused = false, left = null } = {}) {
  if (!isOurUpload(req.body.photoUrl)) {
    res.status(400);
    throw new Error("Upload the photo here first.");
  }
  const photo = await fetchOurImage(req.body.photoUrl, req);
  const made = await artFilters(photo.data, { dark: Boolean(req.body.teeIsDark) });
  const stored = await Promise.all(made.map((m) => uploadFile(m.buffer, m.mime, "art-filters")));
  res.status(201).json({
    images: stored.map((s, i) => ({ url: s.url, width: made[i].width, height: made[i].height, label: made[i].name })),
    filtered: true,
    refused,
    left,
  });
}

// POST /api/ai/design  (login required)
// New design: { subject, style, teeColour, teeIsDark, ratio }
// Change one: { baseUrl, change, teeIsDark, ratio }
// Copy the print from a photo sent in the chat: { copyUrl, change?, teeColour, teeIsDark, ratio }   (Google only)
// A new design with a photo as the reference: { refUrl, subject, style, teeColour, teeIsDark, ratio }   (Google only)
// -> { images: [{ url, width, height }], left }   (each picture already cut out of its background)
// Since 15 Nov 2026 Google draws these at 4K (DESIGN_SIZE: about 3,600 × 4,800 for 3:4), so the print is sharp; the
// one-line banner lettering stays 1K and Grok's stand-in keeps its own size. The page shows a smaller copy (?w=).
export const makeAiDesign = asyncHandler(async (req, res) => {
  // the free filters work whether the AI is on or not
  if (req.body.photoUrl && !req.body.baseUrl && req.body.artStyle === FILTER_STYLE) return sendFilterArt(req, res);
  const settings = await readSettings();
  const reason = await whyOff(settings);
  if (reason) {
    res.status(503);
    throw new Error(reason === "cap" ? "The design maker is taking a break until next month. You can still use the art library or upload your own picture." : "The design maker is not available right now.");
  }
  const used = await usedToday(req.user._id);
  const left = settings.dailyPerUser - used;
  if (left <= 0) {
    res.status(429);
    throw new Error(noPicturesLeft(settings.dailyPerUser, left));
  }

  // a photo sent in the chat: its print copied, or used as a reference for a new design
  const copying = Boolean(req.body.copyUrl);
  const inspired = !copying && Boolean(req.body.refUrl);
  const changing = !copying && !inspired && Boolean(req.body.baseUrl);
  const fromPhoto = !copying && !inspired && !changing && Boolean(req.body.photoUrl);
  // fixing a picture that is on the tee: make it sharper, or recolour it for this tee
  const fixing = !copying && !inspired && !changing && !fromPhoto && Boolean(req.body.fixUrl) && FIX_KINDS.includes(req.body.fixKind);
  const text = copying
    ? `Copy a design from a photo${req.body.change ? `: ${String(req.body.change).replace(/\s+/g, " ").trim().slice(0, PROMPT_MAX)}` : ""}`
    : fixing
    ? (req.body.fixKind === "recolour" ? "Recolour a picture for the tee" : req.body.fixKind === "photo" ? "Photo Studio: enhance a photo" : "Make a picture sharper")
    : fromPhoto
    ? `Photo to art: ${PHOTO_STYLES[req.body.artStyle] ? req.body.artStyle : "Cartoon"}`
    : String((changing ? req.body.change : req.body.subject) || "").replace(/\s+/g, " ").trim().slice(0, PROMPT_MAX);
  if (text.length < 3) {
    res.status(400);
    throw new Error(changing ? "Tell me what to change." : "Describe what the design should show.");
  }
  let jobs;
  let banner = false;
  let photoJob = null; // photo to art, a change to a design, or a fix: what Grok needs if Google refuses the picture
  let drawJob = null; // a new drawing: what Grok needs if Google refuses the words (a named person)
  const teeName = String(req.body.teeColour || "white").replace(/[^\w \-]/g, "").slice(0, 30) || "white";
  if (copying || inspired) {
    const src = copying ? req.body.copyUrl : req.body.refUrl;
    if (!isOurUpload(src)) {
      res.status(400);
      throw new Error("Send the photo here first.");
    }
    const photo = await fetchOurImage(src, req);
    const small = await sharp(photo.data).rotate().resize(1536, 1536, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toBuffer();
    const dark = Boolean(req.body.teeIsDark);
    const prompt = copying
      ? copyDesignPrompt({
          change: String(req.body.change || "").replace(/\s+/g, " ").trim().slice(0, PROMPT_MAX),
          // what the photo reading found (the customer saw these words on the plan card)
          design: String(req.body.design || "").replace(/\s+/g, " ").trim().slice(0, 400),
          words: (Array.isArray(req.body.words) ? req.body.words : []).map((w) => String(w || "").replace(/\s+/g, " ").trim().slice(0, 60)).filter(Boolean).slice(0, 8),
          teeColour: teeName,
          teeIsDark: dark,
        })
      : inspiredDesignPrompt({ subject: text, style: AI_STYLES[req.body.style] ? req.body.style : "Bold mascot", teeColour: teeName, teeIsDark: dark, variation: 1, of: 1 });
    // (Google only: no Grok stand-in for these — photoJob / drawJob stay empty)
    jobs = [generateImage({ prompt, image: { data: small, mime: "image/jpeg" }, ratio: nearestRatio(req.body.ratio), size: DESIGN_SIZE })];
  } else if (fixing) {
    if (!isOurUpload(req.body.fixUrl)) {
      res.status(400);
      throw new Error("Upload the picture here first.");
    }
    const stored = await fetchOurImage(req.body.fixUrl, req);
    const dark = Boolean(req.body.teeIsDark);
    // (a photo keeps its own background: it is only made sharper)
    const flat = await sharp(stored.data).rotate().resize(1536, 1536, { fit: "inside", withoutEnlargement: true }).flatten({ background: req.body.fixKind === "photo" ? "#ffffff" : KEY_BACKGROUND }).jpeg({ quality: 92 }).toBuffer();
    const prompt = fixPrompt({ kind: req.body.fixKind, teeColour: teeName, teeIsDark: dark });
    photoJob = { promptFor: () => prompt, image: { data: flat, mime: "image/jpeg" } }; // Grok does it if Google refuses
    jobs = [generateImage({ prompt, image: photoJob.image, ratio: nearestRatio(req.body.ratio), size: DESIGN_SIZE })];
  } else if (fromPhoto) {
    // a customer's own photo, redrawn as art (two options)
    if (!isOurUpload(req.body.photoUrl)) {
      res.status(400);
      throw new Error("Upload the photo here first.");
    }
    const photo = await fetchOurImage(req.body.photoUrl, req);
    const small = await sharp(photo.data).rotate().resize(1536, 1536, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer();
    const style = PHOTO_STYLES[req.body.artStyle] ? req.body.artStyle : "Cartoon";
    const of = Math.min(2, Math.max(1, settings.imagesPerRequest));
    const promptFor = (i) => photoArtPrompt({ style, teeColour: teeName, teeIsDark: Boolean(req.body.teeIsDark), variation: i + 1, of });
    photoJob = { of, promptFor, image: { data: small, mime: "image/jpeg" } };
    jobs = Array.from({ length: of }, (_, i) => generateImage({ prompt: promptFor(i), image: photoJob.image, ratio: nearestRatio(req.body.ratio), size: DESIGN_SIZE }));
  } else if (changing) {
    if (!isAiDesign(req.body.baseUrl)) {
      res.status(400);
      throw new Error("Only a design made here can be changed.");
    }
    // the stored design is a cut-out: put it back on its plain background for the AI
    const stored = await fetchOurImage(req.body.baseUrl, req);
    // (a 4K design goes to the AI at most 2,048 px wide, 15 Nov 2026: plenty to change it from, a quarter of the upload)
    const fitted = await sharp(stored.data).resize(2048, 2048, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
    const image = { data: await onPlainBackground(fitted), mime: "image/jpeg" };
    photoJob = { promptFor: () => changeDesignPrompt(text), image }; // Grok edits it if Google refuses
    jobs = [generateImage({ prompt: changeDesignPrompt(text), image, ratio: nearestRatio(req.body.ratio), size: DESIGN_SIZE })];
  } else {
    const style = AI_STYLES[req.body.style] ? req.body.style : "Bold mascot";
    const teeColour = teeName;
    // count: fewer options than usual (used when one message asks for pictures on several areas)
    const wanted = Number(req.body.count) > 0 ? Math.min(Number(req.body.count), settings.imagesPerRequest) : settings.imagesPerRequest;
    // (never more than the pictures left today)
    const of = Math.min(4, Math.max(1, wanted), left);
    // lettering for a tall, thin area: one long line on the widest picture (21:9; 16:9 if the model won't do 21:9)
    banner = Boolean(req.body.banner) && style === "Hand lettering";
    const ask = { subject: text, style, teeColour, teeIsDark: Boolean(req.body.teeIsDark), oneLine: banner };
    drawJob = { prompt: newDesignPrompt({ ...ask, variation: 1, of: 1 }), ratio: banner ? "16:9" : nearestRatio(req.body.ratio) };
    jobs = Array.from({ length: of }, (_, i) => {
      const prompt = newDesignPrompt({ subject: text, style, teeColour, teeIsDark: Boolean(req.body.teeIsDark), variation: i + 1, of, oneLine: banner });
      if (!banner) return generateImage({ prompt, ratio: nearestRatio(req.body.ratio), size: DESIGN_SIZE });
      return generateImage({ prompt, ratio: "21:9" }).catch((err) => (err?.status === 400 ? generateImage({ prompt, ratio: "16:9" }) : Promise.reject(err)));
    });
  }

  const results = await Promise.allSettled(jobs);
  let made = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
  let byGrok = false;
  // Google refuses well-known people — in a photo or by name ("Messi kicking a ball") — with a safety error (422),
  // or quietly, with no picture in the answer: then Grok (xAI) makes it, when it is set up. One version only —
  // Grok costs about twice as much.
  const googleRefused = results[0].reason?.status === 422 || results[0].reason?.noImage === true;
  // Grok's own monthly cap: once reached, refused pictures are handled as if Grok were not set up
  const grokReady = !made.length && googleRefused && xaiConfigured() && !grokCapped(settings, await monthSpend());
  if (!made.length && googleRefused) console.log(`[ai] Google refused; Grok: ${!xaiConfigured() ? "not set up" : !grokReady ? "monthly cap reached" : (photoJob ? (changing ? "change to a design" : fixing ? `fix (${req.body.fixKind})` : "photo") : drawJob ? `drawing (${drawJob.ratio})` : "not for this kind of request")}`);
  if (grokReady && (photoJob || drawJob)) {
    try {
      made = [
        photoJob
          ? await xaiEditImage({ prompt: photoJob.promptFor(0).replace(/ This is option \d+ of \d+:[^.]*\./, ""), image: photoJob.image, resolution: GROK_BEST })
          : await xaiNewImage({ ...drawJob, resolution: GROK_BEST }),
      ];
      byGrok = true;
    } catch (err) {
      console.error("[ai:xai] Grok didn't make it:", err?.status || "", err?.message || err, err?.cause?.message || err?.cause || "");
      made = [];
    }
  }
  if (!made.length) {
    const err = results[0].reason;
    // the picture service refused the customer's photo: they still get art, made by our own filters
    // (the picture service refused the customer's photo: said plainly — the chat offers to use the photo as it is, free)
    if (fromPhoto && googleRefused) {
      res.status(422);
      throw new Error("The picture service wouldn’t redraw this photo — it refuses some photos, well-known faces among them. You weren’t charged. You can still put your photo on as it is, free.");
    }
    res.status(err?.status || 502);
    throw new Error(err?.message || "The design maker had a problem. Please try again.");
  }
  // cut each design out of its plain background here, so "Add to tee" is instant in the Design Room
  // (an enhanced photo is not cut: it is a photograph, its light parts are not a background)
  const keepPhoto = fixing && req.body.fixKind === "photo";
  let cut = await Promise.all(
    made.map((m) =>
      keepPhoto
        ? sharp(m.buffer).metadata().then((md) => ({ buffer: m.buffer, mime: m.mime, width: md.width || 1024, height: md.height || 1024, cut: false }))
        : cutOutPlainBackground(m.buffer).catch(() => ({ buffer: m.buffer, mime: m.mime, width: 1024, height: 1024, cut: false })),
    ),
  );
  // a one-line banner: drop the empty space around the words, so it runs the full length of the strip
  if (banner) {
    cut = await Promise.all(
      cut.map(async (c) => {
        if (!c.cut) return c;
        try {
          const t = await sharp(c.buffer).trim().png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
          return { ...c, buffer: t.data, width: t.info.width, height: t.info.height };
        } catch {
          return c;
        }
      }),
    );
  }
  const stored = await Promise.all(cut.map((c) => uploadFile(c.buffer, c.mime, "ai-designs")));

  await AiUsage.create({
    user: req.user._id,
    kind: copying ? "copy" : inspired ? "inspired" : fixing ? "fix" : fromPhoto ? "photo" : changing ? "change" : "new",
    prompt: text.slice(0, PROMPT_MAX),
    style: fromPhoto ? req.body.artStyle : changing || copying ? undefined : req.body.style,
    images: made.length,
    // (Google's 4K pictures at the 4K price, 15 Nov 2026; the one-line banner lettering is still drawn at 1K)
    costInr: Math.round(made.length * (byGrok ? settings.grokPricePerImageInr : banner ? settings.pricePerImageInr : designPictureCost(settings)) * 100) / 100,
    model: byGrok ? xaiModel() : aiImageModel(),
    ...(byGrok ? { grokUrls: stored.map((s) => s.url) } : {}),
  });
  // My pictures: what the picture shows, in the customer's words — a changed or fixed picture keeps the words of
  // the one it was made from ("a lion with a crown, make it blue")
  const wasAbout = async (url) => (url ? (await MyPicture.findOne({ user: req.user._id, url: String(url) }).lean())?.about || "" : "");
  const about = copying
    ? `Copied from your photo${req.body.change ? `: ${text.replace(/^Copy a design from a photo: /, "")}` : ""}`
    : fromPhoto
      ? `Your photo as ${PHOTO_STYLES[req.body.artStyle] ? req.body.artStyle : "Cartoon"}`
      : fixing
        ? [await wasAbout(req.body.fixUrl), req.body.fixKind === "recolour" ? "recoloured" : "sharper"].filter(Boolean).join(", ")
        : changing
          ? [await wasAbout(req.body.baseUrl), text].filter(Boolean).join(", ")
          : text;
  await rememberPictures(req.user._id, stored.map((s, i) => ({ url: s.url, kind: "ai", about, style: fromPhoto ? req.body.artStyle : AI_STYLES[req.body.style] ? req.body.style : "", width: cut[i].width, height: cut[i].height })));
  res.status(201).json({ images: stored.map((s, i) => ({ url: s.url, width: cut[i].width, height: cut[i].height })), left: Math.max(0, settings.dailyPerUser - used - made.length) });
});

// POST /api/ai/slogans  (no login needed; limited per address in the route)
// { ask, tone?, avoid?: [lines already shown] } -> { slogans: [..] }
// Costs a fraction of a paisa, so it is not counted against the picture limits.
export const makeSlogans = asyncHandler(async (req, res) => {
  const settings = await readSettings();
  if (!settings.enabled || !aiTextConfigured()) {
    res.status(503);
    throw new Error("Slogans to order are not available right now.");
  }
  const ask = String(req.body.ask || "").replace(/\s+/g, " ").trim().slice(0, PROMPT_MAX);
  if (ask.length < 2) {
    res.status(400);
    throw new Error("Tell me what the slogan is about.");
  }
  const tone = ["Funny", "Bold", "Emotional", "Simple"].includes(req.body.tone) ? req.body.tone : undefined;
  const avoid = Array.isArray(req.body.avoid) ? req.body.avoid.map((x) => String(x).slice(0, 80)).slice(-20) : [];
  try {
    res.json({ slogans: await writeSlogans({ ask, tone, avoid }) });
  } catch {
    res.status(502);
    throw new Error("I couldn’t think of any just now. Please try again.");
  }
});

// POST /api/ai/improve  (no login needed; limited per address in the route)
// { idea, teeColour?, teeIsDark?, areas?: [{ key, label, side, cm }] } -> { prompt, expect: [{ label, value }], style, area,
//   pictures: [{ prompt, expect, area }] }  (one picture per print area named; prompt/expect/area are the first's)
// "Improve my idea": the customer's rough words as a clear instruction for the picture AI, and what they will get.
// Text only — costs a fraction of a paisa, so it is not counted against the picture limits.
export const makeImprovedIdea = asyncHandler(async (req, res) => {
  const settings = await readSettings();
  if (!settings.enabled || !aiTextConfigured()) {
    res.status(503);
    throw new Error("Improving ideas isn’t available right now — your own words work fine too.");
  }
  const idea = String(req.body.idea || "").replace(/\s+/g, " ").trim().slice(0, PROMPT_MAX);
  if (idea.length < 3) {
    res.status(400);
    throw new Error("Write your idea first — a few words are enough.");
  }
  const str = (v, n) => String(v ?? "").slice(0, n);
  const areas = (Array.isArray(req.body.areas) ? req.body.areas : []).slice(0, AI_AREAS_MAX).map((a) => ({
    key: str(a.key, 40),
    label: str(a.label, 40),
    side: str(a.side, 10),
    cm: Array.isArray(a.cm) ? a.cm.slice(0, 2).map((n) => Math.round(Number(n) || 0)) : null,
    ...spotWhereOf(a),
  }));
  const styles = Object.entries(AI_STYLES).map(([name, about]) => ({ name, about: String(about).slice(0, 120) }));
  try {
    res.json(await improveIdea({ idea, teeColour: str(req.body.teeColour || "white", 30), teeIsDark: Boolean(req.body.teeIsDark), styles, areas }));
  } catch {
    res.status(502);
    throw new Error("I couldn’t improve that just now. Try again, or draw it with your own words.");
  }
});

// POST /api/ai/edit  (no login needed; limited per address in the route)
// { message, design } -> { reply, ops }   — "edit the tee by chat" (see services/aiTextService.js planEdit)
export const makeEdit = asyncHandler(async (req, res) => {
  const settings = await readSettings();
  if (!settings.enabled || !aiTextConfigured()) {
    res.status(503);
    throw new Error("I can’t do that right now.");
  }
  const message = String(req.body.message || "").trim().slice(0, PROMPT_MAX);
  const d = req.body.design && typeof req.body.design === "object" ? req.body.design : {};
  if (message.length < 2) {
    res.status(400);
    throw new Error("Tell me what to change.");
  }
  // only pass on a small, tidy description of the design
  const str = (v, n) => String(v ?? "").slice(0, n);
  const design = {
    tee: str(d.tee, 30),
    openArea: str(d.openArea, 40),
    selectedId: d.selectedId ? str(d.selectedId, 40) : null,
    fonts: (Array.isArray(d.fonts) ? d.fonts : []).slice(0, 20).map((f) => str(f, 40)),
    teeColours: (Array.isArray(d.teeColours) ? d.teeColours : []).slice(0, 30).map((c) => str(c, 30)),
    pictureStyles: Object.keys(AI_STYLES),
    areas: (Array.isArray(d.areas) ? d.areas : []).slice(0, AI_AREAS_MAX).map((a) => ({ key: str(a.key, 40), label: str(a.label, 40), side: str(a.side, 10), free: Boolean(a.free), ...spotWhereOf(a) })),
    items: (Array.isArray(d.items) ? d.items : []).slice(0, 30).map((it) => ({
      id: str(it.id, 40),
      type: it.type === "text" ? "text" : "picture",
      ...(["team name", "player name", "player number"].includes(it.is) ? { is: it.is } : {}),
      area: str(it.area, 40),
      ...(it.type === "text" ? { text: str(it.text, 200), font: str(it.font, 40), color: str(it.color, 9), sizeCm: Number(it.sizeCm) || 0, shape: str(it.shape, 12), bold: Boolean(it.bold), italic: Boolean(it.italic) } : { widthCm: Number(it.widthCm) || 0 }),
    })),
  };
  try {
    res.json(await planEdit({ message, design }));
  } catch {
    res.status(502);
    throw new Error("I couldn’t work that out just now. Please try again.");
  }
});

// one row of the admin's list of requests
const requestRow = (r) => ({ when: r.createdAt, who: r.user?.name || r.user?.email || "Customer", kind: r.kind, prompt: r.prompt, images: r.images, costInr: r.costInr, ai: /^grok/.test(r.model || "") ? "Grok" : "Google" });

// GET /api/ai/admin  (admin or seller): the settings, this month's use and the use since the start
export const getAiAdmin = asyncHandler(async (req, res) => {
  const settings = await readSettings();
  const month = await monthSpend();
  const since = new Date(Date.now() - 30 * 86_400_000); // the follow-up list: the last 30 days
  const [recent, history, conceptRows, sheetRows, developRows] = await Promise.all([
    AiUsage.find().sort({ createdAt: -1 }).limit(15).populate("user", "name email").lean(),
    usageHistory(),
    AiUsage.find({ kind: { $in: ["sheet", "develop"] } }).select("kind style createdAt").lean(),
    AiUsage.find({ kind: "sheet", createdAt: { $gte: since } }).sort({ createdAt: 1 }).select("user prompt createdAt").populate("user", "name email phone").lean(),
    AiUsage.find({ kind: "develop", createdAt: { $gte: since } }).select("user").lean(),
  ]);
  // the last concept sheets, for Browse ideas (round 7): the admin ticks the ones customers may start from
  const ideaSheets = (await AiUsage.find({ kind: "sheet", "sheet.url": { $exists: true } }).sort({ createdAt: -1 }).limit(30).select("sheet featured createdAt").lean()).map((r) => ({ id: r._id, url: r.sheet.url, brief: r.sheet.brief || "", titles: (r.sheet.concepts || []).map((c) => c.title), teeColour: r.sheet.teeColour || "", featured: Boolean(r.featured), when: r.createdAt }));
  const orders = sheetRows.length ? await Order.find({ user: { $in: [...new Set(sheetRows.map((r) => String(r.user?._id || r.user)))] }, createdAt: { $gte: since } }).select("user createdAt").lean() : [];
  const monthStart = startOfMonth();
  res.json({
    // what the concept sheets teach us (Assistant v2): all time and this month, and who started but didn't order
    concepts: { allTime: conceptSummary(conceptRows), month: conceptSummary(conceptRows.filter((r) => r.createdAt >= monthStart)), unfinished: unfinishedDesigns(sheetRows, developRows, orders), ideaSheets },
    configured: aiImageConfigured(),
    model: aiImageModel(),
    // the second picture service, for photos Google refuses
    grok: { configured: xaiConfigured(), model: xaiModel(), capped: grokCapped(settings, month) },
    // the enlarger for print files (6 Nov 2026)
    // (15 Nov 2026: and Topaz, the first choice — settings.printEnlarger says which is used)
    replicate: { configured: replicateConfigured(), model: replicateModel(), topazModel: topazModel() },
    reason: await whyOff(settings),
    settings,
    month,
    allTime: history.allTime,
    months: history.months,
    recent: recent.map(requestRow),
  });
});

// GET /api/ai/admin/requests?before=<date>  (admin or seller): the next 50 requests older than that date
export const getAiRequests = asyncHandler(async (req, res) => {
  const before = new Date(String(req.query.before));
  if (Number.isNaN(before.getTime())) {
    res.status(400);
    throw new Error("Please send a valid date.");
  }
  const rows = await AiUsage.find({ createdAt: { $lt: before } }).sort({ createdAt: -1 }).limit(50).populate("user", "name email").lean();
  res.json(rows.map(requestRow));
});

// PUT /api/ai/admin  (admin only): { enabled, dailyPerUser, imagesPerRequest, monthlyCapInr, grokMonthlyCapInr, pricePerImageInr, grokPricePerImageInr,
//   printEnlarger ("topaz" | "real-esrgan"), replicatePricePerImageInr, topazPricePerUnitInr, price4kPerImageInr, … }
export const saveAiAdmin = asyncHandler(async (req, res) => {
  const incoming = {
    "ai.enabled": req.body.enabled,
    "ai.dailyPerUser": req.body.dailyPerUser,
    "ai.imagesPerRequest": req.body.imagesPerRequest,
    "ai.monthlyCapInr": req.body.monthlyCapInr,
    "ai.grokMonthlyCapInr": req.body.grokMonthlyCapInr,
    "ai.pricePerImageInr": req.body.pricePerImageInr,
    "ai.grokPricePerImageInr": req.body.grokPricePerImageInr,
    [AI_ADDON_KEY]: req.body.designAddOnInr,
    "ai.smartChat": req.body.smartChat,
    "ai.assistantV2": req.body.assistantV2,
    "ai.chatPricePerMessageInr": req.body.chatPricePerMessageInr,
    "ai.makingDays": req.body.makingDays,
    "ai.teamMakingDays": req.body.teamMakingDays,
    "ai.shippingDays": req.body.shippingDays,
    "print.knockout": req.body.printKnockout,
    "print.dropSpecks": req.body.printDropSpecks,
    "print.aiCopy": req.body.printAiCopy,
    // (15 Nov 2026) the print enlarger and the prices of Topaz and of 4K pictures (and Real-ESRGAN's, which had a
    // limit but could not be saved)
    "ai.printEnlarger": req.body.printEnlarger,
    "ai.replicatePricePerImageInr": req.body.replicatePricePerImageInr,
    "ai.topazPricePerUnitInr": req.body.topazPricePerUnitInr,
    "ai.price4kPerImageInr": req.body.price4kPerImageInr,
  };
  for (const [key, raw] of Object.entries(incoming)) {
    if (raw === undefined) continue;
    let value = raw;
    if (BOOLEAN_KEYS.includes(key)) value = Boolean(raw);
    else if (CHOICES[key]) {
      if (!CHOICES[key].includes(raw)) {
        res.status(400);
        throw new Error(`${DEFAULTS[key].description}: choose ${CHOICES[key].join(" or ")}.`);
      }
    } else {
      value = Number(raw);
      const [min, max] = LIMITS[key];
      if (!Number.isFinite(value) || value < min || value > max) {
        res.status(400);
        throw new Error(`${DEFAULTS[key].description}: enter a number from ${min} to ${max}.`);
      }
    }
    await Setting.findOneAndUpdate(
      { key },
      { $set: { value, updatedBy: req.user._id }, $setOnInsert: { type: DEFAULTS[key].type, category: CATEGORY, description: DEFAULTS[key].description, isPublic: false } },
      { upsert: true },
    );
  }
  res.json({ settings: await readSettings() });
});

/* ---------- admin: a large copy of an ordered picture, for printing ---------- */
// A design is chosen at the small size (fast, cheap). What is printed needs about 300 dots per inch, so
// after the order the admin can have a picture enlarged to about 4,000 px. It costs about 3× a normal
// picture, and only for tees that were sold. The admin compares it with the original before printing,
// because an image AI redraws what it enlarges.
export const isDarkHex = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 < 0.55;
};
async function orderedPicture(req) {
  const { designId, index } = req.body;
  if (!mongoose.isValidObjectId(designId)) throw Object.assign(new Error("Design not found"), { status: 404 });
  const design = await Customization.findById(designId);
  const el = design?.elements?.[Number(index)];
  if (!design || !el || el.type !== "image" || !el.src) throw Object.assign(new Error("That picture is not in this design."), { status: 404 });
  return { design, el };
}

// A customer's own picture with near-magenta in it: the magenta "green screen" can't be used for it (its pink would
// be cut away with the background). rgba: a small copy, raw RGBA; only its solid pixels count.
export function hasKeyColour(rgba) {
  let solid = 0, key = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    solid++;
    if (rgba[i] > 170 && rgba[i + 2] > 170 && rgba[i + 1] < 110) key++;
  }
  return key > Math.max(4, solid * 0.002);
}

// How much of a picture is see-through (0..1), on a small copy.
async function seeThroughShare(buffer) {
  const a = await sharp(buffer).rotate().ensureAlpha().resize(256, 256, { fit: "inside" }).extractChannel("alpha").raw().toBuffer();
  let n = 0;
  for (const v of a) if (v <= 8) n++;
  return n / a.length;
}

/**
 * The AI's 4K copy of one picture of a design, for printing: the same picture with more pixels, nothing changed (the
 * prompt is all about that). Saved as the element's printSrc. Made by the admin's button, and (16 Nov 2026) by Prepare
 * for print itself before Topaz enlarges a picture that is not 4K.
 * A see-through picture is copied on the magenta "green screen" and cut out again at 4K (clean edges, its own white
 * parts kept), unless it has magenta of its own: then it keeps its own outline, enlarged.
 * @param {object} a
 * @param {string} a.designId
 * @param {number} a.index
 * @param {*} a.user        who asked (for the AI-use line)
 * @param {object} a.req    for fetching our own stored picture ({ protocol, get(host) })
 * @param {object} a.settings  readSettings()
 * @param {boolean} [a.allowGrok]  Grok when Google refuses (Prepare for print: only for a picture under 2K, 16 Nov 2026)
 * @param {string} [a.noGrokWhy]  why Grok is not asked (said to the admin)
 * @returns {Promise<{ url, width, height, costInr, byGrok }>}  throws with .status (422: the AI said no)
 */
export async function makeAiPrintCopy({ designId, index, user, req, settings, allowGrok = true, noGrokWhy = "" }) {
  const fail = (status, message) => Object.assign(new Error(message), { status });
  if (!aiImageConfigured()) throw fail(503, "The picture service is not set up.");
  // the copy is made by Google, so Google's cap applies
  if (googleCapped(settings, await monthSpend())) throw fail(503, "This month's Google AI budget is used up. Raise it in Settings → AI designs to enlarge more pictures.");
  const { design, el } = await orderedPicture({ body: { designId, index } });
  if (!isOurUpload(el.src)) throw fail(400, "This picture is not stored with us, so it can't be enlarged.");
  const garment = await GarmentType.findOne({ key: design.garmentType }).lean();
  const dark = isDarkHex(garment?.colors?.find((c) => c.slug === design.color)?.hex);
  const stored = await fetchOurImage(el.src, req);
  const meta = await sharp(stored.data).rotate().metadata();
  // (16 Nov 2026, "no photo will get shrinked") the AI gives about 4,096 px: a picture already 4K or bigger would come
  // back SMALLER, so it is never copied (Prepare for print only copies under 3,840 px; this guards the admin's button)
  if (Math.max(meta.width, meta.height) >= 3840) throw fail(400, `This picture is already 4K (${meta.width} × ${meta.height} px): an AI copy would be smaller, so it prints from the picture itself.`);
  const hasAlpha = Boolean(meta.hasAlpha) && !(await sharp(stored.data).stats()).isOpaque;
  const aiCut = /\/ai-designs\//.test(el.src); // made by the design maker: it was cut out of a plain background
  // (an AI cut-out goes back on the magenta it was drawn on, 8 Nov 2026 — on white or black, its white or black parts
  // would be cleared again after enlarging; 16 Nov 2026: a customer's cut-out logo too, so its edge is cut again at
  // 4K instead of the small picture's rough edge being blown up)
  let key = aiCut;
  if (!aiCut && hasAlpha) {
    const { data } = await sharp(stored.data).rotate().ensureAlpha().resize(512, 512, { fit: "inside", withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
    key = !hasKeyColour(data);
  }
  const bg = key ? KEY_BACKGROUND : dark ? "#000000" : "#ffffff";

  // The AI only makes a few picture shapes. The picture is put on a sheet of the nearest shape (never
  // squeezed), enlarged, and the same part is cut back out — so it keeps its own shape exactly.
  const shape = meta.width / meta.height;
  const [ratio, r] = Object.entries(RATIO_VALUES).sort((a, b) => Math.abs(Math.log(a[1] / shape)) - Math.abs(Math.log(b[1] / shape)))[0];
  const sheetW = r >= shape ? Math.round(meta.height * r) : meta.width;
  const sheetH = r >= shape ? meta.height : Math.round(meta.width / r);
  const small = await sharp(stored.data)
    .rotate()
    .flatten({ background: bg })
    .resize(sheetW, sheetH, { fit: "contain", background: bg })
    // (16 Nov 2026: was 1,536 px — a 3,000 px picture lost detail before it was copied; the user: "dont shrink")
    .resize(4096, 4096, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 95 })
    .toBuffer();

  let out;
  let byGrok = false;
  const original = `Nothing was charged. It prints from the original picture (${meta.width} × ${meta.height} px).`;
  const prompt = printPrompt({ dark, plain: hasAlpha, key });
  try {
    out = await generateImage({ prompt, image: { data: small, mime: "image/jpeg" }, ratio, size: "4K" });
  } catch (err) {
    if (!(err?.status === 422 || err?.noImage)) throw err;
    if (!allowGrok) throw fail(422, `Google won't make a 4K copy of this picture${noGrokWhy ? ` (${noGrokWhy})` : ""}. ${original}`);
    // Google said no (5 Nov 2026, the client's Spider-Man tee). Then Grok, at its largest size, "2k": about 2,000 px, so
    // less than Google's 4,000 px, and it redraws more, so the admin is told to compare it with the original.
    if (!xaiConfigured()) throw fail(422, `Google won't enlarge this picture and Grok is not set up on this server. ${original}`);
    if (grokCapped(settings, await monthSpend())) throw fail(429, `Google won't enlarge this picture and this month's Grok spending limit is reached. ${original}`);
    try {
      out = await xaiEditImage({
        prompt: `${prompt} Keep the same person, face, pose, colours and composition exactly; only add fine detail and sharpness.`,
        image: { data: small, mime: "image/jpeg" },
        resolution: "2k",
      });
      byGrok = true;
    } catch (err2) {
      if (err2?.status !== 422) throw err2;
      throw fail(422, `Neither Google nor Grok would enlarge this picture. ${original}`);
    }
  }
  // (16 Nov 2026) Grok picks its own picture shape and may zoom: its copy is put back in the sheet's exact shape (the
  // VF-2026-0079 front printed 13% too wide before). A copy already of the sheet's shape (Google) is left as it is.
  const fitted = await fitCopyToSheet({ sent: small, copy: out.buffer });
  const copyBuffer = fitted.buffer;
  const big = await sharp(copyBuffer).metadata();
  const keepW = Math.min(big.width, Math.round((big.width * meta.width) / sheetW));
  const keepH = Math.min(big.height, Math.round((big.height * meta.height) / sheetH));
  let picture = await sharp(copyBuffer)
    .extract({ left: Math.floor((big.width - keepW) / 2), top: Math.floor((big.height - keepH) / 2), width: keepW, height: keepH })
    .png()
    .toBuffer();

  // the picture's own outline, enlarged (exactly its shape, so nothing inside it is cleared)
  const ownOutline = async (pic) => {
    const alpha = await sharp(stored.data).rotate().ensureAlpha().extractChannel("alpha").resize(keepW, keepH, { kernel: "lanczos3" }).toBuffer();
    // (in two steps: asked for together, the old alpha is dropped AFTER the new one is joined, losing both)
    const colour = await sharp(pic).removeAlpha().png().toBuffer();
    return sharp(colour).joinChannel(alpha).png().toBuffer();
  };
  if (key) {
    // clear the magenta it was copied on, as when a design is first made
    const cut = await cutOutPlainBackground(picture);
    // then every magenta pixel left anywhere (16 Nov 2026: a figure running off the picture's edge leaves no plain
    // edge to cut from, and closed-in gaps can stay pink) — the original has no magenta, or it was not put on the key
    const keyed = await clearKeyColour(cut.cut ? cut.buffer : picture, { onlyIfLeft: cut.cut });
    // the AI kept (most of) the magenta background: that is the cut-out. If it drew something else there instead,
    // the original's own outline is the only guide left
    const clearBefore = hasAlpha ? await seeThroughShare(stored.data) : 0;
    if (cut.cut || keyed.cleared >= clearBefore * 0.5) picture = keyed.buffer;
    else if (hasAlpha) picture = await ownOutline(picture); // the AI did not keep the background flat
  } else if (hasAlpha) {
    picture = await ownOutline(picture);
  }
  // near-lossless WebP: a 4,000 px PNG can be larger than the picture store accepts
  const webp = await sharp(picture).webp({ quality: 96, alphaQuality: 100, effort: 4 }).toBuffer();
  const { url } = await uploadFile(webp, "image/webp", "print-pictures", "print.webp");

  // saved on a fresh copy of the design (a print job may be saving the same design)
  const fresh = await Customization.findById(design._id);
  const target = fresh?.elements?.[Number(index)];
  if (!target || target.src !== el.src) {
    await deleteStoredFile(url).catch(() => {});
    throw fail(409, "The design changed while the 4K copy was being made. Try again.");
  }
  const old = target.printSrc;
  target.printSrc = url;
  target.aiCopyOff = undefined;
  await fresh.save();
  if (old && old !== url) await deleteStoredFile(old).catch(() => {});
  const costInr = Math.round((byGrok ? settings.grokPricePerImageInr || 0 : settings.price4kPerImageInr) * 100) / 100;
  await AiUsage.create({ user, kind: "print", prompt: `4K copy for print (design ${design._id}, picture ${Number(index) + 1})${byGrok ? " (Grok)" : ""}`, images: 1, costInr, model: byGrok ? xaiModel() : aiImageModel() });
  return { url, width: keepW, height: keepH, costInr, byGrok };
}

// POST /api/ai/admin/print-picture  { designId, index }  ->  { printSrc, width, height, costInr, byGrok }
export const makePrintPicture = asyncHandler(async (req, res) => {
  try {
    const made = await makeAiPrintCopy({ designId: req.body.designId, index: req.body.index, user: req.user._id, req, settings: await readSettings() });
    res.status(201).json({ printSrc: made.url, width: made.width, height: made.height, costInr: made.costInr, byGrok: made.byGrok });
  } catch (err) {
    res.status(err.status || 500);
    throw err;
  }
});

// DELETE /api/ai/admin/print-picture  { designId, index }  — print the original again
export const dropPrintPicture = asyncHandler(async (req, res) => {
  let found;
  try {
    found = await orderedPicture(req);
  } catch (err) {
    res.status(err.status || 500);
    throw err;
  }
  const { design, el } = found;
  const old = el.printSrc;
  el.printSrc = undefined;
  // (16 Nov 2026) the admin chose the original: Prepare for print won't make a 4K copy of it again
  el.aiCopyOff = true;
  await design.save();
  if (old) await deleteStoredFile(old).catch(() => {});
  res.json({ printSrc: null });
});

// POST /api/ai/photo-plan  (login required): { photoUrl, message, areas: [{ key, label }] }
// A photo sent in the chat with the customer's words: what they want made from it (the text AI reads the photo).
// -> { job, seen, style, area, change, subject, question }   — a small text request, not one of the customer's
// daily picture requests. When it can't be read (AI off, out of credit), the chat uses its own rules instead.
export const makePhotoPlan = asyncHandler(async (req, res) => {
  const settings = await readSettings();
  if (!settings.enabled || !aiTextConfigured()) {
    res.status(503);
    throw new Error("Reading photos isn't available right now.");
  }
  if (!isOurUpload(req.body.photoUrl)) {
    res.status(400);
    throw new Error("Send the photo here first.");
  }
  const photo = await fetchOurImage(req.body.photoUrl, req);
  const small = await sharp(photo.data).rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer();
  const areas = (Array.isArray(req.body.areas) ? req.body.areas : []).slice(0, AI_AREAS_MAX).map((a) => ({ key: String(a?.key || "").slice(0, 40), label: String(a?.label || "").slice(0, 60), ...spotWhereOf(a) }));
  try {
    const plan = await readPhotoRequest({ image: { data: small, mime: "image/jpeg" }, message: String(req.body.message || "").slice(0, PROMPT_MAX), styles: Object.keys(AI_STYLES), photoStyles: Object.keys(PHOTO_STYLES), areas });
    res.json(plan);
  } catch (err) {
    res.status(err?.status === 503 ? 503 : 502);
    throw new Error("I couldn’t read the photo just now.");
  }
});

// POST /api/ai/remove-background  (login required): { url } — a photo the customer uploaded
// -> { url, width, height }: the photo without its background (a transparent PNG), stored like an upload.
// Free: our own model on this server (services/backgroundService.js), not an AI service, not a daily request.
// (It used to run in the customer's browser, where iPhones ran out of memory and reloaded the page.)
export const makeBackgroundRemoval = asyncHandler(async (req, res) => {
  if (!isOurUpload(req.body.url)) {
    res.status(400);
    throw new Error("Upload the photo here first.");
  }
  const photo = await fetchOurImage(req.body.url, req);
  let cut;
  try {
    cut = await removePhotoBackground(photo.data);
  } catch (err) {
    console.error("[background] removal failed:", err?.message || err);
    // (503: the remover can't run on this server at all — said plainly, so the customer isn't told to keep retrying)
    res.status(err?.status === 503 ? 503 : 502);
    throw new Error(err?.status === 503 ? err.message : "The background couldn’t be removed just now. Please try again.");
  }
  const stored = await uploadFile(cut.buffer, "image/png", "designs", "cut-out.png");
  // (My pictures: the photo without its background is one of theirs too, under the photo's own words)
  const was = (await MyPicture.findOne({ user: req.user._id, url: String(req.body.url) }).lean())?.about || "";
  await rememberPictures(req.user._id, [{ url: stored.url, kind: "photo", about: [was, "background removed"].filter(Boolean).join(", "), width: cut.width, height: cut.height }]);
  res.status(201).json({ url: stored.url, width: cut.width, height: cut.height });
});
