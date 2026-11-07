// studio/assistantV2.js — the Assistant v2 helpers (7 Nov 2026, docs/ASSISTANT_V2_PLAN.md)
//
// Pure functions the chat and the page share: the first screen, the concept sheets kept in a chat, picks by number
// ("3, 6 and 9", "the second one"), and which print area a concept's piece goes on.
import { areaFor } from "./aiOps";
// (placementHint / shrinkForHint: where a concept's print goes and how big, from its own words — round 4)
// (placementHint / shrinkForHint: where a concept's print goes and how big, from its own words — round 4)

export const HELLO_V2 = "Hi! Tell me what you want on your tee — an idea, an occasion, a picture, words — and I’ll design it with you.";
export const SUGGESTIONS = ["Designs for my college fest", "Draw a lion with a cricket bat", "A slogan for my team"];
// Starters that sell (round 3, 7 Nov 2026): the first chip follows the season in India, the other two stay evergreen
const SEASON = [
  [1, "A Pongal tee for my family"],
  [2, "A Valentine's couple tee"],
  [3, "Designs for our college fest"],
  [4, "A farewell tee for our batch"],
  [5, "A summer trip tee for my gang"],
  [6, "A tee for my cricket team"],
  [7, "Designs for our office team"],
  [8, "An Independence Day tee"],
  [9, "A tee for our Onam celebration"],
  [10, "A Diwali tee for my family"],
  [11, "Designs for my cafe staff"],
  [12, "A New Year 2027 tee for our group"],
];
export const suggestionsFor = (date = new Date()) => {
  const m = date.getMonth() + 1;
  const first = (SEASON.find(([month]) => month === m) || SEASON[0])[1];
  return [first, "Draw a lion with a cricket bat", "A slogan for my team"];
};
export const CONCEPTS_PER_SHEET = 3;
export const PIECES = ["front", "back", "sleeve"];

/** The start of a v2 chat: one line and three suggestions (they go to the brain when tapped). */
export const firstMessagesV2 = (date = new Date()) => [{ from: "bot", text: HELLO_V2 }, { chips: suggestionsFor(date), smart: true }];

/** Is this chat still the untouched start (nothing said yet)? Then it may be swapped for the v2 start. */
export const isUntouchedStart = (messages) => Array.isArray(messages) && messages.length <= 3 && !messages.some((m) => m.from === "me" || m.pending || m.sheet || m.designs);

/** The concept sheets in a chat, oldest first: [{ url, width, height, brief, numberFrom, concepts: [{ n, title, … }], developed: [n] }] */
export const sheetsFromChat = (messages) => (Array.isArray(messages) ? messages : []).filter((m) => m?.sheet?.url).map((m) => m.sheet);

/** The number the next sheet's first concept gets (4 after one sheet of three). */
export const nextConceptNumber = (sheets) => sheets.reduce((n, s) => Math.max(n, (s.numberFrom || 1) + (s.concepts?.length || 0)), 1);

/** How many concepts exist across the sheets. */
export const conceptCount = (sheets) => sheets.reduce((n, s) => n + (s.concepts?.length || 0), 0);

/** The sheet and the concept with this number, or null. */
export function findConcept(sheets, n) {
  for (const sheet of sheets) {
    const concept = (sheet.concepts || []).find((c) => Number(c.n) === Number(n));
    if (concept) return { sheet, concept };
  }
  return null;
}

/** The pieces a concept has (the ones with a print). */
export const piecesOf = (concept) => PIECES.filter((p) => concept?.[p]);

/**
 * "3, 6 and 9" / "the second one" / "1-3" / "all" → concept numbers (1-based), in the order said, no repeats.
 * (the same rules as the server's services/assistantBrain.js parsePicks)
 */
export function parsePicks(text, max = 12) {
  const t = String(text || "").toLowerCase();
  if (!t.trim()) return [];
  if (/\b(all|every one|all of them)\b/.test(t)) return Array.from({ length: Math.min(max, 12) }, (_, i) => i + 1);
  const words = { first: 1, "1st": 1, second: 2, "2nd": 2, third: 3, "3rd": 3, fourth: 4, "4th": 4, fifth: 5, "5th": 5, sixth: 6, "6th": 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, last: max };
  const out = [];
  const add = (n) => {
    if (Number.isInteger(n) && n >= 1 && n <= max && !out.includes(n)) out.push(n);
  };
  for (const m of t.matchAll(/\b(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\b/g)) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a <= b && b - a < 12) for (let n = a; n <= b; n++) add(n);
  }
  for (const m of t.replace(/\b\d{1,2}\s*(?:-|–|to)\s*\d{1,2}\b/g, " ").matchAll(/(?<![\d.])(\d{1,2})(?![\d.%:])/g)) add(Number(m[1]));
  if (!out.length) for (const [w, n] of Object.entries(words)) if (new RegExp(`\\b${w}\\b`).test(t)) add(n);
  return out;
}

