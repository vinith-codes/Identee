// controllers/aiController.js
//
// The Design Room's "Make a design": a customer describes a picture, the
// image AI draws it, the pictures are stored in Cloudinary (identee/ai-designs)
// and their addresses go back to the assistant chat.
//
// Kept in check by three limits the admin can change (Admin → Settings → AI):
//   • requests per customer per day
//   • pictures per request
//   • a monthly spending cap — past it, the feature pauses until next month
//
// Customers may ask for anything (the shop owner's decision, 12 Oct 2026): this
// code does not filter subjects. The image AI still applies its own rules and
// may refuse some requests. The Review step tells the customer that ordering
// means they have the right to print the design.
import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import Setting from "../models/settingModel.js";
import AiUsage from "../models/aiUsageModel.js";
import Customization from "../models/customizationModel.js";
import GarmentType from "../models/garmentTypeModel.js";
import { uploadFile, deleteStoredFile } from "../utils/imageStorage.js";
import { cutOutPlainBackground, onPlainBackground } from "../services/cutoutService.js";
import { aiTextConfigured, planEdit, writeSlogans } from "../services/aiTextService.js";
import sharp from "sharp";
import { AI_STYLES, PHOTO_STYLES, aiImageConfigured, aiImageModel, changeDesignPrompt, generateImage, nearestRatio, newDesignPrompt, photoArtPrompt, FIX_KINDS, fixPrompt, printPrompt, RATIO_VALUES } from "../services/aiImageService.js";

const CATEGORY = "ai";
const DEFAULTS = {
  "ai.enabled": { value: true, type: "boolean", description: "Customers can make designs with AI" },
  "ai.dailyPerUser": { value: 5, type: "number", description: "Design requests one customer may make per day" },
  "ai.imagesPerRequest": { value: 3, type: "number", description: "Pictures shown for each new design request" },
  "ai.monthlyCapInr": { value: 2000, type: "number", description: "Monthly spending cap in rupees" },
  "ai.pricePerImageInr": { value: 2.9, type: "number", description: "What one picture costs, in rupees (for the spending figures)" },
};
const LIMITS = { "ai.dailyPerUser": [1, 50], "ai.imagesPerRequest": [1, 4], "ai.monthlyCapInr": [0, 1000000], "ai.pricePerImageInr": [0, 100] };


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
    pricePerImageInr: Number(get("ai.pricePerImageInr")),
  };
}
async function monthSpend() {
  const [row] = await AiUsage.aggregate([{ $match: { createdAt: { $gte: startOfMonth() } } }, { $group: { _id: null, cost: { $sum: "$costInr" }, images: { $sum: "$images" }, requests: { $sum: 1 } } }]);
  return { cost: row?.cost || 0, images: row?.images || 0, requests: row?.requests || 0 };
}
// Why the feature is off (null = it is on).
async function whyOff(settings) {
  if (!aiImageConfigured()) return "setup";
  if (!settings.enabled) return "off";
  if (settings.monthlyCapInr > 0 && (await monthSpend()).cost >= settings.monthlyCapInr) return "cap";
  return null;
}
const usedToday = (userId) => AiUsage.countDocuments({ user: userId, createdAt: { $gte: startOfDay() } });

// GET /api/ai/status  (login optional)
export const getAiStatus = asyncHandler(async (req, res) => {
  const settings = await readSettings();
  const reason = await whyOff(settings);
  const left = req.user ? Math.max(0, settings.dailyPerUser - (await usedToday(req.user._id))) : null;
  // text: the assistant can write slogans to order (same key; switched off together with the design maker)
  res.json({ available: !reason, reason, text: aiTextConfigured() && settings.enabled, styles: Object.keys(AI_STYLES), photoStyles: Object.keys(PHOTO_STYLES), dailyPerUser: settings.dailyPerUser, left });
});

// Only pictures this feature made may be sent back to be changed.
const isAiDesign = (url) => {
  const cloud = process.env.CLOUDINARY_NAME?.trim();
  const s = String(url || "");
  return (cloud && s.startsWith(`https://res.cloudinary.com/${cloud}/`) && s.includes("/identee/ai-designs/")) || /^\/uploads\/ai-designs\/[\w\-.]+$/.test(s);
};
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

