// utils/shopManage.js — the sums behind Admin → Shop your IDENTEE → Manage the shop (24 Nov 2026)
// (no React here, so the node tests can check them). A tee is a row from GET /api/studio/shop:
// { _id, name, collection, collectionName, inShop, style, gender, colours: [{ slug, name, hex, hidden }], price, oldPrice }

const norm = (s) => String(s || "").toLowerCase();

// the tees of one collection ("" = the whole shop)
export const inScope = (tees, collection = "") => (collection ? tees.filter((t) => t.collection === collection) : tees);

// the tee list's filters: words, collection, style, gender, colour, in the shop / taken out
export function filterTees(tees, f = {}) {
  const words = norm(f.q).split(/\s+/).filter(Boolean);
  return tees.filter(
    (t) =>
      (!f.collection || t.collection === f.collection) &&
      (!f.style || t.style === f.style) &&
      (!f.gender || t.gender === f.gender) &&
      (!f.colour || t.colours.some((c) => c.slug === f.colour)) &&
      (!f.status || (f.status === "in" ? t.inShop : !t.inShop)) &&
      words.every((w) => norm(`${t.name} ${t.style} ${t.gender} ${t.colours.map((c) => c.name).join(" ")}`).includes(w)),
  );
}

// a switch per style (or per Men / Women): [{ name, inShop, out, ids }]
export function groupBy(tees, field) {
  const map = new Map();
  for (const t of tees) {
    const name = t[field] || "—";
    if (!map.has(name)) map.set(name, { name, inShop: 0, out: 0, ids: [] });
    const g = map.get(name);
    g[t.inShop ? "inShop" : "out"] += 1;
    g.ids.push(t._id);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// a switch per colour: [{ slug, name, hex, shown, hidden, ids }] — shown/hidden count the tees sold in that colour
export function colourGroups(tees) {
  const map = new Map();
  for (const t of tees) {
    for (const c of t.colours) {
      if (!map.has(c.slug)) map.set(c.slug, { slug: c.slug, name: c.name, hex: c.hex, shown: 0, hidden: 0, ids: [] });
      const g = map.get(c.slug);
      g[c.hidden ? "hidden" : "shown"] += 1;
      g.ids.push(t._id);
    }
  }
  return [...map.values()].sort((a, b) => b.shown + b.hidden - (a.shown + a.hidden) || a.name.localeCompare(b.name));
}

// the prices the tees sell at now: [{ price, oldPrice, count }], the most common first
export function priceGroups(tees) {
  const map = new Map();
  for (const t of tees) {
    const k = `${t.price}|${t.oldPrice || 0}`;
    if (!map.has(k)) map.set(k, { price: t.price, oldPrice: t.oldPrice || 0, count: 0 });
    map.get(k).count += 1;
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

// the collections, in the admin's saved order (new ones after), each with its settings and counts
// conf: { order, items: { key: { name, text, home } } }; defaultHome: the keys on the home page before any save
export function collectionRows(tees, conf = {}, defaultHome = []) {
  const map = new Map();
  for (const t of tees) {
    if (!map.has(t.collection)) map.set(t.collection, { key: t.collection, title: t.collectionName, inShop: 0, out: 0, ids: [], picture: null });
    const c = map.get(t.collection);
    c[t.inShop ? "inShop" : "out"] += 1;
    c.ids.push(t._id);
    if (!c.picture && t.inShop && t.picture) c.picture = t.picture;
  }
  const order = conf.order || [];
  const at = (k) => (order.includes(k) ? order.indexOf(k) : 1e6);
  return [...map.values()]
    .map((c, i) => {
      const s = conf.items?.[c.key];
      return { ...c, i, name: s?.name || "", text: s?.text || "", home: s ? Boolean(s.home) : defaultHome.includes(c.key) };
    })
    .sort((a, b) => at(a.key) - at(b.key) || a.i - b.i)
    .map(({ i, ...c }) => c); // eslint-disable-line no-unused-vars
}

// what the page saves for the collections: their order and each one's name, text, home page
export const collectionsBody = (rows) => ({
  order: rows.map((r) => r.key),
  items: Object.fromEntries(rows.map((r) => [r.key, { name: r.name.trim(), text: r.text.trim(), home: r.key !== "none" && r.home }])),
});

// many ids sent a few at a time (so a long job shows how far it is)
export const chunks = (list, size = 40) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));
