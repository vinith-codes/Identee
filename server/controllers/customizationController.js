// controllers/customizationController.js

import mongoose from "mongoose";
import Customization from "../models/customizationModel.js";
import GarmentType from "../models/garmentTypeModel.js";
import Order from "../models/orderModel.js";
import { uploadFile, deleteStoredFile } from "../utils/imageStorage.js";
import { positionsForGarment, SIZES, SIZE_GROUPS } from "../data/printPositions.js";

const MAX_ELEMENTS = 40;
const clampNum = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};
const HEX = /^#[0-9a-f]{3,8}$/i;

// Image sources must be files we host: our Cloudinary account or a legacy
// local upload path — never an arbitrary external URL.
const isOurImage = (src) => {
  const s = String(src || "");
  const cloud = process.env.CLOUDINARY_NAME?.trim();
  return (
    (cloud && s.startsWith(`https://res.cloudinary.com/${cloud}/`)) ||
    /^\/?uploads\/[\w\-./]+$/.test(s)
  );
};

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

// Validates + normalises one layout-v2 element from the client.
// `positionByKey` = the print positions this garment offers.
const cleanElement = (positionByKey) => (el, i) => {
  const pos = positionByKey[el?.position];
  if (!pos) throw badRequest(`Element ${i + 1}: this print position isn't available on this garment`);

  const base = {
    type: el.type,
    position: pos.key,
    side: pos.side,
    x: clampNum(el.x, -50, 150, 0),
    y: clampNum(el.y, -50, 150, 0),
    width: clampNum(el.width, 2, 200, 50),
    height: clampNum(el.height, 2, 200, 20),
    rotation: clampNum(el.rotation, -360, 360, 0),
    zIndex: clampNum(el.zIndex, -1000, 1000, 0),
  };

  if (el.type === "image") {
    if (!isOurImage(el.src)) throw badRequest(`Element ${i + 1}: image must be uploaded to IDENTEE`);
    return {
      ...base,
      src: el.src,
      artDesignId: mongoose.isValidObjectId(el.artDesignId) ? el.artDesignId : undefined,
    };
  }

  if (el.type === "text") {
    const text = String(el.text || "").slice(0, 200);
    if (!text.trim()) throw badRequest(`Element ${i + 1}: text is empty`);
    return {
      ...base,
      text,
      fontFamily: String(el.fontFamily || "Arial").slice(0, 60),
      fontSizePct: clampNum(el.fontSizePct, 1, 100, 15),
      color: HEX.test(el.color) ? el.color : "#000000",
      bold: !!el.bold,
      italic: !!el.italic,
      underline: !!el.underline,
      align: ["left", "center", "right", "justify"].includes(el.align) ? el.align : "center",
      effect: ["straight", "arc-up", "arc-down"].includes(el.effect) ? el.effect : "straight",
      note: el.note ? String(el.note).slice(0, 300) : undefined,
    };
  }

  throw badRequest(`Element ${i + 1}: unknown element type`);
};

// GET /api/customizations/print-positions  (public)
// ?garment=<key> returns that garment's offered areas (set in the admin
// wizard); without it, the 6 standard ones.
export const getPrintPositions = async (req, res) => {
  try {
    const key = req.query.garment ? String(req.query.garment) : null;
    const garment = key ? await GarmentType.findOne({ key }).lean() : null;
    const { positions, scales } = positionsForGarment(garment);
    res.set("Cache-Control", "public, max-age=60");
    res.json({ positions, scales, sizes: SIZES, sizeGroups: SIZE_GROUPS });
  } catch (err) {
    res.status(500).json({ message: err.message || "Could not load print positions" });
  }
};

// POST /api/customizations/upload-design  (login required; multipart "design")
export const uploadDesignImage = (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  res.status(201).json({ path: req.file.path });
};

// Mockup pictures arrive as small JPEG/PNG data URLs (made in the browser
// from the 3D view) and are stored in Cloudinary identee/mockups.
const MOCKUP_VIEWS = ["front", "back", "left", "right"];
const MAX_MOCKUP_BYTES = 800 * 1024;
const DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

async function storeMockups(mockups) {
  if (!mockups || typeof mockups !== "object") return null;
  const out = {};
  for (const view of MOCKUP_VIEWS) {
    const m = DATA_URL.exec(String(mockups[view] || ""));
    if (!m) continue;
    const buffer = Buffer.from(m[2], "base64");
    if (buffer.length > MAX_MOCKUP_BYTES) throw badRequest("A mockup picture is too large");
    const { url } = await uploadFile(buffer, `image/${m[1]}`, "mockups", `${view}.${m[1] === "jpeg" ? "jpg" : m[1]}`);
    out[view] = url;
  }
  return Object.keys(out).length ? out : null;
}

// Delete mockup files no other design still points at (duplicates share them).
async function dropMockups(mockups, exceptId) {
  for (const view of MOCKUP_VIEWS) {
    const url = mockups?.[view];
    if (!url) continue;
    const shared = await Customization.exists({ _id: { $ne: exceptId }, $or: MOCKUP_VIEWS.map((v) => ({ [`mockups.${v}`]: url })) });
    if (!shared) await deleteStoredFile(url);
  }
}

