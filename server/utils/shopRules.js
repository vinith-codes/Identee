// utils/shopRules.js — Shop your IDENTEE's own rules (the client, 30 Oct 2026):
// - only dark colours and White are on sale there, and no Royal Blue on Round Neck (the colours stay on the tees,
//   just not shown);
// - a tee costs its garment's price (Round Neck ₹499, Oversized ₹699): the picture add-on of the design room is not
//   charged for the shop's own pictures, only for a picture the customer adds when they change the tee;
// - an order of only Shop your IDENTEE tees ships free;
// - tees are grouped into collections by the first part of their name ("SCENE · The One" → SCENE).
import ReadyDesign from "../models/readyDesignModel.js";
import { aiDesignAddOn, hasPaidPicture } from "./aiPricing.js";

// colours not shown in Shop your IDENTEE, and colours not shown in one style (the client, 30 Oct 2026: "remove royal
// blue in round neck")
export const LIGHT_COLOURS = ["yellow", "mustard yellow", "grey", "light brown", "pink", "baby pink", "hot pink", "lavender", "sky blue", "cream"];
export const HIDDEN_IN_STYLE = { "round neck": ["royal blue"] };
const norm = (s) => String(s || "").trim().toLowerCase();
// style: the tee's style ("Round Neck") — or any words that contain it, such as the garment's name
export const shownInShop = (colourName, style = "") => {
  const colour = norm(colourName);
  if (LIGHT_COLOURS.includes(colour)) return false;
  return !Object.entries(HIDDEN_IN_STYLE).some(([s, colours]) => norm(style).includes(s) && colours.includes(colour));
};
// the same as a database match, to spread into a Product query
const named = (list) => ({ $in: list.map((c) => new RegExp(`^\\s*${c}\\s*$`, "i")) });
export const SHOWN_IN_SHOP = {
  $nor: [
    { "productdetails.color": named(LIGHT_COLOURS) },
    ...Object.entries(HIDDEN_IN_STYLE).map(([s, colours]) => ({ "productdetails.garmentStyle": named([s]), "productdetails.color": named(colours) })),
  ],
};

// "SCENE · The One" → "scene"; a name with no " · " is in no collection ("")
export const collectionOf = (name) => {
  const parts = String(name || "").split(" · ");
  return parts.length > 1 ? norm(parts[0]).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "";
};
export const collectionTitle = (name) => {
  const parts = String(name || "").split(" · ");
  return parts.length > 1 ? parts[0].trim() : "";
};

// the picture add-on for a customer's copy of a shop tee: only a picture that isn't one of the shop tee's own
export async function shopTeeAddOn(customization) {
  const ready = await ReadyDesign.findById(customization.fromReady).select("elements").lean();
  const own = new Set((ready?.elements || []).filter((e) => e.type === "image" && e.src).map((e) => e.src));
  const added = (customization.elements || []).filter((e) => !(e.type === "image" && own.has(e.src)));
  return (await hasPaidPicture(added)) ? aiDesignAddOn() : 0;
}

// the shop tee's own pictures (the design room leaves them out of the picture add-on)
export async function readyPictures(fromReady) {
  if (!fromReady) return [];
  const ready = await ReadyDesign.findById(fromReady).select("elements").lean();
  return [...new Set((ready?.elements || []).filter((e) => e.type === "image" && e.src).map((e) => e.src))];
}
