// services/trendTeeNames.js — a trend's shop tees follow its ready designs' names (24 Nov 2026)
// The owner: the GTA shop tees were called "GTA · Design 77", "GTA · Design 78" — "it should not be like that". The
// tees are named after the ready design on their back ("GTA · <name>", made by Admin → Trends → Make GTA shop tees),
// so when a ready design gets a new name on the Trends page, its tees (Oversized, Round Neck Men and Women) and their
// shop products get the same new name — no new pictures.
import ReadyDesign from "../models/readyDesignModel.js";
import Product from "../models/productModel.js";

// a ready design's title, exactly as the Make-shop-tees button names its tees (frontend/src/pages/admin/TrendShopTees.jsx
// wantedTees): its name, or "Design <n>"; a repeated name gets " 2", " 3" …
export function backTitles(backs = []) {
  const seen = new Map();
  return backs.map((b, i) => {
    let title = String(b?.name || "").trim() || `Design ${i + 1}`;
    const n = (seen.get(title.toLowerCase()) || 0) + 1;
    seen.set(title.toLowerCase(), n);
    if (n > 1) title = `${title} ${n}`;
    return title;
  });
}

export const teeName = (key, title) => `${String(key || "").toUpperCase()} · ${title}`.slice(0, 60);
const exactly = (s) => new RegExp(`^${String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");

/** [{ from, to }] — the tee names that change when the backs go from `before` to `after` (matched by picture). */
export function renamesOf(key, before = [], after = []) {
  const oldTitles = backTitles(before);
  const newTitles = backTitles(after);
  const out = [];
  after.forEach((b, i) => {
    const k = before.findIndex((x) => x.url === b.url);
    if (k < 0) return;
    const from = teeName(key, oldTitles[k]);
    const to = teeName(key, newTitles[i]);
    if (from.toLowerCase() !== to.toLowerCase()) out.push({ from, to });
  });
  return out;
}

/** Renames the Studio tees (and their shop products) named `from` to `to`. -> how many tees were renamed */
export async function renameTrendTees(renames) {
  let tees = 0;
  for (const { from, to } of renames) {
    if (await ReadyDesign.exists({ source: "studio", status: { $ne: "removed" }, name: exactly(to) })) continue; // that name is taken: leave both
    const designs = await ReadyDesign.find({ source: "studio", name: exactly(from) }, { _id: 1 }).lean();
    if (!designs.length) continue;
    const ids = designs.map((d) => d._id);
    await ReadyDesign.updateMany({ _id: { $in: ids } }, { $set: { name: to } });
    await Product.updateMany({ readyDesign: { $in: ids } }, { $set: { brandname: to } });
    tees += ids.length;
  }
  return tees;
}