/** A bare pick ("2", "3 and 6", "the second one"): answered without the brain, as a develop step. */
export const isBarePick = (text, max) => {
  const t = String(text || "").trim().toLowerCase();
  if (!t || t.length > 40 || !max) return false;
  if (!parsePicks(t, max).length) return false;
  return /^(the\s+)?(\d{1,2}|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last|all)(\s*(,|and|&|\+|or|,\s*and)\s*(\d{1,2}|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|last))*(\s*(one|ones|please|pls|suit me|suits me|is good|are good|looks? good))?[.! ]*$/.test(t);
};

/** The act for a typed message in v2: a bare pick becomes a develop step straight away (free, instant); the rest goes to the brain. */
export function assistAct(text, messages) {
  const total = conceptCount(sheetsFromChat(messages));
  if (total && isBarePick(text, total)) return { type: "assist", text, steps: [{ type: "develop", picks: parsePicks(text, total), sheet: null, pieces: null }] };
  return { type: "assist", text };
}

/**
 * Where and how big a concept's print goes, read from its own words (round 4, 8 Nov 2026 — the brain writes
 * "small left-chest badge", "large centre-front artwork", "full-back lettering"):
 * { area: "chest" | "full" | null, size: "small" | "large" | null }
 */
export function placementHint(text) {
  const t = String(text || "").toLowerCase();
  const chest = /left[- ]chest|right[- ]chest|chest (badge|logo|emblem|crest|pocket|icon|mark)|pocket[- ]?(size|print|logo)|(badge|logo|emblem|crest|icon|monogram)\b[^.]{0,30}\b(on|at|over) the chest/.test(t);
  const full = /full[- ](back|front)|\b(covers?|covering|across) the (whole|full|entire)|edge[- ]to[- ]edge/.test(t);
  const small = /\b(small|tiny|little|subtle|minimal|pocket[- ]?size|discreet)\b/.test(t);
  const large = /\b(large|big|huge|bold|oversized|statement|full[- ](back|front))\b/.test(t);
  return { area: chest ? "chest" : full ? "full" : null, size: small && !large ? "small" : large ? "large" : null };
}

/**
 * The print area for a concept's piece: front → centre front (or the main front area), back → full back (or the
 * main back area), sleeve → the left sleeve, else the right one. A taken area falls back the way the AI's own
 * drawings do (aiOps.areaFor). used: area keys that already carry a print the piece must not cover.
 * hint: placementHint() of the concept's words — a chest badge goes on a chest area when the tee has one.
 */
export function pieceArea(piece, positions = [], used = [], hint = null) {
  const has = (key) => positions.some((p) => p.key === key);
  const chestKey = hint?.area === "chest" && piece === "front" ? ["left-chest", ...positions.filter((p) => p.side === "front" && /chest|pocket/.test(p.key)).map((p) => p.key)].find(has) : null;
  const want =
    chestKey ||
    (piece === "sleeve"
      ? ["left-sleeve", "right-sleeve", ...positions.filter((p) => /sleeve/.test(p.key)).map((p) => p.key)].find(has)
      : piece === "back"
        ? ["full-back", positions.find((p) => p.side === "back" && p.main)?.key, positions.find((p) => p.side === "back")?.key].find(has)
        : ["centre-front", positions.find((p) => p.side === "front" && p.main)?.key, positions.find((p) => p.side === "front")?.key].find(has));
  if (!want) return null;
  return areaFor(want, positions, used) || positions.find((p) => p.key === want) || null;
}

/**
 * A "small" print on a big (main) area: a little over half the size, near the top, as a chest badge sits —
 * the item as aiElement() made it (x, y, width, height in % of the area) made smaller. A turned (sleeve-strip)
 * item or a small area is left as it is.
 */
export function shrinkForHint(el, pos, hint, factor = 0.55) {
  if (!el || hint?.size !== "small" || !pos?.main || el.rotation) return el;
  const width = el.width * factor;
  const height = el.height * factor;
  return { ...el, width, height, x: 50 - width / 2, y: Math.max(4, Math.min(50 - height / 2, 12)) };
}

/** The concept under a tap on the sheet picture: the tees sit side by side, left to right. x = 0..1 across the picture. */
export function conceptAtX(x, concepts = []) {
  if (!concepts.length || !(x >= 0 && x <= 1)) return null;
  const i = Math.min(concepts.length - 1, Math.floor(x * concepts.length));
  return concepts[i]?.n ?? null;
}
