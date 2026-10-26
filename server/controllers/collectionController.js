// controllers/collectionController.js — Admin → Collection maker (25 Oct 2026). The pipeline itself is in
// services/collectionService.js; these are the admin's buttons.
import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import DesignCollection from "../models/designCollectionModel.js";
import ReadyDesign from "../models/readyDesignModel.js";
import Product from "../models/productModel.js";
import { changeDesign, cleanBrief, garmentInfos, partsOf, makeBrief, markStale, redoPicture, runCollection, LANGUAGES, LAYOUTS, PLACES, MAX_AI_PICTURES, MAX_BUDGET, MAX_PARTS, MAX_TEES, SOURCES } from "../services/collectionService.js";
import { cleanDesign, storeMockups } from "./customizationController.js";
import { readSettings } from "./aiController.js";
import { xaiConfigured } from "../services/xaiImageService.js";

const notFound = (res, what = "Not found") => {
  res.status(404);
  throw new Error(what);
};
const collectionOr404 = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) notFound(res, "Collection not found");
  const doc = await DesignCollection.findById(req.params.id);
  if (!doc) notFound(res, "Collection not found");
  return markStale(doc);
};
const designOr404 = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) notFound(res, "Design not found");
  const doc = await ReadyDesign.findById(req.params.id);
  if (!doc) notFound(res, "Design not found");
  return doc;
};

// GET /api/collections/setup  (admin) — what the page needs: the products (their print areas, colours, layouts —
// the admin's browser draws the 3D tee and fits the words with them), prices and limits
export const getSetup = asyncHandler(async (req, res) => {
  const infos = await garmentInfos();
  const settings = await readSettings();
  res.json({
    garments: infos.map(({ key, garment, positions, colours, layouts }) => ({
      key,
      label: garment.label,
      category: garment.category,
      fit: garment.fit,
      sizes: garment.sizes,
      sizeChart: garment.sizeChart,
      positions,
      colours,
      layouts: Object.entries(layouts).map(([k, l]) => ({ key: k, label: l.label })),
    })),
    // every layout, with its parts (the admin's page draws them on a small tee); each product lists the ones it fits
    layouts: Object.entries(LAYOUTS).map(([key, l]) => ({ key, label: l.label, suits: l.suits, parts: l.parts })),
    places: Object.fromEntries(Object.entries(PLACES).map(([k, p]) => [k, p.box])),
    languages: LANGUAGES,
    sources: Object.entries(SOURCES).map(([key, label]) => ({ key, label })),
    maxParts: MAX_PARTS,
    maxAiPictures: MAX_AI_PICTURES,
    pricePerImageInr: settings.pricePerImageInr,
    grokPricePerImageInr: settings.grokPricePerImageInr,
    grok: xaiConfigured(),
    maxTees: MAX_TEES,
    maxBudget: MAX_BUDGET,
  });
});

// GET /api/collections  (admin) — the latest runs, with how many tees each has in each state
export const listCollections = asyncHandler(async (req, res) => {
  const docs = await DesignCollection.find().sort({ createdAt: -1 }).limit(30).lean();
  const counts = await ReadyDesign.aggregate([
    { $match: { collectionId: { $in: docs.map((d) => d._id) } } },
    { $group: { _id: { c: "$collectionId", s: "$status" }, n: { $sum: 1 } } },
  ]);
  const byCol = {};
  for (const { _id, n } of counts) (byCol[_id.c] ||= {})[_id.s] = n;
  res.json(docs.map((d) => ({ _id: d._id, prompt: d.prompt, theme: d.brief?.theme, status: d.status, step: d.step, spentInr: d.spentInr, createdAt: d.createdAt, counts: byCol[d._id] || {} })));
});

// GET /api/collections/:id  (admin) — the run and its tees
export const getCollection = asyncHandler(async (req, res) => {
  const collection = await collectionOr404(req, res);
  const designs = await ReadyDesign.find({ collectionId: collection._id }).sort({ order: 1 }).lean();
  res.json({ collection, designs });
});

