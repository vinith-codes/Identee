// studio/assistantExtras.js — the small rules behind the Assistant's round 8 (11 Nov 2026): feedback chips under a
// concept sheet, "change this spot", tips while a picture is drawn, the pictures-left line, the mic's language,
// orders in the chat and the group link. All pure (no React, no network), so they are tested in tests/round8.test.mjs.

/* ---------- one-tap feedback under a concept sheet ---------- */
// label: what the chip shows · say: what is sent to the Assistant (as if typed, so the brain answers with a new sheet)
export const FEEDBACK = [
  { label: "Too busy", say: "Too busy — show simpler ones" },
  { label: "Too plain", say: "Too plain — show bolder ones" },
  { label: "Other colours", say: "Same ideas in other colours" },
  { label: "More fun", say: "More fun — show playful ones" },
];

/* ---------- "change this spot" ---------- */
// A tapped point of a picture (x, y from 0 to 1, from the top left) in words the picture AI follows.
export function spotWords(x, y) {
  const cx = Math.min(1, Math.max(0, Number(x) || 0));
  const cy = Math.min(1, Math.max(0, Number(y) || 0));
  const col = cx < 1 / 3 ? "left" : cx > 2 / 3 ? "right" : "centre";
  const row = cy < 1 / 3 ? "top" : cy > 2 / 3 ? "bottom" : "middle";
  const place = row === "middle" && col === "centre" ? "the centre" : row === "middle" ? `the ${col} side` : col === "centre" ? `the ${row}` : `the ${row} ${col}`;
  return `${place} (about ${Math.round(cx * 100)}% from the left, ${Math.round(cy * 100)}% from the top)`;
}
// the short name of the spot, for the chat ("the top right")
export const spotName = (words) => String(words || "").replace(/\s*\(.*$/, "");
// what the picture AI is asked when a spot was tapped: the change, there and nowhere else
export const changeAtSpot = (change, spot) => (spot ? `${change} — only at this spot of the picture: ${spot}. Keep everything else exactly the same.` : change);

/* ---------- tips while a picture is drawn ---------- */
export const WAIT_TIPS = [
  "Tap a picture to zoom in and look at the small details.",
  "Say “2 but with the words in gold” to change a concept as you pick it.",
  "Bright colours stand out on dark tees. Soft colours suit light tees.",
  "Tees for a team or a class? Ask me for a group link: friends fill in their own name and size.",
  "Not sure about your size? Tell me your height and weight.",
  "Ask “when will it arrive?” and I’ll work out the date.",
  "You can move, resize and turn every picture once it is on the tee.",
  "Want one part changed? Tap “Change a part” under a picture and point at it.",
];
// the tip showing after `secs` seconds (a new one every `every` seconds, starting from tip `start`)
export const tipAt = (tips, secs, start = 0, every = 7) => (tips?.length ? tips[(start + Math.floor(Math.max(0, secs) / every)) % tips.length] : "");

/* ---------- "14 of 20 pictures left today" ---------- */
export function leftLine(ai) {
  if (!ai?.loggedIn || !ai.available) return "";
  const left = Number(ai.left);
  const all = Number(ai.dailyPerUser);
  if (!Number.isFinite(left) || ai.left == null || !(all > 0)) return "";
  if (left <= 0) return "No pictures left today. They come back tomorrow.";
  return `${Math.min(left, all)} of ${all} pictures left today`;
}

/* ---------- the mic's language ---------- */
export const MIC_LANGS = [
  { key: "en-IN", label: "EN", name: "English" },
  { key: "ta-IN", label: "தமிழ்", name: "Tamil" },
];
const MIC_KEY = "identee:micLang";
export const readMicLang = () => {
  try {
    const v = localStorage.getItem(MIC_KEY);
    return MIC_LANGS.some((l) => l.key === v) ? v : "en-IN";
  } catch {
    return "en-IN";
  }
};
export const saveMicLang = (key) => {
  try {
    localStorage.setItem(MIC_KEY, key);
  } catch {
    /* private window: the choice lasts until the page is closed */
  }
};
export const nextMicLang = (key) => MIC_LANGS[(MIC_LANGS.findIndex((l) => l.key === key) + 1) % MIC_LANGS.length].key;

/* ---------- size from height and weight ---------- */
export const SIZE_LIMITS = { height: [90, 215], weight: [10, 170] };
// the numbers typed in the size card: both needed, both believable
export function sizeAnswers({ who, heightCm, weightKg }) {
  const h = Number(heightCm);
  const w = Number(weightKg);
  const ok = h >= SIZE_LIMITS.height[0] && h <= SIZE_LIMITS.height[1] && w >= SIZE_LIMITS.weight[0] && w <= SIZE_LIMITS.weight[1];
  return ok ? { who: ["men", "women", "kids"].includes(who) ? who : "men", heightCm: h, weightKg: w } : null;
}

/* ---------- orders in the chat ---------- */
export const ORDER_WORDS = { CREATED: "Placed", CONFIRMED: "Being made", PACKED: "Packed", OUT_FOR_DELIVERY: "Out for delivery", DELIVERED: "Delivered", CANCELLED: "Cancelled", RETURN_APPROVED: "Return approved", RETURN_COMPLETED: "Returned" };
export const orderNo = (o) => o?.invoiceNumber || String(o?._id || "").slice(-6).toUpperCase();
// the design of the customer's own that an order holds (its id), or ""
export const ownDesignId = (order) => {
  const item = (order?.orderItems || []).find((i) => i.customization);
  return item ? String(item.customization?._id || item.customization) : "";
};
// "the same tee again": the order named ("0076", "IDT-0076"), else the newest one with a design of their own
export function findOrder(orders, no) {
  const own = (orders || []).filter((o) => ownDesignId(o));
  const want = String(no || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (!want) return own[0] || null;
  const key = (o) => orderNo(o).replace(/[^a-z0-9]/gi, "").toLowerCase();
  return own.find((o) => key(o) === want) || own.find((o) => key(o).endsWith(want) || String(o._id).toLowerCase().endsWith(want)) || null;
}

/* ---------- the group link ---------- */
// our own picture as the server keeps it ("/uploads/ai/x.png"), whatever address it was shown from; else ""
export const uploadPath = (url) => (String(url || "").match(/\/uploads\/[\w\-./]+$/) || [""])[0];
// what friends vote on: the newest concept sheet in the chat (its picture and its numbered concepts), or nothing
export function voteFromSheet(sheet) {
  const picture = uploadPath(sheet?.url);
  const options = (sheet?.concepts || []).map((c) => ({ n: c.n, title: c.title })).filter((o) => o.n > 0);
  return picture && options.length > 1 ? { picture, options } : { picture: "", options: [] };
}
export const groupLink = (origin, token) => `${String(origin || "").replace(/\/+$/, "")}/g/${token}`;
// the concept most friends picked; null while nobody voted or two are level
export function voteLeader(options) {
  const sorted = [...(options || [])].sort((a, b) => (b.votes || 0) - (a.votes || 0));
  if (!sorted.length || !sorted[0].votes) return null;
  if (sorted[1] && sorted[1].votes === sorted[0].votes) return null;
  return sorted[0];
}
// the friends' answers as tees with a name each (a size the tee doesn't come in becomes the size chosen now)
export function playersFromEntries(entries, sizes, sizeNow) {
  return (entries || [])
    .filter((e) => String(e?.name || "").trim())
    .map((e) => ({ name: String(e.name).trim(), number: String(e.number || "").trim(), size: e.size && (sizes || []).includes(e.size) ? e.size : sizeNow }));
}
// the friends' answers as a count per size ({ M: 2, L: 1 }); `skipped` = answers whose size the tee doesn't come in
export function qtysFromEntries(entries, sizes) {
  const qtys = {};
  let skipped = 0;
  for (const e of entries || []) {
    if (e?.size && (sizes || []).includes(e.size)) qtys[e.size] = Math.min(99, (qtys[e.size] || 0) + 1);
    else skipped += 1;
  }
  return { qtys, skipped };
}
