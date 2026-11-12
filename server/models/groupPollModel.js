// models/groupPollModel.js — one group link (11 Nov 2026, Assistant round 8)
//
// A customer making tees for a team, class or family shares ONE link. Each friend opens it (no account needed), votes
// for a concept and fills in their name, size and number. Back in the Design Room the owner taps "Fill my tees" and
// every answer becomes a tee. Only the owner ever sees the names; the public page shows the picture and the counts.
import mongoose from "mongoose";

const entrySchema = new mongoose.Schema(
  {
    key: { type: String, required: true }, // kept in the friend's own browser, so they can correct their answer
    name: { type: String, required: true, trim: true, maxlength: 24 },
    size: { type: String, default: "", maxlength: 12 },
    number: { type: String, default: "", maxlength: 4 },
    vote: { type: Number, default: null },
  },
  { timestamps: true, _id: false },
);

const groupPollSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    token: { type: String, required: true, unique: true },
    title: { type: String, default: "", trim: true, maxlength: 80 },
    garment: { type: String, default: "", maxlength: 60 }, // "Oversized Tee", shown on the page
    picture: { type: String, default: "" }, // the concept sheet (or the tee) the friends look at: one of our own uploads
    options: [{ n: Number, title: { type: String, maxlength: 60 }, _id: false }], // what they vote on; empty = no vote
    sizes: [{ type: String, maxlength: 12 }],
    askNumber: { type: Boolean, default: false },
    entries: [entrySchema],
    closedAt: { type: Date, default: null },
  },
  { timestamps: true },
);


export default mongoose.model("GroupPoll", groupPollSchema);
