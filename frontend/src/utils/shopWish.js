// utils/shopWish.js — the shop's Ask bar (round 8, 11 Nov 2026)
//
// Reads a wish typed in plain words ("black anime tee under ₹500 for women") and turns it into the shop's own filters
// (colour, style, who it is for, size, top price) plus the words left over to search with. Rules only: no AI call, so
// it is instant, free, and works without signing in. The filter choices come from the shop itself (facets), so the bar
// never filters by a colour or a size the shop doesn't have.

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const word = (s) => new RegExp(`(^|[^a-z0-9])${esc(s)}(?![a-z0-9])`, "i");

// words that say nothing about the tee
const FILLER = new Set(
  ("a an the tee tees tshirt tshirts shirt shirts t for me i im we us want wants need needs show find finding looking look with in of some any please design designs " +
    "print printed prints and or to something like my on it is are that have has you do got give get buy wear good nice cool best one ones type kind types can could would " +
    "under below within upto up max maximum less than rs inr rupees rupee size sized colour color coloured colored price priced budget only just also there this these those what which")
    .split(" "),
);

const COLOUR_WORDS = ["black", "white", "blue", "navy", "red", "green", "maroon", "grey", "gray", "pink", "yellow", "purple", "lavender", "beige", "brown", "olive", "orange", "teal", "cream", "mustard", "wine", "violet", "charcoal"];

const SIZE_WORDS = [
  [/\b(extra[\s-]?small)\b/i, "XS"],
  [/\b(double|2)[\s-]?(extra[\s-]?large|xl)\b/i, "XXL"],
  [/\b(extra[\s-]?large)\b/i, "XL"],
  [/\bsmall\b/i, "S"],
  [/\bmedium\b/i, "M"],
  [/\blarge\b/i, "L"],
];

// the size the shop calls it (XXL and 2XL are the same size under two names)
const shopSize = (size, sizes) => {
  if (!sizes?.length) return size;
  const same = { XXL: "2XL", "2XL": "XXL", XXXL: "3XL", "3XL": "XXXL" };
  return sizes.find((s) => s.toUpperCase() === size) || sizes.find((s) => s.toUpperCase() === same[size]) || "";
};

/**
 * @param {string} text   what the customer typed
 * @param {object} facets the shop's choices: { colors: [name], styles: [name], genders: [{ name }], sizes: [name] }
 * @returns {{ filters: { color?, style?, gender?, size?, maxPrice?, sort? }, words: string[], said: string[] }}
 *   `said` = the understood parts in plain words, for the line under the bar
 */
