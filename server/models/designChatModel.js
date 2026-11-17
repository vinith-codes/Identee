import mongoose from "mongoose";

// A saved chat of the design room's Assistant (23 Oct 2026): the conversation and the tee it was designing, so a
// customer who leaves (or starts a new design) finds it again under "Chats" — on any device they log in on.
// Visitors who aren't logged in keep their chats in the browser instead (frontend studio/chatStore.js); those move
// here when they log in.
//
// `body` is the chat itself as the page keeps it (messages, the Assistant's state, the design), stored as JSON
// text: the server only keeps it for the customer and never reads it (orders use the saved design, not this).

// How long a chat nobody changed is kept (13 Nov 2026: one place to change it; the frontend's chatStore.js says the
// same number to the customer). 0 = kept for good. An index already on the database keeps its old time until
// scripts/updateChatExpiry.js --apply is run (Mongoose never changes an existing expiry by itself).
export const CHAT_DAYS = 90;

const designChatSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    chatId: { type: String, required: true }, // made by the page
    garmentType: { type: String, default: "" },
    title: { type: String, default: "" },
    colour: { type: String, default: "" },
    designId: { type: String, default: null }, // the design in My designs, when it was saved there
    body: { type: String, default: "{}" },
    // the page's stamp of this copy (13 Nov 2026): it only goes up, so an older copy (another device, an old open
    // tab) can't be saved over a newer one — see utils/chatStamps.js
    at: { type: Number, default: 0 },
  },
  { timestamps: true },
);
designChatSchema.index({ user: 1, chatId: 1 }, { unique: true });
designChatSchema.index({ user: 1, updatedAt: -1 });
// a chat nobody changed for CHAT_DAYS days goes by itself (saves happen only on real changes, so updatedAt is "last changed")
if (CHAT_DAYS > 0) designChatSchema.index({ updatedAt: 1 }, { expireAfterSeconds: CHAT_DAYS * 24 * 60 * 60 });

const DesignChat = mongoose.model("DesignChat", designChatSchema);
export default DesignChat;

// A chat the customer deleted (13 Nov 2026): a small mark, so a device that still has it open is told "deleted"
// (410) and starts a new chat. A chat that went by itself (not changed for CHAT_DAYS days, or past the newest 20) has
// no mark (404): the device that still has it saves it again. The mark goes by itself after CHAT_DAYS days too.
const deletedChatSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  chatId: { type: String, required: true },
  at: { type: Date, default: Date.now },
});
deletedChatSchema.index({ user: 1, chatId: 1 }, { unique: true });
deletedChatSchema.index({ at: 1 }, { expireAfterSeconds: (CHAT_DAYS || 365) * 24 * 60 * 60 });
export const DeletedChat = mongoose.model("DeletedChat", deletedChatSchema);
