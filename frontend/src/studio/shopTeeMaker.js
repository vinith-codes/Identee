// studio/shopTeeMaker.js — what the admin's shop-tee makers share (24 Nov 2026).
// Made for the Ayyappa collection: the owner sent 20 pictures and picked all 45 tees ("All three" garments, shop prices,
// a card of its own). The GTA maker (TrendShopTees) and the new "Add tees from a list" (Manage the shop) both list a
// tee the way the shop's other tees of that garment are listed, and both check a picture's size first.

// the garments shop tees are made on, and how a garment is listed when there is no SCENE / GTA tee of it to copy
export const GARMENTS = [
  { key: "oversized-tee", listings: [{ category: "t-shirts", style: "Oversized" }], gender: "Unisex", fit: "Oversized fit" },
  { key: "boys-round-neck", listings: [{ category: "t-shirts", style: "Round Neck" }], gender: "Men", fit: "Regular round-neck fit" },
  { key: "girls-round-neck", listings: [{ category: "womens-t-shirts", style: "Round Neck" }], gender: "Women", fit: "Regular round-neck fit" },
];

const inShop = (d) => d.status === "published" || (d.status === "ready" && d.publishedAt);

// how the tee is listed in the shop: as a SCENE tee of the same garment (else a GTA one) — its categories, style,
// fabric, care … — else as GARMENTS says
export const listingOf = (designs, plan) => {
  const like = (re) => designs.find((d) => d.garmentType === plan.key && inShop(d) && re.test(d.name || "") && d.product?.listings?.length);
  const p = (like(/^scene\s·/i) || like(/^gta\s·/i))?.product || {};
  return {
    listings: p.listings?.length ? p.listings.map(({ category, style }) => ({ category, style })) : plan.listings,
    gender: p.gender || plan.gender,
    fabric: p.fabric || "100% Cotton",
    washCare: p.washCare || [],
    hsnCode: p.hsnCode || "6109",
    oldPrice: p.oldPrice || 0,
    type: p.type || "Casual",
    ageRange: p.ageRange || "Adult",
    shipping: p.shipping || {},
  };
};

// (konvaRender is loaded only here, so the list helpers below run in the tests without a canvas)
export const sizeOf = async (url) => {
  const { loadImage } = await import("./konvaRender");
  const img = await loadImage(url, { full: true });
  return { url, w: img.naturalWidth, h: img.naturalHeight };
};

const NAME_MAX = 60; // a Studio tee's name (models/readyDesignModel.js)
const PICTURE = /\.(png|jpe?g|webp)$/i;

/**
 * The list of a collection's tees (a JSON file the admin picks with its pictures), checked.
 * json: the file's words; files: the names of the pictures picked with it.
 * -> { prefix, about, logoAt, garmentKeys, tees: [{ name (with the collection), label (without), front, back, colours }], problems: [] }
 * The file:
 *   { "collection": "AYYAPPA", "about": "Ayyappa", "frontAt": "top", "garments": ["oversized-tee", …],
 *     "tees": [{ "name": "Sun Rider – Tiger Saranam", "front": "front-09.png", "back": "back-11.png", "colours": ["Black", "White"] }, …] }
 * "back" may be left out (a tee with only the front logo).
 */
export function readTeeList(json, files = []) {
  const problems = [];
  let list;
  try {
    list = typeof json === "string" ? JSON.parse(json) : json;
  } catch {
    return { tees: [], problems: ["The list file is not proper JSON."] };
  }
  if (!list || typeof list !== "object") return { tees: [], problems: ["The list file is empty."] };
  const prefix = String(list.collection || "").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9 -]{0,23}$/.test(prefix)) problems.push("“collection” must be a short name in letters, e.g. AYYAPPA.");
  if (prefix === "SCENE" || prefix === "GTA") problems.push(`“${prefix}” is made elsewhere — pick another collection name.`);
  const garmentKeys = Array.isArray(list.garments) && list.garments.length ? list.garments.map(String) : GARMENTS.map((g) => g.key);
  for (const k of garmentKeys) if (!GARMENTS.some((g) => g.key === k)) problems.push(`Unknown garment “${k}”.`);
  const have = new Set(files.map((f) => String(f).toLowerCase()));
  const seen = new Set();
  const tees = [];
  (Array.isArray(list.tees) ? list.tees : []).forEach((t, i) => {
    const where = `Tee ${i + 1}`;
    const name = String(t?.name || "").trim();
    const front = String(t?.front || "").trim();
    const back = t?.back ? String(t.back).trim() : null;
    const colours = (Array.isArray(t?.colours) ? t.colours : []).map((c) => String(c).trim()).filter(Boolean);
    if (!name) return problems.push(`${where} has no name.`);
    const full = `${prefix} · ${name}`;
    if (full.length > NAME_MAX) problems.push(`“${name}” is too long (${full.length} letters with the collection name, ${NAME_MAX} at most).`);
    if (seen.has(name.toLowerCase())) problems.push(`“${name}” is in the list twice.`);
    seen.add(name.toLowerCase());
    if (!front) problems.push(`“${name}” has no front picture.`);
    for (const f of [front, back].filter(Boolean)) {
      if (!PICTURE.test(f)) problems.push(`“${name}”: ${f} is not a PNG, JPG or WebP picture.`);
      else if (!have.has(f.toLowerCase())) problems.push(`“${name}”: the picture ${f} was not picked.`);
    }
    if (!colours.length) problems.push(`“${name}” has no colours.`);
    tees.push({ name: full, label: name, front, back, colours });
  });
  if (!tees.length && !problems.length) problems.push("The list has no tees.");
  return { prefix, about: String(list.about || prefix).trim().slice(0, 40), logoAt: list.frontAt === "top" ? "top" : "middle", garmentKeys, tees, problems };
}

/** A tee's colours on a garment, by name or slug ("Black" → the garment's black), in the list's order. */
export const coloursOn = (garmentColours, names) =>
  names
    .map((n) => (garmentColours || []).find((c) => [c.name, c.slug].some((x) => String(x || "").toLowerCase() === n.toLowerCase())))
    .filter((c, i, all) => c && all.indexOf(c) === i);

/**
 * Every tee × garment still to make: [{ name, front, back, colours (the garment's), garment, plan }].
 * garments: the live products (Studio setup); designs: the Studio's tees (a tee of the same name on the same garment is
 * already made). A garment that isn't live, or a tee none of whose colours that garment has, is skipped (in `skipped`).
 */
export function teesToMake(list, garments, designs = []) {
  const have = new Set(designs.map((d) => `${d.garmentType}|${String(d.name || "").toLowerCase()}`));
  const todo = [];
  const skipped = [];
  let made = 0;
  for (const key of list.garmentKeys || []) {
    const plan = GARMENTS.find((g) => g.key === key);
    const garment = garments.find((g) => g.key === key);
    if (!plan) continue;
    if (!garment) {
      skipped.push(`${key} is not a live product`);
      continue;
    }
    for (const t of list.tees) {
      if (have.has(`${key}|${t.name.toLowerCase()}`)) {
        made += 1;
        continue;
      }
      const colours = coloursOn(garment.colours, t.colours);
      if (!colours.length) {
        skipped.push(`${t.name} (${garment.label}): no ${t.colours.join(" / ")}`);
        continue;
      }
      todo.push({ ...t, colours, garment, plan });
    }
  }
  return { todo, made, skipped };
}
