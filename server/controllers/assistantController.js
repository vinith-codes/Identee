// controllers/assistantController.js — Assistant v2 (7 Nov 2026, docs/ASSISTANT_V2_PLAN.md)
//
//   POST /api/ai/assist     the brain: the customer's message → { reply, steps, chips, memory? }   (login needed: guests get nothing)
//   POST /api/ai/concepts   one concept sheet: three numbered whole-tee concepts on one picture     (counts as one picture request, 1.5× the price)
//   POST /api/ai/develop    the artwork pieces of one concept, drawn from its sheet                  (counts as one picture request)
//
// The limits are the ones of the Design Room's picture maker (Admin → Settings → AI designs): per-customer daily
// requests, the monthly Google cap, the Grok cap. Google refusing a sheet or a piece hands it to Grok, as for drawings.
import asyncHandler from "express-async-handler";
import sharp from "sharp";
import AiUsage from "../models/aiUsageModel.js";
import AiChatUsage from "../models/aiChatUsageModel.js";
import Order from "../models/orderModel.js";
import { customerCancelMode } from "../services/orderCancel.js";
import { dayWords, deliveryFact, indiaDay } from "../utils/deliveryDates.js";
import { uploadFile } from "../utils/imageStorage.js";
import { cutOutPlainBackground, trimClearEdges } from "../services/cutoutService.js";
import { dropFrame, splitParts } from "../services/splitParts.js";
import { measureParts, measureSleeve } from "../services/photoMeasure.js";
import { rememberPictures } from "./myPictureController.js";
import { GROK_BEST, xaiConfigured, xaiEditImage, xaiModel, xaiNewImage } from "../services/xaiImageService.js";
import { AI_STYLES, PHOTO_STYLES, aiImageModel, generateImage, nearestRatio } from "../services/aiImageService.js";
import { brainConfigured, brainReply, CONCEPTS_PER_SHEET, MAX_PHOTOS, PIECES } from "../services/assistantBrain.js";
import { chatModel, MEMORY_MAX } from "../services/aiChatService.js";
import { developPrompt, matchPrompt, mockSheet, piecesOf, SHEET_COST_FACTOR, SHEET_RATIO, SHEET_SIZE, sheetPrompt, tryOnPrompt, tryOnSidePrompt, WORN_SIDES, wornPrompt } from "../services/conceptSheets.js";
import User from "../models/userModel.js";
import { DESIGN_SIZE, designPictureCost, googleCapped, grokCapped, isOurUpload, noPicturesLeft, readSettings, usedToday, whyOff } from "./aiController.js";
import { expectedWords, missingWords, readWords, wordCheckReady } from "../services/wordCheck.js";
import { AI_AREAS_MAX, spotWhereOf } from "../data/printPositions.js";

const PROMPT_MAX = 2000;
const mockImages = () => process.env.AI_IMAGE_PROVIDER?.trim() === "mock";

const settings = () => readSettings(); // the same keys and defaults as the Design Room's picture maker
const startOfMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};
async function monthSpend() {
  const rows = await AiUsage.aggregate([{ $match: { createdAt: { $gte: startOfMonth() } } }, { $group: { _id: { $regexMatch: { input: { $ifNull: ["$model", ""] }, regex: /^grok/ } }, cost: { $sum: "$costInr" } } }]);
  const of = (grok) => rows.find((r) => r._id === grok)?.cost || 0;
  return { google: { cost: of(false) }, grok: { cost: of(true) } };
}
const fetchOurImage = async (url, req) => {
  const abs = /^https?:/.test(url) ? url : `${req.protocol}://${req.get("host")}${url}`;
  const r = await fetch(abs);
  if (!r.ok) throw Object.assign(new Error("That picture can't be read."), { status: 400 });
  return { data: Buffer.from(await r.arrayBuffer()), mime: r.headers.get("content-type") || "image/jpeg" };
};

