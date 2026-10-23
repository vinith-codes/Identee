import mongoose from "mongoose";

// A saved chat of the design room's Assistant (23 Oct 2026): the conversation and the tee it was designing, so a
// customer who leaves (or starts a new design) finds it again under "Chats" — on any device they log in on.
// Visitors who aren't logged in keep their chats in the browser instead (frontend studio/chatStore.js); those move
// here when they log in.
//
// `body` is the chat itself as the page keeps it (messages, the Assistant's state, the design), stored as JSON
// text: the server only keeps it for the customer and never reads it (orders use the saved design, not this).
const designChatSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    chatId: { type: String, required: true }, // made by the page
    garmentType: { type: String, default: "" },
    title: { type: String, default: "" },
    colour: { type: String, default: "" },
    designId: { type: String, default: null }, // the design in My designs, when it was saved there
    body: { type: String, default: "{}" },
  },
  { timestamps: true },
);
designChatSchema.index({ user: 1, chatId: 1 }, { unique: true });
designChatSchema.index({ user: 1, updatedAt: -1 });
// a chat nobody opened for 90 days goes by itself
designChatSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const DesignChat = mongoose.model("DesignChat", designChatSchema);
export default DesignChat;
