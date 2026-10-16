// models/printSheetDayModel.js
// When a day's print sheets (Admin → Orders → Print sheets) were downloaded, so the page can warn
// before the same day is printed twice. One document per day; the last 20 downloads are kept.
import mongoose from "mongoose";

const downloadSchema = new mongoose.Schema(
  {
    at: { type: Date, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    byName: { type: String, default: "" },
    sheets: { type: Number, default: 0 },
    orders: { type: Number, default: 0 },
    pieces: { type: Number, default: 0 },
  },
  { _id: false },
);

const printSheetDaySchema = new mongoose.Schema(
  {
    day: { type: String, required: true, unique: true }, // YYYY-MM-DD, India time
    downloads: { type: [downloadSchema], default: [] },
  },
  { timestamps: true },
);

export default mongoose.model("PrintSheetDay", printSheetDaySchema);
