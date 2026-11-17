// studio/multiPhoto.js — several photos sent in one chat message (17 Nov 2026, the owner: "I want to upload multiple
// photos at a time and the assistant should analyse and make actions according to user need").
//
// Like ChatGPT with several pictures in one message: the customer picks up to MAX_PHOTOS photos with 📎 (more with
// 📎 again), says what they want (or nothing), and sends them together. The Assistant v2 brain looks at all of them
// and answers with a "photos" step (each photo made its own way and put on its own print area) or a concept sheet
// that mixes them. Both reuse the one-photo abilities: print as is / without background (free), copy the design,
// redraw as art, a new design from it — the same "photoMake" the photo plan card runs, once per photo.
//
// Nothing here talks to a server: it decides, the page and the chat do. One photo keeps the old flow exactly.
import { areasFromWords, photoJobFrom, SAME_THEME } from "./photoIntent";

export const MAX_PHOTOS = 6;
export const PHOTO_JOBS = ["photo", "copy", "art", "inspired"];

// How many of the picked photos fit next to the ones already waiting: { take, extra }
export const roomFor = (have, picked, max = MAX_PHOTOS) => {
  const take = Math.max(0, Math.min(picked, max - have));
  return { take, extra: Math.max(0, picked - take) };
};
// what the chat says when more were picked than fit (plain, with what happened)
export const tooManyLine = (extra, have, max = MAX_PHOTOS) =>
  have >= max
    ? `You can send up to ${max} photos at a time, and ${max} are already waiting. Send these first, or tap ✕ on one to swap it.`
    : `You can send up to ${max} photos at a time, so I kept the first ${max - have} and left out ${extra}.`;

// what one photo's job uses of the customer's pictures for today: the photo itself is free (unless made sharper by
// the AI); a copy, art or a new design is one picture
export const pictureCost = (item) => (item.skip ? 0 : item.job === "photo" ? (item.enhance ? 1 : 0) : 1);
export const picturesNeeded = (items = []) => items.reduce((n, x) => n + pictureCost(x), 0);

// The plain line under the plan: what it uses of today's pictures, or that it doesn't fit (said BEFORE making)
//   left: pictures left today (null = not known)
export function limitLine(need, left) {
  if (!need) return "All free — nothing counts toward today’s pictures.";
  const uses = `Uses ${need} of your pictures for today`;
  if (left == null) return `${uses}.`;
  if (left <= 0) return `This needs ${need} picture${need === 1 ? "" : "s"}, and today’s pictures are used up. They come back tomorrow — the free choices still work.`;
  if (need > left) return `This needs ${need} pictures and you have ${left} left today. Leave ${need - left === 1 ? "one" : `${need - left}`} out, or switch ${need - left === 1 ? "it" : "them"} to a free choice.`;
  return `${uses} (${left} left).`;
}

// the words sent when the photos come without any (the brain then decides, or asks)
export const noWordsLine = (n) => `I attached ${n} pictures — use them on my tee.`;

