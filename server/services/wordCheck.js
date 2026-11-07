// services/wordCheck.js — the words in a made piece are read back and compared with the words the concept asked for
// (Assistant v2 round 4, 8 Nov 2026). A picture AI sometimes misspells a word in a drawing; one check with the text
// AI (about a chat message's cost) catches it, and the piece is drawn once more with the spelling spelt out.
import { aiTextConfigured, askJsonWithImage } from "./aiTextService.js";

/** The words a concept's print must carry: quoted words ("AVENGERS", “Brew & Co”) and words in CAPITALS. */
export function expectedWords(text) {
  const t = String(text || "");
  const out = [];
  const add = (w) => {
    const v = w.replace(/\s+/g, " ").trim();
    if (v.length >= 2 && /[A-Za-z0-9]/.test(v) && !out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
  };
  for (const m of t.matchAll(/["“”]([^"“”]{2,60})["“”]/g)) add(m[1]);
  // CAPITALS of two letters or more (not a lone "A"), digits and & allowed: "AVENGERS", "IDENTEE", "CLASS OF 2026"
  for (const m of t.matchAll(/\b(?:[A-Z][A-Z0-9&'.-]*[A-Z0-9](?:\s+(?:[A-Z][A-Z0-9&'.-]*[A-Z0-9]|\d{2,4}))*)\b/g)) add(m[0]);
  return out.slice(0, 8);
}

/** A word reduced to its letters and digits, for comparing: "Brew & Co." → "BREWCO". */
export const normWord = (w) => String(w || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** The expected words that are not in the picture (as the text AI read it). */
export function missingWords(expected, seen) {
  const words = (Array.isArray(seen) ? seen : []).map(normWord).filter(Boolean);
  const all = words.join("");
  return (expected || []).filter((w) => {
    const n = normWord(w);
    if (!n) return false;
    if (words.includes(n) || all.includes(n)) return false;
    // a phrase: every word of it somewhere in the picture is good enough ("CLASS OF 2026" read as three words)
    const parts = String(w).split(/\s+/).map(normWord).filter((p) => p.length >= 2);
    return !(parts.length > 1 && parts.every((p) => words.includes(p) || all.includes(p)));
  });
}

export const wordCheckReady = () => aiTextConfigured();

/** The words printed in a picture, as the text AI reads them (null when it couldn't). */
export async function readWords(buffer, mime = "image/jpeg") {
  try {
    const out = await askJsonWithImage('Read every word printed in this t-shirt artwork, exactly as written, in reading order. Answer only {"words": [strings]} — an empty list if there are no words.', { data: buffer, mime }, 0.1, undefined, { timeoutMs: 25_000 });
    return Array.isArray(out?.words) ? out.words.map((w) => String(w)) : null;
  } catch {
    return null;
  }
}
