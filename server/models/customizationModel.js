// models/customizationModel.js

import mongoose from "mongoose";

// Layout v2 (current): every element belongs to a print position
// (data/printPositions.js) and x / y / width / height are % of THAT
// position's print box; fontSizePct is % of the box height. The design is
// therefore size-independent — the physical size comes from the position
// and the garment size chosen at order time.
// Layout v1 (older saves): % of the whole editor canvas, no position.
const elementSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["image", "text"], required: true },
    position: { type: String }, // e.g. "centre-front" (v2)
    side: {
      type: String,
      enum: ["front", "back", "right", "left"],
      default: "front",
    },

    // image elements
    src: { type: String }, // Cloudinary URL (or legacy uploads/ path)
    artDesignId: { type: mongoose.Schema.Types.ObjectId, ref: "ArtDesign" },

    // text elements
    text: { type: String, maxlength: 200 },
    fontFamily: { type: String, default: "Arial" },
    fontSizePct: { type: Number, default: 6 },
    color: { type: String, default: "#000000" },
    bold: { type: Boolean, default: false },
    italic: { type: Boolean, default: false },
    underline: { type: Boolean, default: false },
    align: {
      type: String,
      enum: ["left", "center", "right", "justify"],
      default: "left",
    },
    effect: {
      type: String,
      enum: ["straight", "arc-up", "arc-down"],
      default: "straight",
    },
    letterSpacingPct: { type: Number, default: 0 }, // % of the letter size
    lineHeight: { type: Number, default: 1.05 },
    strokeWidthPct: { type: Number, default: 0 }, // outline, % of the letter size (0 = none)
    strokeColor: { type: String },
    note: { type: String, maxlength: 300 },

    // placement
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number },
    rotation: { type: Number, default: 0 },
    zIndex: { type: Number, default: 0 },
  },
  { _id: false },
);

const customizationSchema = new mongoose.Schema(
  {
    garmentType: { type: String, required: true }, // e.g. "round-neck-tshirt"
    color: { type: String, required: true }, // colour slug, e.g. "black"
    size: { type: String, default: null }, // garment size the customer designed for, e.g. "M"
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    layoutVersion: { type: Number, default: 1 },
    name: { type: String, default: "", trim: true }, // "Birthday squad tee" — shown in My designs
    // Pictures of the finished tee (Cloudinary identee/mockups), made in the 3D Design Room
    mockups: {
      front: { type: String, default: null },
      back: { type: String, default: null },
      left: { type: String, default: null },
      right: { type: String, default: null },
    },
    orderedAt: { type: Date, default: null }, // set when ordered → the design is locked
    hiddenAt: { type: Date, default: null }, // "deleted" by the customer but kept for an order
    elements: {
      type: [elementSchema],
      validate: (v) => Array.isArray(v) && v.length > 0,
    },
  },
  { timestamps: true },
);

customizationSchema.index({ user: 1, hiddenAt: 1, updatedAt: -1 });

export default mongoose.model("Customization", customizationSchema);
