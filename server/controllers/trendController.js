// controllers/trendController.js — "Trending now" (23 Nov 2026): the trends a customer's photo can be redrawn in.
// The shop reads the switched-on ones (GET /api/ai/trends); the team keeps the list in Admin → Design Studio → Trends.
// The picture itself is made by POST /api/ai/design with { photoUrl, trend, look } (aiController.js).
import asyncHandler from "express-async-handler";
import Trend from "../models/trendModel.js";
import { listTrends, publicTrend } from "../services/trends.js";
import { isOurUpload } from "./aiController.js";

const words = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const keyFrom = (v) => words(v, 40).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
// (a picture is one of our own uploads, or none)
const picture = (v) => (v && isOurUpload(String(v)) ? String(v) : "");

const MAX_BACKS = 120; // (the owner's first set is 70 ready designs, 23 Nov 2026)
// what the team may set
function fields(body, { adding = false } = {}) {
  const out = {};
  if (adding || body.name !== undefined) out.name = words(body.name, 40);
  if (adding || body.look !== undefined) out.look = words(body.look, 600);
  if (body.setting !== undefined) out.setting = words(body.setting, 600);
  if (body.example !== undefined) out.example = picture(body.example);
  if (body.before !== undefined) out.before = picture(body.before);
  // (23 Nov 2026) the tee colours offered, the fixed front picture, the ready-made backs
  if (body.colours !== undefined) out.colours = [...new Set((Array.isArray(body.colours) ? body.colours : String(body.colours || "").split(",")).map((c) => words(c, 30).toLowerCase()).filter(Boolean))].slice(0, 30);
  if (body.front !== undefined) out.front = picture(body.front);
  if (body.backs !== undefined)
    out.backs = (Array.isArray(body.backs) ? body.backs : [])
      .map((b) => ({ url: picture(b?.url), name: words(b?.name, 40) }))
      .filter((b) => b.url)
      .slice(0, MAX_BACKS);
  if (body.active !== undefined) out.active = Boolean(body.active);
  if (body.order !== undefined && Number.isFinite(Number(body.order))) out.order = Math.round(Number(body.order));
  return out;
}

// GET /api/ai/trends  (public) -> { trends: [{ key, name, example, before, scene, colours, front, backs }] }   (the switched-on ones)
export const getTrends = asyncHandler(async (req, res) => {
  res.json({ trends: (await listTrends()).map(publicTrend) });
});

// GET /api/ai/trends/all  (team) -> { trends: [whole rows] }
export const getAllTrends = asyncHandler(async (req, res) => {
  res.json({ trends: await listTrends({ all: true }) });
});

// POST /api/ai/trends  (admin)  { name, look, setting?, example?, before?, colours?, front?, backs?, active?, order? }
export const addTrend = asyncHandler(async (req, res) => {
  const set = fields(req.body || {}, { adding: true });
  if (set.name.length < 2 || set.look.length < 10) {
    res.status(400);
    throw new Error("Give the trend a name, and describe its look in a sentence.");
  }
  let key = keyFrom(req.body?.key || set.name) || "trend";
  // (two trends never share a key: "anime", "anime-2")
  for (let n = 2; await Trend.exists({ key }); n++) key = `${keyFrom(req.body?.key || set.name) || "trend"}-${n}`;
  const last = await Trend.findOne().sort({ order: -1 }).select("order").lean();
  const row = await Trend.create({ ...set, key, order: set.order ?? (last?.order ?? -1) + 1 });
  res.status(201).json({ trend: row });
});

// PUT /api/ai/trends/:id  (admin)  any of the fields above (the key never changes: designs remember it)
export const saveTrend = asyncHandler(async (req, res) => {
  const set = fields(req.body || {});
  if ((set.name !== undefined && set.name.length < 2) || (set.look !== undefined && set.look.length < 10)) {
    res.status(400);
    throw new Error("A trend needs a name, and its look in a sentence.");
  }
  // (a ready back that was swapped for its 4K copy keeps the small pictures it remembers — see services/trends.js)
  if (set.backs) {
    const now = await Trend.findById(req.params.id, { backs: 1 }).lean();
    set.backs = set.backs.map((b) => ({ ...b, small: now?.backs?.find((x) => x.url === b.url)?.small || [] }));
  }
  const row = await Trend.findByIdAndUpdate(req.params.id, set, { new: true }).lean();
  if (!row) {
    res.status(404);
    throw new Error("That trend is gone.");
  }
  res.json({ trend: row });
});

// POST /api/ai/trends/picture  (admin)  form field "design" -> { path }
// A trend's own picture (its example, its front logo, a ready design for the back): stored like a customer's upload,
// but NOT put on the admin's "My pictures" (70 ready designs would fill it).
export const uploadTrendPicture = asyncHandler(async (req, res) => {
  if (!req.file) {
    res.status(400);
    throw new Error("No picture was sent.");
  }
  res.status(201).json({ path: req.file.path });
});

// DELETE /api/ai/trends/:id  (admin)
export const dropTrend = asyncHandler(async (req, res) => {
  const row = await Trend.findByIdAndDelete(req.params.id).lean();
  if (!row) {
    res.status(404);
    throw new Error("That trend is gone.");
  }
  res.json({ ok: true });
});