// POST /api/ai/design  (login required)
// New design: { subject, style, teeColour, teeIsDark, ratio }
// Change one: { baseUrl, change, teeIsDark, ratio }
// -> { images: [{ url, width, height }], left }   (each picture already cut out of its background)
export const makeAiDesign = asyncHandler(async (req, res) => {
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

  const changing = Boolean(req.body.baseUrl);
  const fromPhoto = !changing && Boolean(req.body.photoUrl);
  // fixing a picture that is on the tee: make it sharper, or recolour it for this tee
  const fixing = !changing && !fromPhoto && Boolean(req.body.fixUrl) && FIX_KINDS.includes(req.body.fixKind);
  const text = fixing
    ? (req.body.fixKind === "recolour" ? "Recolour a picture for the tee" : "Make a picture sharper")
    : fromPhoto
    ? `Photo to art: ${PHOTO_STYLES[req.body.artStyle] ? req.body.artStyle : "Cartoon"}`
    : String((changing ? req.body.change : req.body.subject) || "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (text.length < 3) {
    res.status(400);
    throw new Error(changing ? "Tell me what to change." : "Describe what the design should show.");
  }
  let jobs;
  const teeName = String(req.body.teeColour || "white").replace(/[^\w \-]/g, "").slice(0, 30) || "white";
  if (fixing) {
    if (!isOurUpload(req.body.fixUrl)) {
      res.status(400);
      throw new Error("Upload the picture here first.");
    }
    const stored = await fetchOurImage(req.body.fixUrl, req);
    const dark = Boolean(req.body.teeIsDark);
    const flat = await sharp(stored.data).rotate().resize(1536, 1536, { fit: "inside", withoutEnlargement: true }).flatten({ background: dark ? "#000000" : "#ffffff" }).jpeg({ quality: 92 }).toBuffer();
    jobs = [generateImage({ prompt: fixPrompt({ kind: req.body.fixKind, teeColour: teeName, teeIsDark: dark }), image: { data: flat, mime: "image/jpeg" }, ratio: nearestRatio(req.body.ratio) })];
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
    jobs = Array.from({ length: of }, (_, i) =>
      generateImage({ prompt: photoArtPrompt({ style, teeColour: teeName, teeIsDark: Boolean(req.body.teeIsDark), variation: i + 1, of }), image: { data: small, mime: "image/jpeg" }, ratio: nearestRatio(req.body.ratio) }),
    );
  } else if (changing) {
    if (!isAiDesign(req.body.baseUrl)) {
      res.status(400);
      throw new Error("Only a design made here can be changed.");
    }
    // the stored design is a cut-out: put it back on its plain background for the AI
    const stored = await fetchOurImage(req.body.baseUrl, req);
    const image = { data: await onPlainBackground(stored.data, Boolean(req.body.teeIsDark)), mime: "image/jpeg" };
    jobs = [generateImage({ prompt: changeDesignPrompt(text), image, ratio: nearestRatio(req.body.ratio) })];
  } else {
    const style = AI_STYLES[req.body.style] ? req.body.style : "Bold mascot";
    const teeColour = teeName;
    // count: fewer options than usual (used when one message asks for pictures on several areas)
    const wanted = Number(req.body.count) > 0 ? Math.min(Number(req.body.count), settings.imagesPerRequest) : settings.imagesPerRequest;
    const of = Math.min(4, Math.max(1, wanted));
    jobs = Array.from({ length: of }, (_, i) =>
      generateImage({ prompt: newDesignPrompt({ subject: text, style, teeColour, teeIsDark: Boolean(req.body.teeIsDark), variation: i + 1, of }), ratio: nearestRatio(req.body.ratio) }),
    );
  }

  const results = await Promise.allSettled(jobs);
  const made = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
  if (!made.length) {
    const err = results[0].reason;
    res.status(err?.status || 502);
    throw new Error(err?.message || "The design maker had a problem. Please try again.");
  }
  // cut each design out of its plain background here, so "Add to tee" is instant in the Design Room
  const cut = await Promise.all(made.map((m) => cutOutPlainBackground(m.buffer).catch(() => ({ buffer: m.buffer, mime: m.mime, width: 1024, height: 1024, cut: false }))));
  const stored = await Promise.all(cut.map((c) => uploadFile(c.buffer, c.mime, "ai-designs")));

  await AiUsage.create({
    user: req.user._id,
    kind: fixing ? "fix" : fromPhoto ? "photo" : changing ? "change" : "new",
    prompt: text,
    style: fromPhoto ? req.body.artStyle : changing ? undefined : req.body.style,
    images: made.length,
    costInr: Math.round(made.length * settings.pricePerImageInr * 100) / 100,
    model: aiImageModel(),
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
    areas: (Array.isArray(d.areas) ? d.areas : []).slice(0, 20).map((a) => ({ key: str(a.key, 40), label: str(a.label, 40), free: Boolean(a.free) })),
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
    reason: await whyOff(settings),
    settings,
    month,
    recent: recent.map((r) => ({ when: r.createdAt, who: r.user?.name || r.user?.email || "Customer", kind: r.kind, prompt: r.prompt, images: r.images, costInr: r.costInr })),
  });
});

// PUT /api/ai/admin  (admin only): { enabled, dailyPerUser, imagesPerRequest, monthlyCapInr, pricePerImageInr }
export const saveAiAdmin = asyncHandler(async (req, res) => {
  const incoming = {
    "ai.enabled": req.body.enabled,
    "ai.dailyPerUser": req.body.dailyPerUser,
    "ai.imagesPerRequest": req.body.imagesPerRequest,
    "ai.monthlyCapInr": req.body.monthlyCapInr,
    "ai.pricePerImageInr": req.body.pricePerImageInr,
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
  if (settings.monthlyCapInr > 0 && (await monthSpend()).cost >= settings.monthlyCapInr) {
    res.status(503);
    throw new Error("This month's AI budget is used up. Raise it in Settings → AI designs to enlarge more pictures.");
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

  const out = await generateImage({ prompt: printPrompt({ dark, plain: hasAlpha }), image: { data: small, mime: "image/jpeg" }, ratio, size: "4K" });
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
