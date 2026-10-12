// studio/teamOrder.js
//
// Team orders: one design, a different name and number on each tee.
// A text on the tee is marked as "the player's name" or "the player's
// number" (element.role); the customer then fills a list of players in
// Review — name, number and size — and each player gets their own tee.
// The list is saved with the design (design.players). The cart and the
// order hold the design as sizes × quantities counted from the list.
//
// Drawing one player's tee (their name in place of the marked text) is
// playerElements() in konvaRender.js — the Design Room preview and the
// print files both use it.

export const MAX_PLAYERS = 99;
export const NAME_MAX = 24;
export const NUMBER_MAX = 4;

export const hasRoles = (elements) => elements.some((e) => e.type === "text" && (e.role === "name" || e.role === "number"));
export const rolesIn = (elements) => ({
  name: elements.some((e) => e.type === "text" && e.role === "name"),
  number: elements.some((e) => e.type === "text" && e.role === "number"),
});

// A row counts once it has a name or a number.
export const filled = (p) => Boolean((p.name || "").trim() || (p.number || "").trim());

// [{ size, qty }] — what the cart and the order hold for this list
export const sizeCounts = (players) => {
  const count = {};
  for (const p of players) if (filled(p)) count[p.size] = (count[p.size] || 0) + 1;
  return Object.entries(count).map(([size, qty]) => ({ size, qty }));
};

const SIZE_WORDS = { XXL: "2XL", XXXL: "3XL", XXXXL: "4XL", SMALL: "S", MEDIUM: "M", LARGE: "L" };
const sizeOf = (word, sizes) => {
  const w = String(word || "").toUpperCase();
  const s = SIZE_WORDS[w] || w;
  return sizes.includes(s) ? s : null;
};

// One player from a piece of text: "Arun 7 L", "7 Arun Kumar XL", "Arun, 7, L", "Arun - 10".
function onePlayer(piece, sizes, fallbackSize) {
  const words = piece.split(/[\s,\t|:–—-]+/).filter(Boolean);
  let size = null;
  let number = "";
  const name = [];
  // the size is the last word that is a size ("M" at the end, not the M in "M Arun")
  for (let i = words.length - 1; i >= 1 && !size; i--) {
    if (sizeOf(words[i], sizes)) {
      size = sizeOf(words[i], sizes);
      words.splice(i, 1);
    }
  }
  for (const w of words) {
    const n = /^(?:#|no\.?)?(\d{1,4})$/i.exec(w);
    if (n && !number) number = n[1];
    else if (!/^(size|no\.?|number)$/i.test(w)) name.push(w);
  }
  const p = { name: name.join(" ").slice(0, NAME_MAX), number: number.slice(0, NUMBER_MAX), size: size || fallbackSize };
  return filled(p) ? p : null;
}

/**
 * A pasted or typed list → players. One player per line; on one line, players
 * are separated by ";" or by commas when every piece has its own number
 * ("Arun 7 L, Karthik 10 XL").
 */
export function parsePlayers(text, sizes, fallbackSize) {
  const out = [];
  for (const line of String(text || "").split(/[\n;]+/)) {
    if (!line.trim()) continue;
    const parts = line.split(",").map((s) => s.trim()).filter(Boolean);
    const each = parts.length > 1 && parts.every((s) => /\d/.test(s) && /[a-z]/i.test(s.replace(/\b(x{0,4}[sml]|[2-4]xl)\b/gi, "")));
    for (const piece of each ? parts : [line]) {
      const p = onePlayer(piece, sizes, fallbackSize);
      if (p) out.push(p);
      if (out.length >= MAX_PLAYERS) return out;
    }
  }
  return out;
}

// "07 ARUN" for lists and file names
export const playerLabel = (p) => [p.number, p.name].filter(Boolean).join(" ");
