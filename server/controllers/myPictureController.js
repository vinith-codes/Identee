import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import MyPicture from "../models/myPictureModel.js";

// "My pictures" (23 Oct 2026) — see models/myPictureModel.js.
export const PICTURES_KEPT = 100;

const shown = (p) => ({ id: String(p._id), url: p.url, kind: p.kind, about: p.about, style: p.style, width: p.width, height: p.height, createdAt: p.createdAt });

/**
 * Adds pictures to a customer's list (called where pictures are made or uploaded). Never fails the request it is
 * called from: a picture that couldn't be listed is still made.
 * @param userId   the customer
 * @param pictures [{ url, kind: "ai" | "photo", about, style, width, height }]
 */
export async function rememberPictures(userId, pictures) {
  if (!userId || !pictures?.length) return;
  try {
    for (const p of pictures) {
      if (!p?.url) continue;
      await MyPicture.updateOne(
        { user: userId, url: String(p.url) },
        {
          // (made again — like a photo sent twice — it simply comes back to the top)
          $set: { kind: p.kind === "photo" ? "photo" : "ai", about: String(p.about || "").replace(/\s+/g, " ").trim().slice(0, 300), style: String(p.style || "").slice(0, 60), width: Math.round(Number(p.width) || 0), height: Math.round(Number(p.height) || 0), createdAt: new Date() },
        },
        { upsert: true, timestamps: false },
      );
    }
    const old = await MyPicture.find({ user: userId }).sort({ createdAt: -1 }).skip(PICTURES_KEPT).select("_id").lean();
    if (old.length) await MyPicture.deleteMany({ _id: { $in: old.map((p) => p._id) } });
  } catch (err) {
    console.error("[my pictures] couldn't list a picture:", err?.message || err);
  }
}

// @desc   The customer's pictures, newest first
// @route  GET /api/my-pictures
// @access Private
export const listMyPictures = asyncHandler(async (req, res) => {
  const rows = await MyPicture.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(PICTURES_KEPT).lean();
  res.json(rows.map(shown));
});

// @desc   Take a picture off the list (the file stays — it may be on a saved design or an order)
// @route  DELETE /api/my-pictures/:id
// @access Private
export const removeMyPicture = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400);
    throw new Error("Unknown picture.");
  }
  await MyPicture.deleteOne({ _id: req.params.id, user: req.user._id });
  res.json({ ok: true });
});
