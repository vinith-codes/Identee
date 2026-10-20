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
import Customization from "../models/customizationModel.js";
import GarmentType from "../models/garmentTypeModel.js";
import { uploadFile, deleteStoredFile } from "../utils/imageStorage.js";
import { cutOutPlainBackground, onPlainBackground } from "../services/cutoutService.js";
import { aiTextConfigured, improveIdea, planEdit, readPhotoRequest, writeSlogans } from "../services/aiTextService.js";
import sharp from "sharp";
import { artFilters, FILTER_STYLE } from "../services/artFilterService.js";
import { xaiConfigured, xaiEditImage, xaiModel, xaiNewImage } from "../services/xaiImageService.js";
import { AI_STYLES, PHOTO_STYLES, aiImageConfigured, aiImageModel, changeDesignPrompt, copyDesignPrompt, inspiredDesignPrompt, generateImage, nearestRatio, newDesignPrompt, photoArtPrompt, FIX_KINDS, fixPrompt, printPrompt, RATIO_VALUES } from "../services/aiImageService.js";

const CATEGORY = "ai";
const DEFAULTS = {
  "ai.enabled": { value: true, type: "boolean", description: "Customers can make designs with AI" },
  "ai.dailyPerUser": { value: 5, type: "number", description: "Design requests one customer may make per day" },
  "ai.imagesPerRequest": { value: 1, type: "number", description: "Pictures shown for each new design request" },
  // (the key keeps its old name: before 18 Oct 2026 it was one cap for both services)
  "ai.monthlyCapInr": { value: 2000, type: "number", description: "Monthly spending cap for Google, in rupees" },
  "ai.grokMonthlyCapInr": { value: 500, type: "number", description: "Monthly spending cap for Grok, in rupees" },
  "ai.pricePerImageInr": { value: 2.9, type: "number", description: "What one picture costs, in rupees (for the spending figures)" },
  // Grok (xAI) redraws photos Google refuses; $5 of credit ≈ 71 pictures
  "ai.grokPricePerImageInr": { value: 6, type: "number", description: "What one Grok picture costs, in rupees (for the spending figures)" },
  // what the CUSTOMER pays extra per tee with a picture — AI-made, art library or upload (utils/aiPricing.js)
  [AI_ADDON_KEY]: { value: AI_ADDON_DEFAULT, type: "number", description: "Extra price per tee with a picture (₹)" },
};
const LIMITS = { "ai.dailyPerUser": [1, 50], "ai.imagesPerRequest": [1, 4], "ai.monthlyCapInr": [0, 1000000], "ai.grokMonthlyCapInr": [0, 1000000], "ai.pricePerImageInr": [0, 100], "ai.grokPricePerImageInr": [0, 100], [AI_ADDON_KEY]: [0, 5000] };


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

async function readSettings() {
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
    designAddOnInr: Number(get(AI_ADDON_KEY)),
  };
}
// This month's use, in total and for Grok alone (a Grok row's model starts with "grok").
async function monthSpend() {
  const rows = await AiUsage.aggregate([
    { $match: { createdAt: { $gte: startOfMonth() } } },
    { $group: { _id: { $regexMatch: { input: { $ifNull: ["$model", ""] }, regex: /^grok/ } }, cost: { $sum: "$costInr" }, images: { $sum: "$images" }, requests: { $sum: 1 } } },
  ]);
  const part = (r) => ({ cost: r?.cost || 0, images: r?.images || 0, requests: r?.requests || 0 });
  const grok = part(rows.find((r) => r._id === true));
  const google = part(rows.find((r) => r._id === false));
  return { cost: grok.cost + google.cost, images: grok.images + google.images, requests: grok.requests + google.requests, grok, google };
}
// Each service has its own cap (0 = no cap).
const googleCapped = (settings, month) => settings.monthlyCapInr > 0 && month.google.cost >= settings.monthlyCapInr;
const grokCapped = (settings, month) => settings.grokMonthlyCapInr > 0 && month.grok.cost >= settings.grokMonthlyCapInr;
// Why the feature is off (null = it is on). Google makes every picture, so its cap pauses the feature;
// Grok's cap only stops Grok standing in for refused pictures.
async function whyOff(settings) {
  if (!aiImageConfigured()) return "setup";
  if (!settings.enabled) return "off";
  if (googleCapped(settings, await monthSpend())) return "cap";
  return null;
}
const usedToday = (userId) => AiUsage.countDocuments({ user: userId, createdAt: { $gte: startOfDay() } });