export function parseWish(text, facets = {}) {
  let rest = ` ${norm(text).replace(/[’']/g, "").replace(/t-?\s?shirts?/g, " tee ")} `;
  const filters = {};
  const said = [];
  const take = (re) => {
    const m = rest.match(re);
    if (m) rest = rest.replace(m[0], " ");
    return m;
  };

  // the top price: "under ₹500", "below 500", "500 rupees", "₹500"
  const price =
    take(/(?:under|below|within|less than|up ?to|max(?:imum)?|<)\s*(?:₹|rs\.?|inr)?\s*(\d{3,5})/i) ||
    take(/(?:₹|rs\.?|inr)\s*(\d{3,5})/i) ||
    take(/(\d{3,5})\s*(?:₹|rs\.?|rupees?|inr)/i);
  if (price) {
    filters.maxPrice = Number(price[1]);
    said.push(`under ₹${filters.maxPrice}`);
  }
  if (take(/\b(cheap(?:est)?|low(?:est)? price|budget|affordable)\b/i)) {
    filters.sort = "price_asc";
    said.push("lowest price first");
  }

  // who it is for ("women" before "men": the one word sits inside the other)
  const genders = (facets.genders || []).map((g) => g.name || g);
  const who = take(/\b(women|woman|womens|girls?|ladies|lady|her)\b/i) ? "Women" : take(/\b(men|man|mens|boys?|guys?|gents|him)\b/i) ? "Men" : take(/\bunisex\b/i) ? "Unisex" : "";
  if (who && (!genders.length || genders.includes(who))) {
    filters.gender = who;
    said.push(who === "Unisex" ? "Unisex" : `for ${who.toLowerCase()}`);
  }

  // the style: Oversized or Round Neck (the shop's own names)
  const styles = facets.styles || [];
  const styleOf = (re) => styles.find((s) => re.test(s));
  const style = take(/\b(over\s?sized?|baggy|loose|drop shoulder)\b/i) ? styleOf(/over/i) : take(/\b(round[\s-]?neck|crew[\s-]?neck|regular fit|regular)\b/i) ? styleOf(/round/i) : "";
  if (style) {
    filters.style = style;
    said.push(style);
  }

  // the size: "size M", "XL", "large"
  let size = "";
  const asked = take(/\bsize\s*(xs|s|m|l|xl|xxl|xxxl|2xl|3xl)\b/i) || take(/\b(xs|xl|xxl|xxxl|2xl|3xl)\b/i);
  if (asked) size = asked[1].toUpperCase();
  else {
    for (const [re, value] of SIZE_WORDS) {
      if (take(re)) {
        size = value;
        break;
      }
    }
  }
  size = size && shopSize(size, facets.sizes);
  if (size) {
    filters.size = size;
    said.push(`size ${size}`);
  }

  // the colour: the shop's own name first ("navy blue"), then a plain colour word that only one shop colour has
  const colours = [...(facets.colors || [])].sort((a, b) => b.length - a.length);
  const exact = colours.find((c) => word(norm(c)).test(rest));
  if (exact) {
    rest = rest.replace(word(norm(exact)), " ");
    filters.color = exact;
    said.push(exact);
  } else {
    const plain = COLOUR_WORDS.find((c) => word(c).test(rest));
    const key = plain === "gray" ? "grey" : plain;
    const having = plain ? colours.filter((c) => norm(c).replace("gray", "grey").includes(key)) : [];
    if (having.length === 1) {
      rest = rest.replace(word(plain), " ");
      filters.color = having[0];
      said.push(having[0]);
    }
    // more than one ("blue": Navy Blue and Royal Blue), or none: the word stays, and the search finds it in the colour's name
  }

  const words = [...new Set(rest.split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !FILLER.has(w)))].slice(0, 6);
  if (words.length) said.push(`“${words.join(" ")}”`);
  return { filters, words, said };
}

/**
 * The searches to try, the strictest first: every word, then any of the words, then the filters alone.
 * @returns {Array<{ params: object, note: string }>} note = what to tell the customer when this try is the one that found tees
 */
export function wishTries({ filters, words }) {
  const has = Object.keys(filters).some((k) => k !== "sort");
  const tries = [];
  if (words.length) tries.push({ params: { ...filters, q: words.join(" ") }, note: "" });
  if (words.length > 1) tries.push({ params: { ...filters, q: words.join(" "), any: "1" }, note: "No tee has all of those words. These match some of them." });
  if (has) tries.push({ params: { ...filters }, note: words.length ? `No tee says “${words.join(" ")}”. These fit the rest of what you asked for.` : "" });
  if (!tries.length && filters.sort) tries.push({ params: { ...filters }, note: "" });
  return tries;
}

// A few wishes to tap, made from what the shop has
export function wishExamples(facets = {}) {
  const out = [];
  const colours = facets.colors || [];
  const dark = colours.find((c) => /black/i.test(c));
  const over = (facets.styles || []).find((s) => /over/i.test(s));
  if (dark && over) out.push(`${dark} oversized tee`);
  else if (dark) out.push(`${dark} tee`);
  const genders = (facets.genders || []).map((g) => g.name || g);
  const round = (facets.styles || []).find((s) => /round/i.test(s));
  if (genders.includes("Women")) out.push(round ? "Round neck for women" : "Tees for women");
  if (facets.priceMin > 0) out.push(`Under ₹${Math.ceil((facets.priceMin + 1) / 100) * 100}`);
  return out.slice(0, 3);
}
