// models/designHelpModel.js — "Ask the IDENTEE team to finish it" (Assistant round 6, 8 Nov 2026): a customer who is
// stuck hands their tee and chat to the team; the admin sees it under Design Studio → Help requests, finishes the
// design in the Studio and gets in touch (WhatsApp / phone / email), then marks it done.
import mongoose from "mongoose";

const designHelpSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, default: "" },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    garment: { type: String, default: "" }, // the garment type key, e.g. "oversized-tee"
    colour: { type: String, default: "" }, // the colour slug
    size: { type: String, default: "" },
    note: { type: String, default: "", maxlength: 1000 }, // what the customer asked for, in their words
    chat: [{ who: { type: String }, text: { type: String, maxlength: 1500 } }], // the last part of their chat
    design: { type: mongoose.Schema.Types.Mixed }, // the tee as it is: { elements, positions } (the room's own format)
    mockupUrl: { type: String, default: "" }, // a picture of the front, as the customer saw it
    status: { type: String, enum: ["new", "done"], default: "new", index: true },
    doneAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export default mongoose.model("DesignHelp", designHelpSchema);
