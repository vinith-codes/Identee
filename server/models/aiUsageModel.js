import mongoose from "mongoose";

// One row per AI design request a customer made in the Design Room. Used for
// the per-customer daily limit, the monthly spending cap, and the admin's
// usage figures. Only requests that produced at least one picture are saved.
const aiUsageSchema = mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: { type: String, enum: ["new", "change", "photo", "fix", "print", "copy", "inspired", "collection", "studio", "sheet", "develop", "match", "worn"], default: "new" }, // photo = a customer's photo redrawn as art; collection = Admin → Collection maker; studio = Admin → Studio; sheet / develop = Assistant v2 concept sheets and the artwork made from them
    prompt: { type: String, maxlength: 2200 }, // what the customer asked for (not the full instruction sent to the AI)
    style: { type: String, maxlength: 60 },
    images: { type: Number, default: 0 },
    // what counts toward the customer's daily pictures when it differs from images (a developed concept: its
    // automatic redraws are free, 16 Nov 2026); unset = images
    counted: { type: Number },
    // (16 Nov 2026) the pictures Grok drew at its best size (2k) for the customer: Prepare for print enlarges them
    // with Topaz straight away (no AI copy first — another copy would not be sharper)
    grokUrls: { type: [String], default: undefined, index: true },
    costInr: { type: Number, default: 0 }, // images × the price per picture set by the admin
    model: { type: String, maxlength: 80 },
    // a concept sheet's picture and concepts (kind "sheet", round 7, 8 Nov 2026) — so the admin can feature it in Browse ideas
    sheet: { type: mongoose.Schema.Types.Mixed },
    featured: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);
aiUsageSchema.index({ createdAt: -1 });

const AiUsage = mongoose.model("AiUsage", aiUsageSchema);
export default AiUsage;
