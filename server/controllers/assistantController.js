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
import { uploadFile } from "../utils/imageStorage.js";
import { cutOutPlainBackground, trimClearEdges } from "../services/cutoutService.js";
import { rememberPictures } from "./myPictureController.js";
import { xaiConfigured, xaiEditImage, xaiModel, xaiNewImage } from "../services/xaiImageService.js";
import { AI_STYLES, aiImageModel, generateImage, nearestRatio } from "../services/aiImageService.js";
import { brainConfigured, brainReply, CONCEPTS_PER_SHEET, PIECES } from "../services/assistantBrain.js";
import { chatModel, MEMORY_MAX } from "../services/aiChatService.js";
import { developPrompt, matchPrompt, mockSheet, piecesOf, SHEET_COST_FACTOR, SHEET_RATIO, SHEET_SIZE, sheetPrompt, wornPrompt } from "../services/conceptSheets.js";
import User from "../models/userModel.js";
import { googleCapped, grokCapped, isOurUpload, readSettings, usedToday, whyOff } from "./aiController.js";
import { expectedWords, missingWords, readWords, wordCheckReady } from "../services/wordCheck.js";

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
// a picture made small enough for the AI, on a white background
const smallCopy = async (pic, px) => ({ data: await sharp(pic.data).rotate().resize(px, px, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toBuffer(), mime: "image/jpeg" });
const conceptIn = (c) => ({
  title: text(c?.title, 50),
  front: c?.front ? text(c.front, 300) : null,
  back: c?.back ? text(c.back, 300) : null,
  sleeve: c?.sleeve ? text(c.sleeve, 200) : null,
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
    .slice(0, 30)
    .map((a) => ({ key: text(a?.key, 40), label: text(a?.label, 60), free: a?.free !== false }))
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
  const attached = req.body?.photo?.url && isOurUpload(String(req.body.photo.url)) ? { url: String(req.body.photo.url), about: text(req.body.photo.about, 200) } : null;
  const logo = req.body?.logoUrl && isOurUpload(String(req.body.logoUrl)) ? String(req.body.logoUrl) : null;
  // what we know about this customer from earlier visits (round 5, 8 Nov 2026) — kept on their account
  const profile = String((await User.findById(req.user._id).select("aiProfile").lean().catch(() => null))?.aiProfile || "").slice(0, 400);
  let answer;
  try {
    answer = await brainReply({
      profile,
      message,
      history: said(req.body?.history, 14),
      earlier: said(req.body?.earlier, 40),
      memory: String(req.body?.memory || "").slice(0, MEMORY_MAX),
      design: req.body?.design || {},
      facts: { ...facts, loggedIn: true, picturesLeft: left },
      areas,
      styles: Object.keys(AI_STYLES),
      sheets,
      attached,
      logo,
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
    throw new Error(`You’ve used today’s ${s.dailyPerUser} picture requests. They reset tomorrow.`);
  }
  return { s, used };
}

// Google refused (a named person, a protected character) → Grok, when it is set up and under its cap
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
  if (concepts.length < 2) {
    res.status(400);
    throw new Error("Tell me what the concepts should show.");
  }
  const garment = text(req.body?.garment, 40) || "t-shirt";
  const teeColour = text(req.body?.teeColour, 30).replace(/[^\w \-]/g, "") || "white";
  const teeIsDark = Boolean(req.body?.teeIsDark);
  const numberFrom = Math.max(1, Math.min(97, Number(req.body?.numberFrom) || 1));
  // the customer's own logo / artwork (one of our uploads): sent with the instruction, printed exactly as it is
  const logoUrl = req.body?.logoUrl && isOurUpload(String(req.body.logoUrl)) ? String(req.body.logoUrl) : null;
  // colourways / variations (round 5): the picture already on the tee goes as the reference instead
  const basisUrl = !logoUrl && req.body?.basisUrl && isOurUpload(String(req.body.basisUrl)) ? String(req.body.basisUrl) : null;
  const logo = logoUrl ? await smallCopy(await fetchOurImage(logoUrl, req), 1024) : basisUrl ? await smallCopy(await fetchOurImage(basisUrl, req), 1024) : null;
  const prompt = sheetPrompt({ concepts, garment, teeColour, teeIsDark, numberFrom, logo: Boolean(logoUrl), basis: Boolean(basisUrl) });
  const { made, byGrok } = mockImages()
    ? { made: await mockSheet(concepts, { teeColour, numberFrom }), byGrok: false }
    : await withGrok(
        s,
        () => generateImage({ prompt, images: logo ? [logo] : [], ratio: SHEET_RATIO, size: SHEET_SIZE }),
        () => (logo ? xaiEditImage({ prompt, image: logo }) : xaiNewImage({ prompt, ratio: SHEET_RATIO })),
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
  });
  res.status(201).json({
    sheet: { url: stored.url, width: meta.width || 1536, height: meta.height || 864, numberFrom, concepts: concepts.map((c, i) => ({ n: numberFrom + i, ...c })), byGrok, logoUrl: logoUrl || null },
    left: Math.max(0, s.dailyPerUser - used - 1),
  });
});

// POST /api/ai/develop
// { sheetUrl, n, concept: { title, front, back, sleeve, colours, style }, pieces?: ["front"|"back"|"sleeve"], teeColour, teeIsDark, ratios?: { front, back, sleeve } }
// -> { pieces: [{ piece, url, width, height }], left }   (one picture per piece, drawn in parallel; a refused piece goes to Grok)
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
  if (!concept.title || !pieces.length) {
    res.status(400);
    throw new Error("That concept has nothing to print.");
  }
  const teeIsDark = Boolean(req.body?.teeIsDark);
  const ratios = req.body?.ratios && typeof req.body.ratios === "object" ? req.body.ratios : {};
  const change = text(req.body?.change, 300); // "with the text in gold" — asked together with the pick
  const image = await smallCopy(await fetchOurImage(sheetUrl, req), 2048);
  const logoUrl = req.body?.logoUrl && isOurUpload(String(req.body.logoUrl)) ? String(req.body.logoUrl) : null;
  const logo = logoUrl ? await smallCopy(await fetchOurImage(logoUrl, req), 1024) : null;
  const ratioOf = Object.fromEntries(pieces.map((piece) => [piece, nearestRatio(Number(ratios[piece]) || (piece === "sleeve" ? 0.75 : 1))]));
  const drawPiece = (piece, extraChange = null) => {
    const prompt = developPrompt({ concept, n, piece, teeIsDark, logo: Boolean(logo), change: [change, extraChange].filter(Boolean).join(". ") || null });
    return withGrok(
      s,
      () => generateImage({ prompt, image, images: logo ? [logo] : [], ratio: ratioOf[piece] }),
      () => xaiEditImage({ prompt, image, ratio: ratioOf[piece] }),
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
        const seen = await readWords(m.made.buffer, m.made.mime);
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
        .then(trimClearEdges)
        .catch(() => ({ buffer: m.made.buffer, mime: m.made.mime, width: 1024, height: 1024, cut: false })),
    ),
  );
  const stored = await Promise.all(cut.map((c) => uploadFile(c.buffer, c.mime, "ai-designs")));
  const byGrok = made.some((m) => m.byGrok);
  await AiUsage.create({
    user: req.user._id,
    kind: "develop",
    prompt: `Concept ${n}: ${concept.title}${change ? ` — ${change}` : ""}${checks ? ` (words checked${redraws ? `, ${redraws} redrawn` : ""})` : ""}`.slice(0, PROMPT_MAX),
    style: concept.style || undefined,
    images: made.length + redraws,
    costInr: Math.round((made.reduce((sum, m) => sum + (m.byGrok ? s.grokPricePerImageInr : s.pricePerImageInr) * (m.redrawn ? 2 : 1), 0) + checks * (s.chatPricePerMessageInr || 0)) * 100) / 100,
    model: byGrok ? xaiModel() : aiImageModel(),
  });
  await rememberPictures(
    req.user._id,
    stored.map((st, i) => ({ url: st.url, kind: "ai", about: `${concept.title} — ${made[i].piece} (concept ${n})`, style: concept.style || "", width: cut[i].width, height: cut[i].height })),
  );
  res.status(201).json({
    pieces: stored.map((st, i) => ({ piece: made[i].piece, url: st.url, width: cut[i].width, height: cut[i].height, byGrok: made[i].byGrok, ...(made[i].redrawn ? { redrawn: made[i].redrawn } : {}) })),
    failed: results.filter((r) => r.status === "rejected").map((r, i) => pieces.filter((p) => !made.some((m) => m.piece === p))[i]).filter(Boolean),
    left: Math.max(0, s.dailyPerUser - used - 1),
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
  const ratio = nearestRatio(Number(req.body?.ratio) || (piece === "sleeve" ? 0.75 : 1));
  const image = await smallCopy(await fetchOurImage(fromUrl, req), 1536);
  const prompt = matchPrompt({ piece, from: text(req.body?.fromLabel, 40) || "the front", brief, teeColour, teeIsDark });
  const { made, byGrok } = mockImages()
    ? { made: await mockPiece(piece), byGrok: false }
    : await withGrok(
        s,
        () => generateImage({ prompt, image, ratio }),
        () => xaiEditImage({ prompt, image, ratio }),
        `matching ${piece}`,
      );
  const cut = await cutOutPlainBackground(made.buffer).then(trimClearEdges).catch(() => ({ buffer: made.buffer, mime: made.mime, width: 1024, height: 1024, cut: false }));
  const stored = await uploadFile(cut.buffer, cut.mime, "ai-designs");
  await AiUsage.create({ user: req.user._id, kind: "match", prompt: `Matching ${piece}: ${brief}`.slice(0, PROMPT_MAX), images: 1, costInr: byGrok ? s.grokPricePerImageInr : s.pricePerImageInr, model: byGrok ? xaiModel() : aiImageModel() });
  await rememberPictures(req.user._id, [{ url: stored.url, kind: "ai", about: `matching ${piece} — ${brief}`.slice(0, 200), width: cut.width, height: cut.height }]);
  res.status(201).json({ piece: { piece, url: stored.url, width: cut.width, height: cut.height, byGrok }, left: Math.max(0, s.dailyPerUser - used - 1) });
});

// POST /api/ai/worn  (round 5, 8 Nov 2026): a lifestyle photo of the finished tee on a person, for sharing
// { image: data URL of the tee's front mock-up (from Review), garment, teeColour, setting? } -> { url, width, height, left }
export const makeWorn = asyncHandler(async (req, res) => {
  const { s, used } = await mayDraw(req, res);
  const m = String(req.body?.image || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!m || m[2].length > 8_000_000) {
    res.status(400);
    throw new Error("The picture of the tee is missing. Open Review and try again.");
  }
  const image = await smallCopy({ data: Buffer.from(m[2], "base64"), mime: m[1] }, 1536);
  const prompt = wornPrompt({ garment: text(req.body?.garment, 40) || "t-shirt", teeColour: text(req.body?.teeColour, 30).replace(/[^\w \-]/g, "") || "white", setting: text(req.body?.setting, 80) });
  const { made, byGrok } = mockImages()
    ? { made: { buffer: image.data, mime: image.mime }, byGrok: false }
    : await withGrok(
        s,
        () => generateImage({ prompt, image, ratio: "3:4" }),
        () => xaiEditImage({ prompt, image, ratio: "3:4" }),
        "worn photo",
      );
  const meta = await sharp(made.buffer).metadata();
  const stored = await uploadFile(made.buffer, made.mime, "ai-worn");
  await AiUsage.create({ user: req.user._id, kind: "worn", prompt: "Photo of the tee worn (Review)", images: 1, costInr: byGrok ? s.grokPricePerImageInr : s.pricePerImageInr, model: byGrok ? xaiModel() : aiImageModel() });
  res.status(201).json({ url: stored.url, width: meta.width || 0, height: meta.height || 0, byGrok, left: Math.max(0, s.dailyPerUser - used - 1) });
});

// AI_IMAGE_PROVIDER=mock: a stand-in piece (a coloured ring with the piece's name) on the magenta "green screen"
async function mockPiece(piece) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="#ff00ff"/><circle cx="512" cy="512" r="380" fill="#2a6f4e" stroke="#f0d585" stroke-width="40"/><text x="512" y="540" font-family="Arial" font-size="110" font-weight="bold" text-anchor="middle" fill="#fff">${piece.toUpperCase()}</text></svg>`;
  return { buffer: await sharp(Buffer.from(svg)).png().toBuffer(), mime: "image/png" };
}
