// utils/aiPricing.js — what an AI-made design adds to a tee's price, and how such a picture is recognised.
// (Used by the checkout and the AI controller; the amount is set in Admin → Settings → AI designs.)
import Setting from "../models/settingModel.js";

export const AI_ADDON_KEY = "ai.designAddOnInr";
export const AI_ADDON_DEFAULT = 100;

// A picture this site's AI made (stored under identee/ai-designs on Cloudinary, or /uploads/ai-designs locally).
export const isAiDesignUrl = (url) => {
  const cloud = process.env.CLOUDINARY_NAME?.trim();
  const s = String(url || "");
  return (cloud && s.startsWith(`https://res.cloudinary.com/${cloud}/`) && s.includes("/identee/ai-designs/")) || /^\/uploads\/ai-designs\/[\w\-.]+$/.test(s);
};

// ₹ added to each tee whose design has at least one AI-made picture
export async function aiDesignAddOn() {
  const row = await Setting.findOne({ key: AI_ADDON_KEY }).select("value").lean();
  const n = Number(row?.value);
  return Number.isFinite(n) && n >= 0 ? n : AI_ADDON_DEFAULT;
}

// does this design (its elements) have an AI-made picture on it?
export const hasAiPicture = (elements = []) => elements.some((el) => el?.type === "image" && isAiDesignUrl(el.src));
