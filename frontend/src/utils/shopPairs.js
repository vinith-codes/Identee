// utils/shopPairs.js — one shop card for a design sold for both men and women (components/shop/ShopGrid.jsx).
// The client (31 Oct 2026): in Round Neck → All the same tee showed twice, once as Men's and once as Women's.
//
// items: the shop's cards in order. When a design (same name and style) is there as Men's and as Women's, one card is
// kept, where the first of the two was, built from the Men's, with `pair`: [{ gender: "Men", p }, { gender: "Women", p }];
// the other card is left out. Unisex tees and tees for one gender only stay as they are.
export function pairMenWomen(items = []) {
  const key = (p) => `${p.brandname}|${p.garmentStyle}`;
  const men = new Map();
  const women = new Map();
  for (const p of items) {
    if (p.gender === "Men" && !men.has(key(p))) men.set(key(p), p);
    if (p.gender === "Women" && !women.has(key(p))) women.set(key(p), p);
  }
  const out = [];
  const done = new Set();
  for (const p of items) {
    const k = key(p);
    const m = men.get(k);
    const w = women.get(k);
    if (!m || !w || (p !== m && p !== w)) {
      out.push(p);
      continue;
    }
    if (done.has(k)) continue;
    done.add(k);
    out.push({ ...m, pair: [{ gender: "Men", p: m }, { gender: "Women", p: w }] });
  }
  return out;
}
