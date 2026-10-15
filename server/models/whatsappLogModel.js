// models/whatsappLogModel.js — every WhatsApp message the shop tried to send (order updates and tests),
// for the admin page: what went out, to which (masked) number, and Meta's answer when it failed.
import mongoose from "mongoose";

const whatsappLogSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", default: null },
    orderNumber: { type: String, default: "" },
    event: { type: String, default: "" }, // ORDERED | PACKED | OUT_FOR_DELIVERY | DELIVERED | CANCELLED | TEST
    template: { type: String, default: "" },
    to: { type: String, default: "" }, // masked: +91 98•••••210
    ok: { type: Boolean, default: false },
    messageId: { type: String, default: "" },
    error: { type: String, default: "" },
  },
  { timestamps: true },
);
whatsappLogSchema.index({ createdAt: -1 });

export default mongoose.model("WhatsappLog", whatsappLogSchema);
