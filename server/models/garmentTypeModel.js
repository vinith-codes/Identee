import mongoose from "mongoose";

const colorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },   // "Acid Washed Black"
    slug: { type: String, required: true },   // "acid-washed-black"
    hex: { type: String, required: true },    // "#1B1B1B" — used only for
                                                // the tiny color-swatch dot,
                                                // not for tinting anymore
  },
  { _id: false },
);

// Filled in by the admin set-up wizard (Admin → Customizable).
const fabricSchema = new mongoose.Schema(
  {
    key: { type: String, required: true }, // "cotton-240"
    name: { type: String, required: true }, // "240 GSM Cotton"
  },
  { _id: false },
);

const sizeChartRowSchema = new mongoose.Schema(
  {
    size: { type: String, required: true }, // "M"
    chest: { type: Number }, // inches
    shoulder: { type: Number },
    length: { type: Number },
  },
  { _id: false },
);

// One row per print area from data/printPositions.js PRINT_AREA_CATALOG.
// width/height = M–XL print size in cm (smaller/larger sizes are ±4 cm).
const printAreaSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    offered: { type: Boolean, default: false },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
  },
  { _id: false },
);

const garmentTypeSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    label: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
    basePrice: { type: Number, required: true, default: 0 }, // 🆕 e.g. 599
    colors: { type: [colorSchema], default: [] },
    isActive: { type: Boolean, default: true }, // false = draft, hidden from customers
    description: { type: String, default: "", trim: true },
    fit: { type: String, enum: ["oversized", "regular"], default: "regular" },
    fabrics: { type: [fabricSchema], default: [] },
    sizes: { type: [String], default: [] },
    sizeChart: { type: [sizeChartRowSchema], default: [] },
    printAreas: { type: [printAreaSettingSchema], default: [] }, // empty = the 6 standard areas
    // Where the garment's shoulder top and hem are on its (front) photo, in %
    // of the 4:5 photo frame's height. With the size chart's length this
    // gives the real cm scale for each size (size-accurate print boxes).
    photoRuler: {
      topPct: { type: Number, default: null },
      hemPct: { type: Number, default: null },
    },
  },
  { timestamps: true },
);
export default mongoose.model("GarmentType", garmentTypeSchema);