// "the first", "photo 2", "2nd pic" … → which photo (1-based) a part of the message is about, or null
const ORDINALS = [
  [1, /\b(first|1st|photo 1|picture 1|pic 1|image 1|#1)\b/],
  [2, /\b(second|2nd|photo 2|picture 2|pic 2|image 2|#2)\b/],
  [3, /\b(third|3rd|photo 3|picture 3|pic 3|image 3|#3)\b/],
  [4, /\b(fourth|4th|photo 4|picture 4|pic 4|image 4|#4)\b/],
  [5, /\b(fifth|5th|photo 5|picture 5|pic 5|image 5|#5)\b/],
  [6, /\b(sixth|6th|photo 6|picture 6|pic 6|image 6|#6)\b/],
];
export const photoNumberIn = (text, count) => {
  const low = String(text || "").toLowerCase();
  const hit = ORDINALS.find(([n, re]) => n <= count && re.test(low));
  if (hit) return hit[0];
  if (/\b(last)\b/.test(low)) return count;
  return null;
};

// words that ask for ONE design made from several photos: the brain's concept sheet does that (one picture)
export const MIX = /\b(mix|mixed|combine|combined|merge|merged|blend|collage|into one|one design|single design|all (of them )?together|together in one)\b/;
// "this tee's style with my photo": one photo is the look, another the subject — also one new design
export const STYLE_FROM = /\b(style of|in the style|same style|like (the|this|that) (tee|t-?shirt|shirt|design|one))\b/;

/**
 * The free rules (no AI) for several photos and the words sent with them — used when the smart brain is off or
 * can't answer, so the customer always gets a plan. Returns:
 *   { mix: true }                     one design from all of them (needs the brain's concept sheet)
 *   { items: [{ photo: n, job, areas, style, cutOut, change, subject, skip? }] }
 *   (never null: with no clear words each photo gets its own place, without its background — free)
 */
export function photosFromWords(text, count, { areas = [], photoStyles = [] } = {}) {
  const t = String(text || "").trim();
  const low = t.toLowerCase();
  if (count > 1 && (MIX.test(low) || STYLE_FROM.test(low))) return { mix: true };
  // "the first on the front and the second on the back", "logo on chest, photo on back"
  const parts = t.split(/\s*(?:,|;|\bthen\b|\balso\b|\band\b(?=\s+(?:the\s+|this\s+|that\s+|my\s+|our\s+)?(?:first|second|third|fourth|fifth|sixth|last|\d|photo|picture|pic|image|logo|other|one|rest)\b))\s*/i).filter((x) => x.length >= 2);
  const whole = photoJobFrom(t, { areas, photoStyles });
  const items = [];
  const usedPhotos = [];
  for (const part of parts) {
    const named = areasIn(part, areas);
    const n = photoNumberIn(part, count);
    if (!named.length && !n) continue;
    const photo = n && !usedPhotos.includes(n) ? n : Array.from({ length: count }, (_, i) => i + 1).find((x) => !usedPhotos.includes(x));
    if (!photo) break;
    usedPhotos.push(photo);
    // "the logo on the chest": their own logo goes on as it is (free) — the one-photo rules read "the logo" as a copy
    const own = LOGO_AS_IS(part) ? { job: "photo", cutOut: true } : photoJobFrom(part, { areas, photoStyles });
    const job = own || (whole && whole.job !== "add" ? whole : null);
    items.push(itemFrom(photo, job, named));
  }
  // nothing said per photo: the same wish for each ("remove the backgrounds", "make them cartoons"), each on its own place
  if (!items.length) return { items: Array.from({ length: count }, (_, i) => itemFrom(i + 1, whole && whole.job !== "add" ? whole : null, [])) };
  // photos the words didn't mention are shown on the plan, not ticked (nothing is made from them unless ticked)
  for (let n = 1; n <= count; n++) if (!usedPhotos.includes(n)) items.push({ ...itemFrom(n, null, []), skip: true });
  return { items: items.sort((a, b) => a.photo - b.photo) };
}
const LOGO_AS_IS = (part) => /\blogo\b/i.test(part) && !/\b(copy|replicate|recreate|redraw|same design|exact(ly)?|from (this|the) (tee|t-?shirt|shirt))\b/i.test(part);
// the print areas named in one part of the message: by their names ("full back", "on the front"), or by a word of
// the name ("on the chest" → Left chest, "on the sleeve" → a sleeve)
export const areasIn = (part, areas = []) => {
  const named = areasFromWords(part, areas);
  if (named.length) return named;
  const low = String(part || "").toLowerCase();
  for (const word of ["chest", "sleeve", "pocket", "neck", "nape", "shoulder"]) {
    if (!new RegExp(String.raw`\b${word}\b`).test(low)) continue;
    const hit = areas.filter((a) => a.free !== false && a.label.toLowerCase().includes(word));
    const pick = hit.find((a) => /^left\b/i.test(a.label)) || hit[0];
    if (pick) return [pick.key];
  }
  return [];
};
const itemFrom = (photo, job, areaKeys) => {
  const j = job?.job && PHOTO_JOBS.includes(job.job) ? job.job : "photo";
  return {
    photo,
    job: j,
    areas: areaKeys.slice(0, 2),
    style: job?.style || null,
    cutOut: j === "photo" ? job?.cutOut !== false : true,
    change: j === "copy" ? job?.change || null : null,
    subject: j === "inspired" ? job?.subject || SAME_THEME : null,
  };
};

/**
 * The plan card's content, from the brain's (or the rules') items and the uploaded photos: every photo gets its own
 * print area — the one asked for when it is free and not given to an earlier photo, else the next free main area.
 * The same photo asked in the same way twice is made ONCE and put on both areas (never more pictures than needed).
 *
 * @param items   [{ photo: 1-based number, job, areas: [keys], style, cutOut, change, subject, design, words, seen, skip }]
 * @param photos  the uploaded photos, in order: [{ url, w, h }]
 * @param areas   the garment's print areas [{ key, label, side, main, free }]
 * @param fits(key, taken)  may this photo go on key, with `taken` already given to earlier photos? (the page knows
 *                which areas overlap); default: the area is free and not taken
 * @param styles / photoStyles  the picture styles for a new design / for art
 * @returns { items: [{ n, photo, job, areaKeys, style, … }], need }
 */
export function planPhotos({ items = [], photos = [], areas = [], fits, styles = [], photoStyles = [] }) {
  const ok = fits || ((k, taken) => areas.some((a) => a.key === k && a.free !== false) && !taken.includes(k));
  const taken = [];
  const out = [];
  const same = (a, b) => a.photo === b.photo && a.job === b.job && (a.style || null) === (b.style || null) && (a.change || null) === (b.change || null) && (a.subject || null) === (b.subject || null) && !!a.cutOut === !!b.cutOut;
  // (the asked areas first, for every photo, then the photos that need a place found for them)
  const merged = [];
  for (const raw of items) {
    const n = Number(raw?.photo);
    if (!Number.isInteger(n) || n < 1 || n > photos.length) continue;
    const job = PHOTO_JOBS.includes(raw.job) ? raw.job : "photo";
    const it = {
      photo: n,
      job,
      areas: (Array.isArray(raw.areas) ? raw.areas : raw.area ? [raw.area] : []).filter((k) => areas.some((a) => a.key === k)),
      style: job === "art" ? (photoStyles.includes(raw.style) ? raw.style : photoStyles[0] || null) : job === "inspired" ? (styles.includes(raw.style) ? raw.style : styles[0] || null) : null,
      cutOut: job === "photo" ? raw.cutOut !== false : true,
      change: job === "copy" ? raw.change || null : null,
      subject: job === "inspired" ? raw.subject || SAME_THEME : null,
      design: job === "copy" ? raw.design || null : null,
      words: job === "copy" && Array.isArray(raw.words) ? raw.words : [],
      seen: raw.seen || "",
      skip: !!raw.skip,
    };
    const twin = merged.find((m) => same(m, it));
    if (twin) twin.areas = [...new Set([...twin.areas, ...it.areas])];
    else merged.push(it);
  }
  for (const it of merged) {
    const keys = [];
    for (const k of it.areas) if (keys.length < 3 && ok(k, [...taken, ...keys])) keys.push(k);
    it.areaKeys = keys;
    if (!it.skip) taken.push(...keys);
  }
  // a place for each photo that has none yet: the main areas first (front, then back), then any free one
  const order = [...areas.filter((a) => a.main && a.side === "front"), ...areas.filter((a) => a.main && a.side !== "front"), ...areas.filter((a) => !a.main)];
  for (const it of merged) {
    if (it.areaKeys.length) continue;
    const k = order.find((a) => ok(a.key, taken))?.key;
    it.areaKeys = k ? [k] : [];
    if (k && !it.skip) taken.push(k);
  }
  for (const it of merged) out.push({ n: it.photo, photo: photos[it.photo - 1], job: it.job, areaKeys: it.areaKeys, areaKey: it.areaKeys[0] || null, style: it.style, cutOut: it.cutOut, change: it.change, subject: it.subject, design: it.design, words: it.words, seen: it.seen, enhance: false, skip: it.skip || !it.areaKeys.length });
  return { items: out, need: picturesNeeded(out) };
}

// what one row of the plan will make, in plain words
export const JOB_LABELS = {
  photo: "The photo itself",
  copy: "Copy just the design",
  art: "Turn it into art",
  inspired: "A new design from it",
};
export const jobWords = (it) =>
  it.job === "photo" ? (it.cutOut ? "The photo, background removed · free" : "The photo as it is · free")
  : it.job === "copy" ? `Just the design, made flat and clean${it.change ? ` — ${it.change}` : ""}`
  : it.job === "art" ? `Redrawn as ${String(it.style || "art").toLowerCase()}`
  : `A new design from it${it.subject && !it.subject.startsWith(SAME_THEME) ? `: ${it.subject}` : ""}`;

// one plan row as the act the page already knows ("Make it" on a one-photo plan) — with its own photo
export const makeActFor = (it) => ({ type: "photoMake", job: it.job, photo: it.photo, areaKey: it.areaKeys[0] || null, areaKeys: it.areaKeys, style: it.style, change: it.change, subject: it.subject, design: it.design, words: it.words || [], cutOut: it.cutOut, enhance: !!it.enhance });
