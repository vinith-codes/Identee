import mongoose from "mongoose";

// One run of the Collection maker (Admin → Collection maker, 25 Oct 2026): the admin's prompt, the brief the AI
// made from it (checked and changed by the admin before anything is spent), the facts it looked up and how far the
// pipeline has got. The tees it makes are ReadyDesign rows pointing back here.
//
// status: brief (waiting for the admin's Start) → running → review (tees made, waiting for Publish / Reject)
//         | failed (stopped; error says why)
const briefSchema = new mongoose.Schema(
  {
    improved: { type: String, default: "", maxlength: 3000 }, // the admin's prompt, rewritten by the AI as a clear brief
    understood: { type: [{ label: String, value: String, _id: false }], default: [] }, // what the AI understood, line by line
    theme: { type: String, default: "", maxlength: 200 },
    count: { type: Number, default: null, min: 1, max: 10 }, // null = not given yet (a question for the admin)
    garments: { type: [String], default: [] }, // products (GarmentType keys); [] = not given yet
    style: { type: String, default: "", maxlength: 300 }, // mood in words: "retro poster, bold, slightly funny"
    language: { type: String, default: null, maxlength: 60 }, // of the words: English / Tamil / Tanglish / No words; null = not given
    colours: { type: [String], default: [] }, // tee colour slugs it may use (empty = any)
    avoid: { type: String, default: "", maxlength: 300 },
    realPeople: { type: Boolean, default: false }, // the admin's tick: Grok may draw real people
    sources: { type: String, enum: ["ai", "art", "both"], default: "ai" }, // pictures: AI-made, from the art library, or both
    layouts: { type: [String], default: [] }, // the layouts the admin picked (LAYOUTS keys); [] = the AI chooses
    budget: { type: Number, default: 5, min: 1, max: 20 }, // the most pictures this run may make (retries included)
    missing: { type: [String], default: [] }, // what the admin still has to answer: garments / count / language
  },
  { _id: false },
);

const designCollectionSchema = new mongoose.Schema(
  {
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    prompt: { type: String, required: true, maxlength: 2000 },
    refImage: { type: String, default: "" }, // the first example picture (required; stored with us — a reference only)
    refImages: { type: [String], default: [] }, // all the example pictures (25 Oct 2026: up to 10)
    refNotes: { type: String, default: "", maxlength: 900 }, // what the AI saw in it: look, colours, layout
    brief: { type: briefSchema, default: () => ({}) },
    facts: {
      summary: { type: String, default: "" },
      points: { type: [String], default: [] },
      sources: { type: [{ title: String, url: String, _id: false }], default: [] },
    },
    status: { type: String, enum: ["brief", "running", "review", "failed"], default: "brief", index: true },
    step: { type: String, default: "" }, // what it is doing now, in plain words ("Making picture 2 of 3")
    error: { type: String, default: "" },
    pictures: { type: Number, default: 0 }, // pictures made so far (counts against brief.budget)
    spentInr: { type: Number, default: 0 }, // pictures + text calls, rupees
    startedAt: { type: Date, default: null },
    finishedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
designCollectionSchema.index({ createdAt: -1 });

export default mongoose.model("DesignCollection", designCollectionSchema);
