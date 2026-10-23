import mongoose from "mongoose";

// One message answered by the smart Assistant (23 Oct 2026). Kept apart from AiUsage on purpose: AiUsage rows are
// counted as the customer's daily PICTURE requests, and a chat message must never use one of those up. The cost is
// added to Google's monthly spend, so the monthly cap (Admin → Settings → AI) covers the chat too.
const aiChatUsageSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // null: a visitor not logged in
    costInr: { type: Number, default: 0 },
    model: { type: String, default: "" },
  },
  { timestamps: true },
);
aiChatUsageSchema.index({ createdAt: -1 });

const AiChatUsage = mongoose.model("AiChatUsage", aiChatUsageSchema);
export default AiChatUsage;
