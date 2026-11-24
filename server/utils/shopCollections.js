// utils/shopCollections.js — the admin's settings for Shop your IDENTEE's collections (24 Nov 2026)
//
// Admin → Shop your IDENTEE → Manage the shop: a collection's name and line of text, the order the collections come
// in (shop page, menu, chips) and which ones the home page's "Pick your story" stage shows.
// One setting, "shop.collections": { order: ["ayyappa", "gta", …], items: { ayyappa: { name, text, home } } }.
import Setting from "../models/settingModel.js";

export const KEY = "shop.collections";
// before the admin saves anything: the home page shows GTA and Ayyappa (as it did, 24 Nov 2026)
export const DEFAULT_HOME = ["gta", "ayyappa"];

const line = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const slug = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9-]+/g, "").slice(0, 40);

// a clean copy of what the admin sent (anything else left out)
export function cleanCollections(body = {}) {
  const order = [...new Set((Array.isArray(body.order) ? body.order : []).map(slug).filter(Boolean))].slice(0, 60);
  const items = {};
  for (const [k, v] of Object.entries(body.items && typeof body.items === "object" ? body.items : {}).slice(0, 60)) {
    const key = slug(k);
    if (!key || !v || typeof v !== "object") continue;
    items[key] = { name: line(v.name, 40), text: line(v.text, 200), home: Boolean(v.home) };
  }
  return { order, items };
}

export async function readCollections() {
  const doc = await Setting.findOne({ key: KEY }).lean();
  return doc?.value && typeof doc.value === "object" ? cleanCollections(doc.value) : null;
}

export async function saveCollections(body, userId) {
  const value = cleanCollections(body);
  await Setting.findOneAndUpdate(
    { key: KEY },
    { $set: { value, type: "json", category: "shop", isPublic: false, description: "Shop your IDENTEE collections: names, order, home page", updatedBy: userId } },
    { upsert: true },
  );
  return value;
}

// the shop's collection list with the admin's settings on it, in the admin's order (the rest after, as they were)
export function withSettings(list, conf) {
  const at = (key) => {
    const i = conf?.order?.indexOf(key) ?? -1;
    return i < 0 ? 1e6 : i;
  };
  return list
    .map((c, i) => {
      const s = conf?.items?.[c.key] || {};
      return { ...c, name: s.name || c.name, text: s.text || "", custom: Boolean(s.name || s.text), home: conf?.items?.[c.key] ? Boolean(s.home) : DEFAULT_HOME.includes(c.key), i };
    })
    .sort((a, b) => at(a.key) - at(b.key) || a.i - b.i)
    .map(({ i, ...c }) => c); // eslint-disable-line no-unused-vars
}
