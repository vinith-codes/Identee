import mongoose from "mongoose";

// A ready-made tee design for "Shop your IDENTEE", made by the Collection maker (25 Oct 2026). Sold print on
// demand: a customer who buys it gets their own copy as a design (Customization, fromReady = this) that goes
// through the same cart, checkout and print sheets as a tee designed in the design room. Nothing is kept in stock.
//
// status: planned (idea only) → drafted (picture made and placed; the admin's browser still has to fit the
//         words, check it and take the mockup pictures) → ready (waiting for Publish) → published | rejected
//         | failed (the picture could not be made; error says why)
const readyDesignSchema = new mongoose.Schema(
  {
    collectionId: { type: mongoose.Schema.Types.ObjectId, ref: "DesignCollection", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    slug: { type: String, required: true, unique: true }, // the shop address: /ready-made/design/<slug>
    blurb: { type: String, default: "", maxlength: 300 }, // a line for the shop page
    garmentType: { type: String, required: true },
    color: { type: String, required: true }, // tee colour slug
    size: { type: String, default: "M" }, // the size it was laid out at (prints follow each size's true print area)
    // the AI's plan for this tee (kept so a picture can be made again the same way)
    plan: {
      idea: { type: String, default: "" },
      layout: { type: String, default: "" },
      words: { type: String, default: "" },
      font: { type: String, default: "" },
      ink: { type: String, default: "" },
      subject: { type: String, default: "" }, // what the picture shows (sent to the picture AI)
      style: { type: String, default: "" },
      realPerson: { type: Boolean, default: false },
    },
    service: { type: String, enum: ["google", "grok", ""], default: "" }, // who drew the picture
    art: {
      url: { type: String, default: "" },
      width: { type: Number, default: 0 },
      height: { type: Number, default: 0 },
    },
    // layout v2 elements (as Customization.elements). While drafted, a text item also carries `slot`: the box the
    // admin's browser fits the words into (it measures the letters; the server can't).
    elements: { type: [mongoose.Schema.Types.Mixed], default: [] },
    mockups: {
      front: { type: String, default: null },
      back: { type: String, default: null },
      left: { type: String, default: null },
      right: { type: String, default: null },
    },
    issues: { type: [String], default: [] }, // what the print check still says (shown to the admin)
    status: { type: String, enum: ["planned", "drafted", "ready", "published", "rejected", "failed"], default: "planned", index: true },
    error: { type: String, default: "" },
    costInr: { type: Number, default: 0 },
    order: { type: Number, default: 0 }, // its place in the collection
    publishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
readyDesignSchema.index({ status: 1, publishedAt: -1 });

export default mongoose.model("ReadyDesign", readyDesignSchema);
