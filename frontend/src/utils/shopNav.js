// utils/shopNav.js — finding your way round Shop your IDENTEE (24 Nov 2026)
//
// The owner: "think as a user and implement proper navigation in shop your identee". A tee page knows where it is
// (Shop your IDENTEE › Ayyappa › Oversized), which tee comes before and after it in the grid it was opened from
// (‹ 3 of 45 ›), and shows more tees of its collection. These helpers have no React in them, so they are tested in node.
import { pairMenWomen } from "./shopPairs";
import { wearerFor } from "./wearerFor";

// a shop card's page: a Studio tee opens its design page (the category's wearer goes along, so the design page shows a
// man's photos from the men's category, a woman's from the women's); an old product its product page
export const teeHref = (p, colour = null) => {
  const who = p.readyDesignSlug ? wearerFor(`${p.category?.name || ""} ${p.category?.slug || ""}`) : null;
  return p.readyDesignSlug ? `/ready-made/design/${p.readyDesignSlug}${who ? `?for=${who}` : ""}` : `/product/${colour?._id || p._id}`;
};

// a collection "Make your own" tee (GTA · Make your own): the plain tee a customer puts their own photo on
export const isOwnTee = (p) => /·\s*make your own\s*$/i.test(p?.brandname || p?.name || "");

const GRID_KEYS = ["style", "gender", "size", "color", "maxPrice", "q", "sort"];

// the grid a tee was opened from ("/ready-made/ayyappa?style=Oversized&gender=men") → the same query for the shop's
// list, so ‹ › walk the tees in the order the customer saw them; null when it was not a collection's page
export function gridQuery(to) {
  const m = /^\/ready-made\/([^/?#]+)(\?[^#]*)?/.exec(String(to || ""));
  if (!m || m[1] === "design") return null;
  const params = new URLSearchParams(m[2] || "");
  const q = { collection: decodeURIComponent(m[1]).toLowerCase() };
  for (const k of GRID_KEYS) if (params.get(k)) q[k] = params.get(k);
  return q;
}

// the cards as the grid shows them (a Men's + Women's pair is one card; the "Make your own" tees are not walked
// through unless that is where you are)
export function walkList(items = [], { keepOwn = false } = {}) {
  return pairMenWomen(keepOwn ? items : items.filter((p) => !isOwnTee(p)));
}

// is this card the tee with this design slug (either half of a Men's + Women's pair counts)
export const isTee = (card, slug) => Boolean(slug) && (card.readyDesignSlug === slug || (card.pair || []).some((x) => x.p.readyDesignSlug === slug));

// where a tee is in its list: { index, total, prev, next } — prev/next go round (the last tee's next is the first);
// index -1 when it is not in the list (then no ‹ ›)
export function neighbours(cards = [], slug) {
  const index = cards.findIndex((c) => isTee(c, slug));
  const total = cards.length;
  if (index < 0 || total < 2) return { index, total, prev: null, next: null };
  return { index, total, prev: cards[(index - 1 + total) % total], next: cards[(index + 1) % total] };
}

// "More from Ayyappa": the tees after this one (going round), never this one, never two of the same picture
export function moreFrom(cards = [], slug, n = 8) {
  const at = Math.max(0, cards.findIndex((c) => isTee(c, slug)));
  const out = [];
  const arts = new Set();
  const here = cards.find((c) => isTee(c, slug));
  if (here?.art) arts.add(here.art);
  for (let i = 1; i <= cards.length && out.length < n; i += 1) {
    const c = cards[(at + i) % cards.length];
    if (isTee(c, slug) || (c.art && arts.has(c.art))) continue;
    if (c.art) arts.add(c.art);
    out.push(c);
  }
  // (a small collection: fill up with the repeats left out)
  for (let i = 1; i <= cards.length && out.length < n; i += 1) {
    const c = cards[(at + i) % cards.length];
    if (!isTee(c, slug) && !out.includes(c)) out.push(c);
  }
  return out;
}