const text = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
// (17 Nov 2026) a list of the customer's own uploads (several pictures mixed into one design): at most 6, no repeats
const ourUrls = (list) => [...new Set((Array.isArray(list) ? list : []).map(String).filter(isOurUpload))].slice(0, MAX_PHOTOS);
// a picture made small enough for the AI, on a white background
const smallCopy = async (pic, px) => ({ data: await sharp(pic.data).rotate().resize(px, px, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toBuffer(), mime: "image/jpeg" });
const conceptIn = (c) => ({
  title: text(c?.title, 50),
  front: c?.front ? text(c.front, 300) : null,
  back: c?.back ? text(c.back, 300) : null,
  sleeve: c?.sleeve ? text(c.sleeve, 200) : null,
  // (21 Nov 2026) the right sleeve, when both sleeves carry prints
  sleeve2: c?.sleeve && c?.sleeve2 ? text(c.sleeve2, 200) : null,
  colours: text(c?.colours, 80),
  style: AI_STYLES[c?.style] ? c.style : null,
});

// POST /api/ai/assist
// { message, history, earlier, memory, design, facts, areas, sheets } -> { reply, steps, chips, memory? }
export const makeAssist = asyncHandler(async (req, res) => {
  const s = await settings();
  if (!s.enabled || !s.smartChat || !brainConfigured()) {
    res.status(503);
    throw new Error("The Assistant is off just now.");
  }
  if (googleCapped(s, await monthSpend())) {
    res.status(503);
    throw new Error("The Assistant is taking a break until next month.");
  }
  const message = text(req.body?.message, PROMPT_MAX);
  if (message.length < 1) {
    res.status(400);
    throw new Error("Type a message.");
  }
  const said = (list, n) =>
    (Array.isArray(list) ? list : [])
      .slice(-n)
      .map((h) => ({ who: h?.who === "customer" ? "customer" : "assistant", text: String(h?.text || "").slice(0, 500) }))
      .filter((h) => h.text);
  const areas = (Array.isArray(req.body?.areas) ? req.body.areas : [])
    .slice(0, AI_AREAS_MAX) // (every place a garment can offer: none is silently left out)
    .map((a) => ({ key: text(a?.key, 40), label: text(a?.label, 60), free: a?.free !== false, ...spotWhereOf(a) }))
    .filter((a) => a.key);
  const sheets = (Array.isArray(req.body?.sheets) ? req.body.sheets : [])
    .slice(-8)
    .map((sh, i) => ({
      n: i + 1,
      brief: text(sh?.brief, 200),
      concepts: (Array.isArray(sh?.concepts) ? sh.concepts : []).slice(0, CONCEPTS_PER_SHEET).map((c, j) => ({ n: Number(c?.n) || i * CONCEPTS_PER_SHEET + j + 1, title: text(c?.title, 50) })),
      developed: (Array.isArray(sh?.developed) ? sh.developed : []).map(Number).filter(Number.isInteger).slice(0, 12),
    }));
  const FACT_KEYS = ["garment", "teeColour", "teeColours", "size", "sizes", "price", "wasPrice", "pictureAddOn", "shipping", "offer", "picturesLeft", "canDraw", "pieces"];
  const given = req.body?.facts && typeof req.body.facts === "object" ? req.body.facts : {};
  const facts = Object.fromEntries(
    FACT_KEYS.filter((k) => given[k] !== undefined && given[k] !== null).map((k) => [k, Array.isArray(given[k]) ? given[k].slice(0, 20).map((x) => String(x).slice(0, 40)) : typeof given[k] === "number" || typeof given[k] === "boolean" ? given[k] : String(given[k]).slice(0, 200)]),
  );
  const left = Math.max(0, s.dailyPerUser - (await usedToday(req.user._id)));
  // a picture sent with this message, and the logo on file in this chat (only our own uploads)
  // (21 Nov 2026) photoEarlier: a picture sent with an earlier message and not used yet — the answer is about it
  const sentNow = req.body?.photo?.url && isOurUpload(String(req.body.photo.url)) ? { url: String(req.body.photo.url), about: text(req.body.photo.about, 200) } : null;
  const waiting = !sentNow && req.body?.photoEarlier?.url && isOurUpload(String(req.body.photoEarlier.url)) ? { url: String(req.body.photoEarlier.url), about: text(req.body.photoEarlier.about, 200), earlier: true } : null;
  const attached = sentNow || waiting;
  const logo = req.body?.logoUrl && isOurUpload(String(req.body.logoUrl)) ? String(req.body.logoUrl) : null;
  // (17 Nov 2026) several pictures with this message (or still waiting from the last one: photosEarlier) — only our own
  // uploads, at most 6. The real brain is shown small copies of them all, so it can look at them together.
  const photos = (Array.isArray(req.body?.photos) ? req.body.photos : [])
    .filter((p) => p?.url && isOurUpload(String(p.url)))
    .slice(0, MAX_PHOTOS)
    .map((p) => ({ url: String(p.url), about: text(p.about, 200) }));
  if (photos.length > 1 && process.env.AI_CHAT_PROVIDER?.trim() !== "mock") {
    const small = await Promise.all(photos.map((p) => fetchOurImage(p.url, req).then((pic) => smallCopy(pic, 768)).catch(() => null)));
    small.forEach((im, i) => {
      if (im) photos[i].image = im;
    });
  }
  // (21 Nov 2026) ONE picture is shown to the brain too (it used to get only the customer's words about it, so a whole
  // tee sent with "like this" was taken for a logo): a 1,024 px copy, so the small prints on a tee can be read
  const one = attached || (photos.length === 1 && !req.body?.photosEarlier ? { ...photos[0] } : null);
  if (one && process.env.AI_CHAT_PROVIDER?.trim() !== "mock") {
    const im = await fetchOurImage(one.url, req)
      .then((pic) => smallCopy(pic, 1024))
      .catch(() => null);
    if (im) one.image = im;
  }
  // what we know about this customer from earlier visits (round 5, 8 Nov 2026) — kept on their account
  const profile = String((await User.findById(req.user._id).select("aiProfile").lean().catch(() => null))?.aiProfile || "").slice(0, 400);
  // round 8 (11 Nov 2026): the delivery dates, worked out here, and the customer's own last orders
  const delivery = deliveryFact({ makingDays: s.makingDays, teamMakingDays: s.teamMakingDays, shippingDays: s.shippingDays });
  const orders = await myOrdersFact(req.user._id);
  let answer;
  try {
    answer = await brainReply({
      profile,
      message,
      history: said(req.body?.history, 14),
      earlier: said(req.body?.earlier, 40),
      memory: String(req.body?.memory || "").slice(0, MEMORY_MAX),
      design: req.body?.design || {},
      facts: { ...facts, loggedIn: true, picturesLeft: left, delivery, orders },
      areas,
      styles: Object.keys(AI_STYLES),
      sheets,
      // (one picture goes as `attached`, exactly as before; two or more as `photos`)
      attached: one,
      logo,
      photos: photos.length > 1 ? photos : [],
      photosEarlier: Boolean(req.body?.photosEarlier),
      photoStyles: Object.keys(PHOTO_STYLES),
    });
  } catch (err) {
    console.error("💥 ERROR: Assistant v2 failed:", err?.message || err);
    res.status(err.status === 503 ? 503 : 502);
    throw new Error("The Assistant couldn’t answer just now.");
  }
  await AiChatUsage.create({ user: req.user._id, costInr: s.chatPricePerMessageInr, model: chatModel() }).catch(() => {});
  if (answer.memory) await AiChatUsage.create({ user: req.user._id, costInr: s.chatPricePerMessageInr, model: chatModel(), kind: "memory" }).catch(() => {});
  if (answer.profile) await User.updateOne({ _id: req.user._id }, { $set: { aiProfile: answer.profile } }).catch(() => {});
  const { profile: _kept, ...sent } = answer; // eslint-disable-line no-unused-vars
  res.json({ ...sent, left });
});

// The customer's last orders, as the Assistant may talk about them: number, day, status in plain words, what was in
// it, and whether a cancel can still be asked for. No addresses, no payment details.
const STATUS_WORDS = { CREATED: "placed", CONFIRMED: "confirmed, being made", PACKED: "packed", OUT_FOR_DELIVERY: "out for delivery", DELIVERED: "delivered", CANCELLED: "cancelled" };
export async function myOrdersFact(userId) {
  const rows = await Order.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(5)
    .select("invoiceNumber orderStatus createdAt totalPrice orderItems.name orderItems.qty orderItems.size orderItems.customization cancelRequest printFiles.sentAt refund.status")
    .lean()
    .catch(() => []);
  return rows.map((o) => ({
    no: o.invoiceNumber || String(o._id).slice(-6).toUpperCase(),
    placed: dayWords(indiaDay(o.createdAt)),
    status: STATUS_WORDS[o.orderStatus] || String(o.orderStatus || "").toLowerCase(),
    total: o.totalPrice,
    items: (o.orderItems || []).slice(0, 4).map((i) => `${i.qty} × ${String(i.name || "").slice(0, 40)} (${i.size})`).join(", "),
    ownDesign: (o.orderItems || []).some((i) => i.customization),
    cancel: { now: "can still be cancelled", ask: "a cancel request can be sent", asked: "cancel request sent, waiting for the shop" }[customerCancelMode(o)] || "can no longer be cancelled",
    ...(o.refund?.status ? { refund: o.refund.status } : {}),
  }));
}

// the checks every picture request makes: the feature on, the caps, the customer's daily limit
async function mayDraw(req, res) {
  const s = await settings();
  const reason = await whyOff(s);
  if (reason) {
    res.status(503);
    throw new Error(reason === "cap" ? "The design maker is taking a break until next month. You can still use the art library or upload your own picture." : "The design maker is not available right now.");
  }
  const used = await usedToday(req.user._id);
  if (used >= s.dailyPerUser) {
    res.status(429);
    throw new Error(noPicturesLeft(s.dailyPerUser, s.dailyPerUser - used));
  }
  return { s, used };
}

// Google refused (a named person, a protected character) → Grok, when it is set up and under its cap
// (21 Nov 2026, laptop checks only) AI_MOCK_PIECES = {"front": "file", "back": "file", ...}: those pieces come from
// pictures saved from an earlier paid run instead of the picture AI — no cost. A saved one that was already cut out is
// put back on the magenta key colour first, so the cut-out, splitting and measuring all run as on a fresh drawing.
// Never set on the live server.
function mockPieceFile(piece) {
  try {
    const map = JSON.parse(process.env.AI_MOCK_PIECES?.trim() || "{}");
    return typeof map?.[piece] === "string" ? map[piece] : null;
  } catch {
    return null;
  }
}
async function replayPiece(file) {
  const { readFile } = await import("fs/promises");
  const saved = await readFile(file);
  const meta = await sharp(saved).metadata();
  if (!meta.hasAlpha) return { made: { buffer: saved, mime: meta.format === "png" ? "image/png" : "image/jpeg" }, byGrok: false };
  const buffer = await sharp(saved).flatten({ background: { r: 255, g: 0, b: 255 } }).png().toBuffer();
  return { made: { buffer, mime: "image/png" }, byGrok: false };
}

async function withGrok(settings, googleJob, grokJob, what) {
  try {
    return { made: await googleJob(), byGrok: false };
  } catch (err) {
    const refused = err?.status === 422 || err?.noImage === true;
    const grokReady = refused && xaiConfigured() && !grokCapped(settings, await monthSpend());
    if (refused) console.log(`[ai:v2] Google refused the ${what}; Grok: ${!xaiConfigured() ? "not set up" : !grokReady ? "monthly cap reached" : "taking over"}`);
    if (!grokReady) throw err;
    try {
      return { made: await grokJob(), byGrok: true };
    } catch (e2) {
      console.error("[ai:xai] Grok didn't make it:", e2?.status || "", e2?.message || e2);
      throw err;
    }
  }
}

// POST /api/ai/concepts
// { concepts: [3 × { title, front, back, sleeve, colours, style }], brief, garment, teeColour, teeIsDark, numberFrom }
// -> { sheet: { url, width, height, numberFrom, concepts }, left }
export const makeConcepts = asyncHandler(async (req, res) => {
  const { s, used } = await mayDraw(req, res);
  const concepts = (Array.isArray(req.body?.concepts) ? req.body.concepts : []).map(conceptIn).filter((c) => c.title && (c.front || c.back || c.sleeve)).slice(0, CONCEPTS_PER_SHEET);
  // (21 Nov 2026) refUrl: the customer's picture of a whole tee, the concepts made LIKE it — the reference picture
  const refUrl = req.body?.refUrl && isOurUpload(String(req.body.refUrl)) ? String(req.body.refUrl) : null;
  // inspired: NEW designs with that picture's feel, not a copy of it ("new inspired designs")
  const inspired = Boolean(refUrl) && req.body?.inspired === true;
  if (concepts.length < 2) {
    res.status(400);
    throw new Error("Tell me what the concepts should show.");
  }
  const garment = text(req.body?.garment, 40) || "t-shirt";
  const teeColour = text(req.body?.teeColour, 30).replace(/[^\w \-]/g, "") || "white";
  const teeIsDark = Boolean(req.body?.teeIsDark);
  const numberFrom = Math.max(1, Math.min(97, Number(req.body?.numberFrom) || 1));
  // the customer's own logo / artwork (one of our uploads): sent with the instruction, printed exactly as it is
  // (17 Nov 2026) logoUrls: several of the customer's pictures mixed into one design — all sent, numbered in order
  // (a reference tee is the one picture sent: no logo, no other basis with it)
  const logoUrls = refUrl ? [] : ourUrls(req.body?.logoUrls);
  const logoUrl = refUrl || logoUrls.length > 1 ? null : logoUrls[0] || (req.body?.logoUrl && isOurUpload(String(req.body.logoUrl)) ? String(req.body.logoUrl) : null);
  // colourways / variations (round 5): the picture already on the tee goes as the reference instead
  const basisUrl = !refUrl && !logoUrl && logoUrls.length < 2 && req.body?.basisUrl && isOurUpload(String(req.body.basisUrl)) ? String(req.body.basisUrl) : null;
  const logos = logoUrls.length > 1 ? await Promise.all(logoUrls.map(async (u) => smallCopy(await fetchOurImage(u, req), 1024))) : [];
  const one = refUrl || logoUrl || basisUrl;
  const logo = logos[0] || (one ? await smallCopy(await fetchOurImage(one, req), refUrl ? 1536 : 1024) : null);
  const prompt = sheetPrompt({ concepts, garment, teeColour, teeIsDark, numberFrom, logo: Boolean(logoUrl), basis: Boolean(basisUrl), pictures: logos.length, reference: Boolean(refUrl), inspired });
  const { made, byGrok } = mockImages()
    ? { made: await mockSheet(concepts, { teeColour, numberFrom }), byGrok: false }
    : await withGrok(
        s,
        () => generateImage({ prompt, images: logos.length ? logos : logo ? [logo] : [], ratio: SHEET_RATIO, size: SHEET_SIZE }),
        () => (logo ? xaiEditImage({ prompt, image: logo, resolution: GROK_BEST }) : xaiNewImage({ prompt, ratio: SHEET_RATIO, resolution: GROK_BEST })),
        "concept sheet",
      );
  const meta = await sharp(made.buffer).metadata();
  const stored = await uploadFile(made.buffer, made.mime, "ai-concepts");
  await AiUsage.create({
    user: req.user._id,
    kind: "sheet",
    prompt: text(req.body?.brief, PROMPT_MAX) || concepts.map((c) => c.title).join(", "),
    images: 1,
    costInr: Math.round((byGrok ? s.grokPricePerImageInr : s.pricePerImageInr * SHEET_COST_FACTOR) * 100) / 100,
    model: byGrok ? xaiModel() : aiImageModel(),
    // the sheet itself, so the admin can feature it in Browse ideas (round 7)
    sheet: { url: stored.url, width: meta.width || 1536, height: meta.height || 864, brief: text(req.body?.brief, 400), concepts, teeColour, teeIsDark, logo: Boolean(logoUrl || basisUrl || refUrl || logos.length) },
  });
  res.status(201).json({
    sheet: { url: stored.url, width: meta.width || 1536, height: meta.height || 864, numberFrom, concepts: concepts.map((c, i) => ({ n: numberFrom + i, ...c })), byGrok, logoUrl: logoUrl || null, ...(logos.length ? { logoUrls } : {}), ...(refUrl ? { refUrl, ...(inspired ? { inspired: true } : {}) } : {}) },
    left: Math.max(0, s.dailyPerUser - used - 1),
  });
});

// POST /api/ai/develop
// { sheetUrl, n, concept: { title, front, back, sleeve, colours, style }, pieces?: ["front"|"back"|"sleeve"], teeColour, teeIsDark, ratios?: { front, back, sleeve } }
// -> { pieces: [{ piece, url, width, height }], left }   (one picture per piece, drawn in parallel; a refused piece goes to Grok)
// (21 Nov 2026) layout?: ["front"|"back"] laid-out sides, layoutCm?: { front: print area width }, freePlaces?: the free
// places the tee has left — a laid-out piece also comes with parts: [{ url, width, height, x, y, w, h }] (x … h: 0–1
// of the whole picture) when it has 2 or more separate parts
// parts of a laid-out side closer than this (cm) stay one print: with the 0.5 cm round each print's box, every two
// prints are then at least JOIN_CM (1 cm) apart, so none is pressed together with another
export const SPLIT_GAP_CM = 2;
export const makeDevelop = asyncHandler(async (req, res) => {
  const { s, used } = await mayDraw(req, res);
  const sheetUrl = String(req.body?.sheetUrl || "");
  if (!isOurUpload(sheetUrl)) {
    res.status(400);
    throw new Error("Make the concept sheet here first.");
  }
  const concept = conceptIn(req.body?.concept);
  const n = Math.max(1, Math.min(99, Number(req.body?.n) || 1));
  const wanted = (Array.isArray(req.body?.pieces) ? req.body.pieces : []).filter((p) => PIECES.includes(p));
  const pieces = (wanted.length ? wanted : piecesOf(concept)).filter((p) => concept[p]);
  // (21 Nov 2026) the pieces the page puts on a side's whole print area as a laid-out side (front / back only)
  const layout = (Array.isArray(req.body?.layout) ? req.body.layout : []).filter((p) => p === "front" || p === "back");
  // (21 Nov 2026) ... and how wide that print area is (cm) and how many free places the tee has left: a laid-out side is
  // cut into its separate parts, each its own print anywhere on the tee
  const layoutCm = req.body?.layoutCm && typeof req.body.layoutCm === "object" ? req.body.layoutCm : {};
  const freePlaces = Math.max(0, Math.min(8, Number(req.body?.freePlaces ?? 8) || 0));
  if (!concept.title || !pieces.length) {
    res.status(400);
    throw new Error("That concept has nothing to print.");
  }
  // (16 Nov 2026) each piece is a picture of the day's limit: all of them must fit
  if (s.dailyPerUser - used < pieces.length) {
    res.status(429);
    throw new Error(noPicturesLeft(s.dailyPerUser, s.dailyPerUser - used, pieces.length));
  }
  const teeIsDark = Boolean(req.body?.teeIsDark);
  const teeColour = text(req.body?.teeColour, 30).replace(/[^\w \-]/g, ""); // (its own colour is left out of the inks)
  const ratios = req.body?.ratios && typeof req.body.ratios === "object" ? req.body.ratios : {};
  const change = text(req.body?.change, 300); // "with the text in gold" — asked together with the pick
  const image = await smallCopy(await fetchOurImage(sheetUrl, req), 2048);
  // (17 Nov 2026) a sheet that mixed several of the customer's pictures: all of them go along again, in order
  const logoUrls = ourUrls(req.body?.logoUrls);
  const logoUrl = logoUrls.length ? null : req.body?.logoUrl && isOurUpload(String(req.body.logoUrl)) ? String(req.body.logoUrl) : null;
  const logos = logoUrls.length ? await Promise.all(logoUrls.map(async (u) => smallCopy(await fetchOurImage(u, req), 1024))) : [];
  const logo = logos[0] || (logoUrl ? await smallCopy(await fetchOurImage(logoUrl, req), 1024) : null);
  // (21 Nov 2026) a sheet made LIKE the customer's picture of a whole tee: that picture goes along again, so each
  // piece keeps its look (the lettering, the brush strokes) — never with a logo
  const refUrl = !logo && req.body?.refUrl && isOurUpload(String(req.body.refUrl)) ? String(req.body.refUrl) : null;
  const ref = refUrl ? await smallCopy(await fetchOurImage(refUrl, req), 1536) : null;
  const ratioOf = Object.fromEntries(pieces.map((piece) => [piece, nearestRatio(Number(ratios[piece]) || (/^sleeve/.test(piece) ? 0.75 : 1))]));
  const drawPiece = (piece, extraChange = null) => {
    const saved = mockPieceFile(piece); // (laptop checks only — see mockPieceFile)
    if (saved) return replayPiece(saved);
    const prompt = developPrompt({ concept, n, piece, teeColour, teeIsDark, logo: Boolean(logo) && logos.length < 2, pictures: logos.length > 1 ? logos.length : 0, reference: Boolean(ref), layout: layout.includes(piece), change: [change, extraChange].filter(Boolean).join(". ") || null });
    return withGrok(
      s,
      // (the pieces go on the customer's tee: drawn at 4K since 15 Nov 2026; the sheet itself stays SHEET_SIZE)
      () => generateImage({ prompt, image, images: logos.length ? logos : logo ? [logo] : ref ? [ref] : [], ratio: ratioOf[piece], size: DESIGN_SIZE }),
      () => xaiEditImage({ prompt, image, ratio: ratioOf[piece], resolution: GROK_BEST }),
      `${piece} of concept ${n}${extraChange ? " (spelling)" : ""}`,
    );
  };
  const results = await Promise.allSettled(pieces.map((piece) => drawPiece(piece).then((r) => ({ piece, ...r }))));
  const made = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
  // the words in each piece are read back (round 4, 8 Nov 2026): a piece with a misspelt word is drawn once more,
  // with the spelling spelt out — about a chat message's cost per check, one more picture when it was wrong
  let checks = 0;
  let redraws = 0;
  if (made.length && process.env.AI_CHAT_PROVIDER?.trim() !== "mock" && wordCheckReady()) {
    await Promise.all(
      made.map(async (m) => {
        const expected = expectedWords(concept[m.piece]);
        if (!expected.length) return;
        checks++;
        // (a 4K piece is read from a 1,536 px copy, 15 Nov 2026: the words read the same, the text AI's bill stays small)
        const copy = await smallCopy({ data: m.made.buffer, mime: m.made.mime }, 1536).catch(() => ({ data: m.made.buffer, mime: m.made.mime }));
        const seen = await readWords(copy.data, copy.mime);
        if (!seen) return;
        const missing = missingWords(expected, seen);
        if (!missing.length) return;
        console.log(`[ai:v2] concept ${n} ${m.piece}: ${missing.map((w) => `"${w}"`).join(", ")} not read in the picture (saw ${JSON.stringify(seen).slice(0, 120)}) — drawing it again`);
        const redo = await drawPiece(m.piece, `Spell these words exactly, letter by letter, large and clear: ${missing.map((w) => `"${w}"`).join(", ")}`).catch(() => null);
        if (!redo) return;
        redraws++;
        m.made = redo.made;
        m.byGrok = redo.byGrok;
        m.redrawn = missing;
      }),
    );
  }
  if (!made.length) {
    const err = results[0].reason;
    res.status(err?.status || 502);
    throw new Error(err?.status === 422 ? "The picture service refused this concept. It usually refuses real, named people and some well-known characters. Try another concept, or describe it without the name." : err?.message || "The design maker had a problem. Please try again.");
  }
  // cut each piece out of its plain background, as the Design Room's own drawings are, then drop the empty space
  // around the artwork so the piece is only the artwork (its size on the tee, and "make it bigger", follow the artwork)
  const cut = await Promise.all(
    made.map((m) =>
      cutOutPlainBackground(m.made.buffer)
        // (a laid-out side keeps its empty space: it IS the layout, the picture's edges are the print area's — 21 Nov 2026)
        .then((c) => (layout.includes(m.piece) ? dropFrame(c) : trimClearEdges(c)))
        .catch(() => ({ buffer: m.made.buffer, mime: m.made.mime, width: 1024, height: 1024, cut: false })),
    ),
  );
  const stored = await Promise.all(cut.map((c) => uploadFile(c.buffer, c.mime, "ai-designs")));
  // (21 Nov 2026) a laid-out side in its separate parts (the chest logo, the strokes with their words, the hem tag), each
  // cut straight out of the 4K picture — the page puts each in a free place where it sits; the whole picture stays too.
  // Each part is also found on the concept sheet the customer picked from (photoMeasure.js), so it goes where it is
  // THERE — the picture AI puts the parts only roughly in place (a chest logo 11 cm low on the first test)
  let measured = 0;
  const split = await Promise.all(
    made.map(async (m, i) => {
      // (a side with one print is measured too: the back of a live test, one tall print, wasn't — 21 Nov 2026)
      if (!layout.includes(m.piece) || !cut[i].cut || freePlaces < 1) return null;
      const widthCm = Math.max(5, Math.min(80, Number(layoutCm[m.piece]) || 35));
      const r = await splitParts(cut[i].buffer, { widthCm, gapCm: SPLIT_GAP_CM, maxParts: freePlaces, minParts: 1 }).catch((err) => {
        console.log(`[ai:v2] concept ${n} ${m.piece}: not split (${err.message})`);
        return null;
      });
      if (!r) return null;
      if (r.dropped) console.log(`[ai:v2] concept ${n} ${m.piece}: ${r.dropped} stray speck(s) left out of the parts`);
      // each part is found on the concept the customer picked, on the sheet they picked it from ("the customer expects
      // the output as like in the mockup", 21 Nov 2026) — a part inside the collar ring is left off: our label goes there
      const shape = r.parts[0] ? r.parts[0].width / r.parts[0].w / (r.parts[0].height / r.parts[0].h) : 1; // the laid-out picture's width / height
      const place = await measureParts(image, r.parts.map((p) => p.buffer), m.piece, { concept: n, layout: r.parts.map(({ x, y, w, h }) => ({ x, y, w, h })), aspect: shape }).finally(() => measured++);
      const keep = r.parts.map((p, k) => k).filter((k) => !place?.at[k]?.inCollar);
      if (keep.length < r.parts.length) console.log(`[ai:v2] concept ${n} ${m.piece}: ${r.parts.length - keep.length} part(s) inside the collar left off (the neck label goes there)`);
      console.log(`[ai:v2] concept ${n} ${m.piece}: ${place ? `${place.at.filter((a) => a && !a.inCollar).length} of ${keep.length} parts found on the sheet (${place.how})` : "the sheet could not be measured — the parts stay as drawn"}`);
      if (!keep.length) return null;
      const up = await Promise.all(keep.map((k) => uploadFile(r.parts[k].buffer, r.parts[k].mime, "ai-designs")));
      return keep.map((k, j) => { const p = r.parts[k]; return { url: up[j].url, width: p.width, height: p.height, x: p.x, y: p.y, w: p.w, h: p.h, ...(place?.at[k] ? { at: place.at[k] } : {}) }; });
    }),
  );
  // (21 Nov 2026) each sleeve piece is found on the concept too: where it sits along its sleeve (the sheet's inset)
  const sleevePlace = await Promise.all(
    made.map(async (m, i) => {
      if (!/^sleeve/.test(m.piece) || !cut[i].cut) return null;
      const place = await measureSleeve(image, cut[i].buffer, m.piece, { concept: n, both: Boolean(concept.sleeve2) }).finally(() => measured++);
      return place;
    }),
  );
  const byGrok = made.some((m) => m.byGrok);
  await AiUsage.create({
    user: req.user._id,
    kind: "develop",
    prompt: `Concept ${n}: ${concept.title}${change ? ` — ${change}` : ""}${checks ? ` (words checked${redraws ? `, ${redraws} redrawn` : ""})` : ""}`.slice(0, PROMPT_MAX),
    style: concept.style || undefined,
    images: made.length + redraws,
    counted: made.length,
    ...(made.some((m) => m.byGrok) ? { grokUrls: stored.filter((_, i) => made[i].byGrok).map((st) => st.url) } : {}), // the day's limit counts the pieces made; the automatic redraws are free (16 Nov 2026)
    costInr: Math.round((made.reduce((sum, m) => sum + (m.byGrok ? s.grokPricePerImageInr : designPictureCost(s)) * (m.redrawn ? 2 : 1), 0) + (checks + measured) * (s.chatPricePerMessageInr || 0)) * 100) / 100,
    model: byGrok ? xaiModel() : aiImageModel(),
  });
  await rememberPictures(
    req.user._id,
    stored.map((st, i) => ({ url: st.url, kind: "ai", about: `${concept.title} — ${made[i].piece} (concept ${n})`, style: concept.style || "", width: cut[i].width, height: cut[i].height })),
  );
  res.status(201).json({
    pieces: stored.map((st, i) => ({ piece: made[i].piece, url: st.url, width: cut[i].width, height: cut[i].height, byGrok: made[i].byGrok, ...(made[i].redrawn ? { redrawn: made[i].redrawn } : {}), ...(split[i] ? { parts: split[i] } : {}), ...(sleevePlace[i] ? { place: sleevePlace[i] } : {}) })),
    failed: results.filter((r) => r.status === "rejected").map((r, i) => pieces.filter((p) => !made.some((m) => m.piece === p))[i]).filter(Boolean),
    left: Math.max(0, s.dailyPerUser - used - made.length),
  });
});

// POST /api/ai/match  (round 5, 8 Nov 2026): a companion piece drawn from the picture already on the tee
// { fromUrl (one of our uploads), fromLabel?, piece: "back"|"sleeve"|"front", brief, teeColour, teeIsDark, ratio? }
// -> { piece: { piece, url, width, height, byGrok }, left }
export const makeMatch = asyncHandler(async (req, res) => {
  const { s, used } = await mayDraw(req, res);
  const fromUrl = String(req.body?.fromUrl || "");
  if (!isOurUpload(fromUrl)) {
    res.status(400);
    throw new Error("Put a picture on the tee first, then I can draw a matching piece from it.");
  }
  const piece = PIECES.includes(req.body?.piece) ? req.body.piece : "back";
  const brief = text(req.body?.brief, 400);
  const teeColour = text(req.body?.teeColour, 30).replace(/[^\w \-]/g, "") || "white";
  const teeIsDark = Boolean(req.body?.teeIsDark);
  const ratio = nearestRatio(Number(req.body?.ratio) || (/^sleeve/.test(piece) ? 0.75 : 1));
  const image = await smallCopy(await fetchOurImage(fromUrl, req), 1536);
  const prompt = matchPrompt({ piece, from: text(req.body?.fromLabel, 40) || "the front", brief, teeColour, teeIsDark });
  const { made, byGrok } = mockImages()
    ? { made: await mockPiece(piece), byGrok: false }
    : await withGrok(
        s,
        () => generateImage({ prompt, image, ratio, size: DESIGN_SIZE }), // (a piece for the tee: 4K, 15 Nov 2026)
        () => xaiEditImage({ prompt, image, ratio, resolution: GROK_BEST }),
        `matching ${piece}`,
      );
  const cut = await cutOutPlainBackground(made.buffer).then(trimClearEdges).catch(() => ({ buffer: made.buffer, mime: made.mime, width: 1024, height: 1024, cut: false }));
  const stored = await uploadFile(cut.buffer, cut.mime, "ai-designs");
  await AiUsage.create({ user: req.user._id, kind: "match", prompt: `Matching ${piece}: ${brief}`.slice(0, PROMPT_MAX), images: 1, costInr: byGrok ? s.grokPricePerImageInr : designPictureCost(s), model: byGrok ? xaiModel() : aiImageModel(), ...(byGrok ? { grokUrls: [stored.url] } : {}) });
  await rememberPictures(req.user._id, [{ url: stored.url, kind: "ai", about: `matching ${piece} — ${brief}`.slice(0, 200), width: cut.width, height: cut.height }]);
  res.status(201).json({ piece: { piece, url: stored.url, width: cut.width, height: cut.height, byGrok }, left: Math.max(0, s.dailyPerUser - used - 1) });
});

// Photo of it worn / Try it on me on every printed side (17 Nov 2026, the owner: "it must show all sides where the
// prints are available"). The Review step asks once per printed side — the first side first, so the customer sees
// it at once — and sends the first photo made back as `ref` with the other sides: the AI then keeps the same person,
// place and light. Each side is one picture of the day's 10 and one AiUsage row, as before.
const wornSideOf = (v) => (WORN_SIDES.includes(v) ? v : "front");
const SIDE_NAME = { front: "front", back: "back", left: "left side", right: "right side" };
const pictureIn = (v) => {
  const m = String(v || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  return m && m[2].length <= 8_000_000 ? { data: Buffer.from(m[2], "base64"), mime: m[1] } : null;
};
// the first photo of this set (one of our uploads), small, for the AI to keep the same person; none → null
async function firstPhotoOf(req, res) {
  const url = String(req.body?.ref || "");
  if (!url) return null;
  if (!isOurUpload(url)) {
    res.status(400);
    throw new Error("The first photo couldn’t be found. Close the photo and try again.");
  }
  return smallCopy(await fetchOurImage(url, req), 1024);
}

// POST /api/ai/worn  (round 5, 8 Nov 2026): a lifestyle photo of the finished tee on a person, for sharing
// { image: data URL of the tee's mock-up from that side (from Review), side?: "front"|"back"|"left"|"right",
//   ref?: the url of the first photo of this set (17 Nov 2026), garment, teeColour, setting? } -> { url, width, height, side, left }
export const makeWorn = asyncHandler(async (req, res) => {
  const { s, used } = await mayDraw(req, res);
  const tee = pictureIn(req.body?.image);
  if (!tee) {
    res.status(400);
    throw new Error("The picture of the tee is missing. Open Review and try again.");
  }
  const side = wornSideOf(req.body?.side);
  const image = await smallCopy(tee, 1536);
  const ref = await firstPhotoOf(req, res);
  const words = { garment: text(req.body?.garment, 40) || "t-shirt", teeColour: text(req.body?.teeColour, 30).replace(/[^\w \-]/g, "") || "white", setting: text(req.body?.setting, 80), side };
  const prompt = wornPrompt({ ...words, sameAs: Boolean(ref) });
  const { made, byGrok } = mockImages()
    ? { made: { buffer: image.data, mime: image.mime }, byGrok: false } // (the stand-in: the tee's own picture of that side)
    : await withGrok(
        s,
        () => generateImage({ prompt, image, images: ref ? [ref] : [], ratio: "3:4" }),
        // (Grok takes one picture only: the tee's side, without the first photo — its person may differ)
        () => xaiEditImage({ prompt: ref ? wornPrompt(words) : prompt, image, ratio: "3:4", resolution: GROK_BEST }),
        `worn photo (${side})`,
      );
  const meta = await sharp(made.buffer).metadata();
  const stored = await uploadFile(made.buffer, made.mime, "ai-worn");
  await AiUsage.create({ user: req.user._id, kind: "worn", prompt: `Photo of the tee worn — ${SIDE_NAME[side]} (Review)`, images: 1, costInr: byGrok ? s.grokPricePerImageInr : s.pricePerImageInr, model: byGrok ? xaiModel() : aiImageModel() });
  res.status(201).json({ url: stored.url, width: meta.width || 0, height: meta.height || 0, byGrok, side, left: Math.max(0, s.dailyPerUser - used - 1) });
});

// AI_IMAGE_PROVIDER=mock: a stand-in piece (a coloured ring with the piece's name) on the magenta "green screen"
async function mockPiece(piece) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#ff00ff"/><circle cx="512" cy="512" r="380" fill="#2a6f4e" stroke="#f0d585" stroke-width="40"/><text x="512" y="540" font-family="Arial" font-size="110" font-weight="bold" text-anchor="middle" fill="#fff">${piece.toUpperCase()}</text></svg>`;
  return { buffer: await sharp(Buffer.from(svg)).png().toBuffer(), mime: "image/png" };
}

// POST /api/ai/tryon  (round 7, 8 Nov 2026): the customer's own photo wearing the finished tee
// { photo: data URL (their photo), image: data URL (the tee's mock-up from that side), garment, teeColour,
//   side? (17 Nov 2026), ref?: the url of their front try-on photo, backPhoto?: data URL of a photo of their back }
// -> { url, width, height, side, from: "photo" | "ai", left }
//   front: their photo, dressed. back + backPhoto: their back photo, dressed. Any other side: the SAME person turned
//   round, MADE by the AI from their front try-on photo (ref) or else their own photo — `from: "ai"`, and the caption says so.
export const makeTryOn = asyncHandler(async (req, res) => {
  const { s, used } = await mayDraw(req, res);
  const side = wornSideOf(req.body?.side);
  const t = pictureIn(req.body?.image);
  const own = side === "front" ? pictureIn(req.body?.photo) : side === "back" ? pictureIn(req.body?.backPhoto) : null;
  const ref = side === "front" || own ? null : await firstPhotoOf(req, res);
  const person = own || ref || (side === "front" ? null : pictureIn(req.body?.photo));
  if (!t || !person) {
    res.status(400);
    throw new Error("Choose a photo of yourself first.");
  }
  const photo = own || !ref ? await smallCopy(person, 1536) : person;
  const tee = await smallCopy(t, 1024);
  const words = { garment: text(req.body?.garment, 40) || "t-shirt", teeColour: text(req.body?.teeColour, 30).replace(/[^\w \-]/g, "") || "white", side };
  const fromPhoto = side === "front" || Boolean(own);
  const prompt = fromPhoto ? tryOnPrompt(words) : tryOnSidePrompt(words);
  let made;
  if (mockImages()) made = fromPhoto ? { buffer: photo.data, mime: photo.mime } : { buffer: tee.data, mime: tee.mime }; // (stand-ins: their photo, or the tee's side)
  else {
    try {
      made = await generateImage({ prompt, image: photo, images: [tee], ratio: "3:4" });
    } catch (err) {
      // (Grok takes one picture only, so it can't carry the tee: no second try here)
      if (err?.status === 422 || err?.noImage) {
        res.status(422);
        throw new Error(
          side === "back" && own
            ? "The picture service wouldn’t use this photo. Try a clear photo of your back, standing straight — or use “Photo of it worn” instead."
            : side === "front" || own
              ? "The picture service wouldn’t use this photo. Try a clear photo of yourself facing the camera — or use “Photo of it worn” instead."
              : `The picture service wouldn’t make the ${SIDE_NAME[side]} view from your photo. The other photos are kept.`,
        );
      }
      throw err;
    }
  }
  const meta = await sharp(made.buffer).metadata();
  const stored = await uploadFile(made.buffer, made.mime, "ai-worn");
  await AiUsage.create({ user: req.user._id, kind: "worn", prompt: `Try it on me — ${SIDE_NAME[side]}${fromPhoto ? "" : " made by the AI"} (the customer's own photo, Review)`, images: 1, costInr: s.pricePerImageInr, model: aiImageModel() });
  res.status(201).json({ url: stored.url, width: meta.width || 0, height: meta.height || 0, side, from: fromPhoto ? "photo" : "ai", left: Math.max(0, s.dailyPerUser - used - 1) });
});

// GET /api/ai/ideas  (public): the concept sheets the admin chose for "Browse ideas" (round 7)
export const listIdeas = asyncHandler(async (req, res) => {
  const rows = await AiUsage.find({ kind: "sheet", featured: true, "sheet.url": { $exists: true } }).sort({ createdAt: -1 }).limit(12).select("sheet createdAt").lean();
  res.json({ ideas: rows.map((r) => ({ id: r._id, url: r.sheet.url, width: r.sheet.width, height: r.sheet.height, brief: r.sheet.brief || "", concepts: (r.sheet.concepts || []).map(({ title, front, back, sleeve, colours, style }) => ({ title, front, back, sleeve, colours, style })), teeColour: r.sheet.teeColour || "" })) });
});

// PUT /api/ai/ideas/:id  (admin): { featured: true|false } — show this sheet in Browse ideas, or not
export const setIdea = asyncHandler(async (req, res) => {
  const row = await AiUsage.findOneAndUpdate({ _id: req.params.id, kind: "sheet" }, { featured: Boolean(req.body?.featured) }, { new: true }).lean();
  if (!row) {
    res.status(404);
    throw new Error("That sheet is gone.");
  }
  res.json({ ok: true, featured: row.featured });
});