// POST /api/collections/brief  (admin; multipart: prompt + "images", the example pictures — at least 1, up to 10)
export const createBrief = asyncHandler(async (req, res) => {
  const prompt = String(req.body.prompt || "").trim();
  if (prompt.length < 3) {
    res.status(400);
    throw new Error("Type what the collection should be about.");
  }
  const files = Array.isArray(req.files) ? req.files : [];
  if (!files.length) {
    res.status(400);
    throw new Error("Add an example picture — the AI takes its look as a reference (it doesn't copy it).");
  }

  // the products and layouts picked before the prompt (sent as JSON lists in the form)
  const list = (v) => {
    try {
      const a = JSON.parse(String(v || "[]"));
      return Array.isArray(a) ? a.map(String).slice(0, 20) : [];
    } catch {
      return [];
    }
  };
  try {
    const collection = await makeBrief({
      prompt,
      images: files.map((f) => ({ data: f.buffer, mime: f.mimetype })),
      refImages: files.map((f) => f.path),
      userId: req.user._id,
      garments: list(req.body.garments),
      layouts: list(req.body.layouts),
    });
    res.status(201).json({ collection, designs: [] });
  } catch (err) {
    console.error("[collection] brief failed:", err?.status || "", err?.message || err);
    res.status(err.status || 502);
    throw new Error(err.status === 400 || err.status === 429 || err.status === 503 ? err.message : "The AI couldn't read the request. Please try again.");
  }
});

// POST /api/collections/:id/start  (admin) { brief } — the admin's checked brief; the run starts in the background
export const startCollection = asyncHandler(async (req, res) => {
  const collection = await collectionOr404(req, res);
  if (collection.status !== "brief") {
    res.status(409);
    throw new Error("This collection has already started.");
  }
  const brief = cleanBrief(req.body.brief || {}, await garmentInfos());
  if (brief.realPeople && !xaiConfigured()) brief.realPeople = false; // only Grok draws real people
  if (!brief.theme) {
    res.status(400);
    throw new Error("Give the collection a theme.");
  }
  // the details the prompt didn't give must be answered first
  const ASK = { garments: "which products", count: "how many tees", language: "the language of the words" };
  if (brief.missing.length) {
    res.status(400);
    throw new Error(`Please choose ${brief.missing.map((k) => ASK[k]).join(", ")} first.`);
  }
  collection.brief = brief;
  collection.status = "running";
  collection.step = "Starting";
  collection.startedAt = new Date();
  await collection.save();
  runCollection(collection._id).catch((e) => console.error("[collection] run crashed:", e?.message || e));
  res.json({ collection, designs: [] });
});

// PUT /api/collections/designs/:id/finish  (admin) { elements, mockups: { front, back, left, right }, issues }
// The admin's browser fitted the words, ran the print check and took the 3D mockup pictures.
export const finishDesign = asyncHandler(async (req, res) => {
  const design = await designOr404(req, res);
  if (!["drafted", "ready"].includes(design.status)) {
    res.status(409);
    throw new Error("This tee can't be finished now.");
  }
  let fields;
  try {
    fields = await cleanDesign({ garmentType: design.garmentType, color: design.color, size: design.size, elements: req.body.elements, name: design.name });
  } catch (err) {
    res.status(err.status || 400);
    throw err;
  }
  const mockups = await storeMockups(req.body.mockups);
  if (!mockups?.front || !mockups?.back) {
    res.status(400);
    throw new Error("The mockup pictures are missing.");
  }
  design.elements = fields.elements;
  design.mockups = mockups;
  // the AI's notes (parts it couldn't use) + what the print check still says
  design.issues = [...(design.plan?.notes || []), ...(Array.isArray(req.body.issues) ? req.body.issues : []).map((s) => String(s).slice(0, 200))].slice(0, 12);
  design.status = "ready";
  await design.save();
  res.json(design);
});

