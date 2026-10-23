import mongoose from "mongoose";

// "My pictures" (23 Oct 2026): every picture a customer made or brought in the design room — AI pictures and their
// own uploaded photos — so they can put one on a new tee later without drawing (or paying for) it again. The newest
// PICTURES_KEPT per customer are kept (controllers/myPictureController.js). Removing one from the list never
// deletes the file: it may be on a saved design or an order.
const myPictureSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    url: { type: String, required: true },
    kind: { type: String, enum: ["ai", "photo"], default: "ai" },
    about: { type: String, default: "", maxlength: 300 }, // what was asked for ("a lion with a crown"), or "Your photo"
    style: { type: String, default: "", maxlength: 60 },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
  },
  { timestamps: true },
);
myPictureSchema.index({ user: 1, url: 1 }, { unique: true });
myPictureSchema.index({ user: 1, createdAt: -1 });

const MyPicture = mongoose.model("MyPicture", myPictureSchema);
export default MyPicture;