// Validates garment / colour / size / elements; returns the fields to store.
async function cleanDesign(body) {
  const { garmentType, color, elements, size, name } = body;
  if (!garmentType || !color) throw badRequest("garmentType and color are required");
  if (!Array.isArray(elements) || elements.length === 0) throw badRequest("Add at least one design element before saving");
  if (elements.length > MAX_ELEMENTS) throw badRequest(`A design can have at most ${MAX_ELEMENTS} elements`);
  const garment = await GarmentType.findOne({ key: String(garmentType), isActive: true });
  if (!garment) throw badRequest("This garment is not available");
  // The size the customer designed for must be one this garment comes in.
  const sizes = garment.sizes?.length ? garment.sizes : SIZES;
  if (size !== undefined && size !== null && !sizes.includes(String(size))) {
    throw badRequest("This size isn't available for this garment");
  }
  const positionByKey = Object.fromEntries(positionsForGarment(garment).positions.map((p) => [p.key, p]));
  return {
    garmentType: garment.key,
    color: String(color).slice(0, 60),
    size: size ? String(size) : null,
    name: String(name || "").trim().slice(0, 60) || `${garment.label} design`,
    layoutVersion: 2,
    elements: elements.map(cleanElement(positionByKey)),
  };
}

const sendError = (res, err, fallback) =>
  res.status(err.status || 500).json({ message: err.message || fallback });

// Owner's design (not hidden) or a 404.
async function ownDesign(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw Object.assign(new Error("Design not found"), { status: 404 });
  const doc = await Customization.findById(req.params.id);
  if (!doc || doc.hiddenAt || String(doc.user) !== String(req.user._id)) {
    throw Object.assign(new Error("Design not found"), { status: 404 });
  }
  return doc;
}

// POST /api/customizations  (login required)
// Body: { garmentType, color, size, elements, name?, mockups?: { front, back, left, right } (data URLs) }
export const createCustomization = async (req, res) => {
  try {
    const fields = await cleanDesign(req.body);
    const mockups = await storeMockups(req.body.mockups);
    const customization = await Customization.create({ ...fields, user: req.user._id, ...(mockups ? { mockups } : {}) });
    res.status(201).json(customization);
  } catch (err) {
    sendError(res, err, "Could not save customization");
  }
};

// PUT /api/customizations/:id  (owner) — update a saved design.
// Ordered designs are locked: the client saves a copy instead (409).
export const updateCustomization = async (req, res) => {
  try {
    const doc = await ownDesign(req);
    if (doc.orderedAt) {
      return res.status(409).json({ message: "This design has been ordered, so it can't change. Save it as a new design instead.", locked: true });
    }
    const fields = await cleanDesign(req.body);
    const mockups = await storeMockups(req.body.mockups);
    const old = doc.mockups?.toObject ? doc.mockups.toObject() : doc.mockups;
    Object.assign(doc, fields);
    if (mockups) doc.mockups = mockups;
    await doc.save();
    if (mockups && old) await dropMockups(old, doc._id);
    res.json(doc);
  } catch (err) {
    sendError(res, err, "Could not save the design");
  }
};

// GET /api/customizations/mine  (login) — the user's designs, newest first
export const listMyCustomizations = async (req, res) => {
  try {
    const docs = await Customization.find({ user: req.user._id, hiddenAt: null })
      .select("name garmentType color size mockups orderedAt createdAt updatedAt elements.position")
      .sort({ updatedAt: -1 })
      .limit(200)
      .lean();
    res.json(
      docs.map(({ elements, ...d }) => ({
        ...d,
        elementCount: elements?.length || 0,
        areaCount: new Set((elements || []).map((e) => e.position)).size,
      })),
    );
  } catch (err) {
    sendError(res, err, "Could not load your designs");
  }
};

// POST /api/customizations/:id/duplicate  (owner) — a new, editable copy
export const duplicateCustomization = async (req, res) => {
  try {
    const doc = await ownDesign(req);
    const src = doc.toObject();
    const copy = await Customization.create({
      garmentType: src.garmentType,
      color: src.color,
      size: src.size,
      user: req.user._id,
      layoutVersion: src.layoutVersion,
      elements: src.elements,
      mockups: src.mockups,
      name: `${src.name || "Design"} (copy)`.slice(0, 60),
    });
    res.status(201).json(copy);
  } catch (err) {
    sendError(res, err, "Could not copy the design");
  }
};

// DELETE /api/customizations/:id  (owner)
// Designs used in an order are only hidden (the order still needs them).
export const deleteCustomization = async (req, res) => {
  try {
    const doc = await ownDesign(req);
    const inOrder = doc.orderedAt || (await Order.exists({ "orderItems.customization": doc._id }));
    if (inOrder) {
      doc.hiddenAt = new Date();
      await doc.save();
    } else {
      const mockups = doc.mockups?.toObject ? doc.mockups.toObject() : doc.mockups;
      await doc.deleteOne();
      await dropMockups(mockups, doc._id);
    }
    res.json({ message: "Deleted" });
  } catch (err) {
    sendError(res, err, "Could not delete the design");
  }
};

// GET /api/customizations/:id  (owner or admin)
export const getCustomizationById = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: "Customization not found" });
    }
    const customization = await Customization.findById(req.params.id);
    const allowed =
      customization &&
      (req.user.isAdmin || String(customization.user) === String(req.user._id));
    if (!allowed) return res.status(404).json({ message: "Customization not found" });
    res.json(customization);
  } catch (err) {
    res.status(500).json({ message: err.message || "Could not fetch customization" });
  }
};