// GET /api/ai/status  (login optional)
export const getAiStatus = asyncHandler(async (req, res) => {
  const settings = await readSettings();
  const reason = await whyOff(settings);
  const left = req.user ? Math.max(0, settings.dailyPerUser - (await usedToday(req.user._id))) : null;
  // text: the assistant can write slogans to order (same key; switched off together with the design maker)
  // designAddOnInr: what an AI-made or uploaded picture adds to the tee's price (art library: free; the Design Room shows it)
  res.json({ available: !reason, reason, text: aiTextConfigured() && settings.enabled, styles: Object.keys(AI_STYLES), photoStyles: [...Object.keys(PHOTO_STYLES), FILTER_STYLE], dailyPerUser: settings.dailyPerUser, left, designAddOnInr: settings.designAddOnInr });
});

// Only pictures this feature made may be sent back to be changed.
const isAiDesign = isAiDesignUrl;
// A picture the customer uploaded in the Design Room (for photo to art).
const isOurUpload = (url) => {
  const cloud = process.env.CLOUDINARY_NAME?.trim();
  const s = String(url || "");
  return (cloud && s.startsWith(`https://res.cloudinary.com/${cloud}/`) && s.includes("/identee/")) || /^\/?uploads\/[\w\-./]+$/.test(s);
};
async function fetchOurImage(url, req) {
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
  if (used >= settings.dailyPerUser) {
    res.status(429);
    throw new Error(`You’ve used today’s ${settings.dailyPerUser} design requests. They reset tomorrow.`);
  }

  // a photo sent in the chat: its print copied, or used as a reference for a new design
  const copying = Boolean(req.body.copyUrl);
  const inspired = !copying && Boolean(req.body.refUrl);
  const changing = !copying && !inspired && Boolean(req.body.baseUrl);
  const fromPhoto = !copying && !inspired && !changing && Boolean(req.body.photoUrl);
  // fixing a picture that is on the tee: make it sharper, or recolour it for this tee
  const fixing = !copying && !inspired && !changing && !fromPhoto && Boolean(req.body.fixUrl) && FIX_KINDS.includes(req.body.fixKind);
  const text = copying
    ? `Copy a design from a photo${req.body.change ? `: ${String(req.body.change).replace(/\s+/g, " ").trim().slice(0, 200)}` : ""}`
    : fixing
    ? (req.body.fixKind === "recolour" ? "Recolour a picture for the tee" : req.body.fixKind === "photo" ? "Photo Studio: enhance a photo" : "Make a picture sharper")
    : fromPhoto
    ? `Photo to art: ${PHOTO_STYLES[req.body.artStyle] ? req.body.artStyle : "Cartoon"}`
    : String((changing ? req.body.change : req.body.subject) || "").replace(/\s+/g, " ").trim().slice(0, 300);
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
          change: String(req.body.change || "").replace(/\s+/g, " ").trim().slice(0, 200),
          // what the photo reading found (the customer saw these words on the plan card)
          design: String(req.body.design || "").replace(/\s+/g, " ").trim().slice(0, 400),
          words: (Array.isArray(req.body.words) ? req.body.words : []).map((w) => String(w || "").replace(/\s+/g, " ").trim().slice(0, 60)).filter(Boolean).slice(0, 8),
          teeColour: teeName,
          teeIsDark: dark,
        })
      : inspiredDesignPrompt({ subject: text, style: AI_STYLES[req.body.style] ? req.body.style : "Bold mascot", teeColour: teeName, teeIsDark: dark, variation: 1, of: 1 });
    // (Google only: no Grok stand-in for these — photoJob / drawJob stay empty)
    jobs = [generateImage({ prompt, image: { data: small, mime: "image/jpeg" }, ratio: nearestRatio(req.body.ratio) })];
  } else if (fixing) {
    if (!isOurUpload(req.body.fixUrl)) {
      res.status(400);
      throw new Error("Upload the picture here first.");
    }
    const stored = await fetchOurImage(req.body.fixUrl, req);
    const dark = Boolean(req.body.teeIsDark);
    // (a photo keeps its own background: it is only made sharper)
    const flat = await sharp(stored.data).rotate().resize(1536, 1536, { fit: "inside", withoutEnlargement: true }).flatten({ background: dark && req.body.fixKind !== "photo" ? "#000000" : "#ffffff" }).jpeg({ quality: 92 }).toBuffer();
    const prompt = fixPrompt({ kind: req.body.fixKind, teeColour: teeName, teeIsDark: dark });
    photoJob = { promptFor: () => prompt, image: { data: flat, mime: "image/jpeg" } }; // Grok does it if Google refuses
    jobs = [generateImage({ prompt, image: photoJob.image, ratio: nearestRatio(req.body.ratio) })];
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
    jobs = Array.from({ length: of }, (_, i) => generateImage({ prompt: promptFor(i), image: photoJob.image, ratio: nearestRatio(req.body.ratio) }));
  } else if (changing) {
    if (!isAiDesign(req.body.baseUrl)) {
      res.status(400);
      throw new Error("Only a design made here can be changed.");
    }
    // the stored design is a cut-out: put it back on its plain background for the AI
    const stored = await fetchOurImage(req.body.baseUrl, req);
    const image = { data: await onPlainBackground(stored.data, Boolean(req.body.teeIsDark)), mime: "image/jpeg" };
    photoJob = { promptFor: () => changeDesignPrompt(text), image }; // Grok edits it if Google refuses
    jobs = [generateImage({ prompt: changeDesignPrompt(text), image, ratio: nearestRatio(req.body.ratio) })];
  } else {
    const style = AI_STYLES[req.body.style] ? req.body.style : "Bold mascot";
    const teeColour = teeName;
    // count: fewer options than usual (used when one message asks for pictures on several areas)
    const wanted = Number(req.body.count) > 0 ? Math.min(Number(req.body.count), settings.imagesPerRequest) : settings.imagesPerRequest;
    const of = Math.min(4, Math.max(1, wanted));
    // lettering for a tall, thin area: one long line on the widest picture (21:9; 16:9 if the model won't do 21:9)
    banner = Boolean(req.body.banner) && style === "Hand lettering";
    const ask = { subject: text, style, teeColour, teeIsDark: Boolean(req.body.teeIsDark), oneLine: banner };
    drawJob = { prompt: newDesignPrompt({ ...ask, variation: 1, of: 1 }), ratio: banner ? "16:9" : nearestRatio(req.body.ratio) };
    jobs = Array.from({ length: of }, (_, i) => {
      const prompt = newDesignPrompt({ subject: text, style, teeColour, teeIsDark: Boolean(req.body.teeIsDark), variation: i + 1, of, oneLine: banner });
      if (!banner) return generateImage({ prompt, ratio: nearestRatio(req.body.ratio) });
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
          ? await xaiEditImage({ prompt: photoJob.promptFor(0).replace(/ This is option \d+ of \d+:[^.]*\./, ""), image: photoJob.image })
          : await xaiNewImage(drawJob),
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
    if (fromPhoto && googleRefused) return sendFilterArt(req, res, { refused: true, left: Math.max(0, settings.dailyPerUser - used) });
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
    prompt: text,
    style: fromPhoto ? req.body.artStyle : changing || copying ? undefined : req.body.style,
    images: made.length,
    costInr: Math.round(made.length * (byGrok ? settings.grokPricePerImageInr : settings.pricePerImageInr) * 100) / 100,
    model: byGrok ? xaiModel() : aiImageModel(),
  });
  res.status(201).json({ images: stored.map((s, i) => ({ url: s.url, width: cut[i].width, height: cut[i].height })), left: Math.max(0, settings.dailyPerUser - used - 1) });
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
  const ask = String(req.body.ask || "").replace(/\s+/g, " ").trim().slice(0, 200);
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
// { idea, teeColour?, teeIsDark?, areas?: [{ key, label, side, cm }] } -> { prompt, expect: [{ label, value }], style, area }
// "Improve my idea": the customer's rough words as a clear instruction for the picture AI, and what they will get.
// Text only — costs a fraction of a paisa, so it is not counted against the picture limits.
export const makeImprovedIdea = asyncHandler(async (req, res) => {
  const settings = await readSettings();
  if (!settings.enabled || !aiTextConfigured()) {
    res.status(503);
    throw new Error("Improving ideas isn’t available right now — your own words work fine too.");
  }
  const idea = String(req.body.idea || "").replace(/\s+/g, " ").trim().slice(0, 400);
  if (idea.length < 3) {
    res.status(400);
    throw new Error("Write your idea first — a few words are enough.");
  }
  const str = (v, n) => String(v ?? "").slice(0, n);
  const areas = (Array.isArray(req.body.areas) ? req.body.areas : []).slice(0, 20).map((a) => ({
    key: str(a.key, 40),
    label: str(a.label, 40),
    side: str(a.side, 10),
    cm: Array.isArray(a.cm) ? a.cm.slice(0, 2).map((n) => Math.round(Number(n) || 0)) : null,
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
  const message = String(req.body.message || "").trim();
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
    areas: (Array.isArray(d.areas) ? d.areas : []).slice(0, 20).map((a) => ({ key: str(a.key, 40), label: str(a.label, 40), side: str(a.side, 10), free: Boolean(a.free) })),
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

// GET /api/ai/admin  (admin or seller): the settings and this month's use
export const getAiAdmin = asyncHandler(async (req, res) => {
  const settings = await readSettings();
  const month = await monthSpend();
  const recent = await AiUsage.find().sort({ createdAt: -1 }).limit(15).populate("user", "name email").lean();
  res.json({
    configured: aiImageConfigured(),
    model: aiImageModel(),
    // the second picture service, for photos Google refuses
    grok: { configured: xaiConfigured(), model: xaiModel(), capped: grokCapped(settings, month) },
    reason: await whyOff(settings),
    settings,
    month,
    recent: recent.map((r) => ({ when: r.createdAt, who: r.user?.name || r.user?.email || "Customer", kind: r.kind, prompt: r.prompt, images: r.images, costInr: r.costInr, ai: /^grok/.test(r.model || "") ? "Grok" : "Google" })),
  });
});

// PUT /api/ai/admin  (admin only): { enabled, dailyPerUser, imagesPerRequest, monthlyCapInr, grokMonthlyCapInr, pricePerImageInr, grokPricePerImageInr }
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
  };
  for (const [key, raw] of Object.entries(incoming)) {
    if (raw === undefined) continue;
    let value = raw;
    if (key === "ai.enabled") value = Boolean(raw);
    else {
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
const PRINT_COST_FACTOR = 3;
const isDarkHex = (hex) => {
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

// POST /api/ai/admin/print-picture  { designId, index }  ->  { printSrc, width, height, costInr }
export const makePrintPicture = asyncHandler(async (req, res) => {
  const settings = await readSettings();
  if (!aiImageConfigured()) {
    res.status(503);
    throw new Error("The picture service is not set up.");
  }
  // enlarging is done by Google, so Google's cap applies
  if (googleCapped(settings, await monthSpend())) {
    res.status(503);
    throw new Error("This month's Google AI budget is used up. Raise it in Settings → AI designs to enlarge more pictures.");
  }
  let found;
  try {
    found = await orderedPicture(req);
  } catch (err) {
    res.status(err.status || 500);
    throw err;
  }
  const { design, el } = found;
  if (!isOurUpload(el.src)) {
    res.status(400);
    throw new Error("This picture is not stored with us, so it can't be enlarged.");
  }
  const garment = await GarmentType.findOne({ key: design.garmentType }).lean();
  const dark = isDarkHex(garment?.colors?.find((c) => c.slug === design.color)?.hex);
  const stored = await fetchOurImage(el.src, req);
  const meta = await sharp(stored.data).rotate().metadata();
  const hasAlpha = Boolean(meta.hasAlpha) && !(await sharp(stored.data).stats()).isOpaque;
  const aiCut = /\/ai-designs\//.test(el.src); // made by the design maker: it was cut out of a plain background
  const bg = dark ? "#000000" : "#ffffff";

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
    .resize(1536, 1536, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 95 })
    .toBuffer();

  let out;
  try {
    out = await generateImage({ prompt: printPrompt({ dark, plain: hasAlpha }), image: { data: small, mime: "image/jpeg" }, ratio, size: "4K" });
  } catch (err) {
    // Google refuses some pictures (well-known people) — then too: Grok can't make 4,000 px, so the original is printed
    if (err?.status === 422 || err?.noImage) {
      res.status(422);
      throw new Error(`The picture service won't enlarge this one (it refuses well-known people). Nothing was charged. It prints from the original picture (${meta.width} × ${meta.height} px).`);
    }
    throw err;
  }
  const big = await sharp(out.buffer).metadata();
  const keepW = Math.min(big.width, Math.round((big.width * meta.width) / sheetW));
  const keepH = Math.min(big.height, Math.round((big.height * meta.height) / sheetH));
  let picture = await sharp(out.buffer)
    .extract({ left: Math.floor((big.width - keepW) / 2), top: Math.floor((big.height - keepH) / 2), width: keepW, height: keepH })
    .png()
    .toBuffer();

  if (aiCut) {
    // same as when the design was first made: clear the plain background it was drawn on
    picture = (await cutOutPlainBackground(picture)).buffer;
  } else if (hasAlpha) {
    // the customer's own see-through picture: keep exactly its own outline (enlarged), so nothing inside it is cleared
    const alpha = await sharp(stored.data).rotate().ensureAlpha().extractChannel("alpha").resize(keepW, keepH, { kernel: "lanczos3" }).toBuffer();
    // (in two steps: asked for together, the old alpha is dropped AFTER the new one is joined, losing both)
    const colour = await sharp(picture).removeAlpha().png().toBuffer();
    picture = await sharp(colour).joinChannel(alpha).png().toBuffer();
  }
  // near-lossless WebP: a 4,000 px PNG can be larger than the picture store accepts
  const webp = await sharp(picture).webp({ quality: 96, alphaQuality: 100, effort: 4 }).toBuffer();
  const { url } = await uploadFile(webp, "image/webp", "print-pictures", "print.webp");

  const old = el.printSrc;
  el.printSrc = url;
  await design.save();
  if (old && old !== url) await deleteStoredFile(old).catch(() => {});
  const costInr = Math.round(settings.pricePerImageInr * PRINT_COST_FACTOR * 100) / 100;
  await AiUsage.create({ user: req.user._id, kind: "print", prompt: `Enlarge for print (design ${design._id}, picture ${Number(req.body.index) + 1})`, images: 1, costInr, model: aiImageModel() });
  res.status(201).json({ printSrc: url, width: keepW, height: keepH, costInr });
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
  const areas = (Array.isArray(req.body.areas) ? req.body.areas : []).slice(0, 24).map((a) => ({ key: String(a?.key || "").slice(0, 40), label: String(a?.label || "").slice(0, 60) }));
  try {
    const plan = await readPhotoRequest({ image: { data: small, mime: "image/jpeg" }, message: req.body.message, styles: Object.keys(AI_STYLES), photoStyles: Object.keys(PHOTO_STYLES), areas });
    res.json(plan);
  } catch (err) {
    res.status(err?.status === 503 ? 503 : 502);
    throw new Error("I couldn’t read the photo just now.");
  }
});
