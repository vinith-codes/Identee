// controllers/garmentColorImageController.js

import GarmentColorImage from "../models/garmentColorImageModel.js";
import { deleteStoredFile } from "../utils/imageStorage.js";

const VALID_VIEWS = ["front", "back", "left", "right"];

// GET /api/garment-images
// Returns every garment+color photo set — used by the customizer to
// look up images client-side without one request per combo.
export const getAllGarmentImages = async (req, res) => {
  try {
    const docs = await GarmentColorImage.find({ isActive: true });
    res.json(docs);
  } catch (err) {
    res
      .status(500)
      .json({ message: err.message || "Could not fetch garment images" });
  }
};

// GET /api/garment-images/:garmentType/:colorSlug
export const getGarmentImage = async (req, res) => {
  try {
    const { garmentType, colorSlug } = req.params;
    const doc = await GarmentColorImage.findOne({
      garmentType,
      colorSlug,
      isActive: true,
    });
    if (!doc) {
      return res
        .status(404)
        .json({ message: "No photos uploaded for this garment/color yet" });
    }
    res.json(doc);
  } catch (err) {
    res
      .status(500)
      .json({ message: err.message || "Could not fetch garment image" });
  }
};

// POST /api/garment-images/upload-photo  (multipart, field name "photo")
// Query/body params: garmentType, colorSlug, view (front|back|left|right)
// Creates the garmentType+colorSlug document if it doesn't exist yet,
// then sets/replaces just that one view's photo.


// PUT /api/garment-images/print-area
// Body: { garmentType, colorSlug, view, printArea: { x, y, width, height } }
// Admin drags the design box on the uploaded photo — this saves where
// it ended up, per view.
export const updatePrintArea = async (req, res) => {
  try {
    const { garmentType, colorSlug, view, printArea } = req.body;

    if (!garmentType || !colorSlug || !view || !printArea) {
      return res.status(400).json({
        message: "garmentType, colorSlug, view and printArea are required",
      });
    }
    if (!VALID_VIEWS.includes(view)) {
      return res
        .status(400)
        .json({ message: `view must be one of: ${VALID_VIEWS.join(", ")}` });
    }

    const doc = await GarmentColorImage.findOneAndUpdate(
      { garmentType, colorSlug },
      { $set: { [`${view}.printArea`]: printArea } },
      { new: true },
    );

    if (!doc) {
      return res
        .status(404)
        .json({ message: "Upload a photo for this view first" });
    }

    res.json(doc);
  } catch (err) {
    res
      .status(500)
      .json({ message: err.message || "Could not update print area" });
  }
};

// DELETE /api/garment-images/:garmentType/:colorSlug
export const deleteGarmentImage = async (req, res) => {
  try {
    const { garmentType, colorSlug } = req.params;
    const doc = await GarmentColorImage.findOneAndDelete({
      garmentType,
      colorSlug,
    });
    if (!doc) {
      return res.status(404).json({ message: "Not found" });
    }
    await Promise.all(VALID_VIEWS.map((v) => deleteStoredFile(doc[v]?.imageUrl)));
    res.json({ message: "Deleted" });
  } catch (err) {
    res
      .status(500)
      .json({ message: err.message || "Could not delete garment image" });
  }
};
export const uploadGarmentViewPhoto = async (req, res) => {
  try {
    const { garmentType, colorSlug, colorName, colorHex, view } = req.body;

    if (!garmentType || !colorSlug || !colorName || !colorHex || !view) {
      return res.status(400).json({ message: "All fields are required" });
    }
    if (!VALID_VIEWS.includes(view)) {
      return res
        .status(400)
        .json({ message: `view must be one of: ${VALID_VIEWS.join(", ")}` });
    }
    if (!req.file) {
      return res.status(400).json({ message: "No photo uploaded" });
    }

    const imageUrl = req.file.path;
    const previous = await GarmentColorImage.findOne({ garmentType, colorSlug });
    const oldUrl = previous?.[view]?.imageUrl;

    const doc = await GarmentColorImage.findOneAndUpdate(
      { garmentType, colorSlug },
      {
        $set: {
          colorName,
          colorHex,
          [`${view}.imageUrl`]: imageUrl,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    if (oldUrl && oldUrl !== imageUrl) await deleteStoredFile(oldUrl);

    res.status(201).json(doc);
  } catch (err) {
    res
      .status(500)
      .json({ message: err.message || "Could not upload garment photo" });
  }
};
