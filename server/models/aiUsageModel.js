import mongoose from "mongoose";

// One row per AI design request a customer made in the Design Room. Used for
// the per-customer daily limit, the monthly spending cap, and the admin's
// usage figures. Only requests that produced at least one picture are saved.
const aiUsageSchema = mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: { type: String, enum: ["new", "change", "photo"], default: "new" }, // photo = a customer's photo redrawn as art
    prompt: { type: String, maxlength: 600 }, // what the customer asked for (not the full instruction sent to the AI)
    style: { type: String, maxlength: 60 },
    images: { type: Number, default: 0 },
    costInr: { type: Number, default: 0 }, // images × the price per picture set by the admin
    model: { type: String, maxlength: 80 },
  },
  { timestamps: true },
);
aiUsageSchema.index({ createdAt: -1 });

const AiUsage = mongoose.model("AiUsage", aiUsageSchema);
export default AiUsage;