// POST /api/collections/designs/:id/publish | unpublish | reject  (admin)
const setStatus = (to, from) =>
  asyncHandler(async (req, res) => {
    const design = await designOr404(req, res);
    if (!from.includes(design.status)) {
      res.status(409);
      throw new Error(to === "published" ? "Only a finished tee (with its mockup pictures) can be published." : "This tee can't be changed that way now.");
    }
    design.status = to;
    design.publishedAt = to === "published" ? new Date() : design.publishedAt;
    await design.save();
    // a Studio tee's product in the shop is shown / hidden with it (26 Oct 2026)
    if (design.productGroupId) await Product.updateMany({ readyDesign: design._id }, { $set: { isHidden: to !== "published" } });
    res.json(design);
  });
export const publishDesign = setStatus("published", ["ready"]);
export const unpublishDesign = setStatus("ready", ["published"]);
export const rejectDesign = setStatus("rejected", ["planned", "drafted", "ready", "failed", "published"]);
export const restoreDesign = setStatus("ready", ["rejected"]);

// PUT /api/collections/designs/:id  (admin) { name, blurb } — the shop texts
export const updateDesignText = asyncHandler(async (req, res) => {
  const design = await designOr404(req, res);
  const name = String(req.body.name ?? design.name).replace(/\s+/g, " ").trim().slice(0, 60);
  if (!name) {
    res.status(400);
    throw new Error("The tee needs a name.");
  }
  design.name = name;
  design.blurb = String(req.body.blurb ?? design.blurb).replace(/\s+/g, " ").trim().slice(0, 300);
  await design.save();
  res.json(design);
});

// POST /api/collections/designs/:id/redo  (admin) — new AI pictures, the same parts (each costs one picture; art
// library pictures stay)
export const redoDesign = asyncHandler(async (req, res) => {
  const design = await designOr404(req, res);
  if (design.status === "published") {
    res.status(409);
    throw new Error("Unpublish the tee before making a new picture for it.");
  }
  if (!partsOf(design).length) {
    res.status(409);
    throw new Error("This tee has no plan to make pictures from.");
  }
  try {
    await redoPicture(design);
  } catch (err) {
    res.status(err.status || 502);
    throw new Error(err.message || "The picture could not be made.");
  }
  res.json(design);
});

// POST /api/collections/designs/:id/change  (admin) { instruction } — change one tee in your own words
// ("make the words bigger", "put the picture on the front", "make it navy"). The AI rebuilds its parts; pictures it
// keeps are reused, new ones cost one picture each.
export const changeOneDesign = asyncHandler(async (req, res) => {
  const design = await designOr404(req, res);
  const instruction = String(req.body.instruction || "").trim();
  if (instruction.length < 3) {
    res.status(400);
    throw new Error("Say what to change.");
  }
  if (design.status === "published") {
    res.status(409);
    throw new Error("Unpublish the tee before changing it.");
  }
  try {
    const { design: doc, reply } = await changeDesign(design, instruction);
    res.json({ design: doc, reply });
  } catch (err) {
    res.status(err.status || 502);
    throw new Error(err.status === 422 || err.status === 429 || err.status === 409 ? err.message : "The change couldn't be made. Please try again.");
  }
});

// POST /api/collections/:id/resume  (admin) — a run that stopped carries on (tees made so far are kept)
export const resumeCollection = asyncHandler(async (req, res) => {
  const collection = await collectionOr404(req, res);
  if (collection.status !== "failed") {
    res.status(409);
    throw new Error("Only a stopped run can be resumed.");
  }
  collection.status = "running";
  collection.step = "Carrying on";
  collection.error = "";
  await collection.save();
  runCollection(collection._id).catch((e) => console.error("[collection] resume crashed:", e?.message || e));
  res.json({ collection });
});
