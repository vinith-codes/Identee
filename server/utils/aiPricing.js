// utils/aiPricing.js — what a picture on the tee adds to its price, and how an AI-made picture is recognised.
// Client's rule (16 Oct 2026, art library free from 20 Oct): a tee with an AI-made picture or the customer's own upload —
// costs +₹100 (once per tee, however many pictures); text only costs the garment's price.
// (Used by the checkout and the AI controller; the amount is set in Admin → Settings → AI designs.)
import Setting from "../models/settingModel.js";
import ArtDesign from "../models/artDesignModel.js";

export const AI_ADDON_KEY = "ai.designAddOnInr";
export const AI_ADDON_DEFAULT = 100;

// A picture this site's AI made (stored under identee/ai-designs on Cloudinary, or /uploads/ai-designs locally).
export const isAiDesignUrl = (url) => {
  const cloud = process.env.CLOUDINARY_NAME?.trim();
  const s = String(url || "");
  return (cloud && s.startsWith(`https://res.cloudinary.com/${cloud}/`) && s.includes("/identee/ai-designs/")) || /^\/uploads\/ai-designs\/[\w\-.]+$/.test(s);
};

// ₹ added to each tee whose design has at least one picture
export async function aiDesignAddOn() {
  const row = await Setting.findOne({ key: AI_ADDON_KEY }).select("value").lean();
  const n = Number(row?.value);
  return Number.isFinite(n) && n >= 0 ? n : AI_ADDON_DEFAULT;
}


// Client's rule (20 Oct 2026): art library pictures are free — only an AI-made or uploaded picture adds the amount.
// A picture counts as art library only when it is still that design's own picture (its artDesignId's imageUrl),
// so a changed or uploaded picture can't be passed off as one.
export async function hasPaidPicture(elements = []) {
  const pictures = elements.filter((el) => el?.type === "image" && el.src);
  if (!pictures.length) return false;
  const ids = [...new Set(pictures.map((el) => el.artDesignId).filter(Boolean).map(String))];
  const art = ids.length ? await ArtDesign.find({ _id: { $in: ids } }).select("imageUrl").lean() : [];
  const artSrc = new Map(art.map((d) => [String(d._id), d.imageUrl]));
  return pictures.some((el) => !el.artDesignId || artSrc.get(String(el.artDesignId)) !== el.src);
}
