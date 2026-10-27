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
    // the Collection maker's run it came from; null for a tee designed by hand in the Studio (source "studio", 25 Oct 2026)
    collectionId: { type: mongoose.Schema.Types.ObjectId, ref: "DesignCollection", default: null, index: true },
    source: { type: String, enum: ["collection", "studio"], default: "collection", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    slug: { type: String, required: true, unique: true }, // the shop address: /ready-made/design/<slug>
    blurb: { type: String, default: "", maxlength: 300 }, // a line for the shop page
    garmentType: { type: String, required: true },
    color: { type: String, required: true }, // tee colour slug
    size: { type: String, default: "M" }, // the size it was laid out at (prints follow each size's true print area)
    // the AI's plan for this tee: its parts — pictures (AI-made or from the art library) and words, each on a print
    // area and a place in it (full / top / middle / bottom / small / top-band / bottom-band). A part with a picture
    // keeps it in part.art { url, width, height, service, artDesignId? }, so it can be kept when the tee is changed.
    // (words / font / ink / subject / style: the first plans' one-picture-one-line form, 25 Oct 2026 — still read)
    plan: {
      idea: { type: String, default: "" },
      layout: { type: String, default: "" }, // the starting point it used ("custom" = its own)
      parts: { type: [mongoose.Schema.Types.Mixed], default: [] },
      notes: { type: [String], default: [] }, // parts the AI asked for that couldn't be used (an area the product hasn't…)
      words: { type: String, default: "" },
      font: { type: String, default: "" },
      ink: { type: String, default: "" },
      subject: { type: String, default: "" },
      style: { type: String, default: "" },
      realPerson: { type: Boolean, default: false },
    },
    changes: { type: [String], default: [] }, // what the admin asked to change ("make the words bigger"), oldest first
    service: { type: String, enum: ["google", "grok", "art", "mixed", ""], default: "" }, // who drew the pictures
    // the first picture (the admin's card shows it until the mockups are taken)
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
    // what the admin fills in before publishing (26 Oct 2026): the shop category it is listed under, the sizes and
    // colours it is sold in (each colour with its own four mockup pictures; the designed colour first — `color` and
    // `mockups` above stay that first one), and a price of its own (0 = the garment's price + the AI picture add-on)
    category: { type: String, default: "" },
    sizes: { type: [String], default: [] },
    // photos: AI pictures of a person wearing the tee in that colour (26 Oct 2026) — [{ wearer: man|woman, side: front|back, url }]
    colours: { type: [new mongoose.Schema({ slug: String, mockups: { front: String, back: String, left: String, right: String }, photos: { type: [new mongoose.Schema({ wearer: String, side: String, url: String }, { _id: false })], default: [] } }, { _id: false })], default: [] },
    priceInr: { type: Number, default: 0 },
    // the product details the shop needs (26 Oct 2026, the same as Add a product): style, description, gender, fabric,
    // oldPrice, subcategory, sku, hsnCode, ageRange, type, washCare[], featured, shipping { weight, length, width, height }
    product: { type: mongoose.Schema.Types.Mixed, default: {} },
    productGroupId: { type: String, default: "" }, // its product in the shop once published (the first category's)
    productGroups: { type: mongoose.Schema.Types.Mixed, default: {} }, // { categorySlug: productGroupId } — one group per category (27 Oct 2026)
    // the Studio's earlier saves of this tee, newest last (Step 3, 25 Oct 2026): Restore brings one back
    versions: { type: [new mongoose.Schema({ at: Date, note: String, color: String, size: String, elements: [mongoose.Schema.Types.Mixed] }, { _id: false })], default: [] },
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
