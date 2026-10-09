// controllers/customizationController.js

import mongoose from "mongoose";
import Customization from "../models/customizationModel.js";
import GarmentType from "../models/garmentTypeModel.js";
import {
  PRINT_POSITIONS,
  POSITION_BY_KEY,
  SIZES,
  SIZE_GROUPS,
} from "../data/printPositions.js";

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
const cleanElement = (el, i) => {
  const pos = POSITION_BY_KEY[el?.position];
  if (!pos) throw badRequest(`Element ${i + 1}: unknown print position`);

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
export const getPrintPositions = (req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  res.json({ positions: PRINT_POSITIONS, sizes: SIZES, sizeGroups: SIZE_GROUPS });
};

// POST /api/customizations/upload-design  (login required; multipart "design")
export const uploadDesignImage = (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  res.status(201).json({ path: req.file.path });
};

// POST /api/customizations  (login required)
export const createCustomization = async (req, res) => {
  try {
    const { garmentType, color, elements } = req.body;

    if (!garmentType || !color) {
      return res.status(400).json({ message: "garmentType and color are required" });
    }
    if (!Array.isArray(elements) || elements.length === 0) {
      return res.status(400).json({ message: "Add at least one design element before saving" });
    }
    if (elements.length > MAX_ELEMENTS) {
      return res.status(400).json({ message: `A design can have at most ${MAX_ELEMENTS} elements` });
    }
    const garment = await GarmentType.findOne({ key: String(garmentType), isActive: true });
    if (!garment) return res.status(400).json({ message: "This garment is not available" });

    const customization = await Customization.create({
      garmentType: garment.key,
      color: String(color).slice(0, 60),
      user: req.user._id,
      layoutVersion: 2,
      elements: elements.map(cleanElement),
    });

    res.status(201).json(customization);
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || "Could not save customization" });
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